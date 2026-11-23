import { Pool } from 'pg';
import { logger } from '../logging/logger';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/env';
import { StorageException } from '../../domain/exceptions/storage.exception';
import { IStorageService } from '../../domain/services/storage.service';

function createStorageClient(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export class SupabaseStorageAdapter implements IStorageService {
  constructor(
    private readonly db: Pool,
    private readonly client: SupabaseClient = createStorageClient(),
  ) {}

  async upload(buffer: Buffer, mimeType: string, storagePath: string): Promise<void> {
    let result: Awaited<ReturnType<ReturnType<SupabaseClient['storage']['from']>['upload']>>;
    try {
      result = await this.client.storage
        .from(env.SUPABASE_STORAGE_BUCKET)
        .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new StorageException(`Storage upload failed: ${detail}`);
    }
    if (result.error) {
      throw new StorageException(`Storage upload failed: ${result.error.message}`);
    }
  }

  async processDeletionQueue(): Promise<void> {
    const result = await this.db.query<{ id: string; storage_path: string }>(
      'SELECT id, storage_path FROM storage_deletion_queue WHERE processed_at IS NULL ORDER BY created_at',
    );

    for (const row of result.rows) {
      try {
        const { error } = await this.client.storage
          .from(env.SUPABASE_STORAGE_BUCKET)
          .remove([row.storage_path]);

        if (error) throw new Error(`Storage delete failed: ${error.message}`);

        await this.db.query(
          'UPDATE storage_deletion_queue SET processed_at = NOW() WHERE id = $1',
          [row.id],
        );
      } catch (err) {
        logger.error({ err, storagePath: row.storage_path }, 'Failed to delete storage file');
      }
    }
  }
}
