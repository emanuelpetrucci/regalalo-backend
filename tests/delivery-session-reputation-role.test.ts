import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresDeliverySessionRepository } from '../src/infrastructure/database/supabase/delivery-session.repository';

const SESSION_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const DONOR_UUID = '550e8400-e29b-41d4-a716-446655440001';
const RECEIVER_UUID = '550e8400-e29b-41d4-a716-446655440002';
const ITEM_UUID = '660e8400-e29b-41d4-a716-446655440003';

function createMockPool() {
  return {
    query: vi.fn(),
    connect: vi.fn(),
  } as unknown as Pool;
}

describe('PostgresDeliverySessionRepository — reputation deltas (11.2)', () => {
  let pool: Pool;
  let repo: PostgresDeliverySessionRepository;

  beforeEach(() => {
    pool = createMockPool();
    repo = new PostgresDeliverySessionRepository(pool);
    vi.clearAllMocks();
  });

  describe('confirmDelivery', () => {
    it('reads total_donated before update and applies asymmetric deltas', async () => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({
            rows: [{
              donor_id: DONOR_UUID,
              receiver_id: RECEIVER_UUID,
              item_id: ITEM_UUID,
              created_at: new Date('2026-05-01T10:00:00.000Z'),
              status: 'active',
              donor_confirmed: false,
              category: 'furniture',
              weight_range: 'medium',
            }],
          })
          .mockResolvedValueOnce({ rows: [{ completed_at: new Date() }] })
          .mockResolvedValueOnce({ rows: [{ total_donated: 0 }] })
          .mockResolvedValueOnce({ rows: [{ reputation_score: 25 }] })
          .mockResolvedValueOnce({ rows: [{ reputation_score: 11 }] })
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined),
        release: vi.fn(),
      };
      vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

      const result = await repo.confirmDelivery(SESSION_UUID, DONOR_UUID);

      expect(result.donorDelta).toBe(15);
      expect(result.receiverDelta).toBe(1);

      const totalDonatedSelect = client.query.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('SELECT total_donated'),
      );
      expect(totalDonatedSelect).toBeDefined();
      expect(totalDonatedSelect![0] as string).toContain('FOR UPDATE');

      const donorUpdate = client.query.mock.calls.find(
        ([sql, params]) =>
          typeof sql === 'string'
          && sql.includes('total_donated = total_donated + 1')
          && params?.[1] === 15,
      );
      expect(donorUpdate).toBeDefined();

      const reputationInsert = client.query.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO reputation_events'),
      );
      expect(reputationInsert).toBeDefined();
      expect(reputationInsert![1]).toEqual([DONOR_UUID, RECEIVER_UUID, SESSION_UUID, 15]);
      const insertSql = reputationInsert![0] as string;
      expect(insertSql).toMatch(
        /\(\$1,\s*'delivery_completed',\s*\$4,\s*\$3,\s*'donor'\)/,
      );
      expect(insertSql).toMatch(
        /\(\$2,\s*'delivery_completed',\s*1,\s*\$3,\s*'receiver'\)/,
      );
    });

    it('applies +10 donor delta when total_donated > 0', async () => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({
            rows: [{
              donor_id: DONOR_UUID,
              receiver_id: RECEIVER_UUID,
              item_id: ITEM_UUID,
              created_at: new Date('2026-05-01T10:00:00.000Z'),
              status: 'active',
              donor_confirmed: false,
              category: 'furniture',
              weight_range: 'medium',
            }],
          })
          .mockResolvedValueOnce({ rows: [{ completed_at: new Date() }] })
          .mockResolvedValueOnce({ rows: [{ total_donated: 2 }] })
          .mockResolvedValueOnce({ rows: [{ reputation_score: 20 }] })
          .mockResolvedValueOnce({ rows: [{ reputation_score: 11 }] })
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined),
        release: vi.fn(),
      };
      vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

      const result = await repo.confirmDelivery(SESSION_UUID, DONOR_UUID);

      expect(result.donorDelta).toBe(10);
      expect(result.receiverDelta).toBe(1);
    });
  });

  describe('cancelDelivery (noShow)', () => {
    it('applies -10 base penalty on first no-show', async () => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({
            rows: [{
              donor_id: DONOR_UUID,
              receiver_id: RECEIVER_UUID,
              item_id: ITEM_UUID,
              created_at: new Date('2026-05-01T10:00:00.000Z'),
              status: 'active',
              category: 'furniture',
            }],
          })
          .mockResolvedValueOnce({ rows: [{ completed_at: new Date() }] })
          .mockResolvedValueOnce({ rows: [{ consecutive_no_shows: 1 }] })
          .mockResolvedValueOnce({ rows: [{ reputation_score: -10 }] })
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined),
        release: vi.fn(),
      };
      vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

      const result = await repo.cancelDelivery({
        sessionId: SESSION_UUID,
        donorId: DONOR_UUID,
        noShow: true,
      });

      expect(result.receiverDelta).toBe(-10);

      const reputationInsert = client.query.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO reputation_events'),
      );
      expect(reputationInsert![1]).toEqual([RECEIVER_UUID, -10, SESSION_UUID]);
    });
  });
});
