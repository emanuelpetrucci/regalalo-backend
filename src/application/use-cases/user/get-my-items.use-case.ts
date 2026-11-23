import { IUserRepository, FindMyItemsInput } from '../../../domain/repositories/user.repository';
import { resolveStoragePublicUrls } from '../../../infrastructure/storage/resolve-storage-public-url';
import { GetMyItemsRequestDto, GetMyItemsResponseDto } from '../../dtos/get-my-items.dto';

export class GetMyItemsUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(dto: GetMyItemsRequestDto): Promise<GetMyItemsResponseDto> {
    const input: FindMyItemsInput = {
      userId: dto.userId,
      status: dto.status,
      page: dto.page,
      limit: dto.limit,
    };
    const { items, total } = await this.userRepo.findMyItems(input);
    return {
      items: items.map(item => ({
        id: item.id,
        slug: item.slug,
        title: item.title,
        category: item.category,
        condition: item.condition,
        status: item.status,
        degradedAt: item.degradedAt,
        images: resolveStoragePublicUrls(item.imagePaths),
        createdAt: item.createdAt,
        completedAt: item.completedAt,
        requestsPaused: item.requestsPaused,
        requestCount: item.requestCount,
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
