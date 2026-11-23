import type { Pool } from 'pg';

/** Simulates pg_cron increment-cycles-at-limit for a single user (E2E only). */
export async function incrementCyclesAtLimitForUser(
  pool: Pool,
  userId: string,
): Promise<void> {
  await pool.query(
    `UPDATE users
     SET cycles_at_limit = cycles_at_limit + 1,
         last_cycle_incremented_at = NOW()
     WHERE id = $1`,
    [userId],
  );
}
