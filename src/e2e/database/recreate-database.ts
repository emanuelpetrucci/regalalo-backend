import { Pool } from 'pg';
import { runMigrations } from './run-migrations';

function parseDatabaseName(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const name = url.pathname.replace(/^\//, '');
  if (!name) throw new Error('DATABASE_URL must include a database name');
  return name;
}

function adminUrlForDatabase(databaseUrl: string): { adminUrl: string; dbName: string } {
  const url = new URL(databaseUrl);
  const dbName = parseDatabaseName(databaseUrl);
  url.pathname = '/postgres';
  return { adminUrl: url.toString(), dbName };
}

export async function recreateDatabase(databaseUrl: string): Promise<void> {
  const { adminUrl, dbName } = adminUrlForDatabase(databaseUrl);
  const admin = new Pool({ connectionString: adminUrl });

  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  const appPool = new Pool({ connectionString: databaseUrl });
  try {
    await runMigrations(appPool);
  } finally {
    await appPool.end();
  }
}

export async function ensureDatabaseExists(databaseUrl: string): Promise<void> {
  const { adminUrl, dbName } = adminUrlForDatabase(databaseUrl);
  const admin = new Pool({ connectionString: adminUrl });

  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end();
  }
}
