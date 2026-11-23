import { createHash } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAuthRouter } from '../src/interfaces/http/routes/auth.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60_000);

const RAW_TOKEN = 'a'.repeat(64);
const TOKEN_HASH = createHash('sha256').update(RAW_TOKEN).digest('hex');

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
  verificationTokenHash: TOKEN_HASH,
  verificationTokenExpiresAt: FUTURE,
  verificationResendAt: new Date(),
  isActive: true,
  preferredLanguage: 'es',
};

function buildTestApp(depOverrides: Partial<Parameters<typeof createAuthRouter>[0]> = {}) {
  const app = express();
  app.use(express.json());

  const findByVerificationTokenHash = vi.fn().mockResolvedValue(mockUser);
  const markEmailVerified = vi.fn().mockResolvedValue(undefined);

  const defaultDeps = {
    userRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      findByVerificationTokenHash,
      markEmailVerified,
    },
    passwordResetTokenRepo: {
      create: vi.fn(),
      findByTokenHash: vi.fn(),
      deleteActiveByUserId: vi.fn(),
      markUsedAndResetUserPassword: vi.fn(),
    },
    hashService: {
      hash: vi.fn(),
      verify: vi.fn(),
    },
    jwtService: {
      sign: vi.fn(),
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

describe('GET /auth/verify-email', () => {
  beforeEach(() => vi.clearAllMocks());

  it('8.4.1 — token válido: responde 200 con mensaje exacto', async () => {
    const { app } = buildTestApp();

    const res = await request(app).get('/auth/verify-email').query({ token: RAW_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Email verificado correctamente');
  });

  it('8.4.2 — token válido: llama markEmailVerified con userId', async () => {
    const { app, deps } = buildTestApp();

    await request(app).get('/auth/verify-email').query({ token: RAW_TOKEN });

    expect(deps.userRepo.markEmailVerified).toHaveBeenCalledOnce();
    expect(deps.userRepo.markEmailVerified).toHaveBeenCalledWith(mockUser.id);
  });

  it('8.4.3 — token válido: hashea SHA-256 antes de findByVerificationTokenHash', async () => {
    const { app, deps } = buildTestApp();

    await request(app).get('/auth/verify-email').query({ token: RAW_TOKEN });

    expect(deps.userRepo.findByVerificationTokenHash).toHaveBeenCalledOnce();
    expect(deps.userRepo.findByVerificationTokenHash).toHaveBeenCalledWith(TOKEN_HASH);
  });

  it('8.4.4 — token no encontrado: responde 400', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn(),
        create: vi.fn(),
        findByVerificationTokenHash: vi.fn().mockResolvedValue(null),
        markEmailVerified: vi.fn(),
      },
    });

    const res = await request(app).get('/auth/verify-email').query({ token: 'unknown' });

    expect(res.status).toBe(400);
  });

  it('8.4.5 — token expirado: responde 400', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn(),
        create: vi.fn(),
        findByVerificationTokenHash: vi.fn().mockResolvedValue({
          ...mockUser,
          verificationTokenExpiresAt: PAST,
        }),
        markEmailVerified: vi.fn(),
      },
    });

    const res = await request(app).get('/auth/verify-email').query({ token: RAW_TOKEN });

    expect(res.status).toBe(400);
  });

  it('8.4.6 — query sin token: responde 400', async () => {
    const { app } = buildTestApp();

    const res = await request(app).get('/auth/verify-email');

    expect(res.status).toBe(400);
  });

  it('8.4.7 — sin Authorization: endpoint público responde 200', async () => {
    const { app } = buildTestApp();

    const res = await request(app)
      .get('/auth/verify-email')
      .query({ token: RAW_TOKEN })
      .unset('Authorization');

    expect(res.status).toBe(200);
  });

  it('8.4.9 — usuario ya verificado (findByVerificationTokenHash retorna null): responde 400', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn(),
        create: vi.fn(),
        findByVerificationTokenHash: vi.fn().mockResolvedValue(null),
        markEmailVerified: vi.fn(),
      },
    });

    const res = await request(app).get('/auth/verify-email').query({ token: RAW_TOKEN });

    expect(res.status).toBe(400);
  });

  it('8.4.8 — token expirado: no llama markEmailVerified', async () => {
    const { app, deps } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn(),
        create: vi.fn(),
        findByVerificationTokenHash: vi.fn().mockResolvedValue({
          ...mockUser,
          verificationTokenExpiresAt: PAST,
        }),
        markEmailVerified: vi.fn(),
      },
    });

    await request(app).get('/auth/verify-email').query({ token: RAW_TOKEN });

    expect(deps.userRepo.markEmailVerified).not.toHaveBeenCalled();
  });
});
