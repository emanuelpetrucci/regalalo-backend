export interface DeliverySessionItemSummaryDto {
  title: string;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  category:
    | 'furniture'
    | 'electronics'
    | 'clothing'
    | 'books'
    | 'toys'
    | 'kitchen'
    | 'sports'
    | 'tools'
    | 'other';
  images: string[];
}

export interface DeliverySessionOtherPartyDto {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  reputationScore: number;
  distanceMeters: number;
  locationName: string | null;
}

export interface GetDeliverySessionResponseDto {
  id: string;
  itemId: string;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  contactChannel: string | null;
  sharedContactChannel: string | null;
  receiverContactChannel: string | null;
  deadlineAt: Date;
  donorConfirmed: boolean;
  noShowDeclared: boolean;
  createdAt: Date;
  completedAt: Date | null;
  role: 'donor' | 'receiver';
  item: DeliverySessionItemSummaryDto;
  otherParty: DeliverySessionOtherPartyDto;
}
