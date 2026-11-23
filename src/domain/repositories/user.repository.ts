import type { ItemCategory } from '../entities/item.entity';
import { User } from '../entities/user.entity';
import type { AdminUserListQuery } from '../../application/dtos/admin/admin-user-list.dto';
import type { AppPreferredLanguage } from '../../interfaces/validators/preferred-language.schema';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  postalCode: string;
  locationName: string;
  phone?: string | null;
  lat: number;
  lon: number;
  verificationTokenHash: string;
  verificationTokenExpiresAt: Date;
  verificationResendAt: Date;
  preferredLanguage?: AppPreferredLanguage;
}

export interface ReputationEventRecord {
  id: string;
  type: 'delivery_completed' | 'no_show';
  delta: number;
  sessionId: string | null;
  createdAt: Date;
  role: 'donor' | 'receiver' | null;
}

export interface UserDeliverySessionRecord {
  id: string;
  itemId: string;
  itemTitle: string;
  itemImagePath: string | null;
  role: 'donor' | 'receiver';
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  deadlineAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  otherPartyUserId: string;
  otherPartyFirstName: string;
  otherPartyLastName: string;
  otherPartyAvatarUrl: string | null;
}

export interface FindMyDeliverySessionsInput {
  userId: string;
  role?: 'donor' | 'receiver';
  status?: 'active' | 'completed' | 'cancelled' | 'expired';
  page: number;
  limit: number;
}

export interface UserItemRecord {
  id: string;
  slug: string;
  title: string;
  category: ItemCategory;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  status: 'active' | 'reserved' | 'completed' | 'cancelled';
  degradedAt: Date | null;
  imagePaths: string[];
  createdAt: Date;
  completedAt: Date | null;
  requestsPaused: boolean;
  requestCount: number;
}

export interface FindMyItemsInput {
  userId: string;
  status?: 'active' | 'reserved' | 'completed' | 'cancelled';
  page: number;
  limit: number;
}

export interface UserRequestRecord {
  id: string;
  itemId: string;
  itemTitle: string;
  itemStatus: 'active' | 'reserved' | 'completed' | 'cancelled';
  status: 'pending' | 'selected' | 'rejected' | 'cancelled';
  imagePaths: string[];
  createdAt: Date;
}

export interface FindMyRequestsInput {
  userId: string;
  status?: 'pending' | 'selected' | 'rejected' | 'cancelled';
  page: number;
  limit: number;
}

export interface UpdateVerificationTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  resendAt: Date;
}

export interface UpdateProfileInput {
  userId: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string | null;
  phone?: string | null;
  postalCode?: string;
  locationName?: string;
  lat?: number;
  lon?: number;
  preferredLanguage?: string;
  incrementJwtVersion: boolean;
  previousAvatarUrl: string | null;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  emailVerified: boolean;
  reputationScore: number;
  totalDonated: number;
  totalReceived: number;
  consecutiveNoShows: number;
  cyclesAtLimit: number;
  createdAt: Date;
  lastActiveAt: Date | null;
  isPassive: boolean;
  isHoarder: boolean;
}

export interface AdminReputationEventRecord {
  id: string;
  type: 'delivery_completed' | 'no_show' | 'admin_correction';
  delta: number;
  sessionId: string | null;
  createdAt: Date;
}

export interface AdminUserDetailRecord extends AdminUserRecord {
  avatarUrl: string | null;
  phone: string | null;
  postalCode: string;
  preferredLanguage: string;
  reputationHistory: AdminReputationEventRecord[];
  activeItems: number;
  completedItems: number;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  findByVerificationTokenHash(tokenHash: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  updateProfile(input: UpdateProfileInput): Promise<User>;
  updateVerificationToken(input: UpdateVerificationTokenInput): Promise<void>;
  markEmailVerified(userId: string): Promise<void>;
  findReputationHistory(userId: string): Promise<ReputationEventRecord[]>;
  findMyDeliverySessions(input: FindMyDeliverySessionsInput): Promise<{ sessions: UserDeliverySessionRecord[]; total: number }>;
  findMyItems(input: FindMyItemsInput): Promise<{ items: UserItemRecord[]; total: number }>;
  findMyRequests(input: FindMyRequestsInput): Promise<{ requests: UserRequestRecord[]; total: number }>;
  adminFindAll(query: AdminUserListQuery): Promise<{ users: AdminUserRecord[]; total: number }>;
  adminFindById(id: string): Promise<AdminUserDetailRecord | null>;
  adminSuspend(userId: string): Promise<number>;
  adminReactivate(userId: string): Promise<number>;
  adminForceVerification(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  adminCorrectReputation(userId: string, delta: number): Promise<number>;
  adminResetNoShows(userId: string): Promise<void>;
  countTotal(): Promise<number>;
  countActive(): Promise<number>;
  countSuspended(): Promise<number>;
  countUnverifiedOver24h(): Promise<number>;
  countPassive(): Promise<number>;
  countHoarders(): Promise<number>;
}
