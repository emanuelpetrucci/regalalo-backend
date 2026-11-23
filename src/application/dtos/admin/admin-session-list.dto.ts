export interface AdminSessionParty {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface AdminSessionListItem {
  id: string;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  deadlineAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  contactPurged: boolean;
  noShowDeclared: boolean;
  item: { id: string; title: string };
  donor: AdminSessionParty;
  receiver: AdminSessionParty;
}

export interface AdminSessionListResponse {
  sessions: AdminSessionListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export type { AdminSessionListQuery } from '../../../domain/repositories/delivery-session.repository';
