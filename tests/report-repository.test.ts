import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresReportRepository } from '../src/infrastructure/database/supabase/report.repository';
import type { CreateReportInput, UpdateReportInput, AdminReportQuery } from '../src/domain/repositories/report.repository';
import type { EntitySnapshot } from '../src/domain/entities/report.entity';
import { BadRequestException } from '../src/domain/exceptions/bad-request.exception';

const REPORTER_UUID = 'aaaa0000-0000-4000-8000-000000000001';
const ENTITY_UUID = 'bbbb0000-0000-4000-8000-000000000002';
const REPORT_UUID = 'cccc0000-0000-4000-8000-000000000003';
const ADMIN_UUID = 'dddd0000-0000-4000-8000-000000000004';

const ITEM_SNAPSHOT: EntitySnapshot = {
  entityType: 'item',
  title: 'Silla de madera',
  status: 'active',
  category: 'furniture',
  description: 'Silla en buen estado',
};

const REPORT_DB_ROW = {
  id: REPORT_UUID,
  reporter_id: REPORTER_UUID,
  reported_entity_type: 'item',
  reported_entity_id: ENTITY_UUID,
  reason: 'spam',
  description: null,
  entity_snapshot: ITEM_SNAPSHOT as unknown as Record<string, unknown>,
  status: 'pending',
  resolved_at: null,
  resolved_by: null,
  resolution_action: null,
  resolution_note: null,
  created_at: new Date('2026-06-01T12:00:00Z'),
};

function createMockPool() {
  return {
    query: vi.fn(),
    connect: vi.fn(),
  } as unknown as Pool;
}

describe('PostgresReportRepository (14.2)', () => {
  let pool: Pool;
  let repo: PostgresReportRepository;

  beforeEach(() => {
    pool = createMockPool();
    repo = new PostgresReportRepository(pool);
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('inserta el reporte y mapea la fila correctamente incluyendo entity_snapshot como JSON.stringify', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [REPORT_DB_ROW],
        rowCount: 1,
      } as never);

      const input: CreateReportInput = {
        reporterId: REPORTER_UUID,
        reportedEntityType: 'item',
        reportedEntityId: ENTITY_UUID,
        reason: 'spam',
        description: null,
        entitySnapshot: ITEM_SNAPSHOT,
      };

      const result = await repo.create(input);

      expect(pool.query).toHaveBeenCalledOnce();
      const [sql, params] = vi.mocked(pool.query).mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('INSERT INTO reports');
      expect(params[0]).toBe(REPORTER_UUID);
      expect(params[4]).toBeNull();
      expect(params[5]).toBe(JSON.stringify(ITEM_SNAPSHOT));

      expect(result.id).toBe(REPORT_UUID);
      expect(result.reporterId).toBe(REPORTER_UUID);
      expect(result.reportedEntityType).toBe('item');
      expect(result.reason).toBe('spam');
      expect(result.status).toBe('pending');
      expect(result.entitySnapshot).toEqual(ITEM_SNAPSHOT);
    });

    it('lanza BadRequestException cuando el CHECK reports_reason_check es rechazado por la base de datos', async () => {
      vi.mocked(pool.query).mockRejectedValueOnce({
        code: '23514',
        table: 'reports',
        constraint: 'reports_reason_check',
      } as never);

      const input: CreateReportInput = {
        reporterId: REPORTER_UUID,
        reportedEntityType: 'item',
        reportedEntityId: ENTITY_UUID,
        reason: 'fraude_o_enganio',
        description: null,
        entitySnapshot: ITEM_SNAPSHOT,
      };

      await expect(repo.create(input)).rejects.toMatchObject({
        name: BadRequestException.name,
        message: 'INVALID_REPORT_REASON',
      });
    });

    it('lanza BadRequestException cuando falla un check legacy de reason en reports', async () => {
      vi.mocked(pool.query).mockRejectedValueOnce({
        code: '23514',
        table: 'reports',
        constraint: 'reports_reason_chk_legacy',
      } as never);

      const input: CreateReportInput = {
        reporterId: REPORTER_UUID,
        reportedEntityType: 'item',
        reportedEntityId: ENTITY_UUID,
        reason: 'fraude_o_enganio',
        description: null,
        entitySnapshot: ITEM_SNAPSHOT,
      };

      await expect(repo.create(input)).rejects.toMatchObject({
        name: BadRequestException.name,
        message: 'INVALID_REPORT_REASON',
      });
    });
  });

  describe('findAllAdmin', () => {
    it('ejecuta count y listado con paginación cuando no hay filtros', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 } as never)
        .mockResolvedValueOnce({
          rows: [
            {
              ...REPORT_DB_ROW,
              reporter_first_name: 'Ana',
              reporter_last_name: 'López',
              pending_count_for_entity: '2',
            },
          ],
          rowCount: 1,
        } as never);

      const query: AdminReportQuery = { page: 1, limit: 10 };
      const result = await repo.findAllAdmin(query);

      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(5);
      expect(result.reports).toHaveLength(1);
      expect(result.reports[0].reporter.firstName).toBe('Ana');
      expect(result.reports[0].pendingCountForEntity).toBe(2);
    });

    it('aplica filtro de status cuando se proporciona', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 } as never)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

      const query: AdminReportQuery = { status: 'pending', page: 1, limit: 10 };
      await repo.findAllAdmin(query);

      const countSql = vi.mocked(pool.query).mock.calls[0][0] as string;
      expect(countSql).toContain('r.status = $1');
    });

    it('aplica filtros de entidad y razón cuando se proporcionan', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as never)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

      const query: AdminReportQuery = {
        reportedEntityType: 'item',
        reason: 'spam',
        page: 1,
        limit: 10,
      };
      await repo.findAllAdmin(query);

      const countSql = vi.mocked(pool.query).mock.calls[0][0] as string;
      expect(countSql).toContain('reported_entity_type = $1');
      expect(countSql).toContain('reason = $2');
    });
  });

  describe('findByIdAdmin', () => {
    it('retorna null cuando el reporte no existe', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

      const result = await repo.findByIdAdmin(REPORT_UUID);
      expect(result).toBeNull();
    });

    it('mapea el JOIN con reporter y consulta la entidad reportada (item)', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce({
          rows: [
            {
              ...REPORT_DB_ROW,
              reporter_email: 'ana@example.com',
              reporter_first_name: 'Ana',
              reporter_last_name: 'López',
              reporter_reputation_score: 80,
              reporter_is_active: true,
              reporter_total_reports: '3',
              reporter_pending_reports: '1',
            },
          ],
          rowCount: 1,
        } as never)
        .mockResolvedValueOnce({
          rows: [{ id: ENTITY_UUID, title: 'Silla', status: 'active', category: 'furniture' }],
          rowCount: 1,
        } as never);

      const result = await repo.findByIdAdmin(REPORT_UUID);

      expect(result).not.toBeNull();
      expect(result!.reporter).not.toBeNull();
      expect(result!.reporter!.email).toBe('ana@example.com');
      expect(result!.reporter!.totalReportsSubmitted).toBe(3);
      expect(result!.reporter!.totalReportsPending).toBe(1);
      expect(result!.reportedEntity).not.toBeNull();
      expect(result!.reportedEntity!.type).toBe('item');
      expect(result!.reportedEntity!.currentState).not.toBeNull();
    });

    it('retorna reporter null cuando reporter_id es null (anonimización)', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce({
          rows: [
            {
              ...REPORT_DB_ROW,
              reporter_id: null,
              reporter_email: null,
              reporter_first_name: null,
              reporter_last_name: null,
              reporter_reputation_score: null,
              reporter_is_active: null,
              reporter_total_reports: null,
              reporter_pending_reports: null,
            },
          ],
          rowCount: 1,
        } as never)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

      const result = await repo.findByIdAdmin(REPORT_UUID);

      expect(result).not.toBeNull();
      expect(result!.reporter).toBeNull();
    });
  });

  describe('update', () => {
    it('actualiza los campos de resolución y devuelve la entidad mapeada', async () => {
      const resolvedAt = new Date('2026-06-09T10:00:00Z');
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          {
            ...REPORT_DB_ROW,
            status: 'resolved',
            resolved_at: resolvedAt,
            resolved_by: ADMIN_UUID,
            resolution_action: 'warn_user',
            resolution_note: 'Advertencia enviada',
          },
        ],
        rowCount: 1,
      } as never);

      const input: UpdateReportInput = {
        status: 'resolved',
        resolvedAt,
        resolvedBy: ADMIN_UUID,
        resolutionAction: 'warn_user',
        resolutionNote: 'Advertencia enviada',
      };

      const result = await repo.update(REPORT_UUID, input);

      const [sql, params] = vi.mocked(pool.query).mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('UPDATE reports');
      expect(sql).toContain('SET status = $2');
      expect(params[0]).toBe(REPORT_UUID);
      expect(params[1]).toBe('resolved');
      expect(params[4]).toBe('warn_user');

      expect(result.status).toBe('resolved');
      expect(result.resolutionAction).toBe('warn_user');
    });
  });

  describe('countByReporterAndEntity', () => {
    it('consulta con reporter_id, entity_id y fecha desde', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ count: '2' }],
        rowCount: 1,
      } as never);

      const since = new Date('2026-01-01');
      const result = await repo.countByReporterAndEntity(REPORTER_UUID, ENTITY_UUID, 'item', since);

      expect(result).toBe(2);
      const [sql, params] = vi.mocked(pool.query).mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('reporter_id = $1');
      expect(sql).toContain('reported_entity_id = $2');
      expect(sql).toContain('reported_entity_type = $3');
      expect(sql).toContain('created_at >= $4');
      expect(params).toEqual([REPORTER_UUID, ENTITY_UUID, 'item', since]);
    });
  });

  describe('countByReporterSince', () => {
    it('consulta con reporter_id y fecha desde', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ count: '5' }],
        rowCount: 1,
      } as never);

      const since = new Date('2026-05-01');
      const result = await repo.countByReporterSince(REPORTER_UUID, since);

      expect(result).toBe(5);
      const [sql, params] = vi.mocked(pool.query).mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('reporter_id = $1');
      expect(sql).toContain('created_at >= $2');
      expect(params).toEqual([REPORTER_UUID, since]);
    });
  });

  describe('hasPendingByReporterAndEntity', () => {
    it('retorna true cuando existe un reporte pending', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ exists: true }],
        rowCount: 1,
      } as never);

      const result = await repo.hasPendingByReporterAndEntity(REPORTER_UUID, ENTITY_UUID, 'item');

      expect(result).toBe(true);
      const [sql, params] = vi.mocked(pool.query).mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("status = 'pending'");
      expect(params).toEqual([REPORTER_UUID, ENTITY_UUID, 'item']);
    });

    it('retorna false cuando no hay reportes pending', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ exists: false }],
        rowCount: 1,
      } as never);

      const result = await repo.hasPendingByReporterAndEntity(REPORTER_UUID, ENTITY_UUID, 'user');
      expect(result).toBe(false);
    });
  });
});
