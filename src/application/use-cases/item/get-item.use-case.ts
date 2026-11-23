import { IItemRepository } from '../../../domain/repositories/item.repository';
import { GoneException } from '../../../domain/exceptions/gone.exception';
import { UUID_V4_REGEX } from '../../../domain/uuid';
import { resolveStoragePublicUrls } from '../../../infrastructure/storage/resolve-storage-public-url';
import { GetItemResponseDto } from '../../dtos/get-item.dto';

export class GetItemUseCase {
  constructor(private readonly itemRepo: IItemRepository) {}

  async execute(itemKey: string, userId: string | null): Promise<GetItemResponseDto> {
    const item = UUID_V4_REGEX.test(itemKey)
      ? await this.itemRepo.findById({ itemId: itemKey, userId })
      : await this.itemRepo.findBySlug({ slug: itemKey, userId });
    if (!item) throw new GoneException('Object not found');

    return {
      id: item.id,
      slug: item.slug,
      title: item.title,
      description: item.description,
      condition: item.condition,
      category: item.category,
      weightRange: item.weightRange,
      status: item.status,
      requestsPaused: item.requestsPaused,
      degradedAt: item.degradedAt,
      distanceMeters: item.distanceMeters,
      locationName: item.locationName,
      images: resolveStoragePublicUrls(item.imagePaths),
      donor: item.donor,
      createdAt: item.createdAt,
    };
  }
}
