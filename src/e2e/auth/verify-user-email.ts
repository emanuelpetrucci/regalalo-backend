import type { Pool } from 'pg';

export async function verifyUserEmailById(pool: Pool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE users
     SET email_verified = TRUE,
         verification_token_hash = NULL,
         verification_token_expires_at = NULL
     WHERE id = $1`,
    [userId],
  );
}
