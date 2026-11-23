import '../src/config/load-env';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  getRestoreExtension,
  isSupportedRestoreExtension,
  requireEnv,
  resolveRestoreFile,
  RESTORE_USAGE,
} from './lib/db-cli';
import { resolveDatabaseUrlForPgTools, runPgTool } from './lib/pg-tools';

export async function main(): Promise<void> {
  const fileArg = resolveRestoreFile(process.argv.slice(2));
  if (!fileArg) {
    console.error(`ERROR: falta el archivo de dump.\n\n${RESTORE_USAGE}`);
    process.exit(1);
  }

  const filePath = path.resolve(fileArg);
  const extension = getRestoreExtension(filePath);

  if (!isSupportedRestoreExtension(extension)) {
    console.error(
      `ERROR: extensión no soportada "${extension}". Usa una de: ${['.dump', '.sql', '.backup'].join(', ')}`,
    );
    process.exit(1);
  }

  try {
    await fs.access(filePath);
  } catch {
    console.error(`ERROR: archivo de restore no encontrado: ${filePath}`);
    process.exit(1);
  }

  const env = requireEnv(['DATABASE_URL']);
  const databaseUrl = await resolveDatabaseUrlForPgTools(env['DATABASE_URL']);
  const mountDir = path.dirname(filePath);
  const command = extension === '.sql' ? 'psql' : 'pg_restore';

  console.log(`Restaurando ${filePath} con ${command} → DATABASE_URL`);

  if (extension === '.sql') {
    await runPgTool({
      tool: 'psql',
      mountDir,
      env: { DATABASE_URL: databaseUrl },
      args: [
        '--dbname',
        databaseUrl,
        '--file',
        filePath,
        '--single-transaction',
        '--set',
        'ON_ERROR_STOP=1',
      ],
    });
  } else {
    await runPgTool({
      tool: 'pg_restore',
      mountDir,
      env: { DATABASE_URL: databaseUrl },
      args: [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-acl',
        '--dbname',
        databaseUrl,
        filePath,
      ],
    });
  }

  console.log('Restore completado exitosamente.');
}

function isInvokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isInvokedDirectly()) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ERROR: ${message}`);
    process.exit(1);
  });
}
