import { Pool } from 'pg';
import { AdminOtpToken } from '../../../domain/entities/admin-otp-token.entity';
import {
  IAdminOtpTokenRepository,
  CreateAdminOtpTokenInput,
} from '../../../domain/repositories/admin-otp-token.repository';

type AdminOtpTokenDbRow = {
  id: string;
  admin_user_id: string;
  token_hash: string;
  expires_at: Date;
  used: boolean;
  attempts: number;
  created_at: Date;
};

const OTP_SELECT = 'id, admin_user_id, token_hash, expires_at, used, attempts, created_at';

export class PostgresAdminOtpTokenRepository implements IAdminOtpTokenRepository {
  constructor(private readonly db: Pool) {}

  async findActiveByAdminId(adminUserId: string, forUpdate = false): Promise<AdminOtpToken | null> {
    const lockClause = forUpdate ? ' FOR UPDATE' : '';
    const result = await this.db.query<AdminOtpTokenDbRow>(
      `SELECT ${OTP_SELECT}
       FROM admin_otp_tokens
       WHERE admin_user_id = $1 AND used = FALSE
       ORDER BY created_at DESC
       LIMIT 1${lockClause}`,
      [adminUserId],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async invalidateByAdminId(adminUserId: string): Promise<void> {
    await this.db.query(
      `UPDATE admin_otp_tokens SET used = TRUE WHERE admin_user_id = $1 AND used = FALSE`,
      [adminUserId],
    );
  }

  async create(input: CreateAdminOtpTokenInput): Promise<AdminOtpToken> {
    const result = await this.db.query<AdminOtpTokenDbRow>(
      `INSERT INTO admin_otp_tokens (admin_user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING ${OTP_SELECT}`,
      [input.adminUserId, input.tokenHash, input.expiresAt],
    );
    return this.mapRow(result.rows[0]);
  }

  async markUsed(id: string): Promise<void> {
    await this.db.query(
      `UPDATE admin_otp_tokens SET used = TRUE WHERE id = $1`,
      [id],
    );
  }

  async incrementAttempts(id: string): Promise<number> {
    const result = await this.db.query<{ attempts: number }>(
      `UPDATE admin_otp_tokens SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
      [id],
    );
    return result.rows[0]?.attempts ?? 0;
  }

  private mapRow(row: AdminOtpTokenDbRow): AdminOtpToken {
    return {
      id: row.id,
      adminUserId: row.admin_user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      used: row.used,
      attempts: row.attempts,
      createdAt: row.created_at,
    };
  }
}
