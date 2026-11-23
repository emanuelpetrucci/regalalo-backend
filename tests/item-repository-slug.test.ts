import { describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgresItemRepository } from '../src/infrastructure/database/supabase/item.repository';

const ITEM_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';

function createMockPool() {
  return {
    query: vi.fn(),
    connect: vi.fn(),
  } as unknown as Pool;
}

function detailRow(slug: string, distance: number | null = null) {
  return {
    id: ITEM_ID,
    slug,
    title: 'Mesa de madera',
    description: 'Mesa',
    condition: 'good',
    category: 'furniture',
    weight_range: '1to5',
    status: 'active',
    requests_paused: false,
    degraded_at: null,
    created_at: new Date('2026-05-01T10:00:00Z'),
    completed_at: null,
    distance_meters: distance,
    location_name: 'Madrid',
    image_paths: ['items/abc/photo.jpg'],
    donor_id: distance === null ? null : USER_ID,
    donor_first_name: distance === null ? 'Anónimo' : 'María',
    donor_last_name: distance === null ? '' : 'López',
    donor_avatar_url: null,
    donor_reputation_score: 20,
  };
}

describe('PostgresItemRepository slug lookup', () => {
  it('findBySlug de invitado filtra por i.slug y mapea la columna', async () => {
    const pool = createMockPool();
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [detailRow('mesa-de-madera')],
      rowCount: 1,
    } as never);

    const item = await new PostgresItemRepository(pool).findBySlug({
      slug: 'mesa-de-madera',
      userId: null,
    });

    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain('i.slug');
    expect(sql).toContain('WHERE i.slug = $1');
    expect(params).toEqual(['mesa-de-madera']);
    expect(item?.slug).toBe('mesa-de-madera');
  });

  it('findBySlug autenticado usa i.slug = $1 y el usuario en $2', async () => {
    const pool = createMockPool();
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ location: 'point' }], rowCount: 1 } as never)
      .mockResolvedValueOnce({
        rows: [detailRow('bicicleta-montana', 1200)],
        rowCount: 1,
      } as never);

    const item = await new PostgresItemRepository(pool).findBySlug({
      slug: 'bicicleta-montana',
      userId: USER_ID,
    });

    const [sql, params] = vi.mocked(pool.query).mock.calls[1];
    expect(sql).toContain('WHERE i.slug = $1');
    expect(params).toEqual(['bicicleta-montana', USER_ID]);
    expect(item?.slug).toBe('bicicleta-montana');
  });

  it('findById de invitado filtra por i.id y sigue devolviendo slug', async () => {
    const pool = createMockPool();
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [detailRow('mesa-de-madera')],
      rowCount: 1,
    } as never);

    const item = await new PostgresItemRepository(pool).findById({
      itemId: ITEM_ID,
      userId: null,
    });

    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain('WHERE i.id = $1');
    expect(sql).not.toContain('WHERE i.slug = $1');
    expect(params).toEqual([ITEM_ID]);
    expect(item?.slug).toBe('mesa-de-madera');
  });
});
