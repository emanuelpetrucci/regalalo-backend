import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createHash } from 'crypto';
import { createAuthRouter } from '../src/interfaces/http/routes/auth.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { ConflictException } from '../src/domain/exceptions/conflict.exception';
import { GeocodingException } from '../src/domain/exceptions/geocoding.exception';
import { UnprocessableEntityException } from '../src/domain/exceptions/unprocessable-entity.exception';
import { emitEvent } from '../src/application/services/analytics.service';

vi.mock('../src/application/services/analytics.service', () => ({
  emitEvent: vi.fn(),
}));

// Mocks base que se reusan en todos los tests
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
  emailVerified: false,
  verificationTokenHash: null,
  verificationTokenExpiresAt: null,
  verificationResendAt: null,
  isActive: true,
  preferredLanguage: 'es',
};

function buildTestApp(depOverrides: Partial<Parameters<typeof createAuthRouter>[0]> = {}) {
  const app = express();
  app.use(express.json());

  const defaultDeps = {
    userRepo: {
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(mockUser),
    },
    hashService: {
      hash: vi.fn().mockResolvedValue('hashed-password'),
      verify: vi.fn().mockResolvedValue(true),
    },
    jwtService: {
      sign: vi.fn().mockReturnValue('mock-jwt-token'),
      verify: vi.fn().mockReturnValue({ sub: mockUser.id }),
    },
    recaptchaService: {
      verify: vi.fn().mockResolvedValue({ success: true, score: 0.9 }),
    },
    geocodingService: {
      geocode: vi.fn().mockResolvedValue({ lat: 40.4168, lon: -3.7038 }),
    },
    mailService: {
      send: vi.fn().mockResolvedValue(undefined),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/auth', createAuthRouter(deps));
  app.use(errorHandler);
  return { app, deps };
}

const validBody = {
  email: 'test@example.com',
  password: 'password123',
  firstName: 'María',
  lastName: 'García',
  postalCode: '28001',
  recaptchaToken: 'valid-token',
};

beforeEach(() => {
  vi.mocked(emitEvent).mockClear();
});

describe('POST /auth/register', () => {
  it('10.1 — registro exitoso responde 201 con token y user (sin campo location)', async () => {
    const { app, deps } = buildTestApp();
    const res = await request(app).post('/auth/register').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token', 'mock-jwt-token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toMatchObject({
      id: mockUser.id,
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      postalCode: '28001',
      reputationScore: 0,
      totalReceived: 0,
      totalDonated: 0,
    });
    expect(res.body.user).not.toHaveProperty('location');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('isActive');
    expect(res.body.user).not.toHaveProperty('emailVerified');
    expect(res.body.user).not.toHaveProperty('phone');

    expect(deps.userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'test@example.com',
        verificationTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        verificationTokenExpiresAt: expect.any(Date),
        verificationResendAt: expect.any(Date),
      }),
    );

    const createInput = vi.mocked(deps.userRepo.create).mock.calls[0][0];
    const expiresMs =
      createInput.verificationTokenExpiresAt.getTime() - createInput.verificationResendAt.getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(expiresMs).toBeLessThanOrEqual(25 * 60 * 60 * 1000);

    expect(deps.mailService.send).toHaveBeenCalledTimes(1);
    expect(deps.mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'TPL-009',
        variables: expect.objectContaining({
          firstName: 'Test',
          recipientEmail: 'test@example.com',
          expiresInHours: 24,
          verificationLink: expect.stringMatching(/\/verificar-email\?token=[a-f0-9]{64}$/),
        }),
      }),
    );

    const tpl009Call = vi.mocked(deps.mailService.send).mock.calls[0][0];
    const tokenFromLink = String(tpl009Call.variables.verificationLink).split('token=')[1];
    const expectedHash = createHash('sha256').update(tokenFromLink).digest('hex');
    expect(createInput.verificationTokenHash).toBe(expectedHash);
  });

  it('10.2 — email duplicado responde 409', async () => {
    const { app, deps } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn().mockResolvedValue(mockUser),
        create: vi.fn(),
      },
    });

    const res = await request(app).post('/auth/register').send(validBody);
    expect(res.status).toBe(409);
    expect(deps.mailService.send).not.toHaveBeenCalled();
  });

  it('10.3 — código postal no geocodificable responde 400', async () => {
    const { app, deps } = buildTestApp({
      geocodingService: {
        geocode: vi.fn().mockRejectedValue(new GeocodingException('Código postal no encontrado: 99999')),
      },
    });

    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, postalCode: '99999' });
    expect(res.status).toBe(400);
    expect(deps.mailService.send).not.toHaveBeenCalled();
  });

  it('10.4 — reCAPTCHA score < 0.5 responde 422', async () => {
    const { app, deps } = buildTestApp({
      recaptchaService: {
        verify: vi.fn().mockResolvedValue({ success: true, score: 0.3 }),
      },
    });

    const res = await request(app).post('/auth/register').send(validBody);
    expect(res.status).toBe(422);
    expect(deps.mailService.send).not.toHaveBeenCalled();
  });

  it('10.4 — reCAPTCHA con success=false responde 422', async () => {
    const { app, deps } = buildTestApp({
      recaptchaService: {
        verify: vi.fn().mockResolvedValue({ success: false, score: 0.0 }),
      },
    });

    const res = await request(app).post('/auth/register').send(validBody);
    expect(res.status).toBe(422);
    expect(deps.mailService.send).not.toHaveBeenCalled();
  });

  it('10.5 — segundo registro con mismo código postal (geocodingService mockeado; LRU real en nominatim.adapter.test.ts)', async () => {
    const mockGeocode = vi.fn().mockResolvedValue({ lat: 40.4168, lon: -3.7038 });
    const { app } = buildTestApp({
      geocodingService: { geocode: mockGeocode },
      userRepo: {
        findByEmail: vi.fn().mockResolvedValue(null),
        create: vi.fn()
          .mockResolvedValueOnce(mockUser)
          .mockResolvedValueOnce({ ...mockUser, id: 'other-id', email: 'other@example.com' }),
      },
    });

    await request(app).post('/auth/register').send(validBody);
    await request(app).post('/auth/register').send({ ...validBody, email: 'other@example.com' });

    expect(mockGeocode).toHaveBeenCalledTimes(2);
    expect(mockGeocode).toHaveBeenCalledWith('28001');
  });

  it('10.6 — payload inválido: email malformado responde 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('10.6 — payload inválido: password corta responde 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('10.6 — payload inválido: postalCode vacío responde 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, postalCode: '' });
    expect(res.status).toBe(400);
  });

  it('10.7 — payload inválido: sin firstName responde 400', async () => {
    const { app } = buildTestApp();
    const { firstName: _, ...bodyWithoutFirstName } = validBody;
    const res = await request(app).post('/auth/register').send(bodyWithoutFirstName);
    expect(res.status).toBe(400);
  });

  it('10.8 — payload inválido: firstName de 1 carácter responde 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, firstName: 'A' });
    expect(res.status).toBe(400);
  });

  it('10.9 — payload inválido: firstName con dígitos responde 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, firstName: 'John3' });
    expect(res.status).toBe(400);
  });

  it('10.10 — payload inválido: sin lastName responde 400', async () => {
    const { app } = buildTestApp();
    const { lastName: _, ...bodyWithoutLastName } = validBody;
    const res = await request(app).post('/auth/register').send(bodyWithoutLastName);
    expect(res.status).toBe(400);
  });

  it('10.11 — payload inválido: lastName de 1 carácter responde 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, lastName: 'G' });
    expect(res.status).toBe(400);
  });

  it('10.12 — payload inválido: lastName con dígitos responde 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, lastName: 'García2' });
    expect(res.status).toBe(400);
  });

  it('10.13 — registro exitoso emite AE-001 user.registered con postalCode', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post('/auth/register').send(validBody);

    expect(res.status).toBe(201);
    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect(emitEvent).toHaveBeenCalledWith(
      'user.registered',
      mockUser.id,
      { postalCode: '28001' },
    );

    const props = vi.mocked(emitEvent).mock.calls[0][2];
    expect(props).not.toHaveProperty('email');
    expect(props).not.toHaveProperty('firstName');
    expect(props).not.toHaveProperty('lastName');
    expect(props).not.toHaveProperty('lat');
    expect(props).not.toHaveProperty('lon');
    expect(props).not.toHaveProperty('password');
  });

  it('10.14 — email duplicado 409: emitEvent no llamado', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn().mockResolvedValue(mockUser),
        create: vi.fn(),
      },
    });

    const res = await request(app).post('/auth/register').send(validBody);
    expect(res.status).toBe(409);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('10.15 — geocode falla 400: emitEvent no llamado', async () => {
    const { app, deps } = buildTestApp({
      geocodingService: {
        geocode: vi.fn().mockResolvedValue(null),
      },
    });

    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, postalCode: '99999' });
    expect(res.status).toBe(400);
    expect(emitEvent).not.toHaveBeenCalled();
    expect(deps.mailService.send).not.toHaveBeenCalled();
  });

  it('10.16 — reCAPTCHA 422: emitEvent no llamado', async () => {
    const { app, deps } = buildTestApp({
      recaptchaService: {
        verify: vi.fn().mockResolvedValue({ success: true, score: 0.3 }),
      },
    });

    const res = await request(app).post('/auth/register').send(validBody);
    expect(res.status).toBe(422);
    expect(emitEvent).not.toHaveBeenCalled();
    expect(deps.mailService.send).not.toHaveBeenCalled();
  });

  it('10.17 — language=en: create recibe preferredLanguage y TPL-009 se envía en inglés', async () => {
    const mockUserEn = { ...mockUser, preferredLanguage: 'en' };
    const { app, deps } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(mockUserEn),
      },
    });

    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, language: 'en' });

    expect(res.status).toBe(201);
    expect(deps.userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ preferredLanguage: 'en' }),
    );
    expect(deps.mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'TPL-009', language: 'en' }),
    );
  });

  it('10.18 — sin language: create recibe preferredLanguage undefined y TPL-009 en español', async () => {
    const { app, deps } = buildTestApp();

    const res = await request(app).post('/auth/register').send(validBody);

    expect(res.status).toBe(201);
    expect(deps.userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ preferredLanguage: undefined }),
    );
    expect(deps.mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'TPL-009', language: 'es' }),
    );
  });
});
