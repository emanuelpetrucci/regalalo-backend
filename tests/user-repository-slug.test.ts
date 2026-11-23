import { describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgresUserRepository } from '../src/infrastructure/database/supabase/user.repository';

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';

function createMockPool() {
  return {
    query: vi.fn(),
    connect: vi.fn(),
  } as unknown as Pool;
}

describe('PostgresUserRepository.findMyItems slug', () => {
  it('selecciona i.slug y lo devuelve en el ítem', async () => {
    const pool = createMockPool();
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 } as never)
      .mockResolvedValueOnce({
        rows: [{
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          slug: 'mesa-de-madera',
          title: 'Mesa de madera',
          category: 'furniture',
          condition: 'good',
          status: 'active',
          degraded_at: null,
          image_paths: [],
          created_at: new Date('2026-05-01T10:00:00Z'),
          completed_at: null,
          requests_paused: false,
          pending_count: '0',
        }],
        rowCount: 1,
      } as never);

    const result = await new PostgresUserRepository(pool).findMyItems({
      userId: USER_ID,
      page: 1,
      limit: 10,
    });

    const listSql = vi.mocked(pool.query).mock.calls[1][0] as string;
    expect(listSql).toContain('i.slug');
    expect(result.items[0]?.slug).toBe('mesa-de-madera');
  });
});
