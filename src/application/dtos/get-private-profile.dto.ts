export interface GetPrivateProfileResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  phone: string | null;
  postalCode: string;
  locationName: string | null;
  preferredLanguage: string;
  emailVerified: boolean;
  reputationScore: number;
  totalReceived: number;
  totalDonated: number;
  consecutiveNoShows: number;
  createdAt: Date;
}
