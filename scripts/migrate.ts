import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import '../src/config/load-env';
import { resolveDatabaseUrlForNodePg } from './lib/pg-tools';

const migrationsDir = path.join(
  __dirname,
  '../src/infrastructure/database/supabase/migrations',
);

async function main(): Promise<void> {
  const configuredUrl = process.env['DATABASE_URL'];
  if (!configuredUrl) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  const databaseUrl = await resolveDatabaseUrlForNodePg(configuredUrl);
  const pool = new Pool({ connectionString: databaseUrl });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const applied = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [file],
    );
    if (applied.rowCount && applied.rowCount > 0) {
      console.log(`skip ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      console.log(`applied ${file}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
      if (/cron|pg_cron/i.test(message)) {
        console.warn(`warn ${file}: ${message} (skipped — pg_cron no disponible en este entorno)`);
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [
          file,
        ]);
        continue;
      }
      if (code === '42P07' || /already exists/i.test(message)) {
        console.warn(`warn ${file}: ${message} (marcada como aplicada)`);
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [
          file,
        ]);
        continue;
      }
      console.error(`failed ${file}: ${message}`);
      await pool.end();
      process.exit(1);
    }
  }

  await pool.end();
  console.log('Migrations complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
