import { Pool } from 'pg';
import {
  IAdminSystemHealthRepository,
  CronJobInfo,
  StorageUsageInfo,
  DatabaseHealthInfo,
} from '../../../domain/repositories/admin-system-health.repository';

function parsePgSafeInt(value: string | number | bigint | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null;
  }

  const normalized = typeof value === 'bigint' ? value.toString() : value.trim();
  if (!/^-?\d+$/.test(normalized)) return null;

  const parsed = BigInt(normalized);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER) || parsed < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return Number(parsed);
}

function isUndefinedColumnError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return (error as { code?: string }).code === '42703';
}

export class PostgresAdminSystemHealthRepository implements IAdminSystemHealthRepository {
  constructor(private readonly db: Pool) {}

  private async canSelectRelation(relationName: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean; canSelect: boolean }>(
      `SELECT
         to_regclass($1) IS NOT NULL AS "exists",
         COALESCE(has_table_privilege(current_user, $1, 'SELECT'), FALSE) AS "canSelect"`,
      [relationName],
    );
    const row = result.rows[0];
    return Boolean(row?.exists && row.canSelect);
  }

  async getCronJobsLastRun(): Promise<CronJobInfo[]> {
    const canReadJob = await this.canSelectRelation('cron.job');
    if (!canReadJob) return [];

    const canReadDetails = await this.canSelectRelation('cron.job_run_details');

    let result: {
      rows: Array<{
        jobName: string;
        lastRunAt: Date | null;
        lastStatus: string | null;
        returnMessage: string | null;
      }>;
    };
    try {
      result = await this.db.query<{
        jobName: string;
        lastRunAt: Date | null;
        lastStatus: string | null;
        returnMessage: string | null;
      }>(
        canReadDetails
          ? `SELECT
               j.jobname          AS "jobName",
               d.start_time       AS "lastRunAt",
               d.status           AS "lastStatus",
               d.return_message   AS "returnMessage"
             FROM cron.job j
             LEFT JOIN cron.job_run_details d
               ON d.jobid = j.jobid
              AND d.runid = (
                SELECT MAX(runid) FROM cron.job_run_details WHERE jobid = j.jobid
              )
             ORDER BY j.jobname`
          : `SELECT
               jobname AS "jobName",
               NULL    AS "lastRunAt",
               NULL    AS "lastStatus",
               NULL    AS "returnMessage"
             FROM cron.job
             ORDER BY jobname`,
      );
    } catch (error) {
      if (isUndefinedColumnError(error)) return [];
      throw error;
    }

    return result.rows.map((row) => ({
      jobName: row.jobName,
      lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
      lastStatus: row.lastStatus === 'succeeded' || row.lastStatus === 'failed'
        ? row.lastStatus
        : null,
      returnMessage: row.returnMessage,
    }));
  }

  async getStorageUsage(bucketName: string): Promise<StorageUsageInfo> {
    const canReadStorageObjects = await this.canSelectRelation('storage.objects');
    if (!canReadStorageObjects) {
      return {
        objectsStored: null,
        usedBytes: null,
      };
    }

    const result = await this.db.query<{
      objectsStored: string | number | bigint | null;
      usedBytes: string | number | bigint | null;
    }>(
      `SELECT
         COUNT(*)::bigint AS "objectsStored",
         COALESCE(
           SUM(
             CASE
               WHEN metadata ? 'size' AND (metadata->>'size') ~ '^[0-9]+$'
                 THEN (metadata->>'size')::bigint
               ELSE 0
             END
           ),
           0
         )::bigint AS "usedBytes"
       FROM storage.objects
       WHERE bucket_id = $1`,
      [bucketName],
    );

    const row = result.rows[0];
    return {
      objectsStored: parsePgSafeInt(row?.objectsStored),
      usedBytes: parsePgSafeInt(row?.usedBytes),
    };
  }

  async getDatabaseHealth(): Promise<DatabaseHealthInfo> {
    const healthResult = await this.db.query<{
      serverVersion: string | null;
      activeConnections: string | number | bigint | null;
      maxConnections: string | number | bigint | null;
      sizeBytes: string | number | bigint | null;
    }>(
      `SELECT
         current_setting('server_version') AS "serverVersion",
         (SELECT COUNT(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS "activeConnections",
         current_setting('max_connections')::int AS "maxConnections",
         pg_database_size(current_database())::bigint AS "sizeBytes"`,
    );

    const canReadReplication = await this.canSelectRelation('pg_stat_replication');
    let replicationActive: boolean | null = null;
    if (canReadReplication) {
      const replicationResult = await this.db.query<{ replicationActive: boolean }>(
        'SELECT EXISTS(SELECT 1 FROM pg_stat_replication) AS "replicationActive"',
      );
      replicationActive = replicationResult.rows[0]?.replicationActive ?? null;
    }

    const row = healthResult.rows[0];
    return {
      serverVersion: row?.serverVersion ?? null,
      activeConnections: parsePgSafeInt(row?.activeConnections),
      maxConnections: parsePgSafeInt(row?.maxConnections),
      sizeBytes: parsePgSafeInt(row?.sizeBytes),
      replicationActive,
    };
  }

  async countPendingStorageDeletions(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM storage_deletion_queue WHERE processed_at IS NULL`,
    );
    return parseInt(result.rows[0].count, 10);
  }

  async countUnverifiedUsers24h(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM users
       WHERE email_verified = FALSE AND created_at < NOW() - INTERVAL '24 hours'`,
    );
    return parseInt(result.rows[0].count, 10);
  }
}
