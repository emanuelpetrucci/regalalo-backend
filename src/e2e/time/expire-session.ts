import type { Pool } from 'pg';

const EXPIRE_SESSIONS_SQL = `
  WITH expired AS (
    UPDATE delivery_sessions
    SET status = 'expired'
    WHERE status = 'active'
      AND deadline_at < NOW()
    RETURNING item_id
  )
  UPDATE items
  SET status = 'active',
      reserved_at = NULL
  WHERE id IN (SELECT item_id FROM expired)
`;

export async function expireSessionById(pool: Pool, sessionId: string): Promise<void> {
  await pool.query(
    `UPDATE delivery_sessions SET deadline_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
    [sessionId],
  );
  await pool.query(EXPIRE_SESSIONS_SQL);
}
