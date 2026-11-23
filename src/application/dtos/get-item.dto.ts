import {
  ItemCategory,
  ItemCondition,
  ItemStatus,
  ItemWeightRange,
} from '../../domain/entities/item.entity';

export interface GetItemResponseDto {
  id: string;
  slug: string;
  title: string;
  description: string;
  condition: ItemCondition;
  category: ItemCategory;
  weightRange: ItemWeightRange;
  status: ItemStatus;
  requestsPaused: boolean;
  degradedAt: Date | null;
  distanceMeters: number | null;
  locationName: string | null;
  images: string[];
  donor: {
    id: string | null;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    reputationScore: number;
  };
  createdAt: Date;
}
