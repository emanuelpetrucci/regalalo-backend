import { IUserRepository } from '../../../domain/repositories/user.repository';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { GetPublicProfileResponseDto } from '../../dtos/get-public-profile.dto';

export class GetPublicProfileUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(userId: string): Promise<GetPublicProfileResponseDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      reputationScore: user.reputationScore,
      totalReceived: user.totalReceived,
      totalDonated: user.totalDonated,
      createdAt: user.createdAt,
    };
  }
}
