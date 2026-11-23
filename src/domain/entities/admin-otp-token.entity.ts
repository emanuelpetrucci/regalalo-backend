export interface AdminOtpToken {
  id: string;
  adminUserId: string;
  tokenHash: string;
  expiresAt: Date;
  used: boolean;
  attempts: number;
  createdAt: Date;
}
