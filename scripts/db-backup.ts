import '../src/config/load-env';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  BACKUP_BUCKET,
  buildBackupFilename,
  buildRemoteBackupKey,
  formatBackupTimestamp,
  requireEnv,
  resolveBackupDir,
} from './lib/db-cli';
import { resolveDatabaseUrlForPgTools, runPgTool } from './lib/pg-tools';

async function uploadToBucket(
  localPath: string,
  remoteKey: string,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<void> {
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const fileBuffer = await fs.readFile(localPath);
  const { error } = await client.storage.from(BACKUP_BUCKET).upload(remoteKey, fileBuffer, {
    contentType: 'application/octet-stream',
    upsert: false,
  });

  if (error) {
    throw new Error(`Error al subir backup a Supabase Storage (${BACKUP_BUCKET}): ${error.message}`);
  }
}

export async function main(): Promise<void> {
  const env = requireEnv(['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const backupDir = path.resolve(resolveBackupDir());
  const timestamp = formatBackupTimestamp(new Date());
  const filename = buildBackupFilename(timestamp);
  const localPath = path.join(backupDir, filename);
  const remoteKey = buildRemoteBackupKey(filename);

  await fs.mkdir(backupDir, { recursive: true });

  const databaseUrl = await resolveDatabaseUrlForPgTools(env['DATABASE_URL']);

  console.log(`Ejecutando pg_dump → ${localPath}`);
  await runPgTool({
    tool: 'pg_dump',
    mountDir: backupDir,
    env: { DATABASE_URL: databaseUrl },
    args: [
      '--dbname',
      databaseUrl,
      '--format',
      'custom',
      '--file',
      localPath,
      '--no-owner',
      '--no-acl',
    ],
  });

  const stats = await fs.stat(localPath);
  console.log(`Backup local creado (${stats.size} bytes): ${localPath}`);

  console.log(`Subiendo a Supabase Storage bucket "${BACKUP_BUCKET}" → ${remoteKey}`);
  await uploadToBucket(localPath, remoteKey, env['SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

  console.log('Backup completado.');
  console.log(`  Local:  ${localPath}`);
  console.log(`  Remoto: ${BACKUP_BUCKET}/${remoteKey}`);
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
