import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAdminRouter } from '../src/interfaces/http/routes/admin.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ITEM_ID = '660e8400-e29b-41d4-a716-446655440002';
const DONOR_ID = '770e8400-e29b-41d4-a716-446655440003';
const RECEIVER_ID = '880e8400-e29b-41d4-a716-446655440004';
const SESSION_ID = '990e8400-e29b-41d4-a716-446655440005';
const REQUEST_ID = 'aa0e8400-e29b-41d4-a716-446655440006';

const mockAdmin = {
  id: ADMIN_ID,
  email: 'admin@test.example.com',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$...',
  jwtVersion: 1,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(),
};

const mockItemRecord = {
  id: ITEM_ID,
  title: 'Mesa de madera',
  description: 'Mesa usada en buen estado',
  condition: 'good',
  category: 'furniture',
  weightRange: '5to20',
  status: 'active',
  requestsPaused: false,
  pausedByAdmin: false,
  degradedAt: null,
  createdAt: new Date(),
  completedAt: null,
  donorId: DONOR_ID,
  donorFirstName: 'Ana',
  donorLastName: 'López',
  donorEmail: 'ana@example.com',
  requestCount: 2,
  images: ['path/to/image1.jpg'],
};

const mockItemDetailRecord = {
  ...mockItemRecord,
  digestNotifiedAt: null,
  reservedAt: null,
  requests: [
    {
      id: REQUEST_ID,
      status: 'pending',
      createdAt: new Date(),
      requesterId: '330e8400-e29b-41d4-a716-446655440007',
      requesterFirstName: 'Carlos',
      requesterLastName: 'Gómez',
      requesterEmail: 'carlos@example.com',
      requesterReputationScore: 100,
    },
  ],
  activeSession: null,
};

const mockItemDetailWithSession = {
  ...mockItemDetailRecord,
  status: 'reserved',
  activeSession: {
    id: SESSION_ID,
    status: 'active',
    deadlineAt: new Date(),
    receiverId: RECEIVER_ID,
  },
};

const mockOwnershipActive = {
  id: ITEM_ID,
  donorId: DONOR_ID,
  status: 'active',
  requestsPaused: false,
  title: 'Mesa de madera',
  category: 'furniture' as const,
  createdAt: new Date(),
};

const mockOwnershipReserved = { ...mockOwnershipActive, status: 'reserved' };
const mockOwnershipCancelled = { ...mockOwnershipActive, status: 'cancelled' };
const mockOwnershipCompleted = { ...mockOwnershipActive, status: 'completed' };

const mockReceiver = {
  id: RECEIVER_ID,
  email: 'receiver@example.com',
  firstName: 'Luis',
  lastName: 'Torres',
  isActive: true,
  emailVerified: true,
  reputationScore: 80,
  totalDonated: 1,
  totalReceived: 2,
  consecutiveNoShows: 0,
  cyclesAtLimit: 0,
  postalCode: '1001',
  avatarUrl: null,
  phone: null,
  preferredLanguage: 'es',
  jwtVersion: 1,
  createdAt: new Date(),
  lastActiveAt: null,
  verificationTokenHash: null,
  verificationTokenExpiresAt: null,
  verificationResendAt: null,
  lastCycleIncrementedAt: null,
};

function buildTestApp(
  depOverrides: Partial<Parameters<typeof createAdminRouter>[0]> = {},
) {
  const app = express();
  app.use(express.json());

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
      findById: vi.fn().mockResolvedValue(mockReceiver),
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
      findItemOwnership: vi.fn().mockResolvedValue(mockOwnershipActive),
      hasActiveDeliverySession: vi.fn().mockResolvedValue(false),
      cancelItem: vi.fn().mockResolvedValue({ receiverId: undefined, itemTitle: 'Mesa de madera' }),
      setPauseStatus: vi.fn(),
      findNewlyDegradedItems: vi.fn(),
      claimPendingDigestItems: vi.fn(),
      findEligibleDigestUsersForItem: vi.fn(),
      adminFindAll: vi.fn().mockResolvedValue({ items: [mockItemRecord], total: 1 }),
      adminFindById: vi.fn().mockResolvedValue(mockItemDetailRecord),
      adminReactivateItem: vi.fn().mockResolvedValue(undefined),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/admin', createAdminRouter(deps));
  app.use(errorHandler);
  return { app, deps: deps as typeof defaultDeps };
}

const AUTH_HEADER = { Authorization: 'Bearer valid-admin-token' };

// ─── AC1: Listar items ─────────────────────────────────────────────────────

describe('GET /admin/items — AC1: Listar objetos', () => {
  it('sin filtros → 200 con items y pagination', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/items').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
  });

  it('items incluyen donor anidado', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/items').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.items[0].donor).toMatchObject({
      id: DONOR_ID,
      firstName: 'Ana',
      lastName: 'López',
      email: 'ana@example.com',
    });
  });

  it('con search → pasa search al repo', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/items?search=mueble').set(AUTH_HEADER);

    expect(deps.itemRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'mueble' }),
    );
  });

  it('con status=active → filtra por status', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/items?status=active').set(AUTH_HEADER);

    expect(deps.itemRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('con status=reserved → filtra por reserved', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/items?status=reserved').set(AUTH_HEADER);

    expect(deps.itemRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'reserved' }),
    );
  });

  it('con category=furniture → filtra por category', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/items?category=furniture').set(AUTH_HEADER);

    expect(deps.itemRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'furniture' }),
    );
  });

  it('con degraded=true → pasa degraded=true al repo', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/items?degraded=true').set(AUTH_HEADER);

    expect(deps.itemRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ degraded: true }),
    );
  });

  it('con donorId → filtra por donorId', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get(`/admin/items?donorId=${DONOR_ID}`).set(AUTH_HEADER);

    expect(deps.itemRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ donorId: DONOR_ID }),
    );
  });

  it('con page=2&limit=5 → pasa paginación al repo', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/items?page=2&limit=5').set(AUTH_HEADER);

    expect(deps.itemRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 5 }),
    );
  });

  it('con limit=200 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/items?limit=200').set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });

  it('sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/items');
    expect(res.status).toBe(401);
  });

  it('con token de usuario regular → 401', async () => {
    const { app } = buildTestApp({
      adminJwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockImplementation(() => {
          throw new Error('invalid signature');
        }),
      },
    });
    const res = await request(app).get('/admin/items').set('Authorization', 'Bearer user.token');
    expect(res.status).toBe(401);
  });
});

// ─── AC2: Detalle de item ──────────────────────────────────────────────────

describe('GET /admin/items/:id — AC2: Detalle de objeto', () => {
  it('item existente → 200 con detalle completo', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/admin/items/${ITEM_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ITEM_ID);
    expect(res.body.donor).toMatchObject({ id: DONOR_ID });
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0].requester).toMatchObject({ firstName: 'Carlos' });
  });

  it('item sin sesión activa → activeSession: null', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/admin/items/${ITEM_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.activeSession).toBeNull();
  });

  it('item con sesión activa → activeSession con datos', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        adminFindAll: vi.fn().mockResolvedValue({ items: [mockItemRecord], total: 1 }),
        adminFindById: vi.fn().mockResolvedValue(mockItemDetailWithSession),
        findItemOwnership: vi.fn().mockResolvedValue(mockOwnershipActive),
        cancelItem: vi.fn().mockResolvedValue({ receiverId: undefined, itemTitle: 'Mesa de madera' }),
        adminReactivateItem: vi.fn().mockResolvedValue(undefined),
      } as any,
    });
    const res = await request(app).get(`/admin/items/${ITEM_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.activeSession).toMatchObject({ id: SESSION_ID, receiverId: RECEIVER_ID });
  });

  it('item inexistente → 404', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        adminFindAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        adminFindById: vi.fn().mockResolvedValue(null),
        findItemOwnership: vi.fn().mockResolvedValue(null),
        cancelItem: vi.fn(),
        adminReactivateItem: vi.fn(),
      } as any,
    });
    const res = await request(app).get(`/admin/items/${ITEM_ID}`).set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });

  it('id no UUID → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/items/not-a-uuid').set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });

  it('sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/admin/items/${ITEM_ID}`);
    expect(res.status).toBe(401);
  });
});

// ─── AC3: Cancelar item ───────────────────────────────────────────────────

describe('POST /admin/items/:id/cancel — AC3: Cancelar objeto', () => {
  it('item active → 200 con mensaje, llama cancelItem y audit log', async () => {
    const { app, deps } = buildTestApp();
    const res = await request(app).post(`/admin/items/${ITEM_ID}/cancel`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
    expect(deps.itemRepo.cancelItem).toHaveBeenCalledWith(ITEM_ID);
    expect(deps.adminAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ADMIN_ID,
        action: 'item.cancelled',
        entityType: 'item',
        entityId: ITEM_ID,
        payloadSnapshot: { status: 'active' },
      }),
    );
  });

  it('item reserved → cancela sesión, envía TPL-005 al receptor', async () => {
    const { app, deps } = buildTestApp({
      itemRepo: {
        adminFindAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        adminFindById: vi.fn().mockResolvedValue(null),
        findItemOwnership: vi.fn().mockResolvedValue(mockOwnershipReserved),
        cancelItem: vi.fn().mockResolvedValue({ receiverId: RECEIVER_ID, itemTitle: 'Mesa de madera' }),
        adminReactivateItem: vi.fn().mockResolvedValue(undefined),
      } as any,
    });
    const res = await request(app).post(`/admin/items/${ITEM_ID}/cancel`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(deps.mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'TPL-005' }),
    );
  });

  it('item active → NO envía TPL-005', async () => {
    const { app, deps } = buildTestApp();
    await request(app).post(`/admin/items/${ITEM_ID}/cancel`).set(AUTH_HEADER);

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(deps.mailService.send).not.toHaveBeenCalled();
  });

  it('item ya cancelado → 409', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        adminFindAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        adminFindById: vi.fn().mockResolvedValue(null),
        findItemOwnership: vi.fn().mockResolvedValue(mockOwnershipCancelled),
        cancelItem: vi.fn(),
        adminReactivateItem: vi.fn(),
      } as any,
    });
    const res = await request(app).post(`/admin/items/${ITEM_ID}/cancel`).set(AUTH_HEADER);
    expect(res.status).toBe(409);
  });

  it('item completed → 409', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        adminFindAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        adminFindById: vi.fn().mockResolvedValue(null),
        findItemOwnership: vi.fn().mockResolvedValue(mockOwnershipCompleted),
        cancelItem: vi.fn(),
        adminReactivateItem: vi.fn(),
      } as any,
    });
    const res = await request(app).post(`/admin/items/${ITEM_ID}/cancel`).set(AUTH_HEADER);
    expect(res.status).toBe(409);
  });

  it('item inexistente → 404', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        adminFindAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        adminFindById: vi.fn().mockResolvedValue(null),
        findItemOwnership: vi.fn().mockResolvedValue(null),
        cancelItem: vi.fn(),
        adminReactivateItem: vi.fn(),
      } as any,
    });
    const res = await request(app).post(`/admin/items/${ITEM_ID}/cancel`).set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });

  it('id no UUID → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post('/admin/items/not-a-uuid/cancel').set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });

  it('sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post(`/admin/items/${ITEM_ID}/cancel`);
    expect(res.status).toBe(401);
  });

  it('con token de usuario regular → 401', async () => {
    const { app } = buildTestApp({
      adminJwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockImplementation(() => {
          throw new Error('invalid signature');
        }),
      },
    });
    const res = await request(app)
      .post(`/admin/items/${ITEM_ID}/cancel`)
      .set('Authorization', 'Bearer user.token');
    expect(res.status).toBe(401);
  });
});

// ─── AC4: Reactivar item ──────────────────────────────────────────────────

describe('POST /admin/items/:id/reactivate — AC4: Reactivar objeto', () => {
  it('item cancelled → 200 con mensaje, llama adminReactivateItem y audit log', async () => {
    const { app, deps } = buildTestApp({
      itemRepo: {
        adminFindAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        adminFindById: vi.fn().mockResolvedValue(null),
        findItemOwnership: vi.fn().mockResolvedValue(mockOwnershipCancelled),
        cancelItem: vi.fn(),
        adminReactivateItem: vi.fn().mockResolvedValue(undefined),
      } as any,
    });
    const res = await request(app).post(`/admin/items/${ITEM_ID}/reactivate`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
    expect(deps.itemRepo.adminReactivateItem).toHaveBeenCalledWith(ITEM_ID);
    expect(deps.adminAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ADMIN_ID,
        action: 'item.reactivated',
        entityType: 'item',
        entityId: ITEM_ID,
        payloadSnapshot: { status: 'cancelled' },
      }),
    );
  });

  it('item active → 409', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post(`/admin/items/${ITEM_ID}/reactivate`).set(AUTH_HEADER);
    expect(res.status).toBe(409);
  });

  it('item reserved → 409', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        adminFindAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        adminFindById: vi.fn().mockResolvedValue(null),
        findItemOwnership: vi.fn().mockResolvedValue(mockOwnershipReserved),
        cancelItem: vi.fn(),
        adminReactivateItem: vi.fn(),
      } as any,
    });
    const res = await request(app).post(`/admin/items/${ITEM_ID}/reactivate`).set(AUTH_HEADER);
    expect(res.status).toBe(409);
  });

  it('item inexistente → 404', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        adminFindAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        adminFindById: vi.fn().mockResolvedValue(null),
        findItemOwnership: vi.fn().mockResolvedValue(null),
        cancelItem: vi.fn(),
        adminReactivateItem: vi.fn(),
      } as any,
    });
    const res = await request(app).post(`/admin/items/${ITEM_ID}/reactivate`).set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });

  it('id no UUID → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post('/admin/items/not-a-uuid/reactivate').set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });

  it('sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post(`/admin/items/${ITEM_ID}/reactivate`);
    expect(res.status).toBe(401);
  });

  it('con token de usuario regular → 401', async () => {
    const { app } = buildTestApp({
      adminJwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockImplementation(() => {
          throw new Error('invalid signature');
        }),
      },
    });
    const res = await request(app)
      .post(`/admin/items/${ITEM_ID}/reactivate`)
      .set('Authorization', 'Bearer user.token');
    expect(res.status).toBe(401);
  });
});

// ─── AC6: Auditoría ───────────────────────────────────────────────────────

describe('AC6: Auditoría — admin_audit_log', () => {
  it('cancel: registra con admin_user_id, entity_id, action e ip_address', async () => {
    const { app, deps } = buildTestApp();
    await request(app).post(`/admin/items/${ITEM_ID}/cancel`).set(AUTH_HEADER);

    expect(deps.adminAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ADMIN_ID,
        action: 'item.cancelled',
        entityType: 'item',
        entityId: ITEM_ID,
        ipAddress: '::ffff:127.0.0.1',
      }),
    );
  });

  it('reactivate: registra con admin_user_id, entity_id, action e ip_address', async () => {
    const { app, deps } = buildTestApp({
      itemRepo: {
        adminFindAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        adminFindById: vi.fn().mockResolvedValue(null),
        findItemOwnership: vi.fn().mockResolvedValue(mockOwnershipCancelled),
        cancelItem: vi.fn(),
        adminReactivateItem: vi.fn().mockResolvedValue(undefined),
      } as any,
    });
    await request(app).post(`/admin/items/${ITEM_ID}/reactivate`).set(AUTH_HEADER);

    expect(deps.adminAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: ADMIN_ID,
        action: 'item.reactivated',
        entityType: 'item',
        entityId: ITEM_ID,
        ipAddress: '::ffff:127.0.0.1',
      }),
    );
  });

  it('cancel item reserved: receiver lookup falla → no lanza error', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findAll: vi.fn(),
      } as any,
      itemRepo: {
        adminFindAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        adminFindById: vi.fn().mockResolvedValue(null),
        findItemOwnership: vi.fn().mockResolvedValue(mockOwnershipReserved),
        cancelItem: vi.fn().mockResolvedValue({ receiverId: RECEIVER_ID, itemTitle: 'Mesa de madera' }),
        adminReactivateItem: vi.fn().mockResolvedValue(undefined),
      } as any,
    });
    const res = await request(app).post(`/admin/items/${ITEM_ID}/cancel`).set(AUTH_HEADER);
    expect(res.status).toBe(200);
  });
});
