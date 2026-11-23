import type { Pool } from 'pg';

export async function degradeItemById(pool: Pool, itemId: string): Promise<void> {
  await pool.query(
    `UPDATE items SET created_at = NOW() - INTERVAL '8 days' WHERE id = $1`,
    [itemId],
  );
  await pool.query(
    `UPDATE items
     SET degraded_at = NOW()
     WHERE id = $1
       AND status = 'active'
       AND degraded_at IS NULL
       AND created_at < NOW() - INTERVAL '7 days'`,
    [itemId],
  );
}
