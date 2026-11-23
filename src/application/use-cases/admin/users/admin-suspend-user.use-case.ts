import { IUserRepository } from '../../../../domain/repositories/user.repository';
import { IAdminAuditLogRepository } from '../../../../domain/repositories/admin-audit-log.repository';
import { AdminSuspendResponse } from '../../../dtos/admin/admin-action.dto';
import { NotFoundException } from '../../../../domain/exceptions/not-found.exception';
import { ConflictException } from '../../../../domain/exceptions/conflict.exception';

export class AdminSuspendUserUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly auditLogRepo: IAdminAuditLogRepository,
  ) {}

  async execute(
    adminUserId: string,
    userId: string,
    ipAddress: string,
  ): Promise<AdminSuspendResponse> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException();
    if (!user.isActive) throw new ConflictException('ENTITY_STATE_CONFLICT');

    const payloadSnapshot = { is_active: user.isActive, jwt_version: user.jwtVersion };

    const itemsPaused = await this.userRepo.adminSuspend(userId);

    await this.auditLogRepo.create({
      adminUserId,
      action: 'user.suspended',
      entityType: 'user',
      entityId: userId,
      payloadSnapshot,
      ipAddress,
    });

    return { message: 'Usuario suspendido', itemsPaused };
  }
}
