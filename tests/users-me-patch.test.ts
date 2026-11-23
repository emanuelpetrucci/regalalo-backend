import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUserRouter } from '../src/interfaces/http/routes/users.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { env } from '../src/config/env';

const USER_UUID = '550e8400-e29b-41d4-a716-446655440000';
const PREVIOUS_AVATAR_URL = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${env.SUPABASE_STORAGE_BUCKET}/avatars/${USER_UUID}/old.webp`;

const mockUser = {
  id: USER_UUID,
  email: 'user@example.com',
  passwordHash: '$argon2id$...',
  postalCode: '28001',
  reputationScore: 42,
  totalReceived: 3,
  totalDonated: 1,
  consecutiveNoShows: 0,
  cyclesAtLimit: 0,
  lastCycleIncrementedAt: null,
  jwtVersion: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  lastActiveAt: null,
  firstName: 'Test',
  lastName: 'User',
  avatarUrl: PREVIOUS_AVATAR_URL,
  phone: '+34600111222',
  emailVerified: true,
  verificationTokenHash: null,
  verificationTokenExpiresAt: null,
  verificationResendAt: null,
  isActive: true,
  preferredLanguage: 'es',
};

const updatedProfileResponse = {
  id: USER_UUID,
  firstName: 'Test',
  lastName: 'User',
  avatarUrl: null,
  phone: '+34999111222',
  postalCode: '28001',
  preferredLanguage: 'es',
};

function buildTestApp(
  depOverrides: Partial<Parameters<typeof createUserRouter>[0]> = {},
  userRepoOverrides: Record<string, unknown> = {},
) {
  const app = express();
  app.use(express.json());

  const mockGeocode = vi.fn().mockResolvedValue({ lat: 40.4168, lon: -3.7038 });
  const mockUpdateProfile = vi.fn().mockResolvedValue(updatedProfileResponse);

  const defaultDeps = {
    jwtService: {
      sign: vi.fn(),
      verify: vi.fn().mockReturnValue({ sub: USER_UUID, jwtVersion: 1 }),
    },
    geocodingService: { geocode: mockGeocode },
    userRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn().mockResolvedValue(mockUser),
      create: vi.fn(),
      updateProfile: mockUpdateProfile,
      findReputationHistory: vi.fn().mockResolvedValue([]),
      findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
      findMyItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findMyRequests: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
      ...userRepoOverrides,
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/users', createUserRouter(deps));
  app.use(errorHandler);
  return {
    app,
    userRepo: deps.userRepo,
    geocodingService: deps.geocodingService ?? defaultDeps.geocodingService,
  };
}

describe('PATCH /users/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).patch('/users/me').send({ phone: '+34999111222' });
    expect(res.status).toBe(401);
  });

  it('body vacío {} → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({});
    expect(res.status).toBe(400);
  });

  it('firstName inválido → 400', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ firstName: 'A' });
    expect(res.status).toBe(400);
    expect(userRepo.updateProfile).not.toHaveBeenCalled();
  });

  it('campo prohibido email en body → 400', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ email: 'hacker@example.com' });
    expect(res.status).toBe(400);
    expect(userRepo.updateProfile).not.toHaveBeenCalled();
  });

  it('campo prohibido password en body → 400', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ password: 'newpassword123' });
    expect(res.status).toBe(400);
    expect(userRepo.updateProfile).not.toHaveBeenCalled();
  });

  it('campo prohibido isActive en body → 400', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ isActive: false });
    expect(res.status).toBe(400);
    expect(userRepo.updateProfile).not.toHaveBeenCalled();
  });

  it('PATCH solo phone → 200 y updateProfile llamado con phone', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ phone: '+34999111222' });

    expect(res.status).toBe(200);
    expect(userRepo.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_UUID,
        phone: '+34999111222',
        incrementJwtVersion: false,
      }),
    );
    expect(res.body).toMatchObject(updatedProfileResponse);
  });

  it('postalCode inválido (geocode null) → 400 sin updateProfile', async () => {
    const mockGeocode = vi.fn().mockResolvedValue(null);
    const { app, userRepo } = buildTestApp({
      geocodingService: { geocode: mockGeocode },
    });

    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ postalCode: '00000' });

    expect(res.status).toBe(400);
    expect(mockGeocode).toHaveBeenCalledWith('00000');
    expect(userRepo.updateProfile).not.toHaveBeenCalled();
  });

  it('postalCode válido → geocode + updateProfile con incrementJwtVersion', async () => {
    const mockGeocode = vi.fn().mockResolvedValue({ lat: 40.4168, lon: -3.7038 });
    const { app, userRepo } = buildTestApp({
      geocodingService: { geocode: mockGeocode },
    });

    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ postalCode: '28002' });

    expect(res.status).toBe(200);
    expect(mockGeocode).toHaveBeenCalledWith('28002');
    expect(userRepo.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_UUID,
        postalCode: '28002',
        lat: 40.4168,
        lon: -3.7038,
        incrementJwtVersion: true,
      }),
    );
  });

  it('AC #4 — Bearer con jwtVersion desincronizado (stale) → 401', async () => {
    const jwtServiceWithStaleVersion = {
      sign: vi.fn(),
      verify: vi.fn().mockReturnValue({ sub: USER_UUID, jwtVersion: 1 }),
    };
    const userWithIncrementedJwtVersion = { ...mockUser, jwtVersion: 2 };
    const { app } = buildTestApp(
      { jwtService: jwtServiceWithStaleVersion },
      { findById: vi.fn().mockResolvedValue(userWithIncrementedJwtVersion) },
    );

    const res = await request(app)
      .get('/users/me')
      .set('Authorization', 'Bearer old-token-with-stale-jwt-version');

    expect(res.status).toBe(401);
  });

  it('avatarUrl null con avatar previo → updateProfile con previousAvatarUrl', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ avatarUrl: null });

    expect(res.status).toBe(200);
    expect(userRepo.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarUrl: null,
        previousAvatarUrl: PREVIOUS_AVATAR_URL,
      }),
    );
  });

  it('respuesta no contiene email, emailVerified ni isActive', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ preferredLanguage: 'es' });

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('email');
    expect(res.body).not.toHaveProperty('emailVerified');
    expect(res.body).not.toHaveProperty('isActive');
    expect(res.body).not.toHaveProperty('reputationScore');
  });

  it.each(['ca', 'en'] as const)(
    'preferredLanguage %s → 200 y pasa al repositorio',
    async (lang) => {
      const mockUpdateProfile = vi.fn().mockResolvedValue({
        ...updatedProfileResponse,
        preferredLanguage: lang,
      });
      const { app, userRepo } = buildTestApp(
        {},
        { updateProfile: mockUpdateProfile },
      );

      const res = await request(app)
        .patch('/users/me')
        .set('Authorization', 'Bearer mock-jwt-token')
        .send({ preferredLanguage: lang });

      expect(res.status).toBe(200);
      expect(res.body.preferredLanguage).toBe(lang);
      expect(userRepo.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ preferredLanguage: lang }),
      );
    },
  );

  it('preferredLanguage no soportado → 400', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ preferredLanguage: 'fr' });

    expect(res.status).toBe(400);
    expect(userRepo.updateProfile).not.toHaveBeenCalled();
  });

  it('usuario eliminado → 401', async () => {
    const { app } = buildTestApp(
      {},
      {
        findById: vi.fn().mockResolvedValue(null),
      },
    );

    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ phone: '+34999111222' });

    expect(res.status).toBe(401);
  });
});

describe('GET /users/me — regresión tras PATCH', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /users/me sigue respondiendo 200 con auth', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('user@example.com');
  });
});
