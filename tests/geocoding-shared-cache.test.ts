import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAuthRouter } from '../src/interfaces/http/routes/auth.routes';
import { createItemRouter } from '../src/interfaces/http/routes/items.routes';
import { NominatimAdapter } from '../src/infrastructure/geocoding/nominatim.adapter';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  passwordHash: '$argon2id$...',
  postalCode: '28001',
  reputationScore: 0,
  totalReceived: 0,
  totalDonated: 0,
  consecutiveNoShows: 0,
  cyclesAtLimit: 0,
  lastCycleIncrementedAt: null,
  jwtVersion: 1,
  createdAt: new Date(),
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

const mockItem = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  donorId: mockUser.id,
  title: 'Silla',
  description: 'Buen estado',
  condition: 'good' as const,
  category: 'other' as const,
  weightRange: 'lt1' as const,
  status: 'active' as const,
  requestsPaused: false,
  degradedAt: null,
  createdAt: new Date(),
  reservedAt: null,
  completedAt: null,
};

describe('LRU geocoding compartida entre auth e items', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([{ lat: '40.4168', lon: '-3.7038' }]),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('register y publish con mismo postalCode — una sola llamada a Nominatim', async () => {
    const geocodingService = new NominatimAdapter();
    const app = express();
    app.use(express.json());

    const sharedDeps = {
      geocodingService,
      jwtService: {
        sign: vi.fn().mockReturnValue('mock-jwt-token'),
        verify: vi.fn().mockReturnValue({ sub: mockUser.id, jwtVersion: 1 }),
      },
      recaptchaService: {
        verify: vi.fn().mockResolvedValue({ success: true, score: 0.9 }),
      },
      hashService: {
        hash: vi.fn().mockResolvedValue('hashed'),
        verify: vi.fn().mockResolvedValue(true),
      },
      mailService: { send: vi.fn().mockResolvedValue(undefined) },
    };

    app.use(
      '/auth',
      createAuthRouter({
        ...sharedDeps,
        userRepo: {
          findByEmail: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(mockUser),
        },
      }),
    );

    app.use(
      '/items',
      createItemRouter({
        ...sharedDeps,
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
      }),
    );

    app.use(errorHandler);

    const registerRes = await request(app)
      .post('/auth/register')
      .send({
        email: 'new@example.com',
        password: 'password123',
        firstName: 'Ana',
        lastName: 'López',
        postalCode: '28001',
        recaptchaToken: 'token',
      });
    expect(registerRes.status).toBe(201);

    const publishRes = await request(app)
      .post('/items')
      .set('Authorization', 'Bearer mock-jwt-token')
      .field('title', 'Silla')
      .field('description', 'Buen estado')
      .field('condition', 'good')
      .field('postalCode', '28001')
      .field('category', 'furniture')
      .field('weightRange', '1to5')
      .attach('images', Buffer.from('fake'), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });
    expect(publishRes.status).toBe(201);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
