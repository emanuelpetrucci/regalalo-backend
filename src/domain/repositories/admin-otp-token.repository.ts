import { AdminOtpToken } from '../entities/admin-otp-token.entity';

export interface CreateAdminOtpTokenInput {
  adminUserId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface IAdminOtpTokenRepository {
  findActiveByAdminId(adminUserId: string, forUpdate?: boolean): Promise<AdminOtpToken | null>;
  invalidateByAdminId(adminUserId: string): Promise<void>;
  create(input: CreateAdminOtpTokenInput): Promise<AdminOtpToken>;
  markUsed(id: string): Promise<void>;
  incrementAttempts(id: string): Promise<number>;
}
