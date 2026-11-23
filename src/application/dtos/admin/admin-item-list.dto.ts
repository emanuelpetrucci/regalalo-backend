import { ItemCategory, ItemCondition, ItemStatus, ItemWeightRange } from '../../../domain/entities/item.entity';

export interface AdminItemListItemDonor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface AdminItemListItem {
  id: string;
  title: string;
  description: string;
  condition: ItemCondition;
  category: ItemCategory;
  weightRange: ItemWeightRange;
  status: ItemStatus;
  requestsPaused: boolean;
  pausedByAdmin: boolean;
  degradedAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  donor: AdminItemListItemDonor;
  requestCount: number;
  images: string[];
}

export interface AdminItemListResponse {
  items: AdminItemListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AdminItemListQuery {
  search?: string;
  status?: ItemStatus;
  category?: ItemCategory;
  degraded?: boolean;
  donorId?: string;
  page: number;
  limit: number;
}
