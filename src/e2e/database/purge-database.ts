import fs from 'fs/promises';
import path from 'path';
import type { Pool } from 'pg';
import { env } from '../../config/env';

export async function wipeLocalStorage(dir: string): Promise<void> {
  const resolved = path.resolve(dir);
  let entries: string[];
  try {
    entries = await fs.readdir(resolved);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }

  await Promise.all(
    entries
      .filter((name) => name !== '.gitkeep')
      .map((name) => fs.rm(path.join(resolved, name), { recursive: true, force: true })),
  );
}

const TRUNCATE_TABLES = [
  'analytics_events',
  'storage_deletion_queue',
  'reputation_events',
  'delivery_sessions',
  'item_requests',
  'item_images',
  'items',
  'password_reset_tokens',
  'users',
] as const;

export async function purgeDatabase(pool: Pool): Promise<void> {
  const existing = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
    [TRUNCATE_TABLES],
  );
  const names = existing.rows.map((r) => r.tablename);
  if (names.length > 0) {
    await pool.query(`TRUNCATE TABLE ${names.join(', ')} CASCADE`);
  }

  if (env.STORAGE_DRIVER === 'local') {
    await wipeLocalStorage(env.LOCAL_STORAGE_DIR);
  }
}
