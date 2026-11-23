/**
 * [Source: docs/test-cases-ranking-v1.0.md] — CASO-01…11, 20–22, 24
 * [Source: docs/ranking-spec-v1.0.md#12-matriz-de-verificación-qa] — QA-01…06, QA-10
 *
 * # Trazabilidad CASO-01…24 (reputación / confirm-cancel)
 * | CASO | Archivo | Test |
 * |------|---------|------|
 * | 01 | ranking-qa-reputation.test.ts | CASO-01 — confirm primera donación |
 * | 02 | ranking-qa-reputation.test.ts | CASO-02 — confirm donante con historial |
 * | 03 | ranking-qa-reputation.test.ts | CASO-03 — receptor siempre +1 |
 * | 04 | ranking-qa-reputation.test.ts | CASO-04 — confirm resetea racha no-show |
 * | 05 | ranking-qa-reputation.test.ts | CASO-05 — segunda donación +10 |
 * | 06 | ranking-qa-reputation.test.ts | CASO-06 — primer no-show |
 * | 07 | ranking-qa-reputation.test.ts | CASO-07 — segundo no-show |
 * | 08 | ranking-qa-reputation.test.ts | CASO-08 — tercer no-show |
 * | 09 | ranking-qa-reputation.test.ts | CASO-09 — no-show tras confirm vuelve a -10 |
 * | 10 | delivery-sessions-cancel.test.ts + ranking-qa-reputation.test.ts | CASO-10 — cancel sin no-show |
 * | 11 | expire-delivery-sessions.test.ts | CASO-11 — expiración sin penalización |
 * | 12–19, 23 | ranking-qa-tier.test.ts | ver cabecera ranking-qa-tier.test.ts |
 * | 20 | ranking-qa-reputation.test.ts | CASO-20 — Tier 2 + primera donación +15 |
 * | 21 | ranking-qa-reputation.test.ts | CASO-21 — receptor +1 independiente del donante |
 * | 22 | ranking-qa-reputation.test.ts | CASO-22 — exactamente 2 eventos por entrega |
 * | 24 | ranking-qa-reputation.test.ts | CASO-24 — racha 3 + confirm como donante |
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresDeliverySessionRepository } from '../src/infrastructure/database/supabase/delivery-session.repository';

const DONOR_UUID = '550e8400-e29b-41d4-a716-446655440000';
const RECEIVER_UUID = '660e8400-e29b-41d4-a716-446655440001';
const SESSION_UUID = '11111111-2222-4333-8444-555555555555';
const ITEM_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const sessionRow = {
  donor_id: DONOR_UUID,
  receiver_id: RECEIVER_UUID,
  item_id: ITEM_UUID,
  created_at: new Date('2026-05-12T10:00:00.000Z'),
  status: 'active',
  donor_confirmed: false,
  category: 'furniture' as const,
  weight_range: '1to5' as const,
};

const cancelSessionRow = {
  donor_id: DONOR_UUID,
  receiver_id: RECEIVER_UUID,
  item_id: ITEM_UUID,
  created_at: new Date('2026-05-12T10:00:00.000Z'),
  status: 'active',
  category: 'furniture' as const,
};

function createMockPool() {
  return {
    query: vi.fn(),
    connect: vi.fn(),
  } as unknown as Pool;
}

function createConfirmMockClient(totalDonatedBefore: number) {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };

  client.query
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ rows: [sessionRow] })
    .mockResolvedValueOnce({ rows: [{ completed_at: new Date('2026-05-13T10:00:00.000Z') }] })
    .mockResolvedValueOnce({ rows: [{ total_donated: totalDonatedBefore }] })
    .mockResolvedValueOnce({ rows: [{ reputation_score: 52 }] })
    .mockResolvedValueOnce({ rows: [{ reputation_score: 31 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce(undefined);

  return client;
}

function createNoShowMockClient(consecutiveAfterIncrement: number, newScore: number) {
  const delta = -10 * consecutiveAfterIncrement;
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };

  client.query
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ rows: [cancelSessionRow] })
    .mockResolvedValueOnce({ rows: [{ completed_at: new Date('2026-05-13T10:00:00.000Z') }] })
    .mockResolvedValueOnce({ rows: [{ consecutive_no_shows: consecutiveAfterIncrement }] })
    .mockResolvedValueOnce({ rows: [{ reputation_score: newScore }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce(undefined);

  return { client, delta };
}

function createCancelNoShowFalseMockClient() {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };

  client.query
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ rows: [cancelSessionRow] })
    .mockResolvedValueOnce({ rows: [{ completed_at: new Date('2026-05-13T10:00:00.000Z') }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce(undefined);

  return client;
}

function countReputationEventInserts(client: { query: ReturnType<typeof vi.fn> }): number {
  return client.query.mock.calls.filter(
    ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO reputation_events'),
  ).length;
}

describe('Ranking QA — reputación confirm/cancel (PostgresDeliverySessionRepository)', () => {
  let pool: Pool;
  let repo: PostgresDeliverySessionRepository;

  beforeEach(() => {
    pool = createMockPool();
    repo = new PostgresDeliverySessionRepository(pool);
    vi.clearAllMocks();
  });

  it('CASO-02 — confirm donante con historial: +10/+1 y roles en reputation_events (QA-01)', async () => {
    const client = createConfirmMockClient(2);
    vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

    const result = await repo.confirmDelivery(SESSION_UUID, DONOR_UUID);

    expect(result.donorDelta).toBe(10);
    expect(result.receiverDelta).toBe(1);

    const insertCall = client.query.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO reputation_events'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![0]).toContain('role');
    expect(insertCall![0]).toContain("'donor'");
    expect(insertCall![0]).toContain("'receiver'");
    expect(insertCall![1]).toEqual([DONOR_UUID, RECEIVER_UUID, SESSION_UUID, 10]);
  });

  it('CASO-01 — confirm primera donación: donante +15, receptor +1 (QA-02)', async () => {
    const client = createConfirmMockClient(0);
    vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

    const result = await repo.confirmDelivery(SESSION_UUID, DONOR_UUID);

    expect(result.donorDelta).toBe(15);
    expect(result.receiverDelta).toBe(1);

    const insertCall = client.query.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO reputation_events'),
    );
    expect(insertCall![1]).toEqual([DONOR_UUID, RECEIVER_UUID, SESSION_UUID, 15]);
  });

  it('CASO-03 — receptor siempre gana +1 con donante primerizo o veterano', async () => {
    for (const totalDonatedBefore of [0, 3]) {
      const client = createConfirmMockClient(totalDonatedBefore);
      vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

      const result = await repo.confirmDelivery(SESSION_UUID, DONOR_UUID);
      expect(result.receiverDelta).toBe(1);
    }
  });

  it('CASO-05 — segunda donación del mismo usuario: donante +10, no +15', async () => {
    const client = createConfirmMockClient(1);
    vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

    const result = await repo.confirmDelivery(SESSION_UUID, DONOR_UUID);

    expect(result.donorDelta).toBe(10);
    expect(result.receiverDelta).toBe(1);

    const insertCall = client.query.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO reputation_events'),
    );
    expect(insertCall![1]).toEqual([DONOR_UUID, RECEIVER_UUID, SESSION_UUID, 10]);
  });

  it('CASO-06 — primer no-show: delta -10, consecutive_no_shows=1 (QA-03)', async () => {
    const { client, delta } = createNoShowMockClient(1, 22);
    vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

    const result = await repo.cancelDelivery({
      sessionId: SESSION_UUID,
      donorId: DONOR_UUID,
      noShow: true,
    });

    expect(result.receiverDelta).toBe(delta);
    expect(result.receiverConsecutiveNoShows).toBe(1);
    expect(delta).toBe(-10);

    const insertCall = client.query.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO reputation_events'),
    );
    expect(insertCall![0]).toContain('role');
    expect(insertCall![1]).toEqual([RECEIVER_UUID, -10, SESSION_UUID]);
  });

  it('CASO-07 — segundo no-show consecutivo: delta -20 (QA-04)', async () => {
    const { client, delta } = createNoShowMockClient(2, 0);
    vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

    const result = await repo.cancelDelivery({
      sessionId: SESSION_UUID,
      donorId: DONOR_UUID,
      noShow: true,
    });

    expect(result.receiverDelta).toBe(-20);
    expect(result.receiverConsecutiveNoShows).toBe(2);
    expect(delta).toBe(-20);
  });

  it('CASO-08 — tercer no-show consecutivo: delta -30 (QA-05)', async () => {
    const { client, delta } = createNoShowMockClient(3, -10);
    vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

    const result = await repo.cancelDelivery({
      sessionId: SESSION_UUID,
      donorId: DONOR_UUID,
      noShow: true,
    });

    expect(result.receiverDelta).toBe(-30);
    expect(result.receiverConsecutiveNoShows).toBe(3);
    expect(delta).toBe(-30);
  });

  it('CASO-04 — confirm tras racha no-show resetea consecutive_no_shows (QA-06)', async () => {
    const client = createConfirmMockClient(1);
    vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

    await repo.confirmDelivery(SESSION_UUID, DONOR_UUID);

    const donorUpdate = client.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('total_donated = total_donated + 1'),
    );
    const receiverUpdate = client.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('total_received = total_received + 1'),
    );

    expect(donorUpdate![0]).toContain('consecutive_no_shows = 0');
    expect(receiverUpdate![0]).toContain('consecutive_no_shows = 0');
  });

  it('CASO-09 — no-show tras entrega exitosa se trata como primero: -10 (QA-06)', async () => {
    const { client, delta } = createNoShowMockClient(1, 18);
    vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

    const result = await repo.cancelDelivery({
      sessionId: SESSION_UUID,
      donorId: DONOR_UUID,
      noShow: true,
    });

    expect(result.receiverDelta).toBe(-10);
    expect(result.receiverConsecutiveNoShows).toBe(1);
    expect(delta).toBe(-10);
  });

  it('CASO-10 — cancel sin no-show: sin INSERT reputation_events ni delta receptor', async () => {
    const client = createCancelNoShowFalseMockClient();
    vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

    const result = await repo.cancelDelivery({
      sessionId: SESSION_UUID,
      donorId: DONOR_UUID,
      noShow: false,
    });

    expect(result.noShowDeclared).toBe(false);
    expect(result.receiverDelta).toBeUndefined();
    expect(countReputationEventInserts(client)).toBe(0);

    const noShowIncrement = client.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('consecutive_no_shows = consecutive_no_shows + 1'),
    );
    expect(noShowIncrement).toBeUndefined();
  });

  it('CASO-22 — confirm registra exactamente 2 entradas en reputation_events', async () => {
    const client = createConfirmMockClient(1);
    vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

    await repo.confirmDelivery(SESSION_UUID, DONOR_UUID);

    const insertCalls = client.query.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO reputation_events'),
    );
    expect(insertCalls).toHaveLength(1);

    const insertSql = insertCalls[0]![0] as string;
    expect(insertSql).toContain("'donor'");
    expect(insertSql).toContain("'receiver'");
    expect(insertCalls[0]![1]).toEqual([DONOR_UUID, RECEIVER_UUID, SESSION_UUID, 10]);
  });

  it('CASO-21 — receptor +1 sin importar historial del donante (3 escenarios)', async () => {
    for (const totalDonatedBefore of [0, 1, 5]) {
      const client = createConfirmMockClient(totalDonatedBefore);
      vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

      const result = await repo.confirmDelivery(SESSION_UUID, DONOR_UUID);
      expect(result.receiverDelta).toBe(1);
    }
  });

  it('CASO-24 — racha 3 como receptor + confirm como donante resetea racha', async () => {
    const client = createConfirmMockClient(2);
    vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

    const result = await repo.confirmDelivery(SESSION_UUID, DONOR_UUID);

    expect(result.donorDelta).toBe(10);
    expect(result.receiverDelta).toBe(1);

    const receiverUpdate = client.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('total_received = total_received + 1'),
    );
    expect(receiverUpdate![0]).toContain('consecutive_no_shows = 0');
  });
});

describe('Ranking QA — rehabilitación tras primera donación (CASO-17, CASO-20)', () => {
  let pool: Pool;
  let repo: PostgresDeliverySessionRepository;

  beforeEach(() => {
    pool = createMockPool();
    repo = new PostgresDeliverySessionRepository(pool);
    vi.clearAllMocks();
  });

  it('CASO-17 — confirm primera donación: total_donated prev 0 → delta +15 (QA-10)', async () => {
    const client = createConfirmMockClient(0);
    vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

    const result = await repo.confirmDelivery(SESSION_UUID, DONOR_UUID);

    expect(result.donorDelta).toBe(15);

    const donorUpdate = client.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('total_donated = total_donated + 1'),
    );
    expect(donorUpdate).toBeDefined();
    expect(donorUpdate![0]).toContain('total_donated = total_donated + 1');
  });

  it('CASO-20 — Tier 2 rehabilitación: primera donación +15 y total_donated incrementa', async () => {
    const client = createConfirmMockClient(0);
    vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

    const result = await repo.confirmDelivery(SESSION_UUID, DONOR_UUID);

    expect(result.donorDelta).toBe(15);
    expect(result.receiverDelta).toBe(1);

    const donorUpdate = client.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('total_donated = total_donated + 1'),
    );
    expect(donorUpdate).toBeDefined();
  });
});
