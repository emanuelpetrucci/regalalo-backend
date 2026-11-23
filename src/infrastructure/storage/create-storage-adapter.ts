import { Pool } from 'pg';
import { env } from '../../config/env';
import { LocalFilesystemStorageAdapter } from './local-filesystem-storage.adapter';
import { SupabaseStorageAdapter } from './supabase-storage.adapter';

export type StorageAdapter = SupabaseStorageAdapter | LocalFilesystemStorageAdapter;

export function createStorageAdapter(db: Pool): StorageAdapter {
  if (env.STORAGE_DRIVER === 'local') {
    return new LocalFilesystemStorageAdapter(db);
  }
  return new SupabaseStorageAdapter(db);
}
