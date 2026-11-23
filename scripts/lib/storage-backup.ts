import type { SupabaseClient } from '@supabase/supabase-js';
import { formatBackupTimestamp } from './db-cli';

export const DEFAULT_ASSETS_BACKUP_ARCHIVE_BUCKET = 'bk';
export const DEFAULT_ASSETS_BACKUP_LOCAL_ROOT = '.bk/assets';

export interface ListedStorageObject {
  path: string;
  size: number | null;
}

export function buildAssetsBackupLabel(date: Date = new Date()): string {
  return formatBackupTimestamp(date);
}

export function buildAssetsLocalBackupDir(label: string, root = DEFAULT_ASSETS_BACKUP_LOCAL_ROOT): string {
  return `${root}/${label}`;
}

export function buildAssetsRemoteBackupPrefix(label: string): string {
  return `assets/${label}`;
}

export async function listAllStorageObjects(
  client: SupabaseClient,
  bucket: string,
  prefix = '',
): Promise<ListedStorageObject[]> {
  const objects: ListedStorageObject[] = [];
  await walkPrefix(client, bucket, prefix, objects);
  return objects;
}

async function walkPrefix(
  client: SupabaseClient,
  bucket: string,
  prefix: string,
  objects: ListedStorageObject[],
): Promise<void> {
  const limit = 1000;
  let offset = 0;

  for (;;) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) {
      throw new Error(`Error listando Storage (${bucket}/${prefix || ''}): ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const entry of data) {
      const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        await walkPrefix(client, bucket, entryPath, objects);
        continue;
      }

      const size =
        entry.metadata && typeof entry.metadata['size'] === 'number'
          ? entry.metadata['size']
          : null;
      objects.push({ path: entryPath, size });
    }

    if (data.length < limit) {
      break;
    }
    offset += limit;
  }
}
