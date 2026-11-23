/**
 * [Source: docs/test-cases-ranking-v1.0.md] — CASO-12…19, 23
 * [Source: docs/ranking-spec-v1.0.md#12-matriz-de-verificación-qa] — QA-07…14
 *
 * # Trazabilidad CASO-12…19, 23 (ranking Tier / visibilidad)
 * | CASO | Test |
 * |------|------|
 * | 12 | CASO-12 — Tier 0 visible sin penalización |
 * | 13 | CASO-13 — Tier 1 penalización -15 en effective_score |
 * | 14 | CASO-14 — Tier 2 excluido de candidatos |
 * | 15 | CASO-15 — requestCount excluye Tier 2 |
 * | 16 | CASO-16 — muchos ciclos con donación sin penalización |
 * | 17 | ranking-qa-reputation.test.ts — CASO-17 |
 * | 18 | CASO-18 — Tier 1 no aplica tras total_donated >= 1 |
 * | 19 | CASO-19 — usuario pasivo FR17 excluido |
 * | 20 | ranking-qa-reputation.test.ts — CASO-20 |
 * | 23 | CASO-23 — exclusión Tier 2 precede perturbación RANDOM |
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresRequestRepository } from '../src/infrastructure/database/supabase/request.repository';
import { PostgresUserRepository } from '../src/infrastructure/database/supabase/user.repository';
import {
  PASSIVE_REQUESTER_SQL,
  HOARDER_TIER1_PENALTY_CASE_SQL,
  HOARDER_TIER2_EXCLUSION_SQL,
  RANKED_ELIGIBLE_REQUESTER_SQL,
  RANKED_VISIBLE_REQUESTER_SQL,
} from '../src/infrastructure/database/sql/ranked-candidate-filters';

const ITEM_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const DONOR_UUID = '550e8400-e29b-41d4-a716-446655440000';
const USER_NORMAL = '11111111-1111-4111-8111-111111111111';
const USER_TIER2 = '22222222-2222-4222-8222-222222222222';

function createMockPool() {
  return {
    query: vi.fn(),
    connect: vi.fn(),
  } as unknown as Pool;
}

describe('Ranking QA — ranked-candidate-filters (constantes SQL)', () => {
  it('CASO-12 — usuario sin ciclos agotados: visible en RANKED_ELIGIBLE (QA-07)', () => {
    expect(RANKED_ELIGIBLE_REQUESTER_SQL).toContain(RANKED_VISIBLE_REQUESTER_SQL);
    expect(RANKED_ELIGIBLE_REQUESTER_SQL).not.toContain('cycles_at_limit >= 0');
    expect(HOARDER_TIER2_EXCLUSION_SQL).toContain('cycles_at_limit >= 2');
  });

  it('CASO-13 — Tier 1 aplica penalización -15 cuando cycles>=1 y donated=0 (QA-08)', () => {
    expect(HOARDER_TIER1_PENALTY_CASE_SQL).toContain('u.cycles_at_limit >= 1');
    expect(HOARDER_TIER1_PENALTY_CASE_SQL).toContain('u.total_donated = 0');
    expect(HOARDER_TIER1_PENALTY_CASE_SQL).toContain('THEN 15');
  });

  it('CASO-14 — Tier 2 excluido de RANKED_ELIGIBLE (QA-09)', () => {
    expect(RANKED_ELIGIBLE_REQUESTER_SQL).toContain(`NOT ${HOARDER_TIER2_EXCLUSION_SQL}`);
    expect(HOARDER_TIER2_EXCLUSION_SQL).toContain('u.cycles_at_limit >= 2');
    expect(HOARDER_TIER2_EXCLUSION_SQL).toContain('u.total_donated = 0');
  });

  it('CASO-16 — total_donated >= 1: ni Tier 1 ni Tier 2 aplican (QA-11)', () => {
    expect(HOARDER_TIER1_PENALTY_CASE_SQL).toContain('u.total_donated = 0');
    expect(HOARDER_TIER2_EXCLUSION_SQL).toContain('u.total_donated = 0');

    const tier1WouldPenalize = (cyclesAtLimit: number, totalDonated: number) =>
      cyclesAtLimit >= 1 && totalDonated === 0;
    const tier2WouldExclude = (cyclesAtLimit: number, totalDonated: number) =>
      cyclesAtLimit >= 2 && totalDonated === 0;

    expect(tier1WouldPenalize(5, 1)).toBe(false);
    expect(tier2WouldExclude(5, 1)).toBe(false);
  });

  it('CASO-18 — Tier 1 no aplica cuando total_donated >= 1', () => {
    const tier1WouldPenalize = (cyclesAtLimit: number, totalDonated: number) =>
      cyclesAtLimit >= 1 && totalDonated === 0;

    expect(tier1WouldPenalize(1, 0)).toBe(true);
    expect(tier1WouldPenalize(1, 1)).toBe(false);
    expect(HOARDER_TIER1_PENALTY_CASE_SQL).toContain('u.total_donated = 0');
  });

  it('CASO-19 — pasivo FR17 excluido antes de evaluar Tier 1 (QA-12)', () => {
    expect(RANKED_ELIGIBLE_REQUESTER_SQL).toContain(RANKED_VISIBLE_REQUESTER_SQL);
    expect(PASSIVE_REQUESTER_SQL).toContain('last_active_at < NOW() - INTERVAL \'60 days\'');
    expect(RANKED_VISIBLE_REQUESTER_SQL).toBe(`NOT ${PASSIVE_REQUESTER_SQL}`);
  });
});

describe('Ranking QA — PostgresRequestRepository.findRankedCandidates', () => {
  let pool: Pool;
  let repo: PostgresRequestRepository;

  beforeEach(() => {
    pool = createMockPool();
    repo = new PostgresRequestRepository(pool);
    vi.clearAllMocks();
  });

  it('CASO-12 — SQL incluye filtro elegible y devuelve candidato Tier 0 (QA-07)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{
        request_id: 'ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb',
        user_id: USER_NORMAL,
        first_name: 'Ana',
        last_name: 'Normal',
        reputation_score: 50,
        distance_meters: 1000,
        request_date: new Date('2026-05-06T09:00:00.000Z'),
      }],
      rowCount: 1,
    } as never);

    const candidates = await repo.findRankedCandidates(ITEM_UUID);

    const [sql] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain(RANKED_ELIGIBLE_REQUESTER_SQL.trim());
    expect(candidates).toHaveLength(1);
    expect(candidates[0].userId).toBe(USER_NORMAL);
  });

  it('CASO-13 — SQL incluye CASE Tier 1 para orden por effective_score (QA-08)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await repo.findRankedCandidates(ITEM_UUID);

    const [sql] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain(HOARDER_TIER1_PENALTY_CASE_SQL.trim());
    expect(sql).toContain('effective_score');
    expect(sql).toContain('ORDER BY effective_score DESC');
  });

  it('CASO-14 — Tier 2 excluido vía RANKED_ELIGIBLE en WHERE (QA-09)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{
        request_id: 'ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb',
        user_id: USER_NORMAL,
        first_name: 'Ana',
        last_name: 'Normal',
        reputation_score: 50,
        distance_meters: 1000,
        request_date: new Date('2026-05-06T09:00:00.000Z'),
      }],
      rowCount: 1,
    } as never);

    const candidates = await repo.findRankedCandidates(ITEM_UUID);

    const [sql] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain(RANKED_ELIGIBLE_REQUESTER_SQL.trim());
    expect(candidates.map(c => c.userId)).not.toContain(USER_TIER2);
    expect(candidates).toHaveLength(1);
  });

  it('CASO-23 — exclusión Tier 2 en WHERE; perturbación solo aplica a elegibles (QA-13)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await repo.findRankedCandidates(ITEM_UUID);

    const sql = vi.mocked(pool.query).mock.calls[0]![0] as string;
    const whereIndex = sql.indexOf('WHERE ir.item_id');
    expect(whereIndex).toBeGreaterThan(-1);
    expect(sql.indexOf(RANKED_ELIGIBLE_REQUESTER_SQL.trim(), whereIndex)).toBeGreaterThan(whereIndex);
    expect(sql).toContain(`NOT ${HOARDER_TIER2_EXCLUSION_SQL}`);
    expect(sql).toMatch(/FLOOR\(RANDOM\(\) \* 5 - 2\)/);
  });
});

describe('Ranking QA — requestCount vs candidates (CASO-15)', () => {
  let requestPool: Pool;
  let userPool: Pool;
  let requestRepo: PostgresRequestRepository;
  let userRepo: PostgresUserRepository;

  beforeEach(() => {
    requestPool = createMockPool();
    userPool = createMockPool();
    requestRepo = new PostgresRequestRepository(requestPool);
    userRepo = new PostgresUserRepository(userPool);
    vi.clearAllMocks();
  });

  it('CASO-15 — requestCount excluye Tier 2 y coincide con candidates (QA-09, QA-14)', async () => {
    vi.mocked(requestPool.query).mockResolvedValueOnce({
      rows: [{
        request_id: 'ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb',
        user_id: USER_NORMAL,
        first_name: 'Ana',
        last_name: 'Normal',
        reputation_score: 50,
        distance_meters: 1000,
        request_date: new Date('2026-05-06T09:00:00.000Z'),
      }],
      rowCount: 1,
    } as never);

    const candidates = await requestRepo.findRankedCandidates(ITEM_UUID);
    expect(candidates).toHaveLength(1);

    const [candidatesSql] = vi.mocked(requestPool.query).mock.calls[0];
    expect(candidatesSql).toContain(RANKED_ELIGIBLE_REQUESTER_SQL.trim());

    vi.mocked(userPool.query)
      .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 } as never)
      .mockResolvedValueOnce({
        rows: [{
          id: ITEM_UUID,
          title: 'Silla',
          category: 'furniture',
          condition: 'good',
          status: 'active',
          degraded_at: null,
          image_paths: [],
          created_at: new Date('2026-05-01T00:00:00.000Z'),
          completed_at: null,
          requests_paused: false,
          pending_count: '1',
        }],
        rowCount: 1,
      } as never);

    const { items } = await userRepo.findMyItems({
      userId: DONOR_UUID,
      status: 'active',
      page: 1,
      limit: 10,
    });

    const itemsSql = vi.mocked(userPool.query).mock.calls[1][0] as string;
    expect(itemsSql).toContain(RANKED_ELIGIBLE_REQUESTER_SQL.trim());
    expect(items[0].requestCount).toBe(1);
    expect(candidates.length).toBe(items[0].requestCount);
  });
});

describe('Ranking QA — rehabilitación visibilidad (CASO-17)', () => {
  it('CASO-17 — Tier 2 excluido antes de donar; total_donated>=1 rompe exclusión (QA-10)', () => {
    expect(HOARDER_TIER2_EXCLUSION_SQL).toContain('cycles_at_limit >= 2');
    expect(HOARDER_TIER2_EXCLUSION_SQL).toContain('total_donated = 0');

    const tier2WouldExclude = (cyclesAtLimit: number, totalDonated: number) =>
      cyclesAtLimit >= 2 && totalDonated === 0;

    expect(tier2WouldExclude(2, 0)).toBe(true);
    expect(tier2WouldExclude(2, 1)).toBe(false);
  });
});
