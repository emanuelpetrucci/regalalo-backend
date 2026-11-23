import { Pool } from 'pg';
import { PasswordResetToken } from '../../../domain/entities/password-reset-token.entity';
import {
  IPasswordResetTokenRepository,
  CreateTokenInput,
} from '../../../domain/repositories/password-reset-token.repository';
import { BadRequestException } from '../../../domain/exceptions/bad-request.exception';

export class PostgresPasswordResetTokenRepository implements IPasswordResetTokenRepository {
  constructor(private readonly db: Pool) {}

  async create(input: CreateTokenInput): Promise<PasswordResetToken> {
    const result = await this.db.query<{
      id: string;
      user_id: string;
      token_hash: string;
      expires_at: Date;
      used: boolean;
      created_at: Date;
    }>(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, token_hash, expires_at, used, created_at`,
      [input.userId, input.tokenHash, input.expiresAt],
    );
    return this.mapRow(result.rows[0]);
  }

  async deleteActiveByUserId(userId: string): Promise<void> {
    await this.db.query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1 AND used = FALSE',
      [userId],
    );
  }

  async findByTokenHash(hash: string): Promise<PasswordResetToken | null> {
    const result = await this.db.query<{
      id: string;
      user_id: string;
      token_hash: string;
      expires_at: Date;
      used: boolean;
      created_at: Date;
    }>(
      `SELECT id, user_id, token_hash, expires_at, used, created_at
       FROM password_reset_tokens WHERE token_hash = $1`,
      [hash],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async markUsedAndResetUserPassword(
    tokenId: string,
    userId: string,
    newPasswordHash: string,
  ): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE users SET password_hash = $1, jwt_version = jwt_version + 1 WHERE id = $2',
        [newPasswordHash, userId],
      );
      const tokenUpdate = await client.query(
        'UPDATE password_reset_tokens SET used = TRUE WHERE id = $1 AND used = FALSE',
        [tokenId],
      );
      if ((tokenUpdate.rowCount ?? 0) !== 1) {
        throw new BadRequestException();
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private mapRow(row: {
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: Date;
    used: boolean;
    created_at: Date;
  }): PasswordResetToken {
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      used: row.used,
      createdAt: row.created_at,
    };
  }
}
