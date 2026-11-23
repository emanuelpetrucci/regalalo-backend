import { IUserRepository } from '../../../domain/repositories/user.repository';
import { UnauthorizedException } from '../../../domain/exceptions/unauthorized.exception';
import { GetPrivateProfileResponseDto } from '../../dtos/get-private-profile.dto';

export class GetPrivateProfileUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(userId: string): Promise<GetPrivateProfileResponseDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      postalCode: user.postalCode,
      locationName: user.locationName,
      preferredLanguage: user.preferredLanguage,
      emailVerified: user.emailVerified,
      reputationScore: user.reputationScore,
      totalReceived: user.totalReceived,
      totalDonated: user.totalDonated,
      consecutiveNoShows: user.consecutiveNoShows,
      createdAt: user.createdAt,
    };
  }
}
