import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import {
  createAuthMiddleware,
  AuthMiddlewareOptions,
} from '../src/interfaces/http/middlewares/auth.middleware';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

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
  emailVerified: true,
  verificationTokenHash: null,
  verificationTokenExpiresAt: null,
  verificationResendAt: null,
  isActive: true,
  preferredLanguage: 'es',
};

function buildTestApp(
  depOverrides: Record<string, unknown> = {},
  middlewareOptions: AuthMiddlewareOptions = {},
) {
  const defaultDeps = {
    jwtService: {
      sign: vi.fn(),
      verify: vi.fn().mockReturnValue({ sub: mockUser.id, jwtVersion: mockUser.jwtVersion }),
    },
    userRepo: {
      findById: vi.fn().mockResolvedValue(mockUser),
      findByEmail: vi.fn(),
      create: vi.fn(),
    },
  };
  const deps = { ...defaultDeps, ...depOverrides };

  const middleware = createAuthMiddleware(
    deps.jwtService as Parameters<typeof createAuthMiddleware>[0],
    deps.userRepo as Parameters<typeof createAuthMiddleware>[1],
    middlewareOptions,
  );

  const app = express();
  app.use(express.json());
  app.get('/protected', middleware, (req, res) => {
    res.json({ userId: req.currentUser?.id });
  });
  app.use(errorHandler);
  return { app, deps };
}

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('5.1 — token válido con jwtVersion coincidente retorna 200 con currentUser', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid.jwt.token');

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(mockUser.id);
  });

  it('5.2 — sin header Authorization retorna 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/protected');

    expect(res.status).toBe(401);
  });

  it('5.3 — header Authorization con formato incorrecto (sin Bearer) retorna 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Token xxx');

    expect(res.status).toBe(401);
  });

  it('5.4 — jwtService.verify lanza (firma inválida) retorna 401', async () => {
    const { app } = buildTestApp({
      jwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockImplementation(() => {
          throw new Error('invalid signature');
        }),
      },
    });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid.token');

    expect(res.status).toBe(401);
  });

  it('5.5 — jwtService.verify lanza TokenExpiredError retorna 401', async () => {
    const { app } = buildTestApp({
      jwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockImplementation(() => {
          const err = new Error('jwt expired');
          err.name = 'TokenExpiredError';
          throw err;
        }),
      },
    });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer expired.token');

    expect(res.status).toBe(401);
  });

  it('5.6 — token válido pero usuario no encontrado en BD retorna 401', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findById: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn(),
        create: vi.fn(),
      },
    });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid.jwt.token');

    expect(res.status).toBe(401);
  });

  it('5.7 — jwtVersion del token difiere del usuario en BD retorna 401', async () => {
    const { app } = buildTestApp({
      jwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockReturnValue({ sub: mockUser.id, jwtVersion: 1 }),
      },
    });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer some.valid.token');

    expect(res.status).toBe(401);
  });

  it('5.8 — inyecta el objeto User completo en req.currentUser sin passwordHash', async () => {
    const middleware = createAuthMiddleware(
      {
        sign: vi.fn(),
        verify: vi.fn().mockReturnValue({ sub: mockUser.id, jwtVersion: mockUser.jwtVersion }),
      },
      { findById: vi.fn().mockResolvedValue(mockUser), findByEmail: vi.fn(), create: vi.fn() },
    );
    const fullApp = express();
    fullApp.use(express.json());
    fullApp.get('/full', middleware, (req, res) => {
      res.json(req.currentUser);
    });
    fullApp.use(errorHandler);

    const res = await request(fullApp).get('/full').set('Authorization', 'Bearer valid.jwt.token');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(mockUser.id);
    expect(res.body.email).toBe(mockUser.email);
    expect(res.body.jwtVersion).toBe(mockUser.jwtVersion);
    expect(res.body.postalCode).toBe(mockUser.postalCode);
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('isActive');
  });

  it('5.9 — payload sin claim sub retorna 401', async () => {
    const { app } = buildTestApp({
      jwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockReturnValue({ jwtVersion: mockUser.jwtVersion }),
      },
    });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer token.without.sub');

    expect(res.status).toBe(401);
  });

  it('5.10 — payload con jwtVersion no numérico retorna 401', async () => {
    const { app } = buildTestApp({
      jwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockReturnValue({ sub: mockUser.id, jwtVersion: 'dos' }),
      },
    });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer token.with.string.version');

    expect(res.status).toBe(401);
  });

  it('5.11 — usuario con isActive=false y JWT válido retorna 401', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findById: vi.fn().mockResolvedValue({ ...mockUser, isActive: false }),
        findByEmail: vi.fn(),
        create: vi.fn(),
      },
    });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid.jwt.token');

    expect(res.status).toBe(401);
  });

  it('5.12 — emailVerified=false en ruta protegida estándar → 403', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findById: vi.fn().mockResolvedValue({ ...mockUser, emailVerified: false }),
        findByEmail: vi.fn(),
        create: vi.fn(),
      },
    });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid.jwt.token');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(res.body.message).toBe('Email not verified');
  });

  it('5.13 — emailVerified=false con skipEmailVerification → 200', async () => {
    const { app } = buildTestApp(
      {
        userRepo: {
          findById: vi.fn().mockResolvedValue({ ...mockUser, emailVerified: false }),
          findByEmail: vi.fn(),
          create: vi.fn(),
        },
      },
      { skipEmailVerification: true },
    );
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid.jwt.token');

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(mockUser.id);
  });

  it('5.14 — isActive=false sigue retornando 401 (email check no alcanzado)', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findById: vi.fn().mockResolvedValue({
          ...mockUser,
          isActive: false,
          emailVerified: false,
        }),
        findByEmail: vi.fn(),
        create: vi.fn(),
      },
    });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid.jwt.token');

    expect(res.status).toBe(401);
  });
});
