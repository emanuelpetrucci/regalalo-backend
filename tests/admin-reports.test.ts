import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAdminRouter } from '../src/interfaces/http/routes/admin.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import * as analyticsService from '../src/application/services/analytics.service';

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const REPORT_ID = 'cccccccc-dddd-4eee-8fff-111111111111';
const REPORTER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ENTITY_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

const baseReportRecord = {
  id: REPORT_ID,
  reportedEntityType: 'item',
  reportedEntityId: ENTITY_ID,
  reason: 'spam',
  status: 'pending',
  createdAt: new Date('2026-06-01T10:00:00Z'),
  resolvedAt: null,
  entitySnapshot: { entityType: 'item', title: 'Mesa de madera', status: 'active', category: 'furniture', description: 'Una mesa' },
  reporter: { id: REPORTER_ID, firstName: 'Ana', lastName: 'García' },
  pendingCountForEntity: 1,
};

const baseReportDetailRecord = {
  ...baseReportRecord,
  description: null,
  resolvedBy: null,
  resolutionAction: null,
  resolutionNote: null,
  reporter: {
    id: REPORTER_ID,
    email: 'ana@example.com',
    firstName: 'Ana',
    lastName: 'García',
    reputationScore: 10,
    isActive: true,
    totalReportsSubmitted: 3,
    totalReportsPending: 1,
  },
  reportedEntity: {
    type: 'item',
    currentState: { id: ENTITY_ID, title: 'Mesa de madera', status: 'active', category: 'furniture' },
  },
};

function buildTestApp(depOverrides = {}) {
  const app = express();
  app.use(express.json());

  const defaultDeps = {
    adminUserRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn().mockResolvedValue({ id: ADMIN_ID, email: 'admin@test.example.com', isActive: true, jwtVersion: 1 }),
      updateLastLogin: vi.fn(),
      updateJwtVersion: vi.fn(),
    },
    adminOtpTokenRepo: {
      findActiveByAdminId: vi.fn().mockResolvedValue(null),
      invalidateByAdminId: vi.fn(),
      create: vi.fn(),
      markUsed: vi.fn(),
      incrementAttempts: vi.fn().mockResolvedValue(1),
    },
    adminAuditLogRepo: { create: vi.fn().mockResolvedValue(undefined) },
    hashService: { hash: vi.fn(), verify: vi.fn().mockResolvedValue(true) },
    adminJwtService: {
      sign: vi.fn().mockReturnValue('mock-admin-jwt-token'),
      verify: vi.fn().mockReturnValue({ sub: ADMIN_ID, role: 'admin', jwtVersion: 1 }),
    },
    mailService: { send: vi.fn().mockResolvedValue(undefined) },
    userRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn().mockResolvedValue({ id: ENTITY_ID, email: 'user@test.example.com', firstName: 'User', isActive: true, jwtVersion: 1 }),
      adminFindAll: vi.fn().mockResolvedValue({ users: [], total: 0 }),
      adminFindById: vi.fn().mockResolvedValue(null), adminSuspend: vi.fn().mockResolvedValue(0), adminReactivate: vi.fn(),
      adminForceVerification: vi.fn(), adminCorrectReputation: vi.fn(), adminResetNoShows: vi.fn(),
      findReputationHistory: vi.fn(), findMyDeliverySessions: vi.fn(), findMyItems: vi.fn(),
      findMyRequests: vi.fn(), create: vi.fn(), updateProfile: vi.fn(), updateVerificationToken: vi.fn(),
      markEmailVerified: vi.fn(), findByVerificationTokenHash: vi.fn(),
    },
    itemRepo: {
      createWithImages: vi.fn(), findActiveInRadius: vi.fn(), findById: vi.fn(),
      findItemOwnership: vi.fn().mockResolvedValue({ itemId: ENTITY_ID, status: 'active', donorId: 'donor-uuid', itemTitle: 'Mesa de madera' }),
      hasActiveDeliverySession: vi.fn(), cancelItem: vi.fn().mockResolvedValue({ itemTitle: 'Mesa de madera', receiverId: null }), setPauseStatus: vi.fn(),
      findNewlyDegradedItems: vi.fn(), claimPendingDigestItems: vi.fn(), findEligibleDigestUsersForItem: vi.fn(),
      adminFindAll: vi.fn().mockResolvedValue({ items: [], total: 0 }), adminFindById: vi.fn().mockResolvedValue(null),
      adminReactivateItem: vi.fn(), findForReport: vi.fn(),
    },
    deliverySessionRepo: {
      adminFindAll: vi.fn().mockResolvedValue({ sessions: [], total: 0 }), adminFindById: vi.fn().mockResolvedValue(null),
      adminForceExpireSession: vi.fn(), selectReceiver: vi.fn(), findById: vi.fn(), findByIdForParticipant: vi.fn(),
      confirmDelivery: vi.fn(), cancelDelivery: vi.fn(), findExpiredSessions: vi.fn(),
    },
    reportRepo: {
      create: vi.fn(),
      findAllAdmin: vi.fn().mockResolvedValue({ reports: [baseReportRecord], total: 1 }),
      findByIdAdmin: vi.fn().mockResolvedValue(baseReportDetailRecord),
      update: vi.fn().mockResolvedValue({
        id: REPORT_ID,
        reporterId: REPORTER_ID,
        reportedEntityType: 'item',
        reportedEntityId: ENTITY_ID,
        reason: 'spam',
        description: null,
        entitySnapshot: {},
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: ADMIN_ID,
        resolutionAction: 'archive',
        resolutionNote: 'Test note',
        createdAt: new Date(),
      }),
      countByReporterAndEntity: vi.fn(),
      countByReporterSince: vi.fn(),
      hasPendingByReporterAndEntity: vi.fn(),
      countMetrics: vi.fn().mockResolvedValue({ pending: 0, resolvedLast30Days: 0, archivedLast30Days: 0 }),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/admin', createAdminRouter(deps));
  app.use(errorHandler);
  return { app, deps };
}

const AUTH_HEADER = { Authorization: 'Bearer valid-admin-token' };

// ─── AC5: Auth ────────────────────────────────────────────────────────────────

describe('14.5 Auth — requireAdminAuth', () => {
  it('14.5.1 — GET /admin/reports sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/reports');
    expect(res.status).toBe(401);
  });

  it('14.5.2 — GET /admin/reports/:id sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/admin/reports/${REPORT_ID}`);
    expect(res.status).toBe(401);
  });
});

// ─── AC1: Lista de reportes ───────────────────────────────────────────────────

describe('14.5 GET /admin/reports — AC1: Lista de reportes', () => {
  it('14.5.3 — lista básica → 200 con reports y pagination', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/reports').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.reports).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
    expect(res.body.reports[0].id).toBe(REPORT_ID);
    expect(res.body.reports[0].reporter).toMatchObject({ id: REPORTER_ID, firstName: 'Ana' });
  });

  it('14.5.4 — filtro status=archived → pasa status al repo', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/reports?status=archived').set(AUTH_HEADER);

    expect(deps.reportRepo.findAllAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'archived' }),
    );
  });

  it('14.5.4b — sin status → aplica default pending', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/reports').set(AUTH_HEADER);

    expect(deps.reportRepo.findAllAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
    );
  });
});

// ─── AC3: Validación filtros ──────────────────────────────────────────────────

describe('14.5 GET /admin/reports — AC3: Validación de filtros', () => {
  it('14.5.5 — limit=101 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/reports?limit=101').set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });

  it('filtro status inválido → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/reports?status=invalid').set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });
});

// ─── AC4: Errores detalle ─────────────────────────────────────────────────────

describe('14.5 GET /admin/reports/:id — AC4: Errores', () => {
  it('14.5.6 — ID no UUID → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/reports/no-uuid').set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });

  it('14.5.7 — reporte no existe (repo retorna null) → 404', async () => {
    const { app } = buildTestApp({
      reportRepo: {
        create: vi.fn(),
        findAllAdmin: vi.fn().mockResolvedValue({ reports: [], total: 0 }),
        findByIdAdmin: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        countByReporterAndEntity: vi.fn(),
        countByReporterSince: vi.fn(),
        hasPendingByReporterAndEntity: vi.fn(),
      },
    });
    const res = await request(app).get(`/admin/reports/${REPORT_ID}`).set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });
});

// ─── AC2: Detalle completo ────────────────────────────────────────────────────

describe('14.5 GET /admin/reports/:id — AC2: Detalle', () => {
  it('14.5.8 — detalle completo → 200 con todos los campos', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/admin/reports/${REPORT_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(REPORT_ID);
    expect(res.body.reportedEntityType).toBe('item');
    expect(res.body.reporter).toMatchObject({
      id: REPORTER_ID,
      email: 'ana@example.com',
      totalReportsSubmitted: 3,
    });
    expect(res.body.reportedEntity).toMatchObject({ type: 'item' });
    expect(res.body.reportedEntity.currentState).not.toBeNull();
  });

  it('14.5.9 — audit log invocado con action=report.viewed', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get(`/admin/reports/${REPORT_ID}`).set(AUTH_HEADER);

    expect(deps.adminAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'report.viewed',
        entityType: 'report',
        entityId: REPORT_ID,
        adminUserId: ADMIN_ID,
      }),
    );
  });

  it('14.5.10 — reporter null (anonimizado) → 200 sin error con reporter null', async () => {
    const { app } = buildTestApp({
      reportRepo: {
        create: vi.fn(),
        findAllAdmin: vi.fn().mockResolvedValue({ reports: [], total: 0 }),
        findByIdAdmin: vi.fn().mockResolvedValue({ ...baseReportDetailRecord, reporter: null }),
        update: vi.fn().mockResolvedValue(null),
        countByReporterAndEntity: vi.fn(),
        countByReporterSince: vi.fn(),
        hasPendingByReporterAndEntity: vi.fn(),
      },
    });
    const res = await request(app).get(`/admin/reports/${REPORT_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.reporter).toBeNull();
  });
});

// ─── 14.6: POST /admin/reports/:id/resolve ───────────────────────────────────

const RESOLVE_BODY = { action: 'archive', resolutionNote: 'Revisado y archivado' };

describe('14.6 Auth — requireAdminAuth', () => {
  it('14.6.1 — POST /admin/reports/:id/resolve sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post(`/admin/reports/${REPORT_ID}/resolve`).send(RESOLVE_BODY);
    expect(res.status).toBe(401);
  });
});

describe('14.6 POST /admin/reports/:id/resolve — AC-10: Validación body', () => {
  it('14.6.2 — resolutionNote vacío → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send({ action: 'archive', resolutionNote: '' });
    expect(res.status).toBe(400);
  });

  it('14.6.3 — action inválido → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send({ action: 'invalid_action', resolutionNote: 'nota' });
    expect(res.status).toBe(400);
  });

  it('14.6.3b — resolutionNote > 1000 caracteres → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send({ action: 'archive', resolutionNote: 'x'.repeat(1001) });
    expect(res.status).toBe(400);
  });
});

describe('14.6 POST /admin/reports/:id/resolve — AC-11: Errores estándar', () => {
  it('14.6.4 — ID no UUID → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/admin/reports/no-uuid/resolve')
      .set(AUTH_HEADER)
      .send(RESOLVE_BODY);
    expect(res.status).toBe(400);
  });

  it('14.6.5 — reporte no existe → 404', async () => {
    const { app } = buildTestApp({
      reportRepo: {
        create: vi.fn(),
        findAllAdmin: vi.fn().mockResolvedValue({ reports: [], total: 0 }),
        findByIdAdmin: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(null),
        countByReporterAndEntity: vi.fn(),
        countByReporterSince: vi.fn(),
        hasPendingByReporterAndEntity: vi.fn(),
      },
    });
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send(RESOLVE_BODY);
    expect(res.status).toBe(404);
  });
});

describe('14.6 POST /admin/reports/:id/resolve — AC-7: Ya cerrado', () => {
  it('14.6.6 — reporte ya cerrado (status=archived) → 409 REPORT_ALREADY_CLOSED', async () => {
    const { app } = buildTestApp({
      reportRepo: {
        create: vi.fn(),
        findAllAdmin: vi.fn().mockResolvedValue({ reports: [], total: 0 }),
        findByIdAdmin: vi.fn().mockResolvedValue({ ...baseReportDetailRecord, status: 'archived' }),
        update: vi.fn().mockResolvedValue(null),
        countByReporterAndEntity: vi.fn(),
        countByReporterSince: vi.fn(),
        hasPendingByReporterAndEntity: vi.fn(),
      },
    });
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send(RESOLVE_BODY);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('REPORT_ALREADY_CLOSED');
  });

  it('14.6.6b — reporte ya cerrado (status=resolved) → 409 REPORT_ALREADY_CLOSED', async () => {
    const { app } = buildTestApp({
      reportRepo: {
        create: vi.fn(),
        findAllAdmin: vi.fn().mockResolvedValue({ reports: [], total: 0 }),
        findByIdAdmin: vi.fn().mockResolvedValue({ ...baseReportDetailRecord, status: 'resolved' }),
        update: vi.fn().mockResolvedValue(null),
        countByReporterAndEntity: vi.fn(),
        countByReporterSince: vi.fn(),
        hasPendingByReporterAndEntity: vi.fn(),
      },
    });
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send(RESOLVE_BODY);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('REPORT_ALREADY_CLOSED');
  });
});

describe('14.6 POST /admin/reports/:id/resolve — AC-8: Incompatibilidad acción/entidad', () => {
  it('14.6.7 — action=cancel_item sobre reporte de user → 422 ACTION_ENTITY_MISMATCH', async () => {
    const { app } = buildTestApp({
      reportRepo: {
        create: vi.fn(),
        findAllAdmin: vi.fn().mockResolvedValue({ reports: [], total: 0 }),
        findByIdAdmin: vi.fn().mockResolvedValue({ ...baseReportDetailRecord, reportedEntityType: 'user' }),
        update: vi.fn().mockResolvedValue(null),
        countByReporterAndEntity: vi.fn(),
        countByReporterSince: vi.fn(),
        hasPendingByReporterAndEntity: vi.fn(),
      },
    });
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send({ action: 'cancel_item', resolutionNote: 'nota' });
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('ACTION_ENTITY_MISMATCH');
  });

  it('14.6.7b — action=warn_user sobre reporte de item → 422 ACTION_ENTITY_MISMATCH', async () => {
    const { app } = buildTestApp({
      reportRepo: {
        create: vi.fn(),
        findAllAdmin: vi.fn().mockResolvedValue({ reports: [], total: 0 }),
        findByIdAdmin: vi.fn().mockResolvedValue(baseReportDetailRecord),
        update: vi.fn().mockResolvedValue(null),
        countByReporterAndEntity: vi.fn(),
        countByReporterSince: vi.fn(),
        hasPendingByReporterAndEntity: vi.fn(),
      },
    });
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send({ action: 'warn_user', resolutionNote: 'nota' });
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('ACTION_ENTITY_MISMATCH');
  });

  it('14.6.7c — action=suspend_user sobre reporte de item → 422 ACTION_ENTITY_MISMATCH', async () => {
    const { app } = buildTestApp({
      reportRepo: {
        create: vi.fn(),
        findAllAdmin: vi.fn().mockResolvedValue({ reports: [], total: 0 }),
        findByIdAdmin: vi.fn().mockResolvedValue(baseReportDetailRecord),
        update: vi.fn().mockResolvedValue(null),
        countByReporterAndEntity: vi.fn(),
        countByReporterSince: vi.fn(),
        hasPendingByReporterAndEntity: vi.fn(),
      },
    });
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send({ action: 'suspend_user', resolutionNote: 'nota' });
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('ACTION_ENTITY_MISMATCH');
  });
});

describe('14.6 POST /admin/reports/:id/resolve — AC-1: Resolución básica', () => {
  it('14.6.8 — action=archive sobre item report → 200, update llamado con todos los campos', async () => {
    const { app, deps } = buildTestApp();
    const before = Date.now();
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send({ action: 'archive', resolutionNote: 'Archivado tras revisión' });
    const after = Date.now();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Reporte cerrado', action: 'archive', reportId: REPORT_ID });
    expect(deps.reportRepo.update).toHaveBeenCalledWith(
      REPORT_ID,
      expect.objectContaining({
        status: 'archived',
        resolvedBy: ADMIN_ID,
        resolutionAction: 'archive',
        resolutionNote: 'Archivado tras revisión',
      }),
    );
    const updateCall = deps.reportRepo.update.mock.calls[0][1];
    expect(updateCall.resolvedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(updateCall.resolvedAt.getTime()).toBeLessThanOrEqual(after);
  });
});

describe('14.6 POST /admin/reports/:id/resolve — AC-9: Estado de entidad conflictivo', () => {
  it('14.6.9 — action=cancel_item, item ya cancelado → 409 ENTITY_STATE_CONFLICT', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        createWithImages: vi.fn(), findActiveInRadius: vi.fn(), findById: vi.fn(),
        findItemOwnership: vi.fn().mockResolvedValue({ itemId: ENTITY_ID, status: 'cancelled', donorId: 'donor-id', itemTitle: 'Mesa' }),
        hasActiveDeliverySession: vi.fn(), cancelItem: vi.fn().mockResolvedValue({ itemTitle: 'Mesa', receiverId: null }), setPauseStatus: vi.fn(),
        findNewlyDegradedItems: vi.fn(), claimPendingDigestItems: vi.fn(), findEligibleDigestUsersForItem: vi.fn(),
        adminFindAll: vi.fn().mockResolvedValue({ items: [], total: 0 }), adminFindById: vi.fn().mockResolvedValue(null),
        adminReactivateItem: vi.fn(), findForReport: vi.fn(),
      },
    });
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send({ action: 'cancel_item', resolutionNote: 'cancelar item' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('ENTITY_STATE_CONFLICT');
  });

  it('14.6.9b — action=suspend_user, usuario ya suspendido → 409 ENTITY_STATE_CONFLICT', async () => {
    const { app } = buildTestApp({
      reportRepo: {
        create: vi.fn(),
        findAllAdmin: vi.fn().mockResolvedValue({ reports: [], total: 0 }),
        findByIdAdmin: vi.fn().mockResolvedValue({ ...baseReportDetailRecord, reportedEntityType: 'user', reportedEntityId: ENTITY_ID }),
        update: vi.fn().mockResolvedValue(null),
        countByReporterAndEntity: vi.fn(),
        countByReporterSince: vi.fn(),
        hasPendingByReporterAndEntity: vi.fn(),
      },
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockResolvedValue({ id: ENTITY_ID, email: 'user@test.example.com', firstName: 'User', isActive: false, jwtVersion: 1 }),
        adminFindAll: vi.fn().mockResolvedValue({ users: [], total: 0 }),
        adminFindById: vi.fn().mockResolvedValue(null), adminSuspend: vi.fn().mockResolvedValue(0), adminReactivate: vi.fn(),
        adminForceVerification: vi.fn(), adminCorrectReputation: vi.fn(), adminResetNoShows: vi.fn(),
        findReputationHistory: vi.fn(), findMyDeliverySessions: vi.fn(), findMyItems: vi.fn(),
        findMyRequests: vi.fn(), create: vi.fn(), updateProfile: vi.fn(), updateVerificationToken: vi.fn(),
        markEmailVerified: vi.fn(), findByVerificationTokenHash: vi.fn(),
      },
    });
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send({ action: 'suspend_user', resolutionNote: 'usuario ya suspendido' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('ENTITY_STATE_CONFLICT');
  });
});

describe('14.6 POST /admin/reports/:id/resolve — AC-5: cancel_item', () => {
  it('14.6.10 — action=cancel_item válido → 200, cancelItem invocado', async () => {
    const { app, deps } = buildTestApp();
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send({ action: 'cancel_item', resolutionNote: 'item violaba reglas' });

    expect(res.status).toBe(200);
    expect(deps.itemRepo.cancelItem).toHaveBeenCalledWith(ENTITY_ID);
  });
});

describe('14.6 POST /admin/reports/:id/resolve — AC-6: suspend_user', () => {
  it('14.6.11 — action=suspend_user válido → 200, adminSuspend invocado', async () => {
    const { app, deps } = buildTestApp({
      reportRepo: {
        create: vi.fn(),
        findAllAdmin: vi.fn().mockResolvedValue({ reports: [], total: 0 }),
        findByIdAdmin: vi.fn().mockResolvedValue({ ...baseReportDetailRecord, reportedEntityType: 'user', reportedEntityId: ENTITY_ID }),
        update: vi.fn().mockResolvedValue({ id: REPORT_ID, status: 'resolved' }),
        countByReporterAndEntity: vi.fn(),
        countByReporterSince: vi.fn(),
        hasPendingByReporterAndEntity: vi.fn(),
      },
    });
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send({ action: 'suspend_user', resolutionNote: 'usuario suspendido por abuso' });

    expect(res.status).toBe(200);
    expect(deps.userRepo.adminSuspend).toHaveBeenCalledWith(ENTITY_ID);
  });
});

describe('14.6 POST /admin/reports/:id/resolve — AC-4: warn_user', () => {
  it('14.6.12 — action=warn_user → 200, TPL-013 enviado al usuario reportado', async () => {
    const { app, deps } = buildTestApp({
      reportRepo: {
        create: vi.fn(),
        findAllAdmin: vi.fn().mockResolvedValue({ reports: [], total: 0 }),
        findByIdAdmin: vi.fn().mockResolvedValue({ ...baseReportDetailRecord, reportedEntityType: 'user', reportedEntityId: ENTITY_ID }),
        update: vi.fn().mockResolvedValue({ id: REPORT_ID, status: 'resolved' }),
        countByReporterAndEntity: vi.fn(),
        countByReporterSince: vi.fn(),
        hasPendingByReporterAndEntity: vi.fn(),
      },
    });
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send({ action: 'warn_user', resolutionNote: 'advertencia por comportamiento' });

    expect(res.status).toBe(200);
    expect(deps.userRepo.findById).toHaveBeenCalledWith(ENTITY_ID);
    expect(deps.mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'TPL-013', to: 'user@test.example.com' }),
    );
  });

  it('14.6.12b — action=warn_user, usuario no encontrado → 200, TPL-013 no enviado', async () => {
    const { app, deps } = buildTestApp({
      reportRepo: {
        create: vi.fn(),
        findAllAdmin: vi.fn().mockResolvedValue({ reports: [], total: 0 }),
        findByIdAdmin: vi.fn().mockResolvedValue({ ...baseReportDetailRecord, reportedEntityType: 'user', reportedEntityId: ENTITY_ID }),
        update: vi.fn().mockResolvedValue(null),
        countByReporterAndEntity: vi.fn(),
        countByReporterSince: vi.fn(),
        hasPendingByReporterAndEntity: vi.fn(),
      },
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockResolvedValue(null),
        adminFindAll: vi.fn().mockResolvedValue({ users: [], total: 0 }),
        adminFindById: vi.fn().mockResolvedValue(null), adminSuspend: vi.fn().mockResolvedValue(0), adminReactivate: vi.fn(),
        adminForceVerification: vi.fn(), adminCorrectReputation: vi.fn(), adminResetNoShows: vi.fn(),
        findReputationHistory: vi.fn(), findMyDeliverySessions: vi.fn(), findMyItems: vi.fn(),
        findMyRequests: vi.fn(), create: vi.fn(), updateProfile: vi.fn(), updateVerificationToken: vi.fn(),
        markEmailVerified: vi.fn(), findByVerificationTokenHash: vi.fn(),
      },
    });
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send({ action: 'warn_user', resolutionNote: 'advertencia' });

    expect(res.status).toBe(200);
    expect(deps.mailService.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'TPL-013' }),
    );
  });
});

describe('14.6 POST /admin/reports/:id/resolve — AC-2: Audit log', () => {
  it('14.6.13 — audit log report.resolved insertado en resolución exitosa', async () => {
    const { app, deps } = buildTestApp();
    await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send(RESOLVE_BODY);

    expect(deps.adminAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'report.resolved',
        entityType: 'report',
        entityId: REPORT_ID,
        adminUserId: ADMIN_ID,
      }),
    );
  });
});

describe('14.6 POST /admin/reports/:id/resolve — AC-3: TPL-012 al denunciante', () => {
  it('14.6.14 — reporter anonimizado (reporter=null) → 200, mailService.send NO llamado para TPL-012', async () => {
    const { app, deps } = buildTestApp({
      reportRepo: {
        create: vi.fn(),
        findAllAdmin: vi.fn().mockResolvedValue({ reports: [], total: 0 }),
        findByIdAdmin: vi.fn().mockResolvedValue({ ...baseReportDetailRecord, reporter: null }),
        update: vi.fn().mockResolvedValue({ id: REPORT_ID, status: 'resolved' }),
        countByReporterAndEntity: vi.fn(),
        countByReporterSince: vi.fn(),
        hasPendingByReporterAndEntity: vi.fn(),
        countMetrics: vi.fn().mockResolvedValue({ pending: 0, resolvedLast30Days: 0, archivedLast30Days: 0 }),
      },
    });
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send(RESOLVE_BODY);

    expect(res.status).toBe(200);
    expect(deps.mailService.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'TPL-012' }),
    );
  });

  it('14.6.14b — reporter con email → 200, TPL-012 enviado', async () => {
    const { app, deps } = buildTestApp();
    const res = await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send(RESOLVE_BODY);

    expect(res.status).toBe(200);
    expect(deps.mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'TPL-012', to: 'ana@example.com' }),
    );
  });
});

// ─── 14.7: AE-033 analytics post-resolución ──────────────────────────────────

describe('14.7 — AE-033 analytics post-resolución', () => {
  it('14.7.2 — safeEmitEvent es llamado con report.resolved tras resolución exitosa', async () => {
    const safeEmitSpy = vi.spyOn(analyticsService, 'safeEmitEvent');

    const { app } = buildTestApp();
    await request(app)
      .post(`/admin/reports/${REPORT_ID}/resolve`)
      .set(AUTH_HEADER)
      .send({ action: 'archive', resolutionNote: 'Archivado por test' });

    expect(safeEmitSpy).toHaveBeenCalledTimes(1);
    expect(safeEmitSpy).toHaveBeenCalledWith(
      'report.resolved',
      ADMIN_ID,
      expect.objectContaining({
        action: 'archive',
        entityType: expect.any(String),
        resolutionTimeHours: expect.any(Number),
      }),
    );
    const callProps = safeEmitSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(Number.isFinite(callProps.resolutionTimeHours)).toBe(true);
    expect(callProps.resolutionTimeHours).toBeGreaterThanOrEqual(0);
    expect(callProps).not.toHaveProperty('reporter_id');
    expect(callProps).not.toHaveProperty('reported_entity_id');
  });
});
