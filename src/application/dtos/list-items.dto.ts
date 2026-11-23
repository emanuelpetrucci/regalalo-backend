import { ItemCategory, ItemCondition } from '../../domain/entities/item.entity';

export interface ListItemsRequestDto {
  userId: string | null;
  page: number;
  limit: number;
}

export interface ItemSummaryDto {
  id: string;
  slug: string;
  title: string;
  condition: ItemCondition;
  category: ItemCategory;
  createdAt: Date;
  degradedAt: Date | null;
  distanceMeters: number | null;
  locationName: string | null;
  images: string[];
}

export interface ListItemsResponseDto {
  items: ItemSummaryDto[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
