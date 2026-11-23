import { PasswordResetToken } from '../entities/password-reset-token.entity';

export interface CreateTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface IPasswordResetTokenRepository {
  create(input: CreateTokenInput): Promise<PasswordResetToken>;
  findByTokenHash(hash: string): Promise<PasswordResetToken | null>;
  deleteActiveByUserId(userId: string): Promise<void>;
  markUsedAndResetUserPassword(
    tokenId: string,
    userId: string,
    newPasswordHash: string,
  ): Promise<void>;
}
