import { IUserRepository } from '../../../../domain/repositories/user.repository';
import { AdminUserDetailResponse } from '../../../dtos/admin/admin-user-detail.dto';
import { NotFoundException } from '../../../../domain/exceptions/not-found.exception';

export class AdminGetUserDetailUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(userId: string): Promise<AdminUserDetailResponse> {
    const record = await this.userRepo.adminFindById(userId);
    if (!record) throw new NotFoundException();

    return {
      id: record.id,
      email: record.email,
      firstName: record.firstName,
      lastName: record.lastName,
      isActive: record.isActive,
      emailVerified: record.emailVerified,
      reputationScore: record.reputationScore,
      totalDonated: record.totalDonated,
      totalReceived: record.totalReceived,
      consecutiveNoShows: record.consecutiveNoShows,
      cyclesAtLimit: record.cyclesAtLimit,
      createdAt: record.createdAt,
      lastActiveAt: record.lastActiveAt,
      isPassive: record.isPassive,
      isHoarder: record.isHoarder,
      avatarUrl: record.avatarUrl,
      phone: record.phone,
      postalCode: record.postalCode,
      preferredLanguage: record.preferredLanguage,
      reputationHistory: record.reputationHistory,
      activeItems: record.activeItems,
      completedItems: record.completedItems,
    };
  }
}
