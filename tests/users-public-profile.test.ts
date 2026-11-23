import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUserRouter } from '../src/interfaces/http/routes/users.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const USER_UUID = '550e8400-e29b-41d4-a716-446655440000';
const TARGET_UUID = '660e8400-e29b-41d4-a716-446655440001';

const mockAuthUser = {
  id: USER_UUID,
  email: 'auth@example.com',
  passwordHash: '$argon2id$...',
  postalCode: '28001',
  reputationScore: 10,
  totalReceived: 1,
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
  phone: null,
  emailVerified: true,
  verificationTokenHash: null,
  verificationTokenExpiresAt: null,
  verificationResendAt: null,
  isActive: true,
  preferredLanguage: 'es',
};

const mockPublicUser = {
  id: TARGET_UUID,
  email: 'target@example.com',
  passwordHash: '$argon2id$...',
  postalCode: '28002',
  reputationScore: 25,
  totalReceived: 3,
  totalDonated: 2,
  consecutiveNoShows: 0,
  cyclesAtLimit: 0,
  lastCycleIncrementedAt: null,
  jwtVersion: 1,
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  lastActiveAt: null,
  firstName: 'Carlos',
  lastName: 'López',
  avatarUrl: 'https://example.com/avatar.webp',
  phone: '+34600999888',
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
      findById: vi.fn().mockImplementation((id: string) =>
        id === USER_UUID ? Promise.resolve(mockAuthUser) : Promise.resolve(mockPublicUser),
      ),
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

describe('GET /users/:id', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('26.1 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/users/${TARGET_UUID}`);
    expect(res.status).toBe(401);
  });

  it('26.2 — UUID válido, usuario existe → 200 con perfil público', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get(`/users/${TARGET_UUID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: TARGET_UUID,
      firstName: 'Carlos',
      lastName: 'López',
      avatarUrl: 'https://example.com/avatar.webp',
      reputationScore: 25,
      totalReceived: 3,
      totalDonated: 2,
    });
    expect(res.body.createdAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('26.3 — response no expone campos privados', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get(`/users/${TARGET_UUID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('email');
    expect(res.body).not.toHaveProperty('phone');
    expect(res.body).not.toHaveProperty('emailVerified');
    expect(res.body).not.toHaveProperty('preferredLanguage');
    expect(res.body).not.toHaveProperty('consecutiveNoShows');
    expect(res.body).not.toHaveProperty('postalCode');
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('jwtVersion');
    expect(res.body).not.toHaveProperty('isActive');
    expect(res.body).not.toHaveProperty('location');
  });

  it('26.4 — reputationScore negativo se retorna sin truncar', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockImplementation((id: string) =>
          id === USER_UUID
            ? Promise.resolve(mockAuthUser)
            : Promise.resolve({ ...mockPublicUser, reputationScore: -5 }),
        ),
        create: vi.fn(),
        findReputationHistory: vi.fn().mockResolvedValue([]),
        findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
        findMyItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        findMyRequests: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
      },
    });
    const res = await request(app)
      .get(`/users/${TARGET_UUID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.reputationScore).toBe(-5);
  });

  it('26.5 — UUID válido, usuario no existe → 404', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockImplementation((id: string) =>
          id === USER_UUID ? Promise.resolve(mockAuthUser) : Promise.resolve(null),
        ),
        create: vi.fn(),
        findReputationHistory: vi.fn().mockResolvedValue([]),
        findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
        findMyItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        findMyRequests: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
      },
    });
    const res = await request(app)
      .get(`/users/${TARGET_UUID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(404);
  });

  it('26.6 — parámetro no es UUID v4 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/not-a-uuid')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });
});
