import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createItemRouter } from '../src/interfaces/http/routes/items.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { emitEvent } from '../src/application/services/analytics.service';

vi.mock('../src/application/services/analytics.service', () => ({
  emitEvent: vi.fn(),
}));

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

const mockItem = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  donorId: mockUser.id,
  title: 'Silla de madera',
  description: 'En buen estado',
  condition: 'good' as const,
  category: 'furniture' as const,
  weightRange: '1to5' as const,
  status: 'active' as const,
  requestsPaused: false,
  degradedAt: null,
  createdAt: new Date(),
  reservedAt: null,
  completedAt: null,
  slug: 'silla-de-madera',
};

function addPublishFields(req: request.Test) {
  return req
    .field('category', 'furniture')
    .field('weightRange', '1to5');
}

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
      createWithImages: vi.fn().mockResolvedValue(mockItem),
      findActiveInRadius: vi.fn(),
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

describe('POST /items', () => {
  beforeEach(() => vi.clearAllMocks());

  it('8.1 — valid request 1 image: responds 201 with { id, title, status, createdAt }', async () => {
    const { app } = buildTestApp();
    const res = await addPublishFields(
      request(app)
        .post('/items')
        .set('Authorization', 'Bearer mock-jwt-token')
        .field('title', 'Silla de madera')
        .field('description', 'En buen estado')
        .field('condition', 'good')
        .field('postalCode', '28001'),
    ).attach('images', Buffer.from('fake-image-data'), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      slug: 'silla-de-madera',
      title: 'Silla de madera',
      status: 'active',
      createdAt: expect.any(String),
    });
    expect(res.body).not.toHaveProperty('category');
    expect(res.body).not.toHaveProperty('weightRange');
  });

  it('8.1b — base ocupada: el 201 devuelve el slug con sufijo', async () => {
    const { app, deps } = buildTestApp();
    (deps.itemRepo.createWithImages as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockItem,
      title: 'Bicicleta Montaña',
      slug: 'bicicleta-montana-2',
    });

    const res = await addPublishFields(
      request(app)
        .post('/items')
        .set('Authorization', 'Bearer mock-jwt-token')
        .field('title', 'Bicicleta Montaña')
        .field('description', 'Rodado 26')
        .field('condition', 'good')
        .field('postalCode', '28001'),
    ).attach('images', Buffer.from('fake-image-data'), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(res.body.slug).toBe('bicicleta-montana-2');
  });

  it('8.2 — valid request with 5 images: responds 201', async () => {
    const { app } = buildTestApp();
    const req = addPublishFields(
      request(app)
        .post('/items')
        .set('Authorization', 'Bearer mock-jwt-token')
        .field('title', 'Mesa de madera')
        .field('description', 'Buena mesa')
        .field('condition', 'good')
        .field('postalCode', '28001'),
    );

    for (let i = 0; i < 5; i++) {
      req.attach('images', Buffer.from(`fake-image-${i}`), { filename: `photo${i}.jpg`, contentType: 'image/jpeg' });
    }

    const res = await req;
    expect(res.status).toBe(201);
  });

  it('8.3 — no auth token: responds 401', async () => {
    const { app } = buildTestApp();
    const res = await addPublishFields(
      request(app)
        .post('/items')
        .field('title', 'Silla')
        .field('description', 'Buena')
        .field('condition', 'good')
        .field('postalCode', '28001'),
    );

    expect(res.status).toBe(401);
  });

  it('8.4 — more than 5 images (LIMIT_FILE_COUNT): responds 400', async () => {
    const { app } = buildTestApp();
    const req = addPublishFields(
      request(app)
        .post('/items')
        .set('Authorization', 'Bearer mock-jwt-token')
        .field('title', 'Silla')
        .field('description', 'Buena')
        .field('condition', 'good')
        .field('postalCode', '28001'),
    );

    for (let i = 0; i < 6; i++) {
      req.attach('images', Buffer.from(`fake-image-${i}`), { filename: `photo${i}.jpg`, contentType: 'image/jpeg' });
    }

    const res = await req;
    expect(res.status).toBe(400);
  });

  it('8.5 — image > 2MB (LIMIT_FILE_SIZE): responds 400', async () => {
    const { app } = buildTestApp();
    const res = await addPublishFields(
      request(app)
        .post('/items')
        .set('Authorization', 'Bearer mock-jwt-token')
        .field('title', 'Silla')
        .field('description', 'Buena')
        .field('condition', 'good')
        .field('postalCode', '28001'),
    ).attach('images', Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'big.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
  });

  it('8.6 — ungeocoda postal code (geocode returns null): responds 400', async () => {
    const { app } = buildTestApp({
      geocodingService: {
        geocode: vi.fn().mockResolvedValue(null),
      },
    });

    const res = await addPublishFields(
      request(app)
        .post('/items')
        .set('Authorization', 'Bearer mock-jwt-token')
        .field('title', 'Silla')
        .field('description', 'Buena')
        .field('condition', 'good')
        .field('postalCode', '99999'),
    ).attach('images', Buffer.from('fake-image'), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('8.7 — invalid body (missing title): responds 400', async () => {
    const { app } = buildTestApp();
    const res = await addPublishFields(
      request(app)
        .post('/items')
        .set('Authorization', 'Bearer mock-jwt-token')
        .field('description', 'Buena')
        .field('condition', 'good')
        .field('postalCode', '28001'),
    ).attach('images', Buffer.from('fake-image'), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
  });

  it('8.8 — storage fails (storageService.upload rejects): responds 500', async () => {
    const { app } = buildTestApp({
      storageService: {
        upload: vi.fn().mockRejectedValue(new Error('Storage unavailable')),
      },
    });

    const res = await addPublishFields(
      request(app)
        .post('/items')
        .set('Authorization', 'Bearer mock-jwt-token')
        .field('title', 'Silla')
        .field('description', 'Buena')
        .field('condition', 'good')
        .field('postalCode', '28001'),
    ).attach('images', Buffer.from('fake-image'), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(500);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('8.9 — no images (0 files attached): responds 201', async () => {
    const { app } = buildTestApp();
    const res = await addPublishFields(
      request(app)
        .post('/items')
        .set('Authorization', 'Bearer mock-jwt-token')
        .field('title', 'Silla')
        .field('description', 'Buena')
        .field('condition', 'good')
        .field('postalCode', '28001'),
    );

    expect(res.status).toBe(201);
  });

  it('8.10 — missing category: responds 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/items')
      .set('Authorization', 'Bearer mock-jwt-token')
      .field('title', 'Silla')
      .field('description', 'Buena')
      .field('condition', 'good')
      .field('postalCode', '28001')
      .field('weightRange', '1to5')
      .attach('images', Buffer.from('fake-image'), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid request', errors: expect.any(Array) });
  });

  it('8.11 — missing weightRange: responds 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/items')
      .set('Authorization', 'Bearer mock-jwt-token')
      .field('title', 'Silla')
      .field('description', 'Buena')
      .field('condition', 'good')
      .field('postalCode', '28001')
      .field('category', 'furniture')
      .attach('images', Buffer.from('fake-image'), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid request', errors: expect.any(Array) });
  });

  it('8.12 — invalid category enum: responds 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/items')
      .set('Authorization', 'Bearer mock-jwt-token')
      .field('title', 'Silla')
      .field('description', 'Buena')
      .field('condition', 'good')
      .field('postalCode', '28001')
      .field('category', 'invalid')
      .field('weightRange', '1to5')
      .attach('images', Buffer.from('fake-image'), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid request', errors: expect.any(Array) });
  });

  it('8.13 — invalid weightRange enum: responds 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/items')
      .set('Authorization', 'Bearer mock-jwt-token')
      .field('title', 'Silla')
      .field('description', 'Buena')
      .field('condition', 'good')
      .field('postalCode', '28001')
      .field('category', 'furniture')
      .field('weightRange', 'invalid')
      .attach('images', Buffer.from('fake-image'), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid request', errors: expect.any(Array) });
  });

  it('8.14 — success: createWithImages receives category and weightRange from body', async () => {
    const { app, deps } = buildTestApp();
    const res = await addPublishFields(
      request(app)
        .post('/items')
        .set('Authorization', 'Bearer mock-jwt-token')
        .field('title', 'Silla de madera')
        .field('description', 'En buen estado')
        .field('condition', 'good')
        .field('postalCode', '28001'),
    ).attach('images', Buffer.from('fake-image'), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(deps.itemRepo.createWithImages).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'furniture',
        weightRange: '1to5',
      }),
    );
  });

  it('8.15 — success: emitEvent called once with AE-010 payload', async () => {
    const { app } = buildTestApp();
    const res = await addPublishFields(
      request(app)
        .post('/items')
        .set('Authorization', 'Bearer mock-jwt-token')
        .field('title', 'Silla de madera')
        .field('description', 'En buen estado')
        .field('condition', 'good')
        .field('postalCode', '28001'),
    ).attach('images', Buffer.from('fake-image'), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect(emitEvent).toHaveBeenCalledWith('item.published', mockUser.id, {
      itemId: mockItem.id,
      category: mockItem.category,
      condition: mockItem.condition,
      weightRange: mockItem.weightRange,
    });
  });

  it('8.16 — geocode null: emitEvent not called', async () => {
    const { app } = buildTestApp({
      geocodingService: {
        geocode: vi.fn().mockResolvedValue(null),
      },
    });

    const res = await addPublishFields(
      request(app)
        .post('/items')
        .set('Authorization', 'Bearer mock-jwt-token')
        .field('title', 'Silla')
        .field('description', 'Buena')
        .field('condition', 'good')
        .field('postalCode', '99999'),
    ).attach('images', Buffer.from('fake-image'), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(emitEvent).not.toHaveBeenCalled();
  });
});
