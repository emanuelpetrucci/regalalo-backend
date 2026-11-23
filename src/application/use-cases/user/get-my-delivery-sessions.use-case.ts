import { IUserRepository, FindMyDeliverySessionsInput } from '../../../domain/repositories/user.repository';
import { GetMyDeliverySessionsRequestDto, GetMyDeliverySessionsResponseDto } from '../../dtos/get-my-delivery-sessions.dto';
import { resolveStoragePublicUrl } from '../../../infrastructure/storage/resolve-storage-public-url';

export class GetMyDeliverySessionsUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(dto: GetMyDeliverySessionsRequestDto): Promise<GetMyDeliverySessionsResponseDto> {
    const input: FindMyDeliverySessionsInput = {
      userId: dto.userId,
      role: dto.role,
      status: dto.status,
      page: dto.page,
      limit: dto.limit,
    };
    const { sessions, total } = await this.userRepo.findMyDeliverySessions(input);
    return {
      sessions: sessions.map(s => ({
        id: s.id,
        itemId: s.itemId,
        itemTitle: s.itemTitle,
        itemImageUrl: s.itemImagePath ? resolveStoragePublicUrl(s.itemImagePath) : null,
        role: s.role,
        status: s.status,
        deadlineAt: s.deadlineAt,
        createdAt: s.createdAt,
        completedAt: s.completedAt,
        otherPartyUserId: s.otherPartyUserId,
        otherPartyFirstName: s.otherPartyFirstName,
        otherPartyLastName: s.otherPartyLastName,
        otherPartyAvatarUrl: s.otherPartyAvatarUrl
          ? resolveStoragePublicUrl(s.otherPartyAvatarUrl)
          : null,
      })),
      pagination: {
        total,
        page: dto.page,
        limit: dto.limit,
        totalPages: Math.ceil(total / dto.limit),
      },
    };
  }
}
