import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createItemRouter } from '../src/interfaces/http/routes/items.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'user@example.com',
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

const VALID_ITEM_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const mockItemDetail = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  title: 'Mesa de madera',
  description: 'Mesa en buen estado, 4 sillas incluidas',
  condition: 'good' as const,
  category: 'furniture' as const,
  weightRange: '1to5' as const,
  status: 'active' as const,
  requestsPaused: false,
  degradedAt: null,
  createdAt: new Date('2026-05-01T10:00:00Z'),
  completedAt: null,
  distanceMeters: 3500,
  locationName: null,
  slug: 'mesa-de-madera',
  imagePaths: ['items/abc123/photo.jpg'],
  donor: {
    id: '11111111-2222-4333-8444-555555555555',
    firstName: 'María',
    lastName: 'López',
    avatarUrl: null,
    reputationScore: 20,
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
      findActiveInRadius: vi.fn(),
      findById: vi.fn().mockResolvedValue(mockItemDetail),
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
      geocode: vi.fn(),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };

  app.use('/items', createItemRouter(deps));
  app.use(errorHandler);
  return { app, deps };
}

describe('GET /items/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('10.1 — GET /items/:id autenticado, objeto existe: 200 con detalle completo', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get(`/items/${VALID_ITEM_ID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: VALID_ITEM_ID,
      title: 'Mesa de madera',
      description: 'Mesa en buen estado, 4 sillas incluidas',
      condition: 'good',
      category: 'furniture',
      weightRange: '1to5',
      status: 'active',
      requestsPaused: false,
      degradedAt: null,
      distanceMeters: 3500,
      images: [
        'https://test.supabase.co/storage/v1/object/public/test-bucket/items/abc123/photo.jpg',
      ],
      donor: {
        id: '11111111-2222-4333-8444-555555555555',
        firstName: 'María',
        lastName: 'López',
        avatarUrl: null,
        reputationScore: 20,
      },
      slug: 'mesa-de-madera',
    });
  });

  it('10.2 — respuesta no contiene campo location', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get(`/items/${VALID_ITEM_ID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('location');
    expect(res.body.donor).not.toHaveProperty('location');
  });

  it('10.3 — findById retorna null: 410 Gone', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        createWithImages: vi.fn(),
        findActiveInRadius: vi.fn(),
        findById: vi.fn().mockResolvedValue(null),
      },
    });
    const res = await request(app)
      .get(`/items/${VALID_ITEM_ID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(410);
  });

  it('10.4 — sin token de autenticación: 200 con donor anonimizado (guest mode)', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        createWithImages: vi.fn(),
        findActiveInRadius: vi.fn(),
        findById: vi.fn().mockResolvedValue({
          ...mockItemDetail,
          distanceMeters: null,
          donor: { id: null, firstName: 'Anónimo', lastName: '', avatarUrl: null, reputationScore: 20 },
        }),
      },
    });
    const res = await request(app).get(`/items/${VALID_ITEM_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.donor.id).toBeNull();
    expect(res.body.donor.firstName).toBe('Anónimo');
    expect(res.body.distanceMeters).toBeNull();
  });

  it('10.5 — parámetro ni UUID ni slug: 400 y no consulta', async () => {
    const { app, deps } = buildTestApp();
    const res = await request(app)
      .get('/items/No_Slug')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
    expect(deps.itemRepo.findById).not.toHaveBeenCalled();
    expect(deps.itemRepo.findBySlug).not.toHaveBeenCalled();
  });

  it('10.5b — clave más larga que varchar(100): 400 y no consulta', async () => {
    const { app, deps } = buildTestApp();
    const res = await request(app).get(`/items/${'a'.repeat(101)}`);

    expect(res.status).toBe(400);
    expect(deps.itemRepo.findById).not.toHaveBeenCalled();
    expect(deps.itemRepo.findBySlug).not.toHaveBeenCalled();
  });

  it('10.5c — UUID que no es v4: 400 y no consulta', async () => {
    const { app, deps } = buildTestApp();
    const res = await request(app).get('/items/550e8400-e29b-11d4-a716-446655440000');

    expect(res.status).toBe(400);
    expect(deps.itemRepo.findById).not.toHaveBeenCalled();
    expect(deps.itemRepo.findBySlug).not.toHaveBeenCalled();
  });

  it('10.6 — objeto purgado (FR34): images vacío', async () => {
    const purgedItem = {
      ...mockItemDetail,
      status: 'completed' as const,
      completedAt: new Date('2026-01-01T00:00:00Z'),
      imagePaths: [],
    };
    const { app } = buildTestApp({
      itemRepo: {
        createWithImages: vi.fn(),
        findActiveInRadius: vi.fn(),
        findById: vi.fn().mockResolvedValue(purgedItem),
      },
    });
    const res = await request(app)
      .get(`/items/${VALID_ITEM_ID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.images).toEqual([]);
  });

  it('10.7 — respuesta contiene donor con id y reputationScore', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get(`/items/${VALID_ITEM_ID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.donor).toMatchObject({
      id: expect.any(String),
      reputationScore: expect.any(Number),
    });
  });

  it('10.8 — UUID existente llama a findById y no a findBySlug', async () => {
    const { app, deps } = buildTestApp();
    const res = await request(app)
      .get(`/items/${VALID_ITEM_ID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(deps.itemRepo.findById).toHaveBeenCalledWith({
      itemId: VALID_ITEM_ID,
      userId: mockUser.id,
    });
    expect(deps.itemRepo.findBySlug).not.toHaveBeenCalled();
  });

  it('10.9 — slug sin token: mismo cuerpo, donante anónimo', async () => {
    const findById = vi.fn();
    const findBySlug = vi.fn().mockResolvedValue({
      ...mockItemDetail,
      slug: 'bicicleta-montana',
      distanceMeters: null,
      donor: { id: null, firstName: 'Anónimo', lastName: '', avatarUrl: null, reputationScore: 20 },
    });
    const { app } = buildTestApp({
      itemRepo: {
        createWithImages: vi.fn(),
        findActiveInRadius: vi.fn(),
        findById,
        findBySlug,
      },
    });

    const res = await request(app).get('/items/bicicleta-montana');

    expect(res.status).toBe(200);
    expect(findById).not.toHaveBeenCalled();
    expect(findBySlug).toHaveBeenCalledWith({ slug: 'bicicleta-montana', userId: null });
    expect(res.body).toMatchObject({
      id: VALID_ITEM_ID,
      slug: 'bicicleta-montana',
      distanceMeters: null,
      donor: { id: null, firstName: 'Anónimo', lastName: '', avatarUrl: null, reputationScore: 20 },
    });
  });

  it('10.10 — slug autenticado: misma rama con distancia', async () => {
    const findById = vi.fn();
    const findBySlug = vi.fn().mockResolvedValue({
      ...mockItemDetail,
      slug: 'bicicleta-montana',
    });
    const { app } = buildTestApp({
      itemRepo: {
        createWithImages: vi.fn(),
        findActiveInRadius: vi.fn(),
        findById,
        findBySlug,
      },
    });

    const res = await request(app)
      .get('/items/bicicleta-montana')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(findById).not.toHaveBeenCalled();
    expect(findBySlug).toHaveBeenCalledWith({ slug: 'bicicleta-montana', userId: mockUser.id });
    expect(res.body.slug).toBe('bicicleta-montana');
    expect(res.body.distanceMeters).toBe(3500);
    expect(res.body.donor.id).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('10.11 — slug ausente: 410', async () => {
    const findBySlug = vi.fn().mockResolvedValue(null);
    const { app } = buildTestApp({
      itemRepo: {
        createWithImages: vi.fn(),
        findActiveInRadius: vi.fn(),
        findById: vi.fn(),
        findBySlug,
      },
    });

    const res = await request(app).get('/items/bicicleta-montana');

    expect(res.status).toBe(410);
    expect(findBySlug).toHaveBeenCalled();
  });

  it('10.12 — DELETE, pause y solicitudes siguen exigiendo UUID', async () => {
    const { app } = buildTestApp();
    const auth = { Authorization: 'Bearer mock-jwt-token' };

    const del = await request(app).delete('/items/bicicleta-montana').set(auth);
    const pause = await request(app)
      .patch('/items/bicicleta-montana/pause')
      .set(auth)
      .send({ paused: true });
    const solicitation = await request(app)
      .post('/items/bicicleta-montana/requests')
      .set(auth)
      .send({ contactChannel: 'a@b.co' });

    expect(del.status).toBe(400);
    expect(pause.status).toBe(400);
    expect(solicitation.status).toBe(400);
  });
});
