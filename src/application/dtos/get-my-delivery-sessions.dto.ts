export interface MyDeliverySessionDto {
  id: string;
  itemId: string;
  itemTitle: string;
  itemImageUrl: string | null;
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

export interface GetMyDeliverySessionsRequestDto {
  userId: string;
  role?: 'donor' | 'receiver';
  status?: 'active' | 'completed' | 'cancelled' | 'expired';
  page: number;
  limit: number;
}

export interface GetMyDeliverySessionsResponseDto {
  sessions: MyDeliverySessionDto[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
