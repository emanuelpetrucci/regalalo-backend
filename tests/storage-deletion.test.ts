import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { SupabaseStorageAdapter } from '../src/infrastructure/storage/supabase-storage.adapter';

function buildMocks(queueRows: Array<{ id: string; storage_path: string }> = []) {
  const mockRemove = vi.fn().mockResolvedValue({ error: null });
  const mockFrom = vi.fn().mockReturnValue({ remove: mockRemove });
  const mockClient = { storage: { from: mockFrom } } as any;

  const queryMock = vi.fn();
  queryMock.mockResolvedValueOnce({ rows: queueRows });
  queryMock.mockResolvedValue({ rows: [] });

  const mockDb = { query: queryMock } as unknown as Pool;

  return { mockDb, mockClient, mockRemove, mockFrom };
}

describe('SupabaseStorageAdapter.processDeletionQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('S.1 — elimina archivo y marca processed_at para registros pendientes', async () => {
    const row = { id: 'row-uuid-1', storage_path: 'items/abc/photo.webp' };
    const { mockDb, mockClient, mockRemove } = buildMocks([row]);

    const adapter = new SupabaseStorageAdapter(mockDb, mockClient);
    await adapter.processDeletionQueue();

    expect(mockRemove).toHaveBeenCalledWith(['items/abc/photo.webp']);
    expect(mockDb.query).toHaveBeenCalledTimes(2);
    const updateCall = vi.mocked(mockDb.query).mock.calls[1];
    expect(updateCall[0]).toContain('processed_at = NOW()');
    expect(updateCall[1]).toEqual(['row-uuid-1']);
  });

  it('S.2 — no hace nada si la cola está vacía', async () => {
    const { mockDb, mockClient, mockRemove } = buildMocks([]);

    const adapter = new SupabaseStorageAdapter(mockDb, mockClient);
    await adapter.processDeletionQueue();

    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockDb.query).toHaveBeenCalledTimes(1);
  });

  it('S.3 — continúa con el siguiente item si un borrado falla', async () => {
    const row1 = { id: 'row-uuid-1', storage_path: 'items/abc/photo1.webp' };
    const row2 = { id: 'row-uuid-2', storage_path: 'items/abc/photo2.webp' };

    const mockRemove = vi.fn()
      .mockResolvedValueOnce({ error: { message: 'Storage error' } })
      .mockResolvedValueOnce({ error: null });
    const mockFrom = vi.fn().mockReturnValue({ remove: mockRemove });
    const mockClient = { storage: { from: mockFrom } } as any;

    const queryMock = vi.fn()
      .mockResolvedValueOnce({ rows: [row1, row2] })
      .mockResolvedValue({ rows: [] });
    const mockDb = { query: queryMock } as unknown as Pool;

    const adapter = new SupabaseStorageAdapter(mockDb, mockClient);
    await expect(adapter.processDeletionQueue()).resolves.not.toThrow();

    expect(mockRemove).toHaveBeenCalledTimes(2);
    const updateCalls = vi.mocked(mockDb.query).mock.calls.filter(c =>
      String(c[0]).includes('processed_at = NOW()')
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][1]).toEqual(['row-uuid-2']);
  });
});
