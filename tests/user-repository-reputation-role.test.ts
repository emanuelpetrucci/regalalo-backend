import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresUserRepository } from '../src/infrastructure/database/supabase/user.repository';

const USER_UUID = '550e8400-e29b-41d4-a716-446655440000';

function createMockPool() {
  return {
    query: vi.fn(),
    connect: vi.fn(),
  } as unknown as Pool;
}

describe('PostgresUserRepository — findReputationHistory role (11.1)', () => {
  let pool: Pool;
  let repo: PostgresUserRepository;

  beforeEach(() => {
    pool = createMockPool();
    repo = new PostgresUserRepository(pool);
    vi.clearAllMocks();
  });

  it('maps role from SELECT including historical NULL rows', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          type: 'delivery_completed',
          delta: 10,
          session_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          created_at: new Date('2026-05-01T10:00:00.000Z'),
          role: 'donor',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          type: 'no_show',
          delta: -20,
          session_id: null,
          created_at: new Date('2026-01-01T00:00:00.000Z'),
          role: null,
        },
      ],
      rowCount: 2,
    } as never);

    const events = await repo.findReputationHistory(USER_UUID);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('role'),
      [USER_UUID],
    );
    expect(events[0].role).toBe('donor');
    expect(events[1].role).toBeNull();
  });
});
