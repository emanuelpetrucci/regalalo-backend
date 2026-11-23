/**
 * GET /items/:id/candidates — contrato HTTP (ranking Tier/FR17: ver tests/ranking-qa-tier.test.ts QA-07+)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createItemRouter } from '../src/interfaces/http/routes/items.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const USER_UUID  = '550e8400-e29b-41d4-a716-446655440000';
const DONOR_UUID = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';
const ITEM_UUID  = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const mockCandidate = {
  requestId: 'ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb',
  userId: '11111111-2222-4333-8444-555555555555',
  firstName: 'Ana',
  lastName: 'García',
  reputationScore: 85,
  distanceMeters: 3200,
  requestDate: new Date('2026-05-06T09:00:00.000Z'),
};

const mockUser = {
  id: USER_UUID,
  email: 'user@example.com',
  passwordHash: '$argon2id$...',
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
  emailVerified: true,
  verificationTokenHash: null,
  verificationTokenExpiresAt: null,
  verificationResendAt: null,
  isActive: true,
  preferredLanguage: 'es',
};

const defaultItemRepo = {
  createWithImages: vi.fn(),
  findActiveInRadius: vi.fn(),
  findById: vi.fn(),
  findItemOwnership: vi.fn().mockResolvedValue({
    donorId: USER_UUID,
    status: 'active',
    requestsPaused: false,
  }),
  hasActiveDeliverySession: vi.fn().mockResolvedValue(false),
  cancelItem: vi.fn(),
  setPauseStatus: vi.fn(),
  findNewlyDegradedItems: vi.fn(),
};

const defaultRequestRepo = {
  create: vi.fn(),
  findRankedCandidates: vi.fn().mockResolvedValue([mockCandidate]),
};

function buildTestApp(depOverrides: Partial<Parameters<typeof createItemRouter>[0]> = {}) {
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
    },
    itemRepo: { ...defaultItemRepo, ...depOverrides.itemRepo },
    requestRepo: { ...defaultRequestRepo, ...depOverrides.requestRepo },
    storageService: { upload: vi.fn().mockResolvedValue(undefined) },
    geocodingService: { geocode: vi.fn() },
    mailService: { send: vi.fn().mockResolvedValue(undefined) },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/items', createItemRouter(deps));
  app.use(errorHandler);
  return { app, requestRepo: deps.requestRepo };
}

describe('GET /items/:id/requests', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('14.1 — donante auténtico con candidatos → 200 con { candidates: [...] }', async () => {
    const { app, requestRepo } = buildTestApp();
    const res = await request(app)
      .get(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('candidates');
    expect(Array.isArray(res.body.candidates)).toBe(true);
    expect(res.body.candidates).toHaveLength(1);
    expect(res.body.candidates[0]).toMatchObject({
      requestId: mockCandidate.requestId,
      userId: mockCandidate.userId,
      firstName: 'Ana',
      lastName: 'García',
      reputationScore: 85,
      distanceMeters: 3200,
    });
    expect(res.body.candidates[0]).not.toHaveProperty('location');
    expect(res.body.candidates[0]).not.toHaveProperty('effectiveScore');
    expect(requestRepo.findRankedCandidates).toHaveBeenCalledWith(ITEM_UUID);
  });

  it('14.2 — sin candidatos → 200 con candidates: []', async () => {
    const { app } = buildTestApp({
      requestRepo: {
        findRankedCandidates: vi.fn().mockResolvedValue([]),
      },
    });
    const res = await request(app)
      .get(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ candidates: [] });
  });

  it('14.3 — usuario autenticado pero no es el donante → 403', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue({
          donorId: DONOR_UUID,
          status: 'active',
          requestsPaused: false,
        }),
      },
    });
    const res = await request(app)
      .get(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(403);
  });

  it('14.4 — item no existe → 404', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue(null),
      },
    });
    const res = await request(app)
      .get(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(404);
  });

  it('14.5 — sin token de autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/items/${ITEM_UUID}/requests`);

    expect(res.status).toBe(401);
  });

  it('14.6 — UUID inválido → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/items/not-a-valid-uuid/requests')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });
});

describe('GET /items/:id/requests — rate limit', () => {
  it('14.7 — 11ª petición desde misma IP → 429', async () => {
    const { app } = buildTestApp();

    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .get(`/items/${ITEM_UUID}/requests`)
        .set('Authorization', 'Bearer mock-jwt-token');
      expect(res.status).not.toBe(429);
    }

    const blocked = await request(app)
      .get(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');
    expect(blocked.status).toBe(429);
  });
});
