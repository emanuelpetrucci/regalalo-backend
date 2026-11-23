import '../src/config/load-env';
import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from './lib/db-cli';
import {
  buildAssetsBackupLabel,
  buildAssetsLocalBackupDir,
  buildAssetsRemoteBackupPrefix,
  DEFAULT_ASSETS_BACKUP_ARCHIVE_BUCKET,
  listAllStorageObjects,
} from './lib/storage-backup';

async function downloadObject(
  client: ReturnType<typeof createClient>,
  sourceBucket: string,
  objectPath: string,
  localRoot: string,
): Promise<number> {
  const { data, error } = await client.storage.from(sourceBucket).download(objectPath);
  if (error) {
    throw new Error(`Error descargando ${objectPath}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Descarga vacía para ${objectPath}`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const destination = path.join(localRoot, objectPath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, buffer);
  return buffer.length;
}

async function uploadArchiveCopy(
  client: ReturnType<typeof createClient>,
  archiveBucket: string,
  remotePrefix: string,
  localRoot: string,
  objectPath: string,
): Promise<void> {
  const localFile = path.join(localRoot, objectPath);
  const fileBuffer = await fs.readFile(localFile);
  const remoteKey = `${remotePrefix}/${objectPath.replace(/\\/g, '/')}`;
  const { error } = await client.storage.from(archiveBucket).upload(remoteKey, fileBuffer, {
    contentType: 'application/octet-stream',
    upsert: true,
  });
  if (error) {
    throw new Error(`Error subiendo ${remoteKey} a ${archiveBucket}: ${error.message}`);
  }
}

async function main(): Promise<void> {
  const env = requireEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const sourceBucket = process.env['SUPABASE_STORAGE_BUCKET'] ?? 'items';
  const archiveBucket = process.env['ASSETS_BACKUP_BUCKET'] ?? DEFAULT_ASSETS_BACKUP_ARCHIVE_BUCKET;
  const label = buildAssetsBackupLabel();
  const localRoot = path.resolve(buildAssetsLocalBackupDir(label));
  const remotePrefix = buildAssetsRemoteBackupPrefix(label);

  const client = createClient(env['SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Listando objetos en bucket "${sourceBucket}"...`);
  const objects = await listAllStorageObjects(client, sourceBucket);
  if (objects.length === 0) {
    console.log('No hay objetos para respaldar.');
    return;
  }

  await fs.mkdir(localRoot, { recursive: true });
  console.log(`Descargando ${objects.length} archivos → ${localRoot}`);

  let totalBytes = 0;
  for (let i = 0; i < objects.length; i++) {
    const objectPath = objects[i].path;
    const bytes = await downloadObject(client, sourceBucket, objectPath, localRoot);
    totalBytes += bytes;
    if ((i + 1) % 25 === 0 || i + 1 === objects.length) {
      console.log(`  ${i + 1}/${objects.length} descargados`);
    }
  }

  const manifest = {
    label,
    sourceBucket,
    archiveBucket,
    remotePrefix,
    fileCount: objects.length,
    totalBytes,
    createdAt: new Date().toISOString(),
    files: objects,
  };
  const manifestPath = path.join(localRoot, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`Subiendo copia a "${archiveBucket}" → ${remotePrefix}/`);
  await client.storage.from(archiveBucket).upload(
    `${remotePrefix}/manifest.json`,
    JSON.stringify(manifest, null, 2),
    { contentType: 'application/json', upsert: true },
  );

  for (let i = 0; i < objects.length; i++) {
    await uploadArchiveCopy(client, archiveBucket, remotePrefix, localRoot, objects[i].path);
    if ((i + 1) % 25 === 0 || i + 1 === objects.length) {
      console.log(`  ${i + 1}/${objects.length} subidos`);
    }
  }

  console.log('Backup de assets completado.');
  console.log(`  Local:  ${localRoot}`);
  console.log(`  Remoto: ${archiveBucket}/${remotePrefix}/`);
  console.log(`  Archivos: ${objects.length} (${totalBytes} bytes)`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`ERROR: ${message}`);
  process.exit(1);
});
