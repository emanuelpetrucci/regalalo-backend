import { ItemCategory, ItemCondition, ItemWeightRange } from '../../domain/entities/item.entity';

export interface PublishItemFileDto {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface PublishItemRequestDto {
  donorId: string;
  title: string;
  description: string;
  condition: ItemCondition;
  category: ItemCategory;
  weightRange: ItemWeightRange;
  postalCode: string;
  files: PublishItemFileDto[];
}

export interface PublishItemResponseDto {
  id: string;
  slug: string;
  title: string;
  status: string;
  createdAt: Date;
}
