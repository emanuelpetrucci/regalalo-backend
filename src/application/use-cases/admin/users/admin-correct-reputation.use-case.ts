import { IUserRepository } from '../../../../domain/repositories/user.repository';
import { IAdminAuditLogRepository } from '../../../../domain/repositories/admin-audit-log.repository';
import {
  AdminCorrectReputationRequest,
  AdminCorrectReputationResponse,
} from '../../../dtos/admin/admin-action.dto';
import { NotFoundException } from '../../../../domain/exceptions/not-found.exception';
import { BadRequestException } from '../../../../domain/exceptions/bad-request.exception';

export class AdminCorrectReputationUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly auditLogRepo: IAdminAuditLogRepository,
  ) {}

  async execute(
    adminUserId: string,
    userId: string,
    dto: AdminCorrectReputationRequest,
    ipAddress: string,
  ): Promise<AdminCorrectReputationResponse> {
    const { delta, reason } = dto;

    if (delta === 0) throw new BadRequestException('delta no puede ser cero');

    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException();

    const newReputationScore = await this.userRepo.adminCorrectReputation(userId, delta);

    await this.auditLogRepo.create({
      adminUserId,
      action: 'user.reputation_corrected',
      entityType: 'user',
      entityId: userId,
      payloadSnapshot: {
        previous_reputation_score: user.reputationScore,
        delta,
        reason,
      },
      ipAddress,
    });

    return { newReputationScore, delta };
  }
}
