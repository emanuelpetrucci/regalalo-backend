import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUserRouter } from '../src/interfaces/http/routes/users.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { ReputationEventRecord } from '../src/domain/repositories/user.repository';

const USER_UUID    = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const mockUser = {
  id: USER_UUID,
  email: 'user@example.com',
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

const mockEvent: ReputationEventRecord = {
  id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
  type: 'delivery_completed',
  delta: 10,
  sessionId: SESSION_UUID,
  createdAt: new Date('2026-05-01T10:00:00.000Z'),
  role: 'donor',
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
      findReputationHistory: vi.fn().mockResolvedValue([mockEvent]),
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

describe('GET /users/me/reputation-history', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('22.1 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/users/me/reputation-history');
    expect(res.status).toBe(401);
  });

  it('22.2 — hay eventos → 200 con lista de eventos', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/reputation-history')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('events');
    expect(res.body.events).toHaveLength(1);
  });

  it('22.3 — sin eventos → 200 con events vacío', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockResolvedValue(mockUser),
        create: vi.fn(),
        findReputationHistory: vi.fn().mockResolvedValue([]),
        findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
        findMyItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        findMyRequests: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
      },
    });
    const res = await request(app)
      .get('/users/me/reputation-history')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
  });

  it('22.4 — el evento retorna todos los campos correctos', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/reputation-history')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    const event = res.body.events[0];
    expect(event).toHaveProperty('id', 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff');
    expect(event).toHaveProperty('type', 'delivery_completed');
    expect(event).toHaveProperty('delta', 10);
    expect(event).toHaveProperty('sessionId', SESSION_UUID);
    expect(event).toHaveProperty('createdAt');
  });
});
