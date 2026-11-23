import { Pool } from 'pg';

/** URL real de Postgres (docker-compose). Vitest sobrescribe DATABASE_URL con un valor ficticio. */
export const INTEGRATION_DATABASE_URL =
  process.env.INTEGRATION_DATABASE_URL ?? 'postgresql://nolv:nolv@localhost:5432/nolv';

export async function isIntegrationDatabaseReady(): Promise<boolean> {
  const pool = new Pool({
    connectionString: INTEGRATION_DATABASE_URL,
    connectionTimeoutMillis: 2_000,
  });
  try {
    await pool.query('SELECT 1');
    const roleColumn = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'reputation_events'
           AND column_name = 'role'
       ) AS exists`,
    );
    return roleColumn.rows[0]?.exists === true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}
