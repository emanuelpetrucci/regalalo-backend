import { ItemCategory, ItemWeightRange } from '../entities/item.entity';
import type { AppPreferredLanguage } from '../../interfaces/validators/preferred-language.schema';

export interface SelectReceiverInput {
  itemId: string;
  requestId: string;
  donorId: string;
  contactChannel: string;
}

export interface SelectReceiverResult {
  sessionId: string;
  status: 'active';
  deadlineAt: Date;
  receiverId: string;
  itemTitle: string;
  itemCondition: string;
}

export interface DeliverySessionDetail {
  id: string;
  itemId: string;
  donorId: string;
  receiverId: string;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  contactChannel: string | null;
  contactPurged: boolean;
  receiverContactChannel: string | null;
  receiverContactPurged: boolean;
  donorConfirmed: boolean;
  noShowDeclared: boolean;
  deadlineAt: Date;
  createdAt: Date;
  completedAt: Date | null;
}

export interface DeliverySessionParticipantView extends DeliverySessionDetail {
  itemTitle: string;
  itemCondition: string;
  itemCategory: ItemCategory;
  itemImagePaths: string[];
  otherPartyUserId: string;
  otherPartyFirstName: string;
  otherPartyLastName: string;
  otherPartyAvatarUrl: string | null;
  otherPartyReputationScore: number;
  otherPartyDistanceMeters: number;
  otherPartyLocationName: string | null;
}

export interface ConfirmDeliveryResult {
  completedAt: Date;
  donorId: string;
  receiverId: string;
  donorNewScore: number;
  receiverNewScore: number;
  donorDelta: number;
  receiverDelta: number;
  itemId: string;
  sessionCreatedAt: Date;
  category: ItemCategory;
  weightRange: ItemWeightRange;
}

export interface CancelDeliveryInput {
  sessionId: string;
  donorId: string;
  noShow: boolean;
}

export interface CancelDeliveryResult {
  noShowDeclared: boolean;
  completedAt: Date;
  itemId: string;
  sessionCreatedAt: Date;
  category: ItemCategory;
  receiverId?: string;
  receiverNewScore?: number;
  receiverConsecutiveNoShows?: number;
  receiverDelta?: number;
}

export interface ExpiredSessionForEmail {
  sessionId: string;
  donorId: string;
  createdAt: Date;
  donorEmail: string;
  donorFirstName: string;
  donorPreferredLanguage: AppPreferredLanguage;
  itemId: string;
  itemTitle: string;
  category: ItemCategory;
}

export interface AdminSessionRecord {
  id: string;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  deadlineAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  contactPurged: boolean;
  noShowDeclared: boolean;
  itemId: string;
  itemTitle: string;
  donorId: string;
  donorFirstName: string;
  donorLastName: string;
  donorEmail: string;
  receiverId: string;
  receiverFirstName: string;
  receiverLastName: string;
  receiverEmail: string;
}

export interface AdminSessionDetailRecord extends AdminSessionRecord {
  contactChannel: string | null;
  donorConfirmed: boolean;
  itemCategory: ItemCategory;
  itemStatus: string;
  itemReservedAt: Date | null;
}

export interface AdminSessionListQuery {
  status?: 'active' | 'completed' | 'cancelled' | 'expired';
  overdue?: boolean;
  userId?: string;
  page: number;
  limit: number;
}

export interface IDeliverySessionRepository {
  selectReceiver(input: SelectReceiverInput): Promise<SelectReceiverResult>;
  findById(sessionId: string): Promise<DeliverySessionDetail | null>;
  findByIdForParticipant(
    sessionId: string,
    currentUserId: string,
  ): Promise<DeliverySessionParticipantView | null>;
  confirmDelivery(sessionId: string, donorId: string): Promise<ConfirmDeliveryResult>;
  cancelDelivery(input: CancelDeliveryInput): Promise<CancelDeliveryResult>;
  findExpiredSessions(): Promise<ExpiredSessionForEmail[]>;
  adminFindAll(query: AdminSessionListQuery): Promise<{ sessions: AdminSessionRecord[]; total: number }>;
  adminFindById(sessionId: string): Promise<AdminSessionDetailRecord | null>;
  adminForceExpireSession(sessionId: string): Promise<void>;
  countActive(): Promise<number>;
  countByStatusLast30Days(): Promise<{ completed: number; expired: number; cancelled: number }>;
  countNoShowLast30Days(): Promise<number>;
}
