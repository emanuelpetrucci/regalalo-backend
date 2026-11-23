import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresDeliverySessionRepository } from '../src/infrastructure/database/supabase/delivery-session.repository';
import {
  INTEGRATION_DATABASE_URL,
  isIntegrationDatabaseReady,
} from './helpers/integration-db';

describe('PostgresDeliverySessionRepository — asymmetric reputation deltas (11.2)', () => {
  let pool: Pool;
  let dbReady = false;
  const createdUserIds: string[] = [];
  const createdItemIds: string[] = [];
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    dbReady = await isIntegrationDatabaseReady();
    if (!dbReady) return;
    pool = new Pool({ connectionString: INTEGRATION_DATABASE_URL });
  });

  afterEach(async () => {
    if (!dbReady || !pool) return;
    if (createdSessionIds.length > 0) {
      await pool.query(
        'DELETE FROM reputation_events WHERE session_id = ANY($1::uuid[])',
        [createdSessionIds],
      );
      await pool.query('DELETE FROM delivery_sessions WHERE id = ANY($1::uuid[])', [
        createdSessionIds,
      ]);
      createdSessionIds.length = 0;
    }
    if (createdItemIds.length > 0) {
      await pool.query('DELETE FROM items WHERE id = ANY($1::uuid[])', [createdItemIds]);
      createdItemIds.length = 0;
    }
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
      createdUserIds.length = 0;
    }
  });

  async function insertUser(
    suffix: string,
    opts: {
      totalDonated?: number;
      reputationScore?: number;
      consecutiveNoShows?: number;
    } = {},
  ): Promise<string> {
    const email = `rep-delta-${suffix}-${randomUUID()}@integration.test`;
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (
         email, password_hash, postal_code, location,
         first_name, last_name, email_verified, is_active,
         total_donated, reputation_score, consecutive_no_shows
       ) VALUES (
         $1, 'test-hash', '28001',
         ST_SetSRID(ST_MakePoint(-3.7038, 40.4168), 4326)::geography,
         $2, 'User', TRUE, TRUE,
         $3, $4, $5
       ) RETURNING id`,
      [
        email,
        suffix,
        opts.totalDonated ?? 0,
        opts.reputationScore ?? 0,
        opts.consecutiveNoShows ?? 0,
      ],
    );
    createdUserIds.push(rows[0].id);
    return rows[0].id;
  }

  async function insertActiveSession(donorId: string, receiverId: string): Promise<string> {
    const { rows: itemRows } = await pool.query<{ id: string }>(
      `INSERT INTO items (
         donor_id, title, description, condition, location, category, weight_range, status, slug
       ) VALUES (
         $1, 'Test item', 'Desc', 'good',
         ST_SetSRID(ST_MakePoint(-3.7038, 40.4168), 4326)::geography,
         'other', 'lt1', 'reserved', $2
       ) RETURNING id`,
      [donorId, `test-item-${randomUUID()}`],
    );
    const itemId = itemRows[0].id;
    createdItemIds.push(itemId);

    const { rows: sessionRows } = await pool.query<{ id: string }>(
      `INSERT INTO delivery_sessions (item_id, donor_id, receiver_id, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id`,
      [itemId, donorId, receiverId],
    );
    const sessionId = sessionRows[0].id;
    createdSessionIds.push(sessionId);
    return sessionId;
  }

  it('QA-02 — first donation: donor +15, receiver +1', async (ctx) => {
    if (!dbReady) ctx.skip();

    const donorId = await insertUser('donor-first', { totalDonated: 0, reputationScore: 0 });
    const receiverId = await insertUser('receiver-first', { reputationScore: 0 });
    const sessionId = await insertActiveSession(donorId, receiverId);
    const repo = new PostgresDeliverySessionRepository(pool);

    const result = await repo.confirmDelivery(sessionId, donorId);

    expect(result.donorDelta).toBe(15);
    expect(result.receiverDelta).toBe(1);

    const { rows: users } = await pool.query<{ id: string; reputation_score: number }>(
      `SELECT id, reputation_score FROM users WHERE id = ANY($1::uuid[])`,
      [[donorId, receiverId]],
    );
    const donorScore = users.find(u => u.id === donorId)!.reputation_score;
    const receiverScore = users.find(u => u.id === receiverId)!.reputation_score;
    expect(donorScore).toBe(15);
    expect(receiverScore).toBe(1);

    const { rows: events } = await pool.query<{ user_id: string; delta: number; role: string }>(
      `SELECT user_id, delta, role FROM reputation_events
       WHERE session_id = $1 ORDER BY role`,
      [sessionId],
    );
    expect(events).toEqual(
      expect.arrayContaining([
        { user_id: donorId, delta: 15, role: 'donor' },
        { user_id: receiverId, delta: 1, role: 'receiver' },
      ]),
    );
  });

  it('QA-01 — repeat donor: donor +10, receiver +1', async (ctx) => {
    if (!dbReady) ctx.skip();

    const donorId = await insertUser('donor-repeat', { totalDonated: 3, reputationScore: 30 });
    const receiverId = await insertUser('receiver-repeat', { reputationScore: 5 });
    const sessionId = await insertActiveSession(donorId, receiverId);
    const repo = new PostgresDeliverySessionRepository(pool);

    const result = await repo.confirmDelivery(sessionId, donorId);

    expect(result.donorDelta).toBe(10);
    expect(result.receiverDelta).toBe(1);

    const { rows: users } = await pool.query<{ id: string; reputation_score: number }>(
      `SELECT id, reputation_score FROM users WHERE id = ANY($1::uuid[])`,
      [[donorId, receiverId]],
    );
    expect(users.find(u => u.id === donorId)!.reputation_score).toBe(40);
    expect(users.find(u => u.id === receiverId)!.reputation_score).toBe(6);

    const { rows: events } = await pool.query<{ user_id: string; delta: number; role: string }>(
      `SELECT user_id, delta, role FROM reputation_events
       WHERE session_id = $1 ORDER BY role`,
      [sessionId],
    );
    expect(events).toEqual(
      expect.arrayContaining([
        { user_id: donorId, delta: 10, role: 'donor' },
        { user_id: receiverId, delta: 1, role: 'receiver' },
      ]),
    );
  });

  it('QA-03 — first no-show: receiver delta -10', async (ctx) => {
    if (!dbReady) ctx.skip();

    const donorId = await insertUser('donor-ns');
    const receiverId = await insertUser('receiver-ns', { reputationScore: 20 });
    const sessionId = await insertActiveSession(donorId, receiverId);
    const repo = new PostgresDeliverySessionRepository(pool);

    const result = await repo.cancelDelivery({
      sessionId,
      donorId,
      noShow: true,
    });

    expect(result.receiverDelta).toBe(-10);

    const { rows: events } = await pool.query<{ delta: number; role: string; type: string }>(
      `SELECT delta, role, type FROM reputation_events WHERE session_id = $1`,
      [sessionId],
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ delta: -10, role: 'receiver', type: 'no_show' });

    const { rows: receiverRows } = await pool.query<{ reputation_score: number; consecutive_no_shows: number }>(
      `SELECT reputation_score, consecutive_no_shows FROM users WHERE id = $1`,
      [receiverId],
    );
    expect(receiverRows[0].reputation_score).toBe(10);
    expect(receiverRows[0].consecutive_no_shows).toBe(1);
  });

  it('QA-04 — second no-show: receiver delta -20', async (ctx) => {
    if (!dbReady) ctx.skip();

    const donorId = await insertUser('donor-ns2');
    const receiverId = await insertUser('receiver-ns2', { reputationScore: 30 });
    const repo = new PostgresDeliverySessionRepository(pool);

    const sessionId1 = await insertActiveSession(donorId, receiverId);
    await repo.cancelDelivery({ sessionId: sessionId1, donorId, noShow: true });

    const sessionId2 = await insertActiveSession(donorId, receiverId);
    const result = await repo.cancelDelivery({ sessionId: sessionId2, donorId, noShow: true });

    expect(result.receiverDelta).toBe(-20);

    const { rows: events } = await pool.query<{ delta: number }>(
      `SELECT delta FROM reputation_events WHERE session_id = $1`,
      [sessionId2],
    );
    expect(events[0].delta).toBe(-20);

    const { rows: receiverRows } = await pool.query<{ reputation_score: number; consecutive_no_shows: number }>(
      `SELECT reputation_score, consecutive_no_shows FROM users WHERE id = $1`,
      [receiverId],
    );
    expect(receiverRows[0].reputation_score).toBe(0);
    expect(receiverRows[0].consecutive_no_shows).toBe(2);
  });

  it('QA-05 — third no-show: receiver delta -30', async (ctx) => {
    if (!dbReady) ctx.skip();

    const donorId = await insertUser('donor-ns3');
    const receiverId = await insertUser('receiver-ns3', { reputationScore: 60 });
    const repo = new PostgresDeliverySessionRepository(pool);

    const sessionId1 = await insertActiveSession(donorId, receiverId);
    await repo.cancelDelivery({ sessionId: sessionId1, donorId, noShow: true });

    const sessionId2 = await insertActiveSession(donorId, receiverId);
    await repo.cancelDelivery({ sessionId: sessionId2, donorId, noShow: true });

    const sessionId3 = await insertActiveSession(donorId, receiverId);
    const result = await repo.cancelDelivery({ sessionId: sessionId3, donorId, noShow: true });

    expect(result.receiverDelta).toBe(-30);

    const { rows: events } = await pool.query<{ delta: number }>(
      `SELECT delta FROM reputation_events WHERE session_id = $1`,
      [sessionId3],
    );
    expect(events[0].delta).toBe(-30);

    const { rows: receiverRows } = await pool.query<{ reputation_score: number; consecutive_no_shows: number }>(
      `SELECT reputation_score, consecutive_no_shows FROM users WHERE id = $1`,
      [receiverId],
    );
    expect(receiverRows[0].reputation_score).toBe(0);
    expect(receiverRows[0].consecutive_no_shows).toBe(3);
  });

  it('QA-06 — confirm resets streak; next no-show applies base -10', async (ctx) => {
    if (!dbReady) ctx.skip();

    const donorId = await insertUser('donor-q6', { totalDonated: 1, reputationScore: 10 });
    const receiverId = await insertUser('receiver-q6', {
      reputationScore: 40,
      consecutiveNoShows: 2,
    });
    const repo = new PostgresDeliverySessionRepository(pool);

    const confirmSessionId = await insertActiveSession(donorId, receiverId);
    await repo.confirmDelivery(confirmSessionId, donorId);

    const { rows: usersAfterConfirm } = await pool.query<{ id: string; consecutive_no_shows: number }>(
      `SELECT id, consecutive_no_shows FROM users WHERE id = ANY($1::uuid[])`,
      [[donorId, receiverId]],
    );
    expect(usersAfterConfirm.find(u => u.id === donorId)!.consecutive_no_shows).toBe(0);
    expect(usersAfterConfirm.find(u => u.id === receiverId)!.consecutive_no_shows).toBe(0);

    const noShowSessionId = await insertActiveSession(donorId, receiverId);
    const result = await repo.cancelDelivery({
      sessionId: noShowSessionId,
      donorId,
      noShow: true,
    });

    expect(result.receiverDelta).toBe(-10);

    const { rows: receiverRows } = await pool.query<{ reputation_score: number; consecutive_no_shows: number }>(
      `SELECT reputation_score, consecutive_no_shows FROM users WHERE id = $1`,
      [receiverId],
    );
    expect(receiverRows[0].consecutive_no_shows).toBe(1);
  });
});
