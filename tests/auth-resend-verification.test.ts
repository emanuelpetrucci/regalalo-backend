import { createHash } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAuthRouter } from '../src/interfaces/http/routes/auth.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { env } from '../src/config/env';

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const JWT_VERSION = 1;

const mockUserBase = {
  id: USER_ID,
  email: 'user@example.com',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$...',
  postalCode: '28001',
  reputationScore: 10,
  totalReceived: 0,
  totalDonated: 0,
  consecutiveNoShows: 0,
  cyclesAtLimit: 0,
  lastCycleIncrementedAt: null,
  jwtVersion: JWT_VERSION,
  createdAt: new Date(),
  lastActiveAt: new Date(),
  firstName: 'Test',
  lastName: 'User',
  avatarUrl: null,
  phone: null,
  emailVerified: false,
  verificationTokenHash: null,
  verificationTokenExpiresAt: null,
  verificationResendAt: null as Date | null,
  isActive: true,
  preferredLanguage: 'es',
};

function buildTestApp(
  userOverrides: Partial<typeof mockUserBase> = {},
  depOverrides: Partial<Parameters<typeof createAuthRouter>[0]> = {},
) {
  const app = express();
  app.use(express.json());

  const mockUser = { ...mockUserBase, ...userOverrides };
  const updateVerificationToken = vi.fn().mockResolvedValue(undefined);
  const sendMail = vi.fn().mockResolvedValue(undefined);

  const defaultDeps = {
    userRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn().mockResolvedValue(mockUser),
      findByVerificationTokenHash: vi.fn(),
      create: vi.fn(),
      updateVerificationToken,
      markEmailVerified: vi.fn(),
    },
    passwordResetTokenRepo: {
      create: vi.fn(),
      findByTokenHash: vi.fn(),
      deleteActiveByUserId: vi.fn(),
      markUsedAndResetUserPassword: vi.fn(),
    },
    hashService: { hash: vi.fn(), verify: vi.fn() },
    jwtService: {
      sign: vi.fn(),
      verify: vi.fn().mockReturnValue({ sub: USER_ID, jwtVersion: JWT_VERSION }),
    },
    recaptchaService: { verify: vi.fn().mockResolvedValue({ success: true, score: 0.9 }) },
    geocodingService: { geocode: vi.fn() },
    mailService: { send: sendMail },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/auth', createAuthRouter(deps));
  app.use(errorHandler);
  return { app, deps, updateVerificationToken, sendMail };
}

function bearerHeader() {
  return { Authorization: 'Bearer valid.jwt.token' };
}

describe('POST /auth/resend-verification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('8.5.1 — verificationResendAt null: responde 200 con mensaje exacto', async () => {
    const { app } = buildTestApp({ verificationResendAt: null });

    const res = await request(app)
      .post('/auth/resend-verification')
      .set(bearerHeader());

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Email de verificación reenviado');
  });

  it('8.5.2 — cooldown expirado (>30s): responde 200', async () => {
    const oldDate = new Date(Date.now() - 31_000);
    const { app } = buildTestApp({ verificationResendAt: oldDate });

    const res = await request(app)
      .post('/auth/resend-verification')
      .set(bearerHeader());

    expect(res.status).toBe(200);
  });

  it('8.5.3 — 200: llama updateVerificationToken y envía TPL-009 con verificationLink correcto', async () => {
    const { app, updateVerificationToken, sendMail } = buildTestApp({ verificationResendAt: null });

    await request(app)
      .post('/auth/resend-verification')
      .set(bearerHeader());

    expect(updateVerificationToken).toHaveBeenCalledOnce();
    const callArg = updateVerificationToken.mock.calls[0][0];
    expect(callArg.userId).toBe(USER_ID);
    expect(callArg.expiresAt).toBeInstanceOf(Date);
    expect(callArg.resendAt).toBeInstanceOf(Date);

    expect(sendMail).toHaveBeenCalledOnce();
    const mailArg = sendMail.mock.calls[0][0];
    expect(mailArg.templateId).toBe('TPL-009');
    expect(mailArg.variables.verificationLink).toContain(`${env.APP_PUBLIC_URL}/verificar-email?token=`);
    expect(mailArg.variables.firstName).toBe('Test');
    expect(mailArg.variables.expiresInHours).toBe(24);

    // Verify the hash matches the raw token in the link
    const linkToken = mailArg.variables.verificationLink.split('?token=')[1];
    const expectedHash = createHash('sha256').update(linkToken).digest('hex');
    expect(callArg.tokenHash).toBe(expectedHash);
  });

  it('8.5.4 — cooldown activo (<30s): responde 429 con header Retry-After >= 1', async () => {
    const recent = new Date(Date.now() - 5_000); // 5s ago → 25s remaining
    const { app } = buildTestApp({ verificationResendAt: recent });

    const res = await request(app)
      .post('/auth/resend-verification')
      .set(bearerHeader());

    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers['retry-after']);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(retryAfter)).toBe(true);
  });

  it('8.5.5 — cooldown activo: no llama updateVerificationToken ni envía email', async () => {
    const recent = new Date();
    const { app, updateVerificationToken, sendMail } = buildTestApp({ verificationResendAt: recent });

    await request(app)
      .post('/auth/resend-verification')
      .set(bearerHeader());

    expect(updateVerificationToken).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('8.5.6 — emailVerified true: responde 409', async () => {
    const { app } = buildTestApp({ emailVerified: true });

    const res = await request(app)
      .post('/auth/resend-verification')
      .set(bearerHeader());

    expect(res.status).toBe(409);
  });

  it('8.5.7 — sin Authorization: responde 401', async () => {
    const { app } = buildTestApp();

    const res = await request(app).post('/auth/resend-verification');

    expect(res.status).toBe(401);
  });

  it('8.5.8 — usuario no verificado con JWT válido: no recibe 403 EMAIL_NOT_VERIFIED', async () => {
    const { app } = buildTestApp({ emailVerified: false, verificationResendAt: null });

    const res = await request(app)
      .post('/auth/resend-verification')
      .set(bearerHeader());

    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it('8.5.9 — JWT inválido (jwtVersion distinta): responde 401', async () => {
    const { app } = buildTestApp(
      {},
      {
        jwtService: {
          sign: vi.fn(),
          verify: vi.fn().mockReturnValue({ sub: USER_ID, jwtVersion: 999 }),
        },
      },
    );

    const res = await request(app)
      .post('/auth/resend-verification')
      .set(bearerHeader());

    expect(res.status).toBe(401);
  });

  it('8.5.10 — is_active false: responde 401', async () => {
    const { app } = buildTestApp({ isActive: false });

    const res = await request(app)
      .post('/auth/resend-verification')
      .set(bearerHeader());

    expect(res.status).toBe(401);
  });
});
