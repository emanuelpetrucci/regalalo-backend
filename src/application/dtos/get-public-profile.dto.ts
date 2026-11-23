export interface GetPublicProfileResponseDto {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  reputationScore: number;
  totalReceived: number;
  totalDonated: number;
  createdAt: Date;
}
