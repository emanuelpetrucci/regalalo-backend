export interface AdminUserListItem {
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

export interface AdminUserListResponse {
  users: AdminUserListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AdminUserListQuery {
  search?: string;
  status?: 'active' | 'suspended';
  emailVerified?: boolean;
  page: number;
  limit: number;
}
