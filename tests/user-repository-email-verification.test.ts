import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresUserRepository } from '../src/infrastructure/database/supabase/user.repository';
import { BadRequestException } from '../src/domain/exceptions/bad-request.exception';

const USER_UUID = '550e8400-e29b-41d4-a716-446655440000';

const baseDbRow = {
  id: USER_UUID,
  email: 'test@example.com',
  password_hash: '$argon2id$...',
  postal_code: '28001',
  first_name: 'Test',
  last_name: 'User',
  avatar_url: null,
  phone: null,
  email_verified: false,
  verification_token_hash: 'abc123hash',
  verification_token_expires_at: new Date('2026-06-01T00:00:00.000Z'),
  verification_resend_at: new Date('2026-05-26T00:00:00.000Z'),
  is_active: true,
  preferred_language: 'es',
  reputation_score: 0,
  total_received: 0,
  total_donated: 0,
  consecutive_no_shows: 0,
  cycles_at_limit: 0,
  last_cycle_incremented_at: null,
  jwt_version: 1,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  last_active_at: null,
};

function createMockPool() {
  return {
    query: vi.fn(),
    connect: vi.fn(),
  } as unknown as Pool;
}

describe('PostgresUserRepository — email verification', () => {
  let pool: Pool;
  let repo: PostgresUserRepository;

  beforeEach(() => {
    pool = createMockPool();
    repo = new PostgresUserRepository(pool);
    vi.clearAllMocks();
  });

  describe('findByVerificationTokenHash', () => {
    it('returns mapped user when token hash matches unverified user', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [baseDbRow], rowCount: 1 } as never);

      const user = await repo.findByVerificationTokenHash('abc123hash');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('verification_token_hash = $1 AND email_verified = FALSE'),
        ['abc123hash'],
      );
      expect(user).toMatchObject({
        id: USER_UUID,
        verificationTokenHash: 'abc123hash',
        emailVerified: false,
      });
    });

    it('returns null when no row matches', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

      const user = await repo.findByVerificationTokenHash('missing');

      expect(user).toBeNull();
    });
  });

  describe('updateVerificationToken', () => {
    it('updates hash, expires and resend atomically', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
      const expiresAt = new Date('2026-06-01T00:00:00.000Z');
      const resendAt = new Date('2026-05-26T00:00:00.000Z');

      await repo.updateVerificationToken({
        userId: USER_UUID,
        tokenHash: 'newhash',
        expiresAt,
        resendAt,
      });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('verification_token_hash = $2'),
        [USER_UUID, 'newhash', expiresAt, resendAt],
      );
    });
  });

  describe('markEmailVerified', () => {
    it('commits when exactly one row is updated', async () => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({ rowCount: 1 })
          .mockResolvedValueOnce(undefined),
        release: vi.fn(),
      };
      vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

      await repo.markEmailVerified(USER_UUID);

      expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(client.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('email_verified = TRUE'),
        [USER_UUID],
      );
      expect(client.query).toHaveBeenNthCalledWith(3, 'COMMIT');
      expect(client.release).toHaveBeenCalled();
    });

    it('throws BadRequestException and rolls back when user already verified', async () => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({ rowCount: 0 })
          .mockResolvedValueOnce(undefined),
        release: vi.fn(),
      };
      vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

      await expect(repo.markEmailVerified(USER_UUID)).rejects.toBeInstanceOf(BadRequestException);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });
  });
});
