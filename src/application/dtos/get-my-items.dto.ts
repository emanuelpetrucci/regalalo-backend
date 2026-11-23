import type { ItemCategory } from '../../domain/entities/item.entity';

export interface MyItemDto {
  id: string;
  slug: string;
  title: string;
  category: ItemCategory;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  status: 'active' | 'reserved' | 'completed' | 'cancelled';
  degradedAt: Date | null;
  images: string[];
  createdAt: Date;
  completedAt: Date | null;
  requestsPaused: boolean;
  requestCount: number;
}

export interface GetMyItemsRequestDto {
  userId: string;
  status?: 'active' | 'reserved' | 'completed' | 'cancelled';
  page: number;
  limit: number;
}

export interface GetMyItemsResponseDto {
  items: MyItemDto[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
