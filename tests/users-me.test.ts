import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUserRouter } from '../src/interfaces/http/routes/users.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const USER_UUID = '550e8400-e29b-41d4-a716-446655440000';

const mockUser = {
  id: USER_UUID,
  email: 'user@example.com',
  passwordHash: '$argon2id$...',
  postalCode: '28001',
  reputationScore: 42,
  totalReceived: 3,
  totalDonated: 1,
  consecutiveNoShows: 0,
  cyclesAtLimit: 0,
  lastCycleIncrementedAt: null,
  jwtVersion: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  lastActiveAt: null,
  firstName: 'Test',
  lastName: 'User',
  avatarUrl: null,
  phone: '+34600111222',
  emailVerified: true,
  verificationTokenHash: null,
  verificationTokenExpiresAt: null,
  verificationResendAt: null,
  isActive: true,
  preferredLanguage: 'es',
};

function buildTestApp(depOverrides: Partial<Parameters<typeof createUserRouter>[0]> = {}) {
  const app = express();
  app.use(express.json());

  const defaultDeps = {
    jwtService: {
      sign: vi.fn(),
      verify: vi.fn().mockReturnValue({ sub: USER_UUID, jwtVersion: 1 }),
    },
    userRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn().mockResolvedValue(mockUser),
      create: vi.fn(),
      findReputationHistory: vi.fn().mockResolvedValue([]),
      findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
      findMyItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findMyRequests: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/users', createUserRouter(deps));
  app.use(errorHandler);
  return { app, userRepo: deps.userRepo };
}

describe('GET /users/me', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('21.1 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/users/me');
    expect(res.status).toBe(401);
  });

  it('21.2 — auth válida → 200 con contrato v1.3 del perfil privado', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: USER_UUID,
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
      avatarUrl: null,
      phone: '+34600111222',
      postalCode: '28001',
      preferredLanguage: 'es',
      emailVerified: true,
      reputationScore: 42,
      totalReceived: 3,
      totalDonated: 1,
      consecutiveNoShows: 0,
    });
    expect(res.body.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('21.3 — la respuesta no expone campos internos ni location', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('location');
    expect(res.body).not.toHaveProperty('jwtVersion');
    expect(res.body).not.toHaveProperty('cyclesAtLimit');
    expect(res.body).not.toHaveProperty('lastCycleIncrementedAt');
    expect(res.body).not.toHaveProperty('lastActiveAt');
    expect(res.body).not.toHaveProperty('isActive');
    expect(res.body).not.toHaveProperty('is_active');
    expect(res.body).toHaveProperty('emailVerified');
  });

  it('21.5 — usuario eliminado entre auth y use case → 401', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn()
          .mockResolvedValueOnce(mockUser)
          .mockResolvedValueOnce(null),
        create: vi.fn(),
        findReputationHistory: vi.fn().mockResolvedValue([]),
        findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
        findMyItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        findMyRequests: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
      },
    });
    const res = await request(app)
      .get('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(401);
  });

  it('21.4 — reputationScore negativo → retornado sin truncar', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockResolvedValue({ ...mockUser, reputationScore: -60 }),
        create: vi.fn(),
        findReputationHistory: vi.fn().mockResolvedValue([]),
        findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
        findMyItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        findMyRequests: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
      },
    });
    const res = await request(app)
      .get('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.reputationScore).toBe(-60);
  });
});
