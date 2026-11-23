import { Item, ItemCategory, ItemCondition, ItemStatus, ItemWeightRange } from '../entities/item.entity';
import { AdminItemListQuery } from '../../application/dtos/admin/admin-item-list.dto';
import type { AppPreferredLanguage } from '../../interfaces/validators/preferred-language.schema';

export interface CreateItemInput {
  id: string;
  donorId: string;
  title: string;
  description: string;
  condition: ItemCondition;
  category: ItemCategory;
  weightRange: ItemWeightRange;
  lat: number;
  lng: number;
  locationName: string;
  imagePaths: string[];
}

export interface FindActiveInRadiusInput {
  userId: string | null;
  page: number;
  limit: number;
}

export interface ItemWithDistance {
  id: string;
  slug: string;
  title: string;
  condition: ItemCondition;
  category: ItemCategory;
  degradedAt: Date | null;
  createdAt: Date;
  distanceMeters: number | null;
  locationName: string | null;
  imagePaths: string[];
}

export interface PaginatedItems {
  items: ItemWithDistance[];
  total: number;
}

export interface FindItemByIdInput {
  itemId: string;
  userId: string | null;
}

export interface FindItemBySlugInput {
  slug: string;
  userId: string | null;
}

export interface ItemDetail {
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
  createdAt: Date;
  completedAt: Date | null;
  distanceMeters: number | null;
  locationName: string | null;
  imagePaths: string[];
  donor: {
    id: string | null;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    reputationScore: number;
  };
}

export interface FindItemOwnershipResult {
  id: string;
  donorId: string;
  status: string;
  requestsPaused: boolean;
  title: string;
  category: ItemCategory;
  createdAt: Date;
}

export interface NewlyDegradedItem {
  itemId: string;
  itemTitle: string;
  donorId: string;
  category: ItemCategory;
  createdAt: Date;
  donorEmail: string;
  donorFirstName: string;
  donorPreferredLanguage: AppPreferredLanguage;
}

export interface CancelItemResult {
  receiverId?: string;
  itemTitle: string;
  alreadyCancelled?: boolean;
}

export interface PendingDigestItem {
  itemId: string;
  donorId: string;
  title: string;
  condition: ItemCondition;
  firstImagePath: string | null;
}

export interface DigestEligibleUser {
  userId: string;
  email: string;
  firstName: string;
  distanceKm: number;
  preferredLanguage: AppPreferredLanguage;
}

export interface NearbyDigestRecipient {
  userId: string;
  email: string;
  firstName: string;
  preferredLanguage: AppPreferredLanguage;
  items: Array<{
    itemId: string;
    title: string;
    condition: ItemCondition;
    distanceKm: number;
    imageUrl?: string;
  }>;
}

export interface AdminItemRecord {
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
  donorId: string;
  donorFirstName: string;
  donorLastName: string;
  donorEmail: string;
  requestCount: number;
  images: string[];
}

export interface AdminItemRequestRecord {
  id: string;
  status: string;
  createdAt: Date;
  requesterId: string;
  requesterFirstName: string;
  requesterLastName: string;
  requesterEmail: string;
  requesterReputationScore: number;
}

export interface AdminItemSessionRecord {
  id: string;
  status: 'active' | 'completed' | 'cancelled';
  deadlineAt: Date | null;
  receiverId: string;
}

export interface AdminItemDetailRecord extends AdminItemRecord {
  digestNotifiedAt: Date | null;
  reservedAt: Date | null;
  requests: AdminItemRequestRecord[];
  activeSession: AdminItemSessionRecord | null;
}

export interface ItemForReport {
  id: string;
  donorId: string;
  title: string;
  status: string;
  category: string;
  description: string;
}

export interface IItemRepository {
  createWithImages(input: CreateItemInput): Promise<Item>;
  findActiveInRadius(input: FindActiveInRadiusInput): Promise<PaginatedItems>;
  findById(input: FindItemByIdInput): Promise<ItemDetail | null>;
  findBySlug(input: FindItemBySlugInput): Promise<ItemDetail | null>;
  findForReport(itemId: string): Promise<ItemForReport | null>;
  findItemOwnership(itemId: string): Promise<FindItemOwnershipResult | null>;
  hasActiveDeliverySession(itemId: string): Promise<boolean>;
  cancelItem(itemId: string): Promise<CancelItemResult>;
  setPauseStatus(itemId: string, paused: boolean): Promise<void>;
  findNewlyDegradedItems(): Promise<NewlyDegradedItem[]>;
  /** Atomically sets digest_notified_at and returns claimed rows (idempotent cron claim). */
  claimPendingDigestItems(): Promise<PendingDigestItem[]>;
  findEligibleDigestUsersForItem(item: PendingDigestItem): Promise<DigestEligibleUser[]>;
  adminFindAll(query: AdminItemListQuery): Promise<{ items: AdminItemRecord[]; total: number }>;
  adminFindById(id: string): Promise<AdminItemDetailRecord | null>;
  adminReactivateItem(itemId: string): Promise<void>;
  countByStatus(): Promise<{ active: number; reserved: number; completed: number; cancelled: number }>;
  countDegraded(): Promise<number>;
}
