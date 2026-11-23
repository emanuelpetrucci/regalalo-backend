import '../src/config/load-env';
import { Pool } from 'pg';
import { purgeDatabase } from '../src/e2e/database/purge-database';
import { ensureDatabaseExists, recreateDatabase } from '../src/e2e/database/recreate-database';
import { runMigrations } from '../src/e2e/database/run-migrations';

async function main(): Promise<void> {
  const command = process.argv[2];
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  switch (command) {
    case 'create': {
      await ensureDatabaseExists(databaseUrl);
      console.log('Database ready');
      break;
    }
    case 'migrate': {
      const pool = new Pool({ connectionString: databaseUrl });
      try {
        await runMigrations(pool);
        console.log('Migrations complete');
      } finally {
        await pool.end();
      }
      break;
    }
    case 'purge': {
      const pool = new Pool({ connectionString: databaseUrl });
      try {
        await purgeDatabase(pool);
        console.log('Purge complete');
      } finally {
        await pool.end();
      }
      break;
    }
    case 'recreate': {
      await recreateDatabase(databaseUrl);
      console.log('Recreate complete');
      break;
    }
    default:
      console.error('Usage: e2e-db.ts create|migrate|purge|recreate');
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
