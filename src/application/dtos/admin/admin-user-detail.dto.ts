import type { AdminUserListItem } from './admin-user-list.dto';

export interface AdminReputationEvent {
  id: string;
  type: 'delivery_completed' | 'no_show' | 'admin_correction';
  delta: number;
  sessionId: string | null;
  createdAt: Date;
}

export interface AdminUserDetailResponse extends AdminUserListItem {
  avatarUrl: string | null;
  phone: string | null;
  postalCode: string;
  preferredLanguage: string;
  reputationHistory: AdminReputationEvent[];
  activeItems: number;
  completedItems: number;
}
