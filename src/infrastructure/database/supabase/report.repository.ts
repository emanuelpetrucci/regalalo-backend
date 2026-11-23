import { Pool } from 'pg';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception.js';
import { BadRequestException } from '../../../domain/exceptions/bad-request.exception.js';
import type {
  IReportRepository,
  CreateReportInput,
  AdminReportQuery,
  AdminReportRecord,
  AdminReportDetailRecord,
  UpdateReportInput,
} from '../../../domain/repositories/report.repository.js';
import type {
  Report,
  ReportEntityType,
  ReportReason,
  ReportStatus,
  ResolutionAction,
  EntitySnapshot,
} from '../../../domain/entities/report.entity.js';

type ReportDbRow = {
  id: string;
  reporter_id: string | null;
  reported_entity_type: string;
  reported_entity_id: string;
  reason: string;
  description: string | null;
  entity_snapshot: Record<string, unknown>;
  status: string;
  resolved_at: Date | null;
  resolved_by: string | null;
  resolution_action: string | null;
  resolution_note: string | null;
  created_at: Date;
};

export class PostgresReportRepository implements IReportRepository {
  constructor(private readonly db: Pool) {}

  async create(input: CreateReportInput): Promise<Report> {
    try {
      const result = await this.db.query<ReportDbRow>(
        `INSERT INTO reports (
           reporter_id, reported_entity_type, reported_entity_id,
           reason, description, entity_snapshot
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, reporter_id, reported_entity_type, reported_entity_id,
                   reason, description, entity_snapshot, status,
                   resolved_at, resolved_by, resolution_action, resolution_note, created_at`,
        [
          input.reporterId,
          input.reportedEntityType,
          input.reportedEntityId,
          input.reason,
          input.description,
          JSON.stringify(input.entitySnapshot),
        ],
      );
      return this.mapRow(result.rows[0]);
    } catch (err) {
      const pgErr = err as { code?: string; constraint?: string; table?: string };
      const isReasonConstraintViolation = pgErr.code === '23514'
        && pgErr.table === 'reports'
        && typeof pgErr.constraint === 'string'
        && pgErr.constraint.toLowerCase().includes('reason');
      if (isReasonConstraintViolation) {
        throw new BadRequestException('INVALID_REPORT_REASON');
      }
      throw err;
    }
  }

  async findAllAdmin(query: AdminReportQuery): Promise<{ reports: AdminReportRecord[]; total: number }> {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (query.status) {
      params.push(query.status);
      conditions.push(`r.status = $${params.length}`);
    }
    if (query.reportedEntityType) {
      params.push(query.reportedEntityType);
      conditions.push(`r.reported_entity_type = $${params.length}`);
    }
    if (query.reason) {
      params.push(query.reason);
      conditions.push(`r.reason = $${params.length}`);
    }
    if (query.dateFrom) {
      params.push(query.dateFrom);
      conditions.push(`r.created_at >= $${params.length}`);
    }
    if (query.dateTo) {
      params.push(query.dateTo);
      conditions.push(`r.created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM reports r ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (query.page - 1) * query.limit;
    params.push(query.limit, offset);

    const listResult = await this.db.query<{
      id: string;
      reported_entity_type: string;
      reported_entity_id: string;
      reason: string;
      status: string;
      created_at: Date;
      resolved_at: Date | null;
      entity_snapshot: Record<string, unknown>;
      reporter_id: string | null;
      reporter_first_name: string | null;
      reporter_last_name: string | null;
      pending_count_for_entity: string;
    }>(
      `SELECT
         r.id,
         r.reported_entity_type,
         r.reported_entity_id,
         r.reason,
         r.status,
         r.created_at,
         r.resolved_at,
         r.entity_snapshot,
         r.reporter_id,
         u.first_name AS reporter_first_name,
         u.last_name  AS reporter_last_name,
         (
           SELECT COUNT(*)
           FROM reports sub
           WHERE sub.reported_entity_type = r.reported_entity_type
             AND sub.reported_entity_id = r.reported_entity_id
             AND sub.status = 'pending'
         ) AS pending_count_for_entity
       FROM reports r
       LEFT JOIN users u ON u.id = r.reporter_id
       ${whereClause}
        ORDER BY r.created_at ASC, r.id ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      total,
      reports: listResult.rows.map(row => ({
        id: row.id,
        reportedEntityType: row.reported_entity_type as ReportEntityType,
        reportedEntityId: row.reported_entity_id,
        reason: row.reason as ReportReason,
        status: row.status as ReportStatus,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
        entitySnapshot: row.entity_snapshot as unknown as EntitySnapshot,
        reporter: {
          id: row.reporter_id,
          firstName: row.reporter_first_name,
          lastName: row.reporter_last_name,
        },
        pendingCountForEntity: parseInt(String(row.pending_count_for_entity), 10),
      })),
    };
  }

  async findByIdAdmin(id: string): Promise<AdminReportDetailRecord | null> {
    const result = await this.db.query<{
      id: string;
      reported_entity_type: string;
      reported_entity_id: string;
      reason: string;
      description: string | null;
      entity_snapshot: Record<string, unknown>;
      status: string;
      created_at: Date;
      resolved_at: Date | null;
      resolved_by: string | null;
      resolution_action: string | null;
      resolution_note: string | null;
      reporter_id: string | null;
      reporter_email: string | null;
      reporter_first_name: string | null;
      reporter_last_name: string | null;
      reporter_preferred_language: string | null;
      reporter_reputation_score: number | null;
      reporter_is_active: boolean | null;
      reporter_total_reports: string | null;
      reporter_pending_reports: string | null;
    }>(
      `SELECT
         r.id,
         r.reported_entity_type,
         r.reported_entity_id,
         r.reason,
         r.description,
         r.entity_snapshot,
         r.status,
         r.created_at,
         r.resolved_at,
         r.resolved_by,
         r.resolution_action,
         r.resolution_note,
         r.reporter_id,
         u.email              AS reporter_email,
         u.first_name         AS reporter_first_name,
         u.last_name          AS reporter_last_name,
         u.preferred_language AS reporter_preferred_language,
         u.reputation_score   AS reporter_reputation_score,
         u.is_active          AS reporter_is_active,
         (SELECT COUNT(*) FROM reports sub WHERE sub.reporter_id = r.reporter_id)
           AS reporter_total_reports,
         (SELECT COUNT(*) FROM reports sub WHERE sub.reporter_id = r.reporter_id AND sub.status = 'pending')
           AS reporter_pending_reports
       FROM reports r
       LEFT JOIN users u ON u.id = r.reporter_id
       WHERE r.id = $1`,
      [id],
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];

    let reportedEntity: AdminReportDetailRecord['reportedEntity'] = null;
    if (row.reported_entity_type === 'item') {
      const itemResult = await this.db.query<{ id: string; title: string; status: string; category: string }>(
        `SELECT id, title, status, category FROM items WHERE id = $1`,
        [row.reported_entity_id],
      );
      reportedEntity = {
        type: 'item',
        currentState: itemResult.rows.length > 0
          ? (itemResult.rows[0] as unknown as Record<string, unknown>)
          : null,
      };
    } else if (row.reported_entity_type === 'user') {
      const userResult = await this.db.query<{
        id: string;
        first_name: string;
        last_name: string;
        is_active: boolean;
      }>(
        `SELECT id, first_name, last_name, is_active FROM users WHERE id = $1`,
        [row.reported_entity_id],
      );
      reportedEntity = {
        type: 'user',
        currentState: userResult.rows.length > 0
          ? (userResult.rows[0] as unknown as Record<string, unknown>)
          : null,
      };
    }

    return {
      id: row.id,
      reportedEntityType: row.reported_entity_type as ReportEntityType,
      reportedEntityId: row.reported_entity_id,
      reason: row.reason as ReportReason,
      description: row.description,
      entitySnapshot: row.entity_snapshot as unknown as EntitySnapshot,
      status: row.status as ReportStatus,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      resolutionAction: row.resolution_action as ResolutionAction | null,
      resolutionNote: row.resolution_note,
      reporter: row.reporter_id !== null
        ? {
            id: row.reporter_id,
            email: row.reporter_email,
            firstName: row.reporter_first_name,
            lastName: row.reporter_last_name,
            preferredLanguage: row.reporter_preferred_language,
            reputationScore: row.reporter_reputation_score,
            isActive: row.reporter_is_active,
            totalReportsSubmitted: parseInt(row.reporter_total_reports ?? '0', 10),
            totalReportsPending: parseInt(row.reporter_pending_reports ?? '0', 10),
          }
        : null,
      reportedEntity,
    };
  }

  async update(id: string, input: UpdateReportInput): Promise<Report> {
    const result = await this.db.query<ReportDbRow>(
      `UPDATE reports
       SET status = $2,
           resolved_at = $3,
           resolved_by = $4,
           resolution_action = $5,
           resolution_note = $6
       WHERE id = $1
       RETURNING id, reporter_id, reported_entity_type, reported_entity_id,
                 reason, description, entity_snapshot, status,
                 resolved_at, resolved_by, resolution_action, resolution_note, created_at`,
      [id, input.status, input.resolvedAt, input.resolvedBy, input.resolutionAction, input.resolutionNote],
    );
    if (result.rows.length === 0) throw new NotFoundException('Report not found');
    return this.mapRow(result.rows[0]);
  }

  async countByReporterAndEntity(reporterId: string, entityId: string, entityType: ReportEntityType, since: Date): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)
       FROM reports
       WHERE reporter_id = $1
         AND reported_entity_id = $2
         AND reported_entity_type = $3
         AND created_at >= $4
         AND status NOT IN ('dismissed', 'rejected')`,
      [reporterId, entityId, entityType, since],
    );
    return parseInt(result.rows[0].count, 10);
  }

  async countByReporterSince(reporterId: string, since: Date): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)
       FROM reports
       WHERE reporter_id = $1
         AND created_at >= $2
         AND status NOT IN ('dismissed', 'rejected')`,
      [reporterId, since],
    );
    return parseInt(result.rows[0].count, 10);
  }

  async hasPendingByReporterAndEntity(reporterId: string, entityId: string, entityType: ReportEntityType): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM reports
         WHERE reporter_id = $1
           AND reported_entity_id = $2
           AND reported_entity_type = $3
           AND status = 'pending'
       ) AS exists`,
      [reporterId, entityId, entityType],
    );
    return result.rows[0].exists === true;
  }

  async countMetrics(): Promise<{ pending: number; resolvedLast30Days: number; archivedLast30Days: number }> {
    const result = await this.db.query<{
      pending: string;
      resolved_last_30_days: string;
      archived_last_30_days: string;
    }>(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'pending')                                                 AS pending,
        COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at >= NOW() - INTERVAL '30 days') AS resolved_last_30_days,
        COUNT(*) FILTER (WHERE status = 'archived' AND resolved_at >= NOW() - INTERVAL '30 days') AS archived_last_30_days
      FROM reports`,
    );
    const row = result.rows[0];
    return {
      pending: parseInt(row.pending, 10),
      resolvedLast30Days: parseInt(row.resolved_last_30_days, 10),
      archivedLast30Days: parseInt(row.archived_last_30_days, 10),
    };
  }

  private mapRow(row: ReportDbRow): Report {
    return {
      id: row.id,
      reporterId: row.reporter_id,
      reportedEntityType: row.reported_entity_type as ReportEntityType,
      reportedEntityId: row.reported_entity_id,
      reason: row.reason as ReportReason,
      description: row.description,
      entitySnapshot: row.entity_snapshot as unknown as EntitySnapshot,
      status: row.status as ReportStatus,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      resolutionAction: row.resolution_action as ResolutionAction | null,
      resolutionNote: row.resolution_note,
      createdAt: row.created_at,
    };
  }
}
