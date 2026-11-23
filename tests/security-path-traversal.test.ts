import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { Pool } from 'pg';
import { LocalFilesystemStorageAdapter } from '../src/infrastructure/storage/local-filesystem-storage.adapter';
import { extractStoragePathFromPublicUrl } from '../src/infrastructure/storage/extract-storage-path';

vi.mock('fs/promises');

describe('Security: Path Traversal', () => {
  describe('LocalFilesystemStorageAdapter', () => {
    const mockDb = { query: vi.fn() } as unknown as Pool;
    const baseDir = '/tmp/storage';
    const adapter = new LocalFilesystemStorageAdapter(mockDb, baseDir);

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should NOT allow upload outside base directory', async () => {
      const maliciousPath = '../../etc/passwd';
      const buffer = Buffer.from('malicious content');

      await expect(adapter.upload(buffer, 'image/jpeg', maliciousPath))
        .rejects.toThrow('Potential path traversal attempt');

      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should NOT allow deletion outside base directory', async () => {
      const maliciousPath = '../../etc/passwd';
      vi.mocked(mockDb.query).mockResolvedValueOnce({
        rows: [{ id: '1', storage_path: maliciousPath }],
      });

      await adapter.processDeletionQueue();

      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('extractStoragePathFromPublicUrl', () => {
    it('should NOT return paths with traversal sequences', () => {
      const maliciousUrl = 'http://localhost:3000/api/storage/..%2F..%2Fetc%2Fpasswd';
      const result = extractStoragePathFromPublicUrl(maliciousUrl);

      // Before fix, this might return '../../etc/passwd'
      // After fix, it should return null
      expect(result).toBeNull();
    });

    it('should NOT return absolute-looking paths', () => {
      const maliciousUrl = '/etc/passwd';
      const result = extractStoragePathFromPublicUrl(maliciousUrl);
      expect(result).not.toBe('/etc/passwd');
    });
  });
});
