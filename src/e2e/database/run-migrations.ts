import fs from 'fs';
import path from 'path';
import type { Pool } from 'pg';

const migrationsDir = path.join(
  __dirname,
  '../../infrastructure/database/supabase/migrations',
);

function findCronScheduleStatementEnd(sql: string, openParenIndex: number): number {
  let i = openParenIndex + 1;
  let depth = 1;
  while (i < sql.length && depth > 0) {
    if (sql.startsWith('$$', i)) {
      const close = sql.indexOf('$$', i + 2);
      if (close === -1) return -1;
      i = close + 2;
      continue;
    }
    const ch = sql[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    i += 1;
  }
  while (i < sql.length && /\s/.test(sql[i] ?? '')) i += 1;
  return sql[i] === ';' ? i + 1 : -1;
}

/** pg_cron blocks are optional in E2E/local; DDL must still commit when cron is unavailable. */
export function stripPgCronScheduling(sql: string): string {
  let out = sql.replace(
    /DO \$\$\s*BEGIN\s*PERFORM cron\.unschedule[\s\S]*?END \$\$;/gi,
    '',
  );

  const scheduleStart = /SELECT\s+cron\.schedule\s*\(/gi;
  for (let match = scheduleStart.exec(out); match; match = scheduleStart.exec(out)) {
    const start = match.index;
    const end = findCronScheduleStatementEnd(out, match.index + match[0].length - 1);
    if (end === -1) break;
    out = out.slice(0, start) + out.slice(end);
    scheduleStart.lastIndex = start;
  }

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function isPgCronError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /cron|pg_cron/i.test(message);
}

function isBenignMigrationError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: string }).code)
      : '';
  return isPgCronError(err) || code === '42P07' || /already exists/i.test(message);
}

export async function runMigrations(pool: Pool): Promise<void> {
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
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    // E2E/local: apply DDL only; pg_cron jobs are exercised via POST /api/e2e/time/*
    const ddlSql = stripPgCronScheduling(sql);

    try {
      if (ddlSql.length > 0) {
        await pool.query(ddlSql);
      }
      await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    } catch (err) {
      if (!isBenignMigrationError(err)) {
        throw err;
      }
      await pool.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
        [file],
      );
    }
  }
}
