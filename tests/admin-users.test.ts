import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAdminRouter } from '../src/interfaces/http/routes/admin.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const USER_ID = '660e8400-e29b-41d4-a716-446655440002';

const mockAdmin = {
  id: ADMIN_ID,
  email: 'admin@test.example.com',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$...',
  jwtVersion: 1,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(),
};

const mockUser = {
  id: USER_ID,
  email: 'user@test.example.com',
  passwordHash: 'hash',
  firstName: 'Juan',
  lastName: 'Pérez',
  isActive: true,
  emailVerified: false,
  reputationScore: 100,
  totalDonated: 5,
  totalReceived: 3,
  consecutiveNoShows: 2,
  cyclesAtLimit: 1,
  postalCode: '1000',
  avatarUrl: null,
  phone: null,
  preferredLanguage: 'es',
  jwtVersion: 3,
  createdAt: new Date(),
  lastActiveAt: new Date(),
  verificationTokenHash: null,
  verificationTokenExpiresAt: null,
  verificationResendAt: null,
  lastCycleIncrementedAt: null,
};

const mockUserRecord = {
  id: USER_ID,
  email: 'user@test.example.com',
  firstName: 'Juan',
  lastName: 'Pérez',
  isActive: true,
  emailVerified: false,
  reputationScore: 100,
  totalDonated: 5,
  totalReceived: 3,
  consecutiveNoShows: 2,
  cyclesAtLimit: 1,
  createdAt: new Date(),
  lastActiveAt: new Date(),
  isPassive: false,
  isHoarder: false,
};

const mockUserDetailRecord = {
  ...mockUserRecord,
  avatarUrl: null,
  phone: null,
  postalCode: '1000',
  preferredLanguage: 'es',
  reputationHistory: [
    {
      id: 'rep-1',
      type: 'delivery_completed' as const,
      delta: 10,
      sessionId: null,
      createdAt: new Date(),
    },
    {
      id: 'rep-2',
      type: 'admin_correction' as const,
      delta: -5,
      sessionId: null,
      createdAt: new Date(),
    },
  ],
  activeItems: 2,
  completedItems: 3,
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
      findById: vi.fn().mockResolvedValue(mockUser),
      findByVerificationTokenHash: vi.fn(),
      create: vi.fn(),
      updateProfile: vi.fn(),
      updateVerificationToken: vi.fn(),
      markEmailVerified: vi.fn(),
      findReputationHistory: vi.fn(),
      findMyDeliverySessions: vi.fn(),
      findMyItems: vi.fn(),
      findMyRequests: vi.fn(),
      adminFindAll: vi.fn().mockResolvedValue({ users: [mockUserRecord], total: 1 }),
      adminFindById: vi.fn().mockResolvedValue(mockUserDetailRecord),
      adminSuspend: vi.fn().mockResolvedValue(3),
      adminReactivate: vi.fn().mockResolvedValue(2),
      adminForceVerification: vi.fn().mockResolvedValue(undefined),
      adminCorrectReputation: vi.fn().mockResolvedValue(95),
      adminResetNoShows: vi.fn().mockResolvedValue(undefined),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/admin', createAdminRouter(deps));
  app.use(errorHandler);
  return { app, deps: deps as typeof defaultDeps };
}

const AUTH_HEADER = { Authorization: 'Bearer valid-admin-token' };

describe('GET /admin/users — AC1: Listar usuarios', () => {
  it('sin filtros → 200 con users y pagination', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/users').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
  });

  it('con search → pasa search al repo', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/users?search=juan').set(AUTH_HEADER);

    expect(deps.userRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'juan' }),
    );
  });

  it('con status=active → pasa status al repo', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/users?status=active').set(AUTH_HEADER);

    expect(deps.userRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('con status=suspended → pasa status=suspended al repo', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/users?status=suspended').set(AUTH_HEADER);

    expect(deps.userRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'suspended' }),
    );
  });

  it('con emailVerified=true → pasa emailVerified al repo', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/users?emailVerified=true').set(AUTH_HEADER);

    expect(deps.userRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ emailVerified: true }),
    );
  });

  it('con page=2&limit=5 → pasa page y limit', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/admin/users?page=2&limit=5').set(AUTH_HEADER);

    expect(deps.userRepo.adminFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 5 }),
    );
  });

  it('con limit=200 → 400 (límite máximo 100)', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/users?limit=200').set(AUTH_HEADER);

    expect(res.status).toBe(400);
  });

  it('sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/users');
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
    const res = await request(app).get('/admin/users').set('Authorization', 'Bearer user.token');
    expect(res.status).toBe(401);
  });

  it('location nunca en la respuesta', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/users').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    const user = res.body.users[0];
    expect(user).not.toHaveProperty('location');
  });
});

describe('GET /admin/users/:id — AC2: Detalle de usuario', () => {
  it('usuario existente → 200 con detalle completo', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/admin/users/${USER_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(USER_ID);
    expect(res.body).toHaveProperty('reputationHistory');
    expect(res.body).toHaveProperty('activeItems');
    expect(res.body).toHaveProperty('completedItems');
    expect(res.body.reputationHistory).toHaveLength(2);
  });

  it('reputationHistory incluye admin_correction', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/admin/users/${USER_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    const types = (res.body.reputationHistory as { type: string }[]).map((e) => e.type);
    expect(types).toContain('admin_correction');
    expect(types).toContain('delivery_completed');
  });

  it('usuario inexistente → 404', async () => {
    const { app } = buildTestApp({
      userRepo: {
        ...buildTestApp().deps.userRepo,
        adminFindById: vi.fn().mockResolvedValue(null),
      },
    });
    const res = await request(app).get(`/admin/users/${USER_ID}`).set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });

  it('ID no UUID → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/users/not-a-uuid').set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });

  it('location nunca en la respuesta', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/admin/users/${USER_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('location');
  });

  it('sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/admin/users/${USER_ID}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /admin/users/:id/suspend — AC3: Suspender usuario', () => {
  it('usuario activo → 200 con itemsPaused', async () => {
    const { app, deps } = buildTestApp();
    const res = await request(app).post(`/admin/users/${USER_ID}/suspend`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Usuario suspendido');
    expect(res.body.itemsPaused).toBe(3);
    expect(deps.userRepo.adminSuspend).toHaveBeenCalledWith(USER_ID);
  });

  it('usuario ya suspendido → 409', async () => {
    const { app } = buildTestApp({
      userRepo: {
        ...buildTestApp().deps.userRepo,
        findById: vi.fn().mockResolvedValue({ ...mockUser, isActive: false }),
      },
    });
    const res = await request(app).post(`/admin/users/${USER_ID}/suspend`).set(AUTH_HEADER);
    expect(res.status).toBe(409);
  });

  it('usuario inexistente → 404', async () => {
    const { app } = buildTestApp({
      userRepo: {
        ...buildTestApp().deps.userRepo,
        findById: vi.fn().mockResolvedValue(null),
      },
    });
    const res = await request(app).post(`/admin/users/${USER_ID}/suspend`).set(AUTH_HEADER);
    expect(res.status).toBe(404);
  });

  it('registra audit log con action user.suspended', async () => {
    const { app, deps } = buildTestApp();
    await request(app).post(`/admin/users/${USER_ID}/suspend`).set(AUTH_HEADER);

    expect(deps.adminAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.suspended',
        entityType: 'user',
        entityId: USER_ID,
      }),
    );
  });

  it('payloadSnapshot captura is_active y jwt_version previos', async () => {
    const { app, deps } = buildTestApp();
    await request(app).post(`/admin/users/${USER_ID}/suspend`).set(AUTH_HEADER);

    const auditCall = (deps.adminAuditLogRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(auditCall.payloadSnapshot).toMatchObject({
      is_active: mockUser.isActive,
      jwt_version: mockUser.jwtVersion,
    });
  });

  it('ID no UUID → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post('/admin/users/invalid-id/suspend').set(AUTH_HEADER);
    expect(res.status).toBe(400);
  });

  it('sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post(`/admin/users/${USER_ID}/suspend`);
    expect(res.status).toBe(401);
  });
});

describe('POST /admin/users/:id/reactivate — AC4: Reactivar usuario', () => {
  const suspendedUser = { ...mockUser, isActive: false };

  it('usuario suspendido → 200 con itemsUnpaused', async () => {
    const { app, deps } = buildTestApp({
      userRepo: {
        ...buildTestApp().deps.userRepo,
        findById: vi.fn().mockResolvedValue(suspendedUser),
      },
    });
    const res = await request(app).post(`/admin/users/${USER_ID}/reactivate`).set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Usuario reactivado');
    expect(res.body.itemsUnpaused).toBe(2);
    expect(deps.userRepo.adminReactivate).toHaveBeenCalledWith(USER_ID);
  });

  it('usuario ya activo → 409', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post(`/admin/users/${USER_ID}/reactivate`).set(AUTH_HEADER);
    expect(res.status).toBe(409);
  });

  it('registra audit log con action user.reactivated', async () => {
    const { app, deps } = buildTestApp({
      userRepo: {
        ...buildTestApp().deps.userRepo,
        findById: vi.fn().mockResolvedValue(suspendedUser),
      },
    });
    await request(app).post(`/admin/users/${USER_ID}/reactivate`).set(AUTH_HEADER);

    expect(deps.adminAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.reactivated', entityId: USER_ID }),
    );
  });

  it('sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post(`/admin/users/${USER_ID}/reactivate`);
    expect(res.status).toBe(401);
  });
});

describe('POST /admin/users/:id/force-verification — AC5: Forzar verificación', () => {
  it('usuario no verificado → 200, email enviado', async () => {
    const { app, deps } = buildTestApp();
    const res = await request(app)
      .post(`/admin/users/${USER_ID}/force-verification`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Email de verificación enviado');
    expect(deps.userRepo.adminForceVerification).toHaveBeenCalledWith(
      USER_ID,
      expect.any(String),
      expect.any(Date),
    );
    expect(deps.mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'TPL-009' }),
    );
  });

  it('usuario ya verificado → 409', async () => {
    const { app } = buildTestApp({
      userRepo: {
        ...buildTestApp().deps.userRepo,
        findById: vi.fn().mockResolvedValue({ ...mockUser, emailVerified: true }),
      },
    });
    const res = await request(app)
      .post(`/admin/users/${USER_ID}/force-verification`)
      .set(AUTH_HEADER);
    expect(res.status).toBe(409);
  });

  it('registra audit log con action user.verification_forced', async () => {
    const { app, deps } = buildTestApp();
    await request(app).post(`/admin/users/${USER_ID}/force-verification`).set(AUTH_HEADER);

    expect(deps.adminAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.verification_forced', entityId: USER_ID }),
    );
  });

  it('sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post(`/admin/users/${USER_ID}/force-verification`);
    expect(res.status).toBe(401);
  });
});

describe('POST /admin/users/:id/correct-reputation — AC6: Corregir reputación', () => {
  const validBody = { delta: 10, reason: 'Compensación por error del sistema' };

  it('delta positivo → 200 con newReputationScore', async () => {
    const { app, deps } = buildTestApp();
    const res = await request(app)
      .post(`/admin/users/${USER_ID}/correct-reputation`)
      .set(AUTH_HEADER)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.newReputationScore).toBe(95);
    expect(res.body.delta).toBe(10);
    expect(deps.userRepo.adminCorrectReputation).toHaveBeenCalledWith(USER_ID, 10);
  });

  it('delta negativo → 200', async () => {
    const { app, deps } = buildTestApp();
    const res = await request(app)
      .post(`/admin/users/${USER_ID}/correct-reputation`)
      .set(AUTH_HEADER)
      .send({ delta: -5, reason: 'Corrección' });

    expect(res.status).toBe(200);
    expect(deps.userRepo.adminCorrectReputation).toHaveBeenCalledWith(USER_ID, -5);
  });

  it('delta=0 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/admin/users/${USER_ID}/correct-reputation`)
      .set(AUTH_HEADER)
      .send({ delta: 0, reason: 'Intento' });
    expect(res.status).toBe(400);
  });

  it('reason con más de 500 caracteres → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/admin/users/${USER_ID}/correct-reputation`)
      .set(AUTH_HEADER)
      .send({ delta: 5, reason: 'x'.repeat(501) });
    expect(res.status).toBe(400);
  });

  it('registra audit log con action user.reputation_corrected y reason', async () => {
    const { app, deps } = buildTestApp();
    await request(app)
      .post(`/admin/users/${USER_ID}/correct-reputation`)
      .set(AUTH_HEADER)
      .send(validBody);

    expect(deps.adminAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.reputation_corrected',
        entityId: USER_ID,
        payloadSnapshot: expect.objectContaining({ reason: validBody.reason }),
      }),
    );
  });

  it('sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/admin/users/${USER_ID}/correct-reputation`)
      .send(validBody);
    expect(res.status).toBe(401);
  });
});

describe('POST /admin/users/:id/reset-no-shows — AC7: Resetear no-shows', () => {
  it('usuario con consecutive_no_shows > 0 → 200 con previousValue', async () => {
    const { app, deps } = buildTestApp();
    const res = await request(app)
      .post(`/admin/users/${USER_ID}/reset-no-shows`)
      .set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Contador de no-shows reseteado');
    expect(res.body.previousValue).toBe(mockUser.consecutiveNoShows);
    expect(deps.userRepo.adminResetNoShows).toHaveBeenCalledWith(USER_ID);
  });

  it('usuario con consecutive_no_shows = 0 → 409', async () => {
    const { app } = buildTestApp({
      userRepo: {
        ...buildTestApp().deps.userRepo,
        findById: vi.fn().mockResolvedValue({ ...mockUser, consecutiveNoShows: 0 }),
      },
    });
    const res = await request(app)
      .post(`/admin/users/${USER_ID}/reset-no-shows`)
      .set(AUTH_HEADER);
    expect(res.status).toBe(409);
  });

  it('registra audit log con action user.no_shows_reset y previous value', async () => {
    const { app, deps } = buildTestApp();
    await request(app).post(`/admin/users/${USER_ID}/reset-no-shows`).set(AUTH_HEADER);

    expect(deps.adminAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.no_shows_reset',
        entityId: USER_ID,
        payloadSnapshot: { consecutive_no_shows: mockUser.consecutiveNoShows },
      }),
    );
  });

  it('sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post(`/admin/users/${USER_ID}/reset-no-shows`);
    expect(res.status).toBe(401);
  });
});

describe('AC8/AC9: Auditoría transversal — todos los endpoints con token de usuario', () => {
  function buildAppWithBadToken() {
    return buildTestApp({
      adminJwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockImplementation(() => {
          throw new Error('invalid signature');
        }),
      },
    });
  }

  it('GET /admin/users con token de usuario → 401', async () => {
    const { app } = buildAppWithBadToken();
    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', 'Bearer user.regular.token');
    expect(res.status).toBe(401);
  });

  it('GET /admin/users/:id con token de usuario → 401', async () => {
    const { app } = buildAppWithBadToken();
    const res = await request(app)
      .get(`/admin/users/${USER_ID}`)
      .set('Authorization', 'Bearer user.regular.token');
    expect(res.status).toBe(401);
  });

  it('POST /admin/users/:id/suspend con token de usuario → 401', async () => {
    const { app } = buildAppWithBadToken();
    const res = await request(app)
      .post(`/admin/users/${USER_ID}/suspend`)
      .set('Authorization', 'Bearer user.regular.token');
    expect(res.status).toBe(401);
  });

  it('POST /admin/users/:id/reactivate con token de usuario → 401', async () => {
    const { app } = buildAppWithBadToken();
    const res = await request(app)
      .post(`/admin/users/${USER_ID}/reactivate`)
      .set('Authorization', 'Bearer user.regular.token');
    expect(res.status).toBe(401);
  });

  it('POST /admin/users/:id/force-verification con token de usuario → 401', async () => {
    const { app } = buildAppWithBadToken();
    const res = await request(app)
      .post(`/admin/users/${USER_ID}/force-verification`)
      .set('Authorization', 'Bearer user.regular.token');
    expect(res.status).toBe(401);
  });

  it('POST /admin/users/:id/correct-reputation con token de usuario → 401', async () => {
    const { app } = buildAppWithBadToken();
    const res = await request(app)
      .post(`/admin/users/${USER_ID}/correct-reputation`)
      .set('Authorization', 'Bearer user.regular.token')
      .send({ delta: 5, reason: 'test' });
    expect(res.status).toBe(401);
  });

  it('POST /admin/users/:id/reset-no-shows con token de usuario → 401', async () => {
    const { app } = buildAppWithBadToken();
    const res = await request(app)
      .post(`/admin/users/${USER_ID}/reset-no-shows`)
      .set('Authorization', 'Bearer user.regular.token');
    expect(res.status).toBe(401);
  });
});
