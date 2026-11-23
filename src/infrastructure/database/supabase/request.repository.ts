import { Pool } from 'pg';
import {
  IRequestRepository,
  CreateRequestInput,
  RequestCreated,
  RankedCandidate,
} from '../../../domain/repositories/request.repository';
import {
  RANKED_ELIGIBLE_REQUESTER_SQL,
  HOARDER_TIER1_PENALTY_CASE_SQL,
} from '../sql/ranked-candidate-filters';
import { ConflictException } from '../../../domain/exceptions/conflict.exception';
import { LimitExceededException } from '../../../domain/exceptions/limit-exceeded.exception';

export class PostgresRequestRepository implements IRequestRepository {
  constructor(private readonly db: Pool) {}

  async create(input: CreateRequestInput): Promise<RequestCreated> {
    const client = await this.db.connect();
    let destroyConnection = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      const limitResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) FROM item_requests
         WHERE requester_id = $1
           AND created_at > NOW() - INTERVAL '720 hours'
           AND status IN ('pending', 'selected')`,
        [input.requesterId],
      );
      if (parseInt(limitResult.rows[0].count, 10) >= 3) {
        await client.query('ROLLBACK');
        throw new LimitExceededException();
      }

      let result;
      try {
        result = await client.query<{ id: string; status: string; created_at: Date }>(
          `INSERT INTO item_requests (item_id, requester_id, contact_channel)
           VALUES ($1, $2, $3)
           RETURNING id, status, created_at`,
          [input.itemId, input.requesterId, input.contactChannel],
        );
      } catch (err) {
        const pgErr = err as { code?: string };
        if (pgErr.code === '23505') {
          await client.query('ROLLBACK');
          throw new ConflictException('Already requested this item');
        }
        throw err;
      }

      await client.query('COMMIT');
      const row = result.rows[0];
      return {
        requestId: row.id,
        status: 'pending',
        createdAt: row.created_at,
      };
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '40001') {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        throw new ConflictException('Concurrent request conflict');
      }
      if (!(err instanceof ConflictException)) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        destroyConnection = true;
      }
      throw err;
    } finally {
      client.release(destroyConnection);
    }
  }

  async findRankedCandidates(itemId: string): Promise<RankedCandidate[]> {
    const result = await this.db.query<{
      request_id: string;
      user_id: string;
      first_name: string;
      last_name: string;
      reputation_score: number;
      distance_meters: number;
      location_name: string | null;
      request_date: Date;
    }>(
      `SELECT request_id, user_id, first_name, last_name, reputation_score, distance_meters, location_name, request_date
       FROM (
         SELECT
           ir.id AS request_id,
           ir.requester_id AS user_id,
           u.first_name,
           u.last_name,
           u.reputation_score,
           ROUND(ST_Distance(i.location, u.location))::int AS distance_meters,
           u.location_name,
           ir.created_at AS request_date,
           (
             u.reputation_score
             + FLOOR(RANDOM() * 5 - 2)::int
             - ${HOARDER_TIER1_PENALTY_CASE_SQL}
           ) AS effective_score
         FROM item_requests ir
         JOIN users u ON u.id = ir.requester_id
         JOIN items i ON i.id = ir.item_id
         WHERE ir.item_id = $1
           AND ir.status = 'pending'
           AND ${RANKED_ELIGIBLE_REQUESTER_SQL}
       ) ranked
       ORDER BY effective_score DESC, distance_meters ASC, request_date ASC`,
      [itemId],
    );

    return result.rows.map(row => ({
      requestId: row.request_id,
      userId: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      reputationScore: row.reputation_score,
      distanceMeters: row.distance_meters,
      locationName: row.location_name,
      requestDate: row.request_date,
    }));
  }
}
