import { IUserRepository } from '../../../../domain/repositories/user.repository';
import { IAdminAuditLogRepository } from '../../../../domain/repositories/admin-audit-log.repository';
import { AdminReactivateResponse } from '../../../dtos/admin/admin-action.dto';
import { NotFoundException } from '../../../../domain/exceptions/not-found.exception';
import { ConflictException } from '../../../../domain/exceptions/conflict.exception';

export class AdminReactivateUserUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly auditLogRepo: IAdminAuditLogRepository,
  ) {}

  async execute(
    adminUserId: string,
    userId: string,
    ipAddress: string,
  ): Promise<AdminReactivateResponse> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException();
    if (user.isActive) throw new ConflictException('Usuario ya activo');

    const payloadSnapshot = { is_active: user.isActive };

    const itemsUnpaused = await this.userRepo.adminReactivate(userId);

    await this.auditLogRepo.create({
      adminUserId,
      action: 'user.reactivated',
      entityType: 'user',
      entityId: userId,
      payloadSnapshot,
      ipAddress,
    });

    return { message: 'Usuario reactivado', itemsUnpaused };
  }
}
