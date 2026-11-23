import { createHash, randomBytes } from 'crypto';
import type { Pool } from 'pg';

export async function issuePasswordResetToken(
  pool: Pool,
  userId: string,
): Promise<string> {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used = FALSE', [
    userId,
  ]);
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );

  return rawToken;
}
