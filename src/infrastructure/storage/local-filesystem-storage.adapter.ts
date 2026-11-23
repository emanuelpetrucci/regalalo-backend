import fs from 'fs/promises';
import path from 'path';
import { Pool } from 'pg';
import { logger } from '../logging/logger';
import { env } from '../../config/env';
import { IStorageService } from '../../domain/services/storage.service';

export class LocalFilesystemStorageAdapter implements IStorageService {
  private readonly baseDir: string;

  constructor(
    private readonly db: Pool,
    baseDir = env.LOCAL_STORAGE_DIR,
  ) {
    this.baseDir = path.resolve(baseDir);
  }

  async upload(buffer: Buffer, _mimeType: string, storagePath: string): Promise<void> {
    const fullPath = this.resolveSafePath(storagePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
  }

  async processDeletionQueue(): Promise<void> {
    const result = await this.db.query<{ id: string; storage_path: string }>(
      'SELECT id, storage_path FROM storage_deletion_queue WHERE processed_at IS NULL ORDER BY created_at',
    );

    for (const row of result.rows) {
      try {
        const fullPath = this.resolveSafePath(row.storage_path);
        await fs.unlink(fullPath).catch((err: NodeJS.ErrnoException) => {
          if (err.code !== 'ENOENT') throw err;
        });

        await this.db.query(
          'UPDATE storage_deletion_queue SET processed_at = NOW() WHERE id = $1',
          [row.id],
        );
      } catch (err) {
        logger.error({ err, storagePath: row.storage_path }, 'Failed to delete local storage file');
      }
    }
  }

  private resolveSafePath(storagePath: string): string {
    const fullPath = path.resolve(this.baseDir, storagePath);
    const normalizedBase = path.resolve(this.baseDir) + path.sep;
    const normalizedFull = fullPath.endsWith(path.sep) ? fullPath : fullPath + path.sep;

    if (!normalizedFull.startsWith(normalizedBase)) {
      throw new Error(`Potential path traversal attempt: ${storagePath}`);
    }
    return fullPath;
  }
}
