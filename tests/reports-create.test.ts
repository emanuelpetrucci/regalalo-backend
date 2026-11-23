import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createReportRouter } from '../src/interfaces/http/routes/reports.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import * as analyticsService from '../src/application/services/analytics.service';
import { BadRequestException } from '../src/domain/exceptions/bad-request.exception';

const REPORTER_UUID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_USER_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ITEM_UUID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const REPORT_UUID = 'cccccccc-dddd-4eee-8fff-111111111111';

const mockReporter = {
  id: REPORTER_UUID,
  email: 'reporter@example.com',
  passwordHash: '$argon2id$...',
  postalCode: '28001',
  reputationScore: 10,
  totalReceived: 0,
  totalDonated: 0,
  consecutiveNoShows: 0,
  cyclesAtLimit: 0,
  lastCycleIncrementedAt: null,
  jwtVersion: 1,
  createdAt: new Date(),
  lastActiveAt: new Date(),
  firstName: 'Ana',
  lastName: 'García',
  avatarUrl: null,
  phone: null,
  emailVerified: true,
  verificationTokenHash: null,
  verificationTokenExpiresAt: null,
  verificationResendAt: null,
  isActive: true,
  preferredLanguage: 'es',
};

const mockItem = {
  id: ITEM_UUID,
  donorId: OTHER_USER_UUID,
  title: 'Silla de madera',
  status: 'active',
  category: 'furniture',
  description: 'Una silla en buen estado',
};

const mockOtherUser = {
  ...mockReporter,
  id: OTHER_USER_UUID,
  email: 'other@example.com',
  firstName: 'Carlos',
  lastName: 'López',
  reputationScore: 15,
};

const validBody = {
  reportedEntityType: 'item',
  reportedEntityId: ITEM_UUID,
  reason: 'spam',
  recaptchaToken: 'valid-token',
};

function buildTestApp(depOverrides: Partial<Parameters<typeof createReportRouter>[0]> = {}) {
  const app = express();
  app.use(express.json());

  const defaultDeps = {
    userRepo: {
      findById: vi.fn().mockResolvedValue(mockReporter),
      findByEmail: vi.fn(),
    },
    itemRepo: {
      findForReport: vi.fn().mockResolvedValue(mockItem),
      findItemOwnership: vi.fn(),
      createWithImages: vi.fn(),
      findActiveInRadius: vi.fn(),
      findById: vi.fn(),
      hasActiveDeliverySession: vi.fn(),
      cancelItem: vi.fn(),
      setPauseStatus: vi.fn(),
      findNewlyDegradedItems: vi.fn(),
      claimPendingDigestItems: vi.fn(),
      findEligibleDigestUsersForItem: vi.fn(),
      adminFindAll: vi.fn(),
      adminFindById: vi.fn(),
      adminReactivateItem: vi.fn(),
      countByStatus: vi.fn(),
      countDegraded: vi.fn(),
    },
    reportRepo: {
      create: vi.fn().mockResolvedValue({ id: REPORT_UUID, createdAt: new Date() }),
      hasPendingByReporterAndEntity: vi.fn().mockResolvedValue(false),
      countByReporterAndEntity: vi.fn().mockResolvedValue(0),
      countByReporterSince: vi.fn().mockResolvedValue(0),
      findAllAdmin: vi.fn(),
      findByIdAdmin: vi.fn(),
      update: vi.fn(),
    },
    recaptchaService: {
      verify: vi.fn().mockResolvedValue({ success: true, score: 0.9 }),
    },
    mailService: {
      send: vi.fn().mockResolvedValue(undefined),
    },
  };

  const jwtService = {
    sign: vi.fn(),
    verify: vi.fn().mockReturnValue({ sub: REPORTER_UUID, jwtVersion: 1 }),
  };

  const deps = {
    ...defaultDeps,
    ...depOverrides,
    itemRepo: { ...defaultDeps.itemRepo, ...(depOverrides.itemRepo ?? {}) },
    reportRepo: { ...defaultDeps.reportRepo, ...(depOverrides.reportRepo ?? {}) },
    recaptchaService: depOverrides.recaptchaService ?? defaultDeps.recaptchaService,
    mailService: depOverrides.mailService ?? defaultDeps.mailService,
  };

  const router = createReportRouter(deps);
  app.use('/reports', router);
  app.use(errorHandler);

  return { app, ...deps };
}

vi.mock('../src/infrastructure/security/jwt.service', () => ({
  JwtService: vi.fn().mockImplementation(() => ({
    sign: vi.fn(),
    verify: vi.fn().mockReturnValue({ sub: REPORTER_UUID, jwtVersion: 1 }),
  })),
}));

vi.mock('../src/application/services/analytics.service', () => ({
  safeEmitEvent: vi.fn(),
}));

describe('POST /reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('14-3.1 — 201: reporte exitoso sobre item', async () => {
    const { app, reportRepo, mailService } = buildTestApp();
    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: REPORT_UUID,
      message: 'Reporte enviado correctamente. Lo revisaremos lo antes posible.',
    });
    expect(reportRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        reporterId: REPORTER_UUID,
        reportedEntityType: 'item',
        reportedEntityId: ITEM_UUID,
        reason: 'spam',
      }),
    );
  });

  it('14-3.2 — 201: reporte exitoso sobre user', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findById: vi.fn().mockImplementation((id: string) =>
          Promise.resolve(id === OTHER_USER_UUID ? mockOtherUser : mockReporter),
        ),
      } as never,
    });

    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({
        reportedEntityType: 'user',
        reportedEntityId: OTHER_USER_UUID,
        reason: 'comportamiento_abusivo',
        recaptchaToken: 'valid-token',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: REPORT_UUID });
  });

  it('14-3.2b — 201: reporte exitoso con reason fraude_o_enganio', async () => {
    const { app, reportRepo } = buildTestApp();

    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({
        ...validBody,
        reason: 'fraude_o_enganio',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: REPORT_UUID });
    expect(reportRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'fraude_o_enganio',
      }),
    );
  });

  it('14-3.3 — 401: sin token', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post('/reports').send(validBody);
    expect(res.status).toBe(401);
  });

  it('14-3.4 — 403: email no verificado', async () => {
    const unverifiedUser = { ...mockReporter, emailVerified: false };
    const { app } = buildTestApp({
      userRepo: { findById: vi.fn().mockResolvedValue(unverifiedUser) } as never,
    });
    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('14-3.5 — 400: payload inválido (sin recaptchaToken)', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ reportedEntityType: 'item', reportedEntityId: ITEM_UUID, reason: 'spam' });
    expect(res.status).toBe(400);
  });

  it('14-3.6 — 400: RECAPTCHA_FAILED', async () => {
    const { app } = buildTestApp({
      recaptchaService: { verify: vi.fn().mockResolvedValue({ success: true, score: 0.3 }) },
    });
    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('RECAPTCHA_FAILED');
  });

  it('14-3.7 — 422: SELF_REPORT_FORBIDDEN (item)', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        findForReport: vi.fn().mockResolvedValue({ ...mockItem, donorId: REPORTER_UUID }),
      } as never,
    });
    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send(validBody);
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('SELF_REPORT_FORBIDDEN');
  });

  it('14-3.8 — 422: SELF_REPORT_FORBIDDEN (user)', async () => {
    const { app } = buildTestApp({
      userRepo: { findById: vi.fn().mockResolvedValue(mockReporter) } as never,
    });
    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({
        reportedEntityType: 'user',
        reportedEntityId: REPORTER_UUID,
        reason: 'spam',
        recaptchaToken: 'valid-token',
      });
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('SELF_REPORT_FORBIDDEN');
  });

  it('14-3.9 — 422: ENTITY_NOT_REPORTABLE (item cancelled)', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        findForReport: vi.fn().mockResolvedValue({ ...mockItem, status: 'cancelled' }),
      } as never,
    });
    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send(validBody);
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('ENTITY_NOT_REPORTABLE');
  });

  it('14-3.10 — 409: REPORT_ALREADY_PENDING', async () => {
    const { app } = buildTestApp({
      reportRepo: {
        hasPendingByReporterAndEntity: vi.fn().mockResolvedValue(true),
        countByReporterAndEntity: vi.fn().mockResolvedValue(0),
        countByReporterSince: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        findAllAdmin: vi.fn(),
        findByIdAdmin: vi.fn(),
        update: vi.fn(),
      },
    });
    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('REPORT_ALREADY_PENDING');
  });

  it('14-3.11 — 429: RATE_LIMIT_ENTITY_EXCEEDED', async () => {
    const { app } = buildTestApp({
      reportRepo: {
        hasPendingByReporterAndEntity: vi.fn().mockResolvedValue(false),
        countByReporterAndEntity: vi.fn().mockResolvedValue(3),
        countByReporterSince: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        findAllAdmin: vi.fn(),
        findByIdAdmin: vi.fn(),
        update: vi.fn(),
      },
    });
    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send(validBody);
    expect(res.status).toBe(429);
    expect(res.body.message).toBe('RATE_LIMIT_ENTITY_EXCEEDED');
  });

  it('14-3.12 — 429: RATE_LIMIT_TOTAL_EXCEEDED', async () => {
    const { app } = buildTestApp({
      reportRepo: {
        hasPendingByReporterAndEntity: vi.fn().mockResolvedValue(false),
        countByReporterAndEntity: vi.fn().mockResolvedValue(0),
        countByReporterSince: vi.fn().mockResolvedValue(10),
        create: vi.fn(),
        findAllAdmin: vi.fn(),
        findByIdAdmin: vi.fn(),
        update: vi.fn(),
      },
    });
    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send(validBody);
    expect(res.status).toBe(429);
    expect(res.body.message).toBe('RATE_LIMIT_TOTAL_EXCEEDED');
  });

  it('14-3.13 — 404: ENTITY_NOT_FOUND (item no existe)', async () => {
    const { app } = buildTestApp({
      itemRepo: { findForReport: vi.fn().mockResolvedValue(null) } as never,
    });
    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('ENTITY_NOT_FOUND');
  });

  it('14-3.14 — post-commit: mailService llamado para TPL-011 y TPL-ADM-002', async () => {
    const mailSend = vi.fn().mockResolvedValue(undefined);
    const { app } = buildTestApp({
      mailService: { send: mailSend },
    });

    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send(validBody);

    expect(res.status).toBe(201);
    // Allow fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(mailSend).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'TPL-011', to: 'reporter@example.com' }),
    );
    expect(mailSend).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'TPL-ADM-002' }),
    );
  });

  it('14-3.15b — AE-032: safeEmitEvent llamado tras reporte exitoso', async () => {
    const mockEmit = vi.mocked(analyticsService.safeEmitEvent);
    const { app } = buildTestApp();

    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send(validBody);

    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 10));
    expect(mockEmit).toHaveBeenCalledWith(
      'report.submitted',
      REPORTER_UUID,
      expect.objectContaining({ entityType: 'item', reason: 'spam' }),
    );
  });

  it('14-3.15 — 400: reportedEntityId inválido (no es UUID)', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ ...validBody, reportedEntityId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });

  it('14-3.16 — 400: INVALID_REPORT_REASON cuando falla reports_reason_check (sin 500)', async () => {
    const { app } = buildTestApp({
      reportRepo: {
        create: vi.fn().mockRejectedValue(new BadRequestException('INVALID_REPORT_REASON')),
      } as never,
    });

    const res = await request(app)
      .post('/reports')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({
        ...validBody,
        reason: 'fraude_o_enganio',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('INVALID_REPORT_REASON');
  });
});
