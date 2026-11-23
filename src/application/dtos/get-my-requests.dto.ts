export interface MyRequestDto {
  id: string;
  itemId: string;
  itemTitle: string;
  itemStatus: 'active' | 'reserved' | 'completed' | 'cancelled';
  status: 'pending' | 'selected' | 'rejected' | 'cancelled';
  images: string[];
  createdAt: Date;
}

export interface GetMyRequestsRequestDto {
  userId: string;
  status?: 'pending' | 'selected' | 'rejected' | 'cancelled';
  page: number;
  limit: number;
}

export interface GetMyRequestsResponseDto {
  requests: MyRequestDto[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
