import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAuthRouter } from '../src/interfaces/http/routes/auth.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { emitEvent } from '../src/application/services/analytics.service';

vi.mock('../src/application/services/analytics.service', () => ({
  emitEvent: vi.fn(),
}));

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$...',
  postalCode: '28001',
  reputationScore: 42,
  totalReceived: 3,
  totalDonated: 5,
  consecutiveNoShows: 0,
  cyclesAtLimit: 0,
  lastCycleIncrementedAt: null,
  jwtVersion: 2,
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

function buildTestApp(depOverrides: Partial<Parameters<typeof createAuthRouter>[0]> = {}) {
  const app = express();
  app.use(express.json());

  const defaultDeps = {
    userRepo: {
      findByEmail: vi.fn().mockResolvedValue(mockUser),
      create: vi.fn(),
    },
    hashService: {
      hash: vi.fn(),
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
    mailService: { send: vi.fn() },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/auth', createAuthRouter(deps));
  app.use(errorHandler);
  return { app, deps };
}

const validLoginBody = {
  email: 'test@example.com',
  password: 'password123',
  recaptchaToken: 'valid-token',
};

beforeEach(() => {
  vi.mocked(emitEvent).mockClear();
});

describe('POST /auth/login', () => {
  it('6.1 — login exitoso responde 200 con token y user { id, email, firstName, lastName, reputationScore }', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post('/auth/login').send(validLoginBody);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token', 'mock-jwt-token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toMatchObject({
      id: mockUser.id,
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      reputationScore: 42,
    });
    expect(res.body.user).not.toHaveProperty('postalCode');
    expect(res.body.user).not.toHaveProperty('location');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('totalReceived');
    expect(res.body.user).not.toHaveProperty('totalDonated');
    expect(res.body.user).not.toHaveProperty('isActive');
    expect(res.body.user).not.toHaveProperty('emailVerified');
  });

  it('6.2 — contraseña incorrecta responde 401', async () => {
    const { app } = buildTestApp({
      hashService: {
        hash: vi.fn(),
        verify: vi.fn().mockResolvedValue(false),
      },
    });

    const res = await request(app).post('/auth/login').send(validLoginBody);
    expect(res.status).toBe(401);
  });

  it('6.3 — email no registrado responde 401', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });

    const res = await request(app).post('/auth/login').send(validLoginBody);
    expect(res.status).toBe(401);
  });

  it('6.3b — respuesta 401 idéntica para email inexistente y contraseña incorrecta (anti-enumeración)', async () => {
    const mockVerify = vi.fn().mockResolvedValue(false);
    const { app: appNoUser } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      hashService: {
        hash: vi.fn(),
        verify: mockVerify,
      },
    });
    const { app: appWrongPwd } = buildTestApp({
      hashService: {
        hash: vi.fn(),
        verify: vi.fn().mockResolvedValue(false),
      },
    });

    const res1 = await request(appNoUser).post('/auth/login').send(validLoginBody);
    const res2 = await request(appWrongPwd).post('/auth/login').send(validLoginBody);

    expect(res1.status).toBe(401);
    expect(res2.status).toBe(401);
    expect(res1.body.message).toBe(res2.body.message);
    // Verifica que el dummy hash se llama para igualar el timing
    expect(mockVerify).toHaveBeenCalledOnce();
  });

  it('6.10 — reCAPTCHA sin campo score responde 422', async () => {
    const { app } = buildTestApp({
      recaptchaService: {
        verify: vi.fn().mockResolvedValue({ success: true }),
      },
    });

    const res = await request(app).post('/auth/login').send(validLoginBody);
    expect(res.status).toBe(422);
  });

  it('6.11 — usuario sin passwordHash responde 401', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn().mockResolvedValue({ ...mockUser, passwordHash: null }),
        create: vi.fn(),
      },
    });

    const res = await request(app).post('/auth/login').send(validLoginBody);
    expect(res.status).toBe(401);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('6.4 — reCAPTCHA score < 0.5 responde 422', async () => {
    const { app } = buildTestApp({
      recaptchaService: {
        verify: vi.fn().mockResolvedValue({ success: true, score: 0.3 }),
      },
    });

    const res = await request(app).post('/auth/login').send(validLoginBody);
    expect(res.status).toBe(422);
  });

  it('6.5 — reCAPTCHA success=false responde 422', async () => {
    const { app } = buildTestApp({
      recaptchaService: {
        verify: vi.fn().mockResolvedValue({ success: false, score: 0.0 }),
      },
    });

    const res = await request(app).post('/auth/login').send(validLoginBody);
    expect(res.status).toBe(422);
  });

  it('6.6 — payload inválido: email malformado responde 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/auth/login')
      .send({ ...validLoginBody, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('6.7 — payload inválido: password corta responde 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/auth/login')
      .send({ ...validLoginBody, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('6.8 — el JWT generado incluye jwtVersion del usuario de BD', async () => {
    const mockSign = vi.fn().mockReturnValue('mock-jwt-token');
    const { app } = buildTestApp({
      jwtService: {
        sign: mockSign,
        verify: vi.fn(),
      },
    });

    await request(app).post('/auth/login').send(validLoginBody);

    expect(mockSign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: mockUser.id,
        jwtVersion: mockUser.jwtVersion,
      }),
    );
  });

  it('6.9 — email se normaliza a lowercase antes de buscar en BD', async () => {
    const mockFindByEmail = vi.fn().mockResolvedValue(mockUser);
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: mockFindByEmail,
        create: vi.fn(),
      },
    });

    await request(app)
      .post('/auth/login')
      .send({ ...validLoginBody, email: 'TEST@EXAMPLE.COM' });

    expect(mockFindByEmail).toHaveBeenCalledWith('test@example.com');
  });

  it('6.12 — login exitoso emite AE-002 user.login con properties vacías', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post('/auth/login').send(validLoginBody);

    expect(res.status).toBe(200);
    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect(emitEvent).toHaveBeenCalledWith('user.login', mockUser.id, {});

    const props = vi.mocked(emitEvent).mock.calls[0][2];
    expect(props).not.toHaveProperty('email');
    expect(props).not.toHaveProperty('reputationScore');
  });

  it('6.13 — contraseña incorrecta 401: emitEvent no llamado', async () => {
    const { app } = buildTestApp({
      hashService: {
        hash: vi.fn(),
        verify: vi.fn().mockResolvedValue(false),
      },
    });

    const res = await request(app).post('/auth/login').send(validLoginBody);
    expect(res.status).toBe(401);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('6.14 — email no registrado 401: emitEvent no llamado', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });

    const res = await request(app).post('/auth/login').send(validLoginBody);
    expect(res.status).toBe(401);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('6.15 — reCAPTCHA 422: emitEvent no llamado', async () => {
    const { app } = buildTestApp({
      recaptchaService: {
        verify: vi.fn().mockResolvedValue({ success: true, score: 0.3 }),
      },
    });

    const res = await request(app).post('/auth/login').send(validLoginBody);
    expect(res.status).toBe(422);
    expect(emitEvent).not.toHaveBeenCalled();
  });
});
