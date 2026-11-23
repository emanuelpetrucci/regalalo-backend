import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresUserRepository } from '../src/infrastructure/database/supabase/user.repository';
import {
  RANKED_ELIGIBLE_REQUESTER_SQL,
  HOARDER_TIER1_PENALTY_CASE_SQL,
} from '../src/infrastructure/database/sql/ranked-candidate-filters';

const DONOR_UUID = '550e8400-e29b-41d4-a716-446655440000';

function createMockPool() {
  return {
    query: vi.fn(),
    connect: vi.fn(),
  } as unknown as Pool;
}

describe('PostgresUserRepository — requestCount / pending_count RFC-003 (11.3)', () => {
  let pool: Pool;
  let repo: PostgresUserRepository;

  beforeEach(() => {
    pool = createMockPool();
    repo = new PostgresUserRepository(pool);
    vi.clearAllMocks();
  });

  it('findMyItems pending_count uses RANKED_ELIGIBLE (FR17 + Tier 2), not Tier 1 penalty', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await repo.findMyItems({
      donorId: DONOR_UUID,
      status: 'active',
      limit: 10,
      offset: 0,
    });

    const allSqls = vi.mocked(pool.query).mock.calls.map(([sql]) => sql as string);
    const itemsSql = allSqls.find(sql => sql.includes('pending_count')) ?? '';
    expect(itemsSql).not.toBe('');
    expect(itemsSql).toContain(RANKED_ELIGIBLE_REQUESTER_SQL.trim());
    expect(itemsSql).not.toContain(HOARDER_TIER1_PENALTY_CASE_SQL.trim());
  });
});
