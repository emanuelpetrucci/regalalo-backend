import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUserRouter } from '../src/interfaces/http/routes/users.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { UserDeliverySessionRecord } from '../src/domain/repositories/user.repository';

const USER_UUID    = '550e8400-e29b-41d4-a716-446655440000';
const ITEM_UUID    = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';
const SESSION_UUID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

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

const OTHER_USER_UUID = '660e8400-e29b-41d4-a716-446655440001';

const mockSessionAsDonor: UserDeliverySessionRecord = {
  id: SESSION_UUID,
  itemId: ITEM_UUID,
  itemTitle: 'Mesa de madera',
  role: 'donor',
  status: 'active',
  deadlineAt: new Date('2026-05-25T00:00:00.000Z'),
  createdAt: new Date('2026-05-18T10:00:00.000Z'),
  completedAt: null,
  otherPartyUserId: OTHER_USER_UUID,
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
      findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [mockSessionAsDonor], total: 1 }),
      findMyItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findMyRequests: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/users', createUserRouter(deps));
  app.use(errorHandler);
  return { app, userRepo: deps.userRepo };
}

describe('GET /users/me/delivery-sessions', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('23.1 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/users/me/delivery-sessions');
    expect(res.status).toBe(401);
  });

  it('23.2 — sin filtros → 200 con sessions y pagination', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/delivery-sessions')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sessions');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0]).toMatchObject({
      id: SESSION_UUID,
      otherPartyUserId: OTHER_USER_UUID,
    });
    expect(res.body.pagination).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
  });

  it('23.3 — role=donor → llama findMyDeliverySessions con role donor', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .get('/users/me/delivery-sessions?role=donor')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(userRepo.findMyDeliverySessions).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'donor' }),
    );
  });

  it('23.4 — role=receiver → llama findMyDeliverySessions con role receiver', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .get('/users/me/delivery-sessions?role=receiver')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(userRepo.findMyDeliverySessions).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'receiver' }),
    );
  });

  it('23.5 — status=active → llama findMyDeliverySessions con status active', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .get('/users/me/delivery-sessions?status=active')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(userRepo.findMyDeliverySessions).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('23.6 — limit=51 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/delivery-sessions?limit=51')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });
});
