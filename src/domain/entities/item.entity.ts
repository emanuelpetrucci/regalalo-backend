export type ItemCondition = 'new' | 'like_new' | 'good' | 'fair';
export type ItemStatus = 'active' | 'reserved' | 'completed' | 'cancelled';

export type ItemCategory =
  | 'furniture' | 'electronics' | 'clothing' | 'books'
  | 'toys' | 'kitchen' | 'sports' | 'tools' | 'other';

export type ItemWeightRange = 'lt1' | '1to5' | '5to20' | 'gt20';

export interface Item {
  id: string;
  slug: string;
  donorId: string;
  title: string;
  description: string;
  condition: ItemCondition;
  category: ItemCategory;
  weightRange: ItemWeightRange;
  status: ItemStatus;
  requestsPaused: boolean;
  degradedAt: Date | null;
  createdAt: Date;
  reservedAt: Date | null;
  completedAt: Date | null;
}
