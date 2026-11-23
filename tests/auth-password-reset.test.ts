import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAuthRouter } from '../src/interfaces/http/routes/auth.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const PAST = new Date(Date.now() - 1);

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'user@example.com',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$...',
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
  firstName: 'Test',
  lastName: 'User',
  avatarUrl: null,
  phone: null,
  emailVerified: false,
  verificationTokenHash: null,
  verificationTokenExpiresAt: null,
  verificationResendAt: null,
  isActive: true,
  preferredLanguage: 'es',
};

const mockTokenRecord = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  userId: mockUser.id,
  tokenHash: 'sha256hashvalue',
  expiresAt: FUTURE,
  used: false,
  createdAt: new Date(),
};

function buildTestApp(
  depOverrides: Partial<Parameters<typeof createAuthRouter>[0]> = {},
) {
  const app = express();
  app.use(express.json());

  const defaultDeps = {
    userRepo: {
      findByEmail: vi.fn().mockResolvedValue(mockUser),
      findById: vi.fn().mockResolvedValue(mockUser),
      create: vi.fn(),
    },
    passwordResetTokenRepo: {
      create: vi.fn().mockResolvedValue(mockTokenRecord),
      findByTokenHash: vi.fn().mockResolvedValue(mockTokenRecord),
      deleteActiveByUserId: vi.fn().mockResolvedValue(undefined),
      markUsedAndResetUserPassword: vi.fn().mockResolvedValue(undefined),
    },
    hashService: {
      hash: vi.fn().mockResolvedValue('$argon2id$new-hash'),
      verify: vi.fn().mockResolvedValue(true),
    },
    jwtService: {
      sign: vi.fn().mockReturnValue('mock-jwt-token'),
      verify: vi.fn(),
    },
    recaptchaService: {
      verify: vi.fn().mockResolvedValue({ success: true, score: 0.9 }),
    },
    geocodingService: { geocode: vi.fn() },
    mailService: { send: vi.fn().mockResolvedValue(undefined) },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/auth', createAuthRouter(deps));
  app.use(errorHandler);
  return { app, deps };
}

// ─── POST /auth/forgot-password ───────────────────────────────────────────────

describe('POST /auth/forgot-password', () => {
  beforeEach(() => vi.clearAllMocks());

  it('7.1 — email registrado: responde 200 con mensaje genérico, crea token y envía email', async () => {
    const { app, deps } = buildTestApp();

    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'user@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();
    expect(deps.passwordResetTokenRepo.create).toHaveBeenCalledOnce();
    expect(deps.mailService.send).toHaveBeenCalledOnce();
    expect(deps.mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'TPL-002',
        variables: expect.objectContaining({
          firstName: 'Test',
          recipientEmail: 'user@example.com',
          expiresInMinutes: 60,
        }),
      }),
    );
  });

  it('7.2 — email NO registrado: responde 200 con el MISMO mensaje (anti-enumeración)', async () => {
    const { app: appExisting } = buildTestApp();
    const { app: appMissing } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn().mockResolvedValue(null),
        findById: vi.fn(),
        create: vi.fn(),
      },
    });

    const res1 = await request(appExisting)
      .post('/auth/forgot-password')
      .send({ email: 'user@example.com' });
    const res2 = await request(appMissing)
      .post('/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.message).toBe(res2.body.message);
  });

  it('7.3 — email NO registrado: NO crea token ni envía email', async () => {
    const { app, deps } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn().mockResolvedValue(null),
        findById: vi.fn(),
        create: vi.fn(),
      },
    });

    await request(app).post('/auth/forgot-password').send({ email: 'nobody@example.com' });

    expect(deps.passwordResetTokenRepo.create).not.toHaveBeenCalled();
    expect(deps.mailService.send).not.toHaveBeenCalled();
  });

  it('7.4 — body inválido: sin campo email responde 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post('/auth/forgot-password').send({});
    expect(res.status).toBe(400);
  });

  it('7.5 — body inválido: email malformado responde 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('7.6 — token creado contiene hash SHA-256 (no el token raw)', async () => {
    const { app, deps } = buildTestApp();

    await request(app).post('/auth/forgot-password').send({ email: 'user@example.com' });

    const createCall = (deps.passwordResetTokenRepo.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(createCall).toHaveProperty('tokenHash');
    expect(createCall.tokenHash).toHaveLength(64);
  });

  it('7.7 — email falla en envío: responde 200 igualmente (fire-and-forget)', async () => {
    const { app } = buildTestApp({
      mailService: {
        send: vi.fn().mockRejectedValue(new Error('SMTP error')),
      },
    });

    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'user@example.com' });

    expect(res.status).toBe(200);
  });
});

// ─── POST /auth/reset-password ────────────────────────────────────────────────

describe('POST /auth/reset-password', () => {
  beforeEach(() => vi.clearAllMocks());

  it('7.8 — token válido: responde 200 con mensaje de confirmación', async () => {
    const { app } = buildTestApp();

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: 'rawtoken123', newPassword: 'NewPassword1!' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();
  });

  it('7.9 — token válido: llama markUsedAndResetUserPassword con userId y hash nuevo', async () => {
    const { app, deps } = buildTestApp();

    await request(app)
      .post('/auth/reset-password')
      .send({ token: 'rawtoken123', newPassword: 'NewPassword1!' });

    expect(deps.passwordResetTokenRepo.markUsedAndResetUserPassword).toHaveBeenCalledOnce();
    expect(deps.passwordResetTokenRepo.markUsedAndResetUserPassword).toHaveBeenCalledWith(
      mockTokenRecord.id,
      mockUser.id,
      '$argon2id$new-hash',
    );
  });

  it('7.10 — token no encontrado en BD: responde 400', async () => {
    const { app } = buildTestApp({
      passwordResetTokenRepo: {
        create: vi.fn(),
        findByTokenHash: vi.fn().mockResolvedValue(null),
        markUsedAndResetUserPassword: vi.fn(),
      },
    });

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: 'badtoken', newPassword: 'NewPassword1!' });

    expect(res.status).toBe(400);
  });

  it('7.11 — token expirado: responde 400', async () => {
    const { app } = buildTestApp({
      passwordResetTokenRepo: {
        create: vi.fn(),
        findByTokenHash: vi.fn().mockResolvedValue({ ...mockTokenRecord, expiresAt: PAST }),
        markUsedAndResetUserPassword: vi.fn(),
      },
    });

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: 'expiredtoken', newPassword: 'NewPassword1!' });

    expect(res.status).toBe(400);
  });

  it('7.12 — token ya usado: responde 400', async () => {
    const { app } = buildTestApp({
      passwordResetTokenRepo: {
        create: vi.fn(),
        findByTokenHash: vi.fn().mockResolvedValue({ ...mockTokenRecord, used: true }),
        markUsedAndResetUserPassword: vi.fn(),
      },
    });

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: 'usedtoken', newPassword: 'NewPassword1!' });

    expect(res.status).toBe(400);
  });

  it('7.13 — token válido pero usuario no existe: responde 400', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: 'validtoken', newPassword: 'NewPassword1!' });

    expect(res.status).toBe(400);
  });

  it('7.14 — body inválido: sin token responde 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ newPassword: 'NewPassword1!' });
    expect(res.status).toBe(400);
  });

  it('7.15 — body inválido: newPassword demasiado corta responde 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: 'sometoken', newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  it('7.16 — body inválido: newPassword demasiado larga (>128) responde 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: 'sometoken', newPassword: 'a'.repeat(129) });
    expect(res.status).toBe(400);
  });

  it('7.17 — reset exitoso envía email de confirmación (fire-and-forget)', async () => {
    const { app, deps } = buildTestApp();

    await request(app)
      .post('/auth/reset-password')
      .send({ token: 'validtoken', newPassword: 'NewPassword1!' });

    expect(deps.mailService.send).toHaveBeenCalledOnce();
    const sendCall = (deps.mailService.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sendCall).toMatchObject({
      to: mockUser.email,
      templateId: 'TPL-008',
      variables: { recipientEmail: mockUser.email, firstName: 'Test' },
    });
  });
});
