import { IDeliverySessionRepository } from '../../../../domain/repositories/delivery-session.repository';
import { IAdminAuditLogRepository } from '../../../../domain/repositories/admin-audit-log.repository';
import { AdminSessionDetailResponse } from '../../../dtos/admin/admin-session-detail.dto';
import { NotFoundException } from '../../../../domain/exceptions/not-found.exception';

export class AdminGetSessionDetailUseCase {
  constructor(
    private readonly sessionRepo: IDeliverySessionRepository,
    private readonly auditLogRepo: IAdminAuditLogRepository,
  ) {}

  async execute(
    adminUserId: string,
    sessionId: string,
    ipAddress: string,
  ): Promise<AdminSessionDetailResponse> {
    const record = await this.sessionRepo.adminFindById(sessionId);
    if (!record) throw new NotFoundException('Session not found');

    let auditLogged = false;
    if (!record.contactPurged) {
      await this.auditLogRepo.create({
        adminUserId,
        action: 'data.contact_channel_accessed',
        entityType: 'delivery_session',
        entityId: sessionId,
        ipAddress,
      });
      auditLogged = true;
    }

    return {
      id: record.id,
      status: record.status,
      deadlineAt: record.deadlineAt,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      donorConfirmed: record.donorConfirmed,
      noShowDeclared: record.noShowDeclared,
      contactChannel: record.contactPurged ? null : record.contactChannel,
      contactPurged: record.contactPurged,
      item: { id: record.itemId, title: record.itemTitle, category: record.itemCategory },
      donor: {
        id: record.donorId,
        firstName: record.donorFirstName,
        lastName: record.donorLastName,
        email: record.donorEmail,
      },
      receiver: {
        id: record.receiverId,
        firstName: record.receiverFirstName,
        lastName: record.receiverLastName,
        email: record.receiverEmail,
      },
      auditLogged,
    };
  }
}
