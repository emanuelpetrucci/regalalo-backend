import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAdminRouter } from '../src/interfaces/http/routes/admin.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const SESSION_ID = '660e8400-e29b-41d4-a716-446655440002';
const ITEM_ID = '770e8400-e29b-41d4-a716-446655440003';
const DONOR_ID = '880e8400-e29b-41d4-a716-446655440004';
const RECEIVER_ID = '990e8400-e29b-41d4-a716-446655440005';

const mockAdmin = {
  id: ADMIN_ID,
  email: 'admin@test.example.com',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$...',
  jwtVersion: 1,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(),
};

const baseSessionRecord = {
  id: SESSION_ID,
  status: 'active' as const,
  deadlineAt: new Date('2030-01-15T12:00:00Z'),
  createdAt: new Date('2030-01-01T10:00:00Z'),
  completedAt: null,
  contactPurged: false,
  noShowDeclared: false,
  itemId: ITEM_ID,
  itemTitle: 'Mesa de madera',
  donorId: DONOR_ID,
  donorFirstName: 'Ana',
  donorLastName: 'López',
  donorEmail: 'ana@example.com',
  receiverId: RECEIVER_ID,
  receiverFirstName: 'Carlos',
  receiverLastName: 'Gómez',
  receiverEmail: 'carlos@example.com',
};

const baseSessionDetailRecord = {
  ...baseSessionRecord,
  contactChannel: 'whatsapp:+5491112345678',
  donorConfirmed: false,
  itemCategory: 'furniture' as const,
  itemStatus: 'reserved',
  itemReservedAt: new Date('2030-01-01T10:05:00Z'),
};

function buildTestApp(
  depOverrides: Partial<Parameters<typeof createAdminRouter>[0]> = {},
) {
  const app = express();
  app.use(express.json());

  const defaultSessionRepo = {
    adminFindAll: vi.fn().mockResolvedValue({ sessions: [baseSessionRecord], total: 1 }),
    adminFindById: vi.fn().mockResolvedValue(baseSessionDetailRecord),
    adminForceExpireSession: vi.fn().mockResolvedValue(undefined),
    selectReceiver: vi.fn(),
    findById: vi.fn(),
    findByIdForParticipant: vi.fn(),
    confirmDelivery: vi.fn(),
    cancelDelivery: vi.fn(),
    findExpiredSessions: vi.fn(),
  };

  const defaultDeps = {
    adminUserRepo: {
      findByEmail: vi.fn().mockResolvedValue(mockAdmin),
      findById: vi.fn().mockResolvedValue(mockAdmin),
      updateLastLogin: vi.fn().mockResolvedValue(undefined),
      updateJwtVersion: vi.fn().mockResolvedValue(undefined),
    },
    adminOtpTokenRepo: {
      findActiveByAdminId: vi.fn().mockResolvedValue(null),
      invalidateByAdminId: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
      markUsed: vi.fn().mockResolvedValue(undefined),
      incrementAttempts: vi.fn().mockResolvedValue(1),
    },
    adminAuditLogRepo: {
      create: vi.fn().mockResolvedValue(undefined),
    },
    hashService: {
      hash: vi.fn(),
      verify: vi.fn().mockResolvedValue(true),
    },
    adminJwtService: {
      sign: vi.fn().mockReturnValue('mock-admin-jwt-token'),
      verify: vi.fn().mockReturnValue({ sub: ADMIN_ID, role: 'admin', jwtVersion: 1 }),
    },
    mailService: {
      send: vi.fn().mockResolvedValue(undefined),
    },
    userRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      findByVerificationTokenHash: vi.fn(),
      create: vi.fn(),
      updateProfile: vi.fn(),
      updateVerificationToken: vi.fn(),
      markEmailVerified: vi.fn(),
      findReputationHistory: vi.fn(),
      findMyDeliverySessions: vi.fn(),
      findMyItems: vi.fn(),
      findMyRequests: vi.fn(),
      adminFindAll: vi.fn().mockResolvedValue({ users: [], total: 0 }),
      adminFindById: vi.fn().mockResolvedValue(null),
      adminSuspend: vi.fn().mockResolvedValue(0),
      adminReactivate: vi.fn().mockResolvedValue(0),
      adminForceVerification: vi.fn().mockResolvedValue(undefined),
      adminCorrectReputation: vi.fn().mockResolvedValue(100),
      adminResetNoShows: vi.fn().mockResolvedValue(undefined),
    },
    itemRepo: {
      createWithImages: vi.fn(),
      findActiveInRadius: vi.fn(),
      findById: vi.fn(),
      findItemOwnership: vi.fn(),
      hasActiveDeliverySession: vi.fn(),
      cancelItem: vi.fn(),
      setPauseStatus: vi.fn(),
      findNewlyDegradedItems: vi.fn(),
      claimPendingDigestItems: vi.fn(),
      findEligibleDigestUsersForItem: vi.fn(),
      adminFindAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      adminFindById: vi.fn().mockResolvedValue(null),
      adminReactivateItem: vi.fn().mockResolvedValue(undefined),
    },
    deliverySessionRepo: defaultSessionRepo,
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/admin', createAdminRouter(deps));
  app.use(errorHandler);
  return { app, deps: deps as typeof defaultDeps & { deliverySessionRepo: typeof defaultSessionRepo } };
}

const AUTH_HEADER = { Authorization: 'Bearer valid-admin-token' };

// ─── AC4: Autorización ────────────────────────────────────────────────────────

describe('AC4 — Autorización: requireAdminAuth', () => {
  it('GET /admin/sessions sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/sessions');
    expect(res.status).toBe(401);
  });

  it('GET /admin/sessions/:id sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/admin/sessions/${SESSION_ID}`);
    expect(res.status).toBe(401);
  });

  it('POST /admin/sessions/:id/force-expire sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post(`/admin/sessions/${SESSION_ID}/force-expire`);
    expect(res.status).toBe(401);
  });

  it('GET /admin/sessions con token de usuario regular (verify lanza) → 401', async () => {
    const { app } = buildTestApp({
      adminJwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockImplementation(() => { throw new Error('Invalid token'); }),
      },
    });
    const res = await request(app)
      .get('/admin/sessions')
      .set({ Authorization: 'Bearer user-token' });
    expect(res.status).toBe(401);
  });
});

// ─── AC1: Listar sesiones ─────────────────────────────────────────────────────

describe('GET /admin/sessions — AC1: Listar sesiones', () => {
  it('sin filtros → 200 con sessions y pagination', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/sessions').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
  });

  it('sessions incluyen item, donor y receiver anidados', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/sessions').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    const session = res.body.sessions[0];
    expect(session.item).toMatchObject({ id: ITEM_ID, title: 'Mesa de madera' });
    expect(session.donor).toMatchObject({ id: DONOR_ID, firstName: 'Ana', email: 'ana@example.com' });
    expect(session.receiver).toMatchObject({ id: RECEIVER_ID, firstName: 'Carlos', email: 'carlos@example.com' });
  });

  it('con status=active → pasa status al repo', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/sessions?status=active').set(AUTH_HEADER);

    expect(deps.deliverySessionRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('con overdue=true → pasa overdue al repo', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/sessions?overdue=true').set(AUTH_HEADER);

    expect(deps.deliverySessionRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ overdue: true }),
    );
  });

  it('con userId → pasa userId al repo', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get(`/admin/sessions?userId=${DONOR_ID}`).set(AUTH_HEADER);

    expect(deps.deliverySessionRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ userId: DONOR_ID }),
    );
  });

  it('con page=2&limit=5 → paginación correcta', async () => {
    const { app, deps } = buildTestApp({
      deliverySessionRepo: {
        adminFindAll: vi.fn().mockResolvedValue({ sessions: [], total: 30 }),
        adminFindById: vi.fn(),
        adminForceExpireSession: vi.fn(),
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn(),
        confirmDelivery: vi.fn(),
        cancelDelivery: vi.fn(),
        findExpiredSessions: vi.fn(),
      },
    });
    const res = await request(app)
      .get('/admin/sessions?page=2&limit=5')
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(deps.deliverySessionRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 5 }),
    );
  });

  it('con limit=200 → 400 (límite máximo 100)', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/sessions?limit=200').set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });

  it('total=0 → pagination.page retorna 1 aunque se pida page>1', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        adminFindAll: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
        adminFindById: vi.fn(),
        adminForceExpireSession: vi.fn(),
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn(),
        confirmDelivery: vi.fn(),
        cancelDelivery: vi.fn(),
        findExpiredSessions: vi.fn(),
      },
    });
    const res = await request(app).get('/admin/sessions?page=5').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.totalPages).toBe(0);
  });

  it('overdue=false → no aplica filtro de sesiones vencidas', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/sessions?overdue=false').set(AUTH_HEADER);
    expect(deps.deliverySessionRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ overdue: false }),
    );
  });

  it('overdue=0 → no aplica filtro de sesiones vencidas', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/sessions?overdue=0').set(AUTH_HEADER);
    expect(deps.deliverySessionRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ overdue: false }),
    );
  });

  it('overdue=true + status=expired → 400 combinación imposible', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/admin/sessions?overdue=true&status=expired')
      .set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });
});

// ─── AC2: Detalle de sesión ───────────────────────────────────────────────────

describe('GET /admin/sessions/:id — AC2: Detalle de sesión', () => {
  it('sesión existente con contact_purged=false → 200 con contactChannel y audit log registrado', async () => {
    const auditCreate = vi.fn().mockResolvedValue(undefined);
    const { app } = buildTestApp({
      adminAuditLogRepo: { create: auditCreate },
    });

    const res = await request(app)
      .get(`/admin/sessions/${SESSION_ID}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.contactChannel).toBe('whatsapp:+5491112345678');
    expect(res.body.contactPurged).toBe(false);
    expect(res.body.auditLogged).toBe(true);

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ADMIN_ID,
        action: 'data.contact_channel_accessed',
        entityType: 'delivery_session',
        entityId: SESSION_ID,
      }),
    );
  });

  it('sesión con contact_purged=true → 200 con contactChannel=null y sin audit log', async () => {
    const auditCreate = vi.fn().mockResolvedValue(undefined);
    const { app } = buildTestApp({
      adminAuditLogRepo: { create: auditCreate },
      deliverySessionRepo: {
        adminFindAll: vi.fn(),
        adminFindById: vi.fn().mockResolvedValue({
          ...baseSessionDetailRecord,
          contactPurged: true,
          contactChannel: null,
        }),
        adminForceExpireSession: vi.fn(),
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn(),
        confirmDelivery: vi.fn(),
        cancelDelivery: vi.fn(),
        findExpiredSessions: vi.fn(),
      },
    });

    const res = await request(app)
      .get(`/admin/sessions/${SESSION_ID}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.contactChannel).toBeNull();
    expect(res.body.contactPurged).toBe(true);
    expect(res.body.auditLogged).toBe(false);
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('detalle incluye item con category, donor, receiver', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get(`/admin/sessions/${SESSION_ID}`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({ id: ITEM_ID, title: 'Mesa de madera', category: 'furniture' });
    expect(res.body.donor).toMatchObject({ id: DONOR_ID, firstName: 'Ana' });
    expect(res.body.receiver).toMatchObject({ id: RECEIVER_ID, firstName: 'Carlos' });
  });

  it('sesión inexistente → 404', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        adminFindAll: vi.fn(),
        adminFindById: vi.fn().mockResolvedValue(null),
        adminForceExpireSession: vi.fn(),
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn(),
        confirmDelivery: vi.fn(),
        cancelDelivery: vi.fn(),
        findExpiredSessions: vi.fn(),
      },
    });
    const res = await request(app)
      .get(`/admin/sessions/${SESSION_ID}`)
      .set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });

  it('ID no es UUID → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/admin/sessions/not-a-uuid')
      .set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });
});

// ─── AC3: Force-expire ────────────────────────────────────────────────────────

describe('POST /admin/sessions/:id/force-expire — AC3: Forzar expiración', () => {
  it('sesión activa → 200 con mensaje y audit log registrado', async () => {
    const auditCreate = vi.fn().mockResolvedValue(undefined);
    const forceExpire = vi.fn().mockResolvedValue(undefined);
    const { app } = buildTestApp({
      adminAuditLogRepo: { create: auditCreate },
      deliverySessionRepo: {
        adminFindAll: vi.fn(),
        adminFindById: vi.fn().mockResolvedValue(baseSessionDetailRecord),
        adminForceExpireSession: forceExpire,
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn(),
        confirmDelivery: vi.fn(),
        cancelDelivery: vi.fn(),
        findExpiredSessions: vi.fn(),
      },
    });

    const res = await request(app)
      .post(`/admin/sessions/${SESSION_ID}/force-expire`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Sesión expirada. Objeto devuelto a estado activo.');

    expect(forceExpire).toHaveBeenCalledWith(SESSION_ID);

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ADMIN_ID,
        action: 'session.force_expired',
        entityType: 'delivery_session',
        entityId: SESSION_ID,
        payloadSnapshot: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  it('sesión completada → 409', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        adminFindAll: vi.fn(),
        adminFindById: vi.fn().mockResolvedValue({
          ...baseSessionDetailRecord,
          status: 'completed',
        }),
        adminForceExpireSession: vi.fn(),
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn(),
        confirmDelivery: vi.fn(),
        cancelDelivery: vi.fn(),
        findExpiredSessions: vi.fn(),
      },
    });
    const res = await request(app)
      .post(`/admin/sessions/${SESSION_ID}/force-expire`)
      .set(AUTH_HEADER);
    expect(res.status).toBe(409);
  });

  it('sesión cancelled → 409', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        adminFindAll: vi.fn(),
        adminFindById: vi.fn().mockResolvedValue({
          ...baseSessionDetailRecord,
          status: 'cancelled',
        }),
        adminForceExpireSession: vi.fn(),
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn(),
        confirmDelivery: vi.fn(),
        cancelDelivery: vi.fn(),
        findExpiredSessions: vi.fn(),
      },
    });
    const res = await request(app)
      .post(`/admin/sessions/${SESSION_ID}/force-expire`)
      .set(AUTH_HEADER);
    expect(res.status).toBe(409);
  });

  it('sesión inexistente → 404', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        adminFindAll: vi.fn(),
        adminFindById: vi.fn().mockResolvedValue(null),
        adminForceExpireSession: vi.fn(),
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn(),
        confirmDelivery: vi.fn(),
        cancelDelivery: vi.fn(),
        findExpiredSessions: vi.fn(),
      },
    });
    const res = await request(app)
      .post(`/admin/sessions/${SESSION_ID}/force-expire`)
      .set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });

  it('ID no es UUID → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/admin/sessions/not-a-uuid/force-expire')
      .set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });

  it('force-expire NO llama a mailService.send (no TPL-004)', async () => {
    const mailSend = vi.fn().mockResolvedValue(undefined);
    const { app } = buildTestApp({
      mailService: { send: mailSend },
    });

    await request(app)
      .post(`/admin/sessions/${SESSION_ID}/force-expire`)
      .set(AUTH_HEADER);

    expect(mailSend).not.toHaveBeenCalled();
  });
});

// ─── AC5: Auditoría transversal ───────────────────────────────────────────────

describe('AC5 — Auditoría transversal', () => {
  it('detail (contact no purgado) registra audit con entity_type=delivery_session y entity_id', async () => {
    const auditCreate = vi.fn().mockResolvedValue(undefined);
    const { app } = buildTestApp({
      adminAuditLogRepo: { create: auditCreate },
    });

    await request(app)
      .get(`/admin/sessions/${SESSION_ID}`)
      .set(AUTH_HEADER);

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'delivery_session',
        entityId: SESSION_ID,
        action: 'data.contact_channel_accessed',
        ipAddress: expect.any(String),
      }),
    );
  });

  it('force-expire registra audit con entity_type=delivery_session, entity_id y payloadSnapshot', async () => {
    const auditCreate = vi.fn().mockResolvedValue(undefined);
    const { app } = buildTestApp({
      adminAuditLogRepo: { create: auditCreate },
    });

    await request(app)
      .post(`/admin/sessions/${SESSION_ID}/force-expire`)
      .set(AUTH_HEADER);

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'delivery_session',
        entityId: SESSION_ID,
        action: 'session.force_expired',
        payloadSnapshot: expect.objectContaining({
          status: 'active',
          item: expect.objectContaining({ status: 'reserved' }),
        }),
        ipAddress: expect.any(String),
      }),
    );
  });
});
