import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresDeliverySessionRepository } from '../src/infrastructure/database/supabase/delivery-session.repository';
import {
  INTEGRATION_DATABASE_URL,
  isIntegrationDatabaseReady,
} from './helpers/integration-db';

describe('PostgresDeliverySessionRepository — reputation_events.role integration (11.1)', () => {
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

  async function insertUser(suffix: string): Promise<string> {
    const email = `rep-role-${suffix}-${randomUUID()}@integration.test`;
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (
         email, password_hash, postal_code, location,
         first_name, last_name, email_verified, is_active
       ) VALUES (
         $1, 'test-hash', '28001',
         ST_SetSRID(ST_MakePoint(-3.7038, 40.4168), 4326)::geography,
         $2, 'User', TRUE, TRUE
       ) RETURNING id`,
      [email, suffix],
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

  it('persists donor and receiver roles after confirmDelivery', async (ctx) => {
    if (!dbReady) ctx.skip();

    const donorId = await insertUser('donor');
    const receiverId = await insertUser('receiver');
    const sessionId = await insertActiveSession(donorId, receiverId);
    const repo = new PostgresDeliverySessionRepository(pool);

    await repo.confirmDelivery(sessionId, donorId);

    const { rows } = await pool.query<{ user_id: string; role: string | null }>(
      `SELECT user_id, role FROM reputation_events
       WHERE session_id = $1
       ORDER BY role NULLS LAST`,
      [sessionId],
    );

    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        { user_id: donorId, role: 'donor' },
        { user_id: receiverId, role: 'receiver' },
      ]),
    );
  });

  it('persists receiver role on no_show after cancelDelivery', async (ctx) => {
    if (!dbReady) ctx.skip();

    const donorId = await insertUser('donor-ns');
    const receiverId = await insertUser('receiver-ns');
    const sessionId = await insertActiveSession(donorId, receiverId);
    const repo = new PostgresDeliverySessionRepository(pool);

    await repo.cancelDelivery({
      sessionId,
      donorId,
      noShow: true,
    });

    const { rows } = await pool.query<{ user_id: string; role: string | null; type: string }>(
      `SELECT user_id, role, type FROM reputation_events WHERE session_id = $1`,
      [sessionId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      user_id: receiverId,
      role: 'receiver',
      type: 'no_show',
    });
  });
});
