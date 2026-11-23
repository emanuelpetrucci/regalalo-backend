import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUserRouter } from '../src/interfaces/http/routes/users.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { UserItemRecord } from '../src/domain/repositories/user.repository';

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

const mockActiveItem: UserItemRecord = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  slug: 'mesa-de-madera',
  title: 'Mesa de madera',
  category: 'furniture',
  condition: 'good',
  status: 'active',
  degradedAt: null,
  imagePaths: ['items/abc/photo1.webp'],
  createdAt: new Date('2026-05-01T10:00:00.000Z'),
  completedAt: null,
  requestsPaused: false,
  requestCount: 3,
};

const mockPurgedItem: UserItemRecord = {
  id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
  slug: 'silla-vieja',
  title: 'Silla vieja',
  category: 'furniture',
  condition: 'fair',
  status: 'completed',
  degradedAt: null,
  imagePaths: [],
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  completedAt: new Date('2026-01-15T10:00:00.000Z'),
  requestsPaused: false,
  requestCount: 0,
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
      findMyItems: vi.fn().mockResolvedValue({ items: [mockActiveItem], total: 1 }),
      findMyRequests: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/users', createUserRouter(deps));
  app.use(errorHandler);
  return { app, userRepo: deps.userRepo };
}

describe('GET /users/me/items', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('24.1 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/users/me/items');
    expect(res.status).toBe(401);
  });

  it('24.2 — sin filtros → 200 con items y pagination', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/items')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].category).toBe('furniture');
    expect(res.body.items[0].slug).toBe('mesa-de-madera');
    expect(res.body.items[0].requestCount).toBe(3);
    expect(res.body.pagination).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
  });

  it('24.3 — status=active → llama findMyItems con status active', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .get('/users/me/items?status=active')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(userRepo.findMyItems).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('24.4 — objeto purgado → images retorna []', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockResolvedValue(mockUser),
        create: vi.fn(),
        findReputationHistory: vi.fn().mockResolvedValue([]),
        findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
        findMyItems: vi.fn().mockResolvedValue({ items: [mockPurgedItem], total: 1 }),
        findMyRequests: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
      },
    });
    const res = await request(app)
      .get('/users/me/items')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.items[0].images).toEqual([]);
  });

  it('24.5 — limit=51 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/items?limit=51')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });

  it('24.6 — page=0 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/items?page=0')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });

  it('24.7 — limit=0 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/items?limit=0')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });
});
