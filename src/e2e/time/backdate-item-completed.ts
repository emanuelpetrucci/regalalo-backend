import type { Pool } from 'pg';

export async function backdateItemCompleted(
  pool: Pool,
  itemId: string,
  days: number,
): Promise<void> {
  await pool.query(
    `UPDATE items SET completed_at = NOW() - ($2 || ' days')::INTERVAL WHERE id = $1`,
    [itemId, String(days)],
  );
}
