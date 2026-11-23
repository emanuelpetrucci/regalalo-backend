import { Pool } from 'pg';
import {
  AnalyticsEventRecord,
  IAnalyticsEventRepository,
} from '../../../domain/repositories/analytics-event.repository';

export class PostgresAnalyticsEventRepository implements IAnalyticsEventRepository {
  constructor(private readonly db: Pool) {}

  async insert(record: AnalyticsEventRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO analytics_events (event, occurred_at, user_id_hash, session_id, properties)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        record.event,
        record.occurredAt,
        record.userIdHash,
        record.sessionId,
        JSON.stringify(record.properties),
      ],
    );
  }
}
