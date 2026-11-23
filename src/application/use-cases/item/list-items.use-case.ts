import { IItemRepository } from '../../../domain/repositories/item.repository';
import { resolveStoragePublicUrls } from '../../../infrastructure/storage/resolve-storage-public-url';
import { ListItemsRequestDto, ListItemsResponseDto } from '../../dtos/list-items.dto';

export class ListItemsUseCase {
  constructor(private readonly itemRepo: IItemRepository) {}

  async execute(dto: ListItemsRequestDto): Promise<ListItemsResponseDto> {
    const { items, total } = await this.itemRepo.findActiveInRadius({
      userId: dto.userId,
      page: dto.page,
      limit: dto.limit,
    });

    return {
      items: items.map(item => ({
        id: item.id,
        slug: item.slug,
        title: item.title,
        condition: item.condition,
        category: item.category,
        createdAt: item.createdAt,
        degradedAt: item.degradedAt,
        distanceMeters: item.distanceMeters,
        locationName: item.locationName,
        images: resolveStoragePublicUrls(item.imagePaths),
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
