import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUserRouter } from '../src/interfaces/http/routes/users.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { UserRequestRecord } from '../src/domain/repositories/user.repository';

const USER_UUID = '550e8400-e29b-41d4-a716-446655440000';

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

const mockRequest: UserRequestRecord = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  itemId: 'cccccccc-dddd-4eee-8fff-000000000000',
  itemTitle: 'Mesa de madera',
  itemStatus: 'active',
  status: 'pending',
  imagePaths: ['items/mesa.jpg'],
  createdAt: new Date('2026-05-01T10:00:00.000Z'),
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
      findMyRequests: vi.fn().mockResolvedValue({ requests: [mockRequest], total: 1 }),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/users', createUserRouter(deps));
  app.use(errorHandler);
  return { app, userRepo: deps.userRepo };
}

describe('GET /users/me/requests', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('25.1 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/users/me/requests');
    expect(res.status).toBe(401);
  });

  it('25.2 — sin filtros → 200 con requests y pagination', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/requests')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('requests');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0]).toMatchObject({
      id: mockRequest.id,
      itemId: mockRequest.itemId,
      itemTitle: mockRequest.itemTitle,
      itemStatus: mockRequest.itemStatus,
      status: mockRequest.status,
    });
    expect(res.body.requests[0]).toHaveProperty('createdAt');
    expect(res.body.pagination).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
  });

  it('25.3 — status=pending → llama findMyRequests con status pending', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .get('/users/me/requests?status=pending')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(userRepo.findMyRequests).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
    );
  });

  it('25.4 — status=selected → llama findMyRequests con status selected', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .get('/users/me/requests?status=selected')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(userRepo.findMyRequests).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'selected' }),
    );
  });

  it('25.5 — limit=51 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/requests?limit=51')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });

  it('25.6 — page=0 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/requests?page=0')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });

  it('25.7 — status inválido → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/requests?status=invalid')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });
});
