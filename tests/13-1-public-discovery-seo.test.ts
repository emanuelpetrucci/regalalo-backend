import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createItemRouter } from '../src/interfaces/http/routes/items.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const VALID_ITEM_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const UNKNOWN_ITEM_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
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

const guestItemSummary = {
  id: VALID_ITEM_ID,
  slug: 'silla-de-madera',
  title: 'Silla de madera',
  condition: 'good' as const,
  category: 'furniture' as const,
  degradedAt: null,
  createdAt: new Date('2026-05-01T10:00:00Z'),
  distanceMeters: null,
  imagePaths: ['items/abc123/photo.jpg'],
};

const guestItemDetail = {
  id: VALID_ITEM_ID,
  slug: 'mesa-de-madera',
  title: 'Mesa de madera',
  description: 'Mesa en buen estado',
  condition: 'good' as const,
  category: 'furniture' as const,
  weightRange: '1to5' as const,
  status: 'active' as const,
  requestsPaused: false,
  degradedAt: null,
  createdAt: new Date('2026-05-01T10:00:00Z'),
  completedAt: null,
  distanceMeters: null,
  imagePaths: ['items/abc123/photo.jpg'],
  donor: {
    id: null,
    firstName: 'Anónimo',
    lastName: '',
    avatarUrl: null,
    reputationScore: 15,
  },
};

const authItemDetail = {
  ...guestItemDetail,
  distanceMeters: 3500,
  donor: {
    id: '11111111-2222-4333-8444-555555555555',
    firstName: 'María',
    lastName: 'López',
    avatarUrl: null,
    reputationScore: 15,
  },
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
      findActiveInRadius: vi.fn().mockResolvedValue({ items: [guestItemSummary], total: 1 }),
      findById: vi.fn().mockResolvedValue(guestItemDetail),
      findBySlug: vi.fn(),
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

describe('Story 13.1 — Infraestructura SEO y Endpoints Públicos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('13.1.1 — GET /api/items sin token → 200, distanceMeters null en items', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/items');

    expect(res.status).toBe(200);
    expect(res.body.items[0].distanceMeters).toBeNull();
    expect(res.body.items[0].slug).toBe('silla-de-madera');
    expect(res.body.pagination).toBeDefined();
  });

  it('13.1.2 — GET /api/items/:id sin token → 200, donor.id null, donor.firstName "Anónimo"', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/items/${VALID_ITEM_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.donor.id).toBeNull();
    expect(res.body.donor.firstName).toBe('Anónimo');
    expect(res.body.donor.lastName).toBe('');
    expect(res.body.donor.avatarUrl).toBeNull();
    expect(res.body.donor.reputationScore).toBe(15);
    expect(res.body.distanceMeters).toBeNull();
    expect(res.body.slug).toBe('mesa-de-madera');
  });

  it('13.1.3 — GET /api/items/:id UUID inexistente → 410', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        createWithImages: vi.fn(),
        findActiveInRadius: vi.fn(),
        findById: vi.fn().mockResolvedValue(null),
      },
    });
    const res = await request(app).get(`/items/${UNKNOWN_ITEM_ID}`);

    expect(res.status).toBe(410);
  });

  it('13.1.3b — GET /api/items/:id UUID inexistente con token válido → 410', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        createWithImages: vi.fn(),
        findActiveInRadius: vi.fn(),
        findById: vi.fn().mockResolvedValue(null),
      },
    });
    const res = await request(app)
      .get(`/items/${UNKNOWN_ITEM_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(410);
  });

  it('13.1.3c — GET /api/items/:slug ausente → 410', async () => {
    const findBySlug = vi.fn().mockResolvedValue(null);
    const findById = vi.fn();
    const { app } = buildTestApp({
      itemRepo: {
        createWithImages: vi.fn(),
        findActiveInRadius: vi.fn(),
        findById,
        findBySlug,
      },
    });
    const res = await request(app).get('/items/bicicleta-montana');

    expect(res.status).toBe(410);
    expect(findById).not.toHaveBeenCalled();
    expect(findBySlug).toHaveBeenCalledWith({ slug: 'bicicleta-montana', userId: null });
  });

  it('13.1.3d — GET /api/items/No_Slug → 400', async () => {
    const { app, deps } = buildTestApp();
    const res = await request(app).get('/items/No_Slug');

    expect(res.status).toBe(400);
    expect(deps.itemRepo.findById).not.toHaveBeenCalled();
    expect(deps.itemRepo.findBySlug).not.toHaveBeenCalled();
  });

  it('13.1.4 — GET /api/items con token válido → 200, distanceMeters calculado (regresión)', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        createWithImages: vi.fn(),
        findActiveInRadius: vi.fn().mockResolvedValue({
          items: [{ ...guestItemSummary, distanceMeters: 1500 }],
          total: 1,
        }),
        findById: vi.fn(),
      },
    });
    const res = await request(app)
      .get('/items')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.items[0].distanceMeters).toBe(1500);
  });

  it('13.1.5 — GET /api/items/:id con token válido → 200, donor.id real, distanceMeters calculado (regresión)', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        createWithImages: vi.fn(),
        findActiveInRadius: vi.fn(),
        findById: vi.fn().mockResolvedValue(authItemDetail),
      },
    });
    const res = await request(app)
      .get(`/items/${VALID_ITEM_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.donor.id).toBe('11111111-2222-4333-8444-555555555555');
    expect(res.body.donor.firstName).toBe('María');
    expect(res.body.distanceMeters).toBe(3500);
  });

  it('13.1.6 — GET /api/items con token malformado → 401', async () => {
    const { app } = buildTestApp({
      jwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockImplementation(() => { throw new Error('invalid token'); }),
      },
    });
    const res = await request(app)
      .get('/items')
      .set('Authorization', 'Bearer malformed-token');

    expect(res.status).toBe(401);
  });

  it('13.1.6b — GET /api/items/:id con token malformado → 401', async () => {
    const { app } = buildTestApp({
      jwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockImplementation(() => { throw new Error('invalid token'); }),
      },
    });
    const res = await request(app)
      .get(`/items/${VALID_ITEM_ID}`)
      .set('Authorization', 'Bearer malformed-token');

    expect(res.status).toBe(401);
  });

  it('13.1.7 — POST /api/items sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/items')
      .send({ title: 'Test', description: 'Desc' });

    expect(res.status).toBe(401);
  });

  it('13.1.8 — DELETE /api/items/:id sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).delete(`/items/${VALID_ITEM_ID}`);

    expect(res.status).toBe(401);
  });

  it('13.1 — listItems sin token pasa userId null al repositorio', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get('/items');

    expect(deps.itemRepo.findActiveInRadius).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null }),
    );
  });

  it('13.1 — listItems con token pasa userId del usuario al repositorio', async () => {
    const { app, deps } = buildTestApp();
    await request(app)
      .get('/items')
      .set('Authorization', 'Bearer valid-token');

    expect(deps.itemRepo.findActiveInRadius).toHaveBeenCalledWith(
      expect.objectContaining({ userId: mockUser.id }),
    );
  });

  it('13.1 — getItem sin token pasa userId null al repositorio', async () => {
    const { app, deps } = buildTestApp();
    await request(app).get(`/items/${VALID_ITEM_ID}`);

    expect(deps.itemRepo.findById).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null }),
    );
  });

  it('13.1.9 — PATCH /api/items/:id/pause sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .patch(`/items/${VALID_ITEM_ID}/pause`)
      .send({ pause: true });

    expect(res.status).toBe(401);
  });

  it('13.1.10 — GET /api/items/:id/requests sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/items/${VALID_ITEM_ID}/requests`);

    expect(res.status).toBe(401);
  });

  it('13.1.11 — POST /api/items/:id/requests sin token → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/items/${VALID_ITEM_ID}/requests`)
      .send({ contactChannel: 'test@example.com' });

    expect(res.status).toBe(401);
  });

  it('13.1 — getItem con token pasa userId del usuario al repositorio', async () => {
    const { app, deps } = buildTestApp({
      itemRepo: {
        createWithImages: vi.fn(),
        findActiveInRadius: vi.fn(),
        findById: vi.fn().mockResolvedValue(authItemDetail),
      },
    });
    await request(app)
      .get(`/items/${VALID_ITEM_ID}`)
      .set('Authorization', 'Bearer valid-token');

    expect(deps.itemRepo.findById).toHaveBeenCalledWith(
      expect.objectContaining({ userId: mockUser.id }),
    );
  });
});
