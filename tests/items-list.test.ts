import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createItemRouter } from '../src/interfaces/http/routes/items.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'donor@example.com',
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
  emailVerified: true,
  verificationTokenHash: null,
  verificationTokenExpiresAt: null,
  verificationResendAt: null,
  isActive: true,
  preferredLanguage: 'es',
};

const defaultPaginatedResult = {
  items: [
    {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      slug: 'silla-de-madera',
      title: 'Silla de madera',
      condition: 'good' as const,
      category: 'furniture' as const,
      degradedAt: null,
      createdAt: new Date('2026-05-01T10:00:00Z'),
      distanceMeters: 5000,
      imagePaths: ['items/abc123/photo.jpg'],
    },
  ],
  total: 1,
};

function buildTestApp(
  depOverrides: Partial<Parameters<typeof createItemRouter>[0]> = {},
) {
  const app = express();

  const defaultDeps = {
    jwtService: {
      sign: vi.fn(),
      verify: vi.fn().mockReturnValue({ sub: mockUser.id, jwtVersion: 1 }),
    },
    userRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn().mockResolvedValue(mockUser),
      create: vi.fn(),
    },
    itemRepo: {
      createWithImages: vi.fn(),
      findActiveInRadius: vi.fn().mockResolvedValue(defaultPaginatedResult),
      findById: vi.fn(),
      findItemOwnership: vi.fn(),
      hasActiveDeliverySession: vi.fn(),
      cancelItem: vi.fn(),
      setPauseStatus: vi.fn(),
      findNewlyDegradedItems: vi.fn(),
    },
    storageService: {
      upload: vi.fn().mockResolvedValue(undefined),
    },
    geocodingService: {
      geocode: vi.fn().mockResolvedValue({ lat: 40.4168, lon: -3.7038 }),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/items', createItemRouter(deps));
  app.use(errorHandler);
  return { app, deps };
}

describe('GET /items', () => {
  beforeEach(() => vi.clearAllMocks());

  it('9.1 — authenticated GET /items: responds 200 with items and pagination', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/items')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      items: [
        {
          id: expect.any(String),
          slug: 'silla-de-madera',
          title: 'Silla de madera',
          condition: 'good',
          category: 'furniture',
          degradedAt: null,
          distanceMeters: 5000,
          images: [
            'https://test.supabase.co/storage/v1/object/public/test-bucket/items/abc123/photo.jpg',
          ],
        },
      ],
      pagination: {
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    });
    expect(res.body.items[0]).not.toHaveProperty('location');
  });

  it('9.1b — GET /items serializes degradedAt when item is degraded', async () => {
    const degradedAt = new Date('2026-04-01T10:00:00.000Z');
    const { app, deps } = buildTestApp();
    (deps.itemRepo.findActiveInRadius as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        {
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          title: 'Silla vieja',
          condition: 'fair' as const,
          category: 'other' as const,
          degradedAt,
          createdAt: new Date('2026-05-01T10:00:00Z'),
          distanceMeters: 1200,
          imagePaths: [],
        },
      ],
      total: 1,
    });

    const res = await request(app)
      .get('/items')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.items[0].degradedAt).toBe(degradedAt.toISOString());
  });

  it('9.2 — no auth token: responds 200 (guest mode, distanceMeters null)', async () => {
    const { app, deps } = buildTestApp();
    (deps.itemRepo.findActiveInRadius as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [{ ...defaultPaginatedResult.items[0], distanceMeters: null }],
      total: 1,
    });
    const res = await request(app).get('/items');

    expect(res.status).toBe(200);
    expect(res.body.items[0].distanceMeters).toBeNull();
  });

  it('9.3 — GET /items?page=2&limit=10: responds 200 with correct pagination params', async () => {
    const { app, deps } = buildTestApp();
    (deps.itemRepo.findActiveInRadius as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      total: 25,
    });

    const res = await request(app)
      .get('/items?page=2&limit=10')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({
      page: 2,
      limit: 10,
    });
    expect(deps.itemRepo.findActiveInRadius).toHaveBeenCalledWith({
      userId: mockUser.id,
      page: 2,
      limit: 10,
    });
  });

  it('9.4 — limit=51: responds 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/items?limit=51')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });

  it('9.5 — limit=0: responds 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/items?limit=0')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });

  it('9.6 — page=0: responds 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/items?page=0')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });

  it('9.7 — no query params: responds 200 with defaults page=1 limit=20', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/items')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 20,
    });
  });

  it('9.8 — findActiveInRadius returns total=0: responds 200 with empty items and totalPages=0', async () => {
    const { app, deps } = buildTestApp();
    (deps.itemRepo.findActiveInRadius as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      total: 0,
    });

    const res = await request(app)
      .get('/items')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      items: [],
      pagination: {
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      },
    });
  });

  it('9.9 — response items do not include field location', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/items')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.items[0]).not.toHaveProperty('location');
  });
});
