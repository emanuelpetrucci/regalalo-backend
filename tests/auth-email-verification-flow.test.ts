import { createHash } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAuthRouter } from '../src/interfaces/http/routes/auth.routes';
import { createAuthMiddleware } from '../src/interfaces/http/middlewares/auth.middleware';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

vi.mock('../src/application/services/analytics.service', () => ({
  emitEvent: vi.fn(),
}));

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const RAW_TOKEN = 'c'.repeat(64);
const TOKEN_HASH = createHash('sha256').update(RAW_TOKEN).digest('hex');

// P2: dates computed per-call, not at module load time
function makeMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: 'flow@example.com',
    passwordHash: '$argon2id$...',
    postalCode: '28001',
    reputationScore: 0,
    totalReceived: 0,
    totalDonated: 0,
    consecutiveNoShows: 0,
    cyclesAtLimit: 0,
    lastCycleIncrementedAt: null,
    jwtVersion: 1,
    createdAt: new Date(),
    lastActiveAt: null,
    firstName: 'Ana',
    lastName: 'García',
    avatarUrl: null,
    phone: null,
    emailVerified: false,
    verificationTokenHash: TOKEN_HASH,
    verificationTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    verificationResendAt: new Date(Date.now() - 60_000),
    isActive: true,
    preferredLanguage: 'es',
    ...overrides,
  };
}

function buildFlowApp(emailVerified = false) {
  const app = express();
  app.use(express.json());

  const mockUser = makeMockUser({ emailVerified });

  const jwtService = {
    sign: vi.fn().mockReturnValue('mock-jwt-token'),
    verify: vi.fn().mockReturnValue({ sub: USER_ID, jwtVersion: 1 }),
  };

  const userRepo = {
    findByEmail: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(mockUser),
    create: vi.fn().mockResolvedValue(makeMockUser({ emailVerified: false })),
    findByVerificationTokenHash: vi.fn().mockResolvedValue(mockUser),
    markEmailVerified: vi.fn().mockResolvedValue(undefined),
    updateVerificationToken: vi.fn().mockResolvedValue(undefined),
  };

  const mailService = { send: vi.fn().mockResolvedValue(undefined) };

  const deps = {
    userRepo,
    jwtService,
    mailService,
    hashService: { hash: vi.fn().mockResolvedValue('hashed'), verify: vi.fn() },
    recaptchaService: { verify: vi.fn().mockResolvedValue({ success: true, score: 0.9 }) },
    geocodingService: { geocode: vi.fn().mockResolvedValue({ lat: 40.4168, lon: -3.7038 }) },
  };

  const authMiddleware = createAuthMiddleware(jwtService, userRepo);

  app.use('/auth', createAuthRouter(deps));
  app.get('/users/me', authMiddleware, (_req, res) => {
    res.json({ userId: _req.currentUser?.id });
  });
  app.use(errorHandler);

  return { app, userRepo, mailService };
}

describe('Flujo EVT-014 / TPL-009 — verificación de email end-to-end', () => {
  beforeEach(() => vi.clearAllMocks());

  it('8.6.1 — registro exitoso envía solo TPL-009 con variables EVT-014 correctas', async () => {
    const { app, mailService } = buildFlowApp();

    const res = await request(app).post('/auth/register').send({
      email: 'flow@example.com',
      password: 'password123',
      firstName: 'Ana',
      lastName: 'García',
      postalCode: '28001',
      recaptchaToken: 'token',
    });

    expect(res.status).toBe(201);
    expect(mailService.send).toHaveBeenCalledTimes(1);

    const calls = vi.mocked(mailService.send).mock.calls;
    const tpl009Call = calls.find((c) => c[0].templateId === 'TPL-009');
    expect(tpl009Call).toBeDefined();
    expect(calls.find((c) => c[0].templateId === 'TPL-001')).toBeUndefined();
    expect(tpl009Call![0].variables).toMatchObject({
      recipientEmail: 'flow@example.com',
      firstName: 'Ana',
      expiresInHours: 24,
    });
    // P8: verify verificationLink uses APP_PUBLIC_URL as origin (SPA URL, not API URL)
    const appPublicUrl =
      process.env['APP_PUBLIC_URL'] ?? process.env['CORS_ORIGIN'] ?? 'http://localhost:4200';
    const verificationLink = String(tpl009Call![0].variables.verificationLink);
    expect(verificationLink).toContain(`${appPublicUrl}/verificar-email?token=`);
  });

  it('8.6.2 — usuario con emailVerified=false en ruta protegida → 403 + code EMAIL_NOT_VERIFIED', async () => {
    const { app } = buildFlowApp(false);

    const res = await request(app)
      .get('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('8.6.3 — usuario con emailVerified=true en ruta protegida → 200', async () => {
    const { app } = buildFlowApp(true);

    const res = await request(app)
      .get('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(USER_ID);
  });

  it('8.6.4 — verify token válido → 200 con mensaje exacto; token expirado → 400', async () => {
    const { app, userRepo } = buildFlowApp();

    const validRes = await request(app)
      .get('/auth/verify-email')
      .query({ token: RAW_TOKEN });
    expect(validRes.status).toBe(200);
    expect(validRes.body.message).toBe('Email verificado correctamente');
    expect(userRepo.markEmailVerified).toHaveBeenCalledWith(USER_ID);
    // P9: cleanup path taken (markEmailVerified), not token rotation path
    expect(userRepo.updateVerificationToken).not.toHaveBeenCalled();

    // P1: re-mock markEmailVerified after clearAllMocks so it returns a proper Promise
    vi.clearAllMocks();
    userRepo.markEmailVerified.mockResolvedValue(undefined);
    userRepo.findByVerificationTokenHash.mockResolvedValue(
      makeMockUser({ verificationTokenExpiresAt: new Date(Date.now() - 1000) }),
    );

    const expiredRes = await request(app)
      .get('/auth/verify-email')
      .query({ token: RAW_TOKEN });
    expect(expiredRes.status).toBe(400);
    expect(userRepo.markEmailVerified).not.toHaveBeenCalled();
  });

  it('8.6.5 — resend con cooldown activo (<30s) → 429 con header Retry-After', async () => {
    const { app, userRepo } = buildFlowApp();
    userRepo.findById.mockResolvedValue(
      makeMockUser({ verificationResendAt: new Date(Date.now() - 5_000) }),
    );

    const res = await request(app)
      .post('/auth/resend-verification')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    // P10: bound Retry-After to the cooldown window; with 5s elapsed, remaining ≤ 30s
    expect(retryAfter).toBeLessThanOrEqual(30);
  });

  it('8.6.6 — resend con email ya verificado → 409', async () => {
    const { app, userRepo } = buildFlowApp();
    userRepo.findById.mockResolvedValue(makeMockUser({ emailVerified: true }));

    const res = await request(app)
      .post('/auth/resend-verification')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(409);
  });

  // P4: token not found in DB
  it('8.6.7 — GET /auth/verify-email token no encontrado en DB → 400', async () => {
    const { app, userRepo } = buildFlowApp();
    userRepo.findByVerificationTokenHash.mockResolvedValue(null);

    const res = await request(app)
      .get('/auth/verify-email')
      .query({ token: RAW_TOKEN });

    expect(res.status).toBe(400);
  });

  // P5: missing Authorization header on resend
  it('8.6.8 — POST /auth/resend-verification sin Authorization → 401', async () => {
    const { app } = buildFlowApp();

    const res = await request(app).post('/auth/resend-verification');

    expect(res.status).toBe(401);
  });

  // P6: user deleted between JWT issuance and request
  it('8.6.9 — POST /auth/resend-verification usuario eliminado (findById null) → 401', async () => {
    const { app, userRepo } = buildFlowApp();
    userRepo.findById.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/resend-verification')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(401);
  });

  // P7: missing token query param
  it('8.6.10 — GET /auth/verify-email sin parámetro token → 400', async () => {
    const { app } = buildFlowApp();

    const res = await request(app).get('/auth/verify-email');

    expect(res.status).toBe(400);
  });
});
