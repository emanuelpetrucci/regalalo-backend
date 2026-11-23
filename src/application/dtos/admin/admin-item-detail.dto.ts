import { ItemStatus } from '../../../domain/entities/item.entity';
import { AdminItemListItem } from './admin-item-list.dto';

export interface AdminItemRequestDetail {
  id: string;
  status: string;
  createdAt: Date;
  requester: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    reputationScore: number;
  };
}

export interface AdminActiveSessionDetail {
  id: string;
  status: ItemStatus;
  deadlineAt: Date | null;
  receiverId: string;
}

export interface AdminItemDetailResponse extends AdminItemListItem {
  digestNotifiedAt: Date | null;
  reservedAt: Date | null;
  requests: AdminItemRequestDetail[];
  activeSession: AdminActiveSessionDetail | null;
}
