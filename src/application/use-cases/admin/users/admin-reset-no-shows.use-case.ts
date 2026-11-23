import { IUserRepository } from '../../../../domain/repositories/user.repository';
import { IAdminAuditLogRepository } from '../../../../domain/repositories/admin-audit-log.repository';
import { AdminResetNoShowsResponse } from '../../../dtos/admin/admin-action.dto';
import { NotFoundException } from '../../../../domain/exceptions/not-found.exception';
import { ConflictException } from '../../../../domain/exceptions/conflict.exception';

export class AdminResetNoShowsUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly auditLogRepo: IAdminAuditLogRepository,
  ) {}

  async execute(
    adminUserId: string,
    userId: string,
    ipAddress: string,
  ): Promise<AdminResetNoShowsResponse> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException();
    if (user.consecutiveNoShows === 0) throw new ConflictException('Contador ya es cero');

    const previousValue = user.consecutiveNoShows;

    await this.userRepo.adminResetNoShows(userId);

    await this.auditLogRepo.create({
      adminUserId,
      action: 'user.no_shows_reset',
      entityType: 'user',
      entityId: userId,
      payloadSnapshot: { consecutive_no_shows: previousValue },
      ipAddress,
    });

    return { message: 'Contador de no-shows reseteado', previousValue };
  }
}
