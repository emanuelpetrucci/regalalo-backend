import { IDeliverySessionRepository } from '../../../../domain/repositories/delivery-session.repository';
import { IAdminAuditLogRepository } from '../../../../domain/repositories/admin-audit-log.repository';
import { AdminItemActionResponse } from '../../../dtos/admin/admin-item-action.dto';
import { NotFoundException } from '../../../../domain/exceptions/not-found.exception';
import { ConflictException } from '../../../../domain/exceptions/conflict.exception';

export class AdminForceExpireSessionUseCase {
  constructor(
    private readonly sessionRepo: IDeliverySessionRepository,
    private readonly auditLogRepo: IAdminAuditLogRepository,
  ) {}

  async execute(
    adminUserId: string,
    sessionId: string,
    ipAddress: string,
  ): Promise<AdminItemActionResponse> {
    const record = await this.sessionRepo.adminFindById(sessionId);
    if (!record) throw new NotFoundException('Session not found');
    if (record.status !== 'active') throw new ConflictException('Session is not active');

    const payloadSnapshot = {
      status: record.status,
      deadline_at: record.deadlineAt,
      item: { status: record.itemStatus, reserved_at: record.itemReservedAt },
    };

    await this.sessionRepo.adminForceExpireSession(sessionId);

    await this.auditLogRepo.create({
      adminUserId,
      action: 'session.force_expired',
      entityType: 'delivery_session',
      entityId: sessionId,
      payloadSnapshot,
      ipAddress,
    });

    return { message: 'Sesión expirada. Objeto devuelto a estado activo.' };
  }
}
