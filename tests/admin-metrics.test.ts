import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAdminRouter } from '../src/interfaces/http/routes/admin.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';

const mockAdmin = {
  id: ADMIN_ID,
  email: 'admin@test.example.com',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$...',
  jwtVersion: 1,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(),
};

const baseMetrics = {
  usersTotal: 100,
  usersActive: 80,
  usersSuspended: 20,
  usersUnverifiedOver24h: 5,
  usersPassive: 10,
  usersHoarders: 3,
  itemsByStatus: { active: 50, reserved: 10, completed: 200, cancelled: 30 },
  itemsDegraded: 4,
  sessionsActive: 8,
  sessionsByStatusLast30Days: { completed: 15, expired: 2, cancelled: 3 },
  sessionsNoShowLast30Days: 1,
};

function buildTestApp(depOverrides: Partial<Parameters<typeof createAdminRouter>[0]> = {}) {
  const app = express();
  app.use(express.json());

  const defaultUserRepo = {
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
    countTotal: vi.fn().mockResolvedValue(baseMetrics.usersTotal),
    countActive: vi.fn().mockResolvedValue(baseMetrics.usersActive),
    countSuspended: vi.fn().mockResolvedValue(baseMetrics.usersSuspended),
    countUnverifiedOver24h: vi.fn().mockResolvedValue(baseMetrics.usersUnverifiedOver24h),
    countPassive: vi.fn().mockResolvedValue(baseMetrics.usersPassive),
    countHoarders: vi.fn().mockResolvedValue(baseMetrics.usersHoarders),
  };

  const defaultItemRepo = {
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
    countByStatus: vi.fn().mockResolvedValue(baseMetrics.itemsByStatus),
    countDegraded: vi.fn().mockResolvedValue(baseMetrics.itemsDegraded),
  };

  const defaultSessionRepo = {
    selectReceiver: vi.fn(),
    findById: vi.fn(),
    findByIdForParticipant: vi.fn(),
    confirmDelivery: vi.fn(),
    cancelDelivery: vi.fn(),
    findExpiredSessions: vi.fn(),
    adminFindAll: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
    adminFindById: vi.fn().mockResolvedValue(null),
    adminForceExpireSession: vi.fn().mockResolvedValue(true),
    countActive: vi.fn().mockResolvedValue(baseMetrics.sessionsActive),
    countByStatusLast30Days: vi.fn().mockResolvedValue(baseMetrics.sessionsByStatusLast30Days),
    countNoShowLast30Days: vi.fn().mockResolvedValue(baseMetrics.sessionsNoShowLast30Days),
  };

  const defaultSystemHealthRepo = {
    getCronJobsLastRun: vi.fn().mockResolvedValue([
      {
        jobName: 'expire-sessions',
        lastRunAt: '2026-06-09T10:00:00.000Z',
        lastStatus: 'succeeded',
        returnMessage: null,
      },
    ]),
    getStorageUsage: vi.fn().mockResolvedValue({
      objectsStored: 1342,
      usedBytes: 5043654656,
    }),
    getDatabaseHealth: vi.fn().mockResolvedValue({
      serverVersion: '16.2',
      activeConnections: 12,
      maxConnections: 100,
      sizeBytes: 1932735283,
      replicationActive: true,
    }),
    countPendingStorageDeletions: vi.fn().mockResolvedValue(7),
    countUnverifiedUsers24h: vi.fn().mockResolvedValue(5),
  };

  const defaultReportRepo = {
    create: vi.fn(),
    findAllAdmin: vi.fn(),
    findByIdAdmin: vi.fn(),
    update: vi.fn(),
    countByReporterAndEntity: vi.fn(),
    countByReporterSince: vi.fn(),
    hasPendingByReporterAndEntity: vi.fn(),
    countMetrics: vi.fn().mockResolvedValue({
      pending: 3,
      resolvedLast30Days: 12,
      archivedLast30Days: 5,
    }),
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
    userRepo: defaultUserRepo,
    itemRepo: defaultItemRepo,
    deliverySessionRepo: defaultSessionRepo,
    systemHealthRepo: defaultSystemHealthRepo,
    reportRepo: defaultReportRepo,
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/admin', createAdminRouter(deps));
  app.use(errorHandler);
  return { app, deps };
}

const AUTH_HEADER = { Authorization: 'Bearer valid-admin-token' };

// ─── AC1: GET /admin/metrics ──────────────────────────────────────────────────

describe('AC1 — GET /admin/metrics', () => {
  it('13.6 — con auth admin → 200 con shape completo', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/metrics').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      users: {
        total: baseMetrics.usersTotal,
        active: baseMetrics.usersActive,
        suspended: baseMetrics.usersSuspended,
        unverifiedOver24h: baseMetrics.usersUnverifiedOver24h,
        passive: baseMetrics.usersPassive,
        hoarders: baseMetrics.usersHoarders,
      },
      items: {
        active: baseMetrics.itemsByStatus.active,
        reserved: baseMetrics.itemsByStatus.reserved,
        completed: baseMetrics.itemsByStatus.completed,
        cancelled: baseMetrics.itemsByStatus.cancelled,
        degraded: baseMetrics.itemsDegraded,
      },
      sessions: {
        active: baseMetrics.sessionsActive,
        completedLast30Days: baseMetrics.sessionsByStatusLast30Days.completed,
        expiredLast30Days: baseMetrics.sessionsByStatusLast30Days.expired,
        cancelledLast30Days: baseMetrics.sessionsByStatusLast30Days.cancelled,
      },
    });
    expect(typeof res.body.sessions.noShowRate).toBe('number');
  });

  it('13.6 — noShowRate calculado correctamente', async () => {
    // noShowCount=1, completed=15, cancelled=3 → 1/18 ≈ 0.0556
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/metrics').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    const expected = baseMetrics.sessionsNoShowLast30Days /
      (baseMetrics.sessionsByStatusLast30Days.completed + baseMetrics.sessionsByStatusLast30Days.cancelled);
    expect(res.body.sessions.noShowRate).toBeCloseTo(expected);
  });

  it('13.6 — noShowRate es null cuando no hay sesiones completadas ni canceladas en 30d', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn(),
        confirmDelivery: vi.fn(),
        cancelDelivery: vi.fn(),
        findExpiredSessions: vi.fn(),
        adminFindAll: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
        adminFindById: vi.fn().mockResolvedValue(null),
        adminForceExpireSession: vi.fn().mockResolvedValue(true),
        countActive: vi.fn().mockResolvedValue(0),
        countByStatusLast30Days: vi.fn().mockResolvedValue({ completed: 0, expired: 0, cancelled: 0 }),
        countNoShowLast30Days: vi.fn().mockResolvedValue(0),
      } as Parameters<typeof createAdminRouter>[0]['deliverySessionRepo'],
    });
    const res = await request(app).get('/admin/metrics').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.sessions.noShowRate).toBeNull();
  });

  it('14.7.1 — incluye bloque reports con pending, resolvedLast30Days, archivedLast30Days', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/metrics').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.reports).toEqual({
      pending: 3,
      resolvedLast30Days: 12,
      archivedLast30Days: 5,
    });
  });

  it('13.6 — sin token admin → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/metrics');
    expect(res.status).toBe(401);
  });

  it('13.6 — con token de usuario regular (verify lanza) → 401', async () => {
    const { app } = buildTestApp({
      adminJwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockImplementation(() => { throw new Error('Invalid token'); }),
      },
    });
    const res = await request(app).get('/admin/metrics').set({ Authorization: 'Bearer user-token' });
    expect(res.status).toBe(401);
  });
});

// ─── AC2: GET /admin/system/health ───────────────────────────────────────────

describe('AC2 — GET /admin/system/health', () => {
  it('13.6 — con auth admin → 200 con shape completo', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/system/health').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      cronJobs: [
        {
          jobName: 'expire-sessions',
          lastRunAt: expect.any(String),
          lastStatus: 'succeeded',
          returnMessage: null,
        },
      ],
      storageQueue: { pendingDeletions: 7 },
      unverifiedUsers24h: 5,
      alerts: expect.arrayContaining([
        expect.objectContaining({ code: 'storage_queue_pending', severity: 'warn' }),
        expect.objectContaining({ code: 'unverified_users_24h', severity: 'warn' }),
      ]),
      storage: {
        bucketName: expect.any(String),
        objectsStored: 1342,
        usedBytes: 5043654656,
        pendingDeletions: 7,
        cdnEnabled: true,
      },
      database: {
        serverVersion: '16.2',
        engine: 'PostgreSQL 16.2',
        activeConnections: 12,
        maxConnections: 100,
        sizeBytes: 1932735283,
        lastBackupAt: null,
        replicationActive: true,
      },
      generalConfig: {
        appVersion: expect.any(String),
        environment: expect.any(String),
        publicAppUrl: expect.any(String),
        adminPanelUrl: expect.any(String),
        registrationOpen: true,
        defaultSearchRadiusKm: 50,
        sessionDeadlineDays: 7,
        maxImagesPerItem: 5,
      },
      stackVersions: {
        node: expect.any(String),
        next: null,
        react: null,
        redis: null,
        nginx: null,
      },
    });
  });

  it('13.6 — cronJobs vacío cuando no hay ejecuciones en cron.job_run_details', async () => {
    const { app } = buildTestApp({
      systemHealthRepo: {
        getCronJobsLastRun: vi.fn().mockResolvedValue([]),
        getStorageUsage: vi.fn().mockResolvedValue({ objectsStored: null, usedBytes: null }),
        getDatabaseHealth: vi.fn().mockResolvedValue({
          serverVersion: null,
          activeConnections: null,
          maxConnections: null,
          sizeBytes: null,
          replicationActive: null,
        }),
        countPendingStorageDeletions: vi.fn().mockResolvedValue(0),
        countUnverifiedUsers24h: vi.fn().mockResolvedValue(0),
      },
    });
    const res = await request(app).get('/admin/system/health').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.cronJobs).toEqual([]);
  });

  it('13.6 — si fallan métricas opcionales, mantiene 200 con fallbacks null', async () => {
    const { app } = buildTestApp({
      systemHealthRepo: {
        getCronJobsLastRun: vi.fn().mockResolvedValue([]),
        getStorageUsage: vi.fn().mockRejectedValue(new Error('storage optional error')),
        getDatabaseHealth: vi.fn().mockRejectedValue(new Error('database optional error')),
        countPendingStorageDeletions: vi.fn().mockResolvedValue(0),
        countUnverifiedUsers24h: vi.fn().mockResolvedValue(0),
      },
    });
    const res = await request(app).get('/admin/system/health').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.storage.objectsStored).toBeNull();
    expect(res.body.storage.usedBytes).toBeNull();
    expect(res.body.database.serverVersion).toBeNull();
    expect(res.body.database.sizeBytes).toBeNull();
  });

  it('13.6 — sin token admin → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/system/health');
    expect(res.status).toBe(401);
  });

  it('13.6 — con token de usuario regular (verify lanza) → 401', async () => {
    const { app } = buildTestApp({
      adminJwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockImplementation(() => { throw new Error('Invalid token'); }),
      },
    });
    const res = await request(app).get('/admin/system/health').set({ Authorization: 'Bearer user-token' });
    expect(res.status).toBe(401);
  });
});

// ─── Resiliencia: fallo parcial en Promise.all ────────────────────────────────

describe('Resiliencia — fallo de repositorio en Promise.all', () => {
  it('13.6 — countByStatusLast30Days rechaza → GET /admin/metrics responde 500', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn(),
        confirmDelivery: vi.fn(),
        cancelDelivery: vi.fn(),
        findExpiredSessions: vi.fn(),
        adminFindAll: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
        adminFindById: vi.fn().mockResolvedValue(null),
        adminForceExpireSession: vi.fn().mockResolvedValue(undefined),
        countActive: vi.fn().mockResolvedValue(0),
        countByStatusLast30Days: vi.fn().mockRejectedValue(new Error('DB error')),
        countNoShowLast30Days: vi.fn().mockResolvedValue(0),
      } as Parameters<typeof createAdminRouter>[0]['deliverySessionRepo'],
    });
    const res = await request(app).get('/admin/metrics').set(AUTH_HEADER);
    expect(res.status).toBe(500);
  });
});
