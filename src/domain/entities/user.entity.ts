import type { AppPreferredLanguage } from '../../interfaces/validators/preferred-language.schema';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  postalCode: string;
  locationName: string | null;
  reputationScore: number;
  totalReceived: number;
  totalDonated: number;
  consecutiveNoShows: number;
  cyclesAtLimit: number;
  lastCycleIncrementedAt: Date | null;
  jwtVersion: number;
  createdAt: Date;
  lastActiveAt: Date | null;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  phone: string | null;
  emailVerified: boolean;
  verificationTokenHash: string | null;
  verificationTokenExpiresAt: Date | null;
  verificationResendAt: Date | null;
  isActive: boolean;
  preferredLanguage: AppPreferredLanguage;
}
