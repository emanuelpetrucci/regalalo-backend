import { randomUUID } from 'crypto';
import { GeocodingException } from '../../../domain/exceptions/geocoding.exception';
import { IGeocodingService } from '../../services/geocoding.service';
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { IStorageService } from '../../../domain/services/storage.service';
import { PublishItemRequestDto, PublishItemResponseDto } from '../../dtos/publish-item.dto';
import { emitEvent } from '../../services/analytics.service';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export class PublishItemUseCase {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly storageService: IStorageService,
    private readonly geocodingService: IGeocodingService,
  ) {}

  async execute(dto: PublishItemRequestDto): Promise<PublishItemResponseDto> {
    const coords = await this.geocodingService.geocode(dto.postalCode);
    if (!coords) throw new GeocodingException('Código postal no válido o no encontrado');

    const itemId = randomUUID();
    const imagePaths: string[] = [];

    for (const file of dto.files) {
      const ext = MIME_TO_EXT[file.mimetype] ?? 'bin';
      const storagePath = `items/${itemId}/${randomUUID()}.${ext}`;
      await this.storageService.upload(file.buffer, file.mimetype, storagePath);
      imagePaths.push(storagePath);
    }

    const item = await this.itemRepo.createWithImages({
      id: itemId,
      donorId: dto.donorId,
      title: dto.title,
      description: dto.description,
      condition: dto.condition,
      category: dto.category,
      weightRange: dto.weightRange,
      lat: coords.lat,
      lng: coords.lon,
      locationName: coords.locationName,
      imagePaths,
    });

    emitEvent('item.published', dto.donorId, {
      itemId: item.id,
      category: item.category,
      condition: item.condition,
      weightRange: item.weightRange,
    });

    return {
      id: item.id,
      slug: item.slug,
      title: item.title,
      status: item.status,
      createdAt: item.createdAt,
    };
  }
}
