import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresRequestRepository } from '../src/infrastructure/database/supabase/request.repository';
import {
  HOARDER_TIER1_PENALTY_CASE_SQL,
  RANKED_ELIGIBLE_REQUESTER_SQL,
} from '../src/infrastructure/database/sql/ranked-candidate-filters';

const ITEM_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function createMockPool() {
  return {
    query: vi.fn(),
    connect: vi.fn(),
  } as unknown as Pool;
}

describe('PostgresRequestRepository — findRankedCandidates RFC-003 (11.3)', () => {
  let pool: Pool;
  let repo: PostgresRequestRepository;

  beforeEach(() => {
    pool = createMockPool();
    repo = new PostgresRequestRepository(pool);
    vi.clearAllMocks();
  });

  it('uses Tier 1 penalty CASE and eligible visibility filter; omits legacy FR18', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await repo.findRankedCandidates(ITEM_UUID);

    const [sql] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain(HOARDER_TIER1_PENALTY_CASE_SQL.trim());
    expect(sql).toContain(RANKED_ELIGIBLE_REQUESTER_SQL.trim());
    expect(sql).not.toContain('total_received > 5 * u.total_donated');
    expect(sql).not.toContain('cycles_at_limit >= 3');
  });
});
