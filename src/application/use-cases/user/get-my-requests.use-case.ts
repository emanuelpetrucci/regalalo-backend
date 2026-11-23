import { IUserRepository, FindMyRequestsInput } from '../../../domain/repositories/user.repository';
import { resolveStoragePublicUrls } from '../../../infrastructure/storage/resolve-storage-public-url';
import { GetMyRequestsRequestDto, GetMyRequestsResponseDto } from '../../dtos/get-my-requests.dto';

export class GetMyRequestsUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(dto: GetMyRequestsRequestDto): Promise<GetMyRequestsResponseDto> {
    const input: FindMyRequestsInput = {
      userId: dto.userId,
      status: dto.status,
      page: dto.page,
      limit: dto.limit,
    };
    const { requests, total } = await this.userRepo.findMyRequests(input);
    return {
      requests: requests.map(r => ({
        id: r.id,
        itemId: r.itemId,
        itemTitle: r.itemTitle,
        itemStatus: r.itemStatus,
        status: r.status,
        images: resolveStoragePublicUrls(r.imagePaths),
        createdAt: r.createdAt,
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
