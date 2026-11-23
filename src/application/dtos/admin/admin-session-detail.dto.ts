import { ItemCategory } from '../../../domain/entities/item.entity';
import { AdminSessionParty } from './admin-session-list.dto';

export interface AdminSessionDetailResponse {
  id: string;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  deadlineAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  donorConfirmed: boolean;
  noShowDeclared: boolean;
  contactChannel: string | null;
  contactPurged: boolean;
  item: { id: string; title: string; category: ItemCategory };
  donor: AdminSessionParty;
  receiver: AdminSessionParty;
  auditLogged: boolean;
}
