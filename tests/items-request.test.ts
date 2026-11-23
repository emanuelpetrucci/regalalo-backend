import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createItemRouter } from '../src/interfaces/http/routes/items.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { ConflictException } from '../src/domain/exceptions/conflict.exception';
import { LimitExceededException } from '../src/domain/exceptions/limit-exceeded.exception';

const { mockEmitEvent } = vi.hoisted(() => ({
  mockEmitEvent: vi.fn(),
}));

vi.mock('../src/application/services/analytics.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/application/services/analytics.service')>();
  return {
    ...actual,
    emitEvent: mockEmitEvent,
    safeEmitEvent: (
      event: string,
      userId: string,
      properties: Record<string, unknown>,
      sessionId?: string,
    ) => {
      if (!event || !userId) return;
      try {
        if (sessionId !== undefined) {
          mockEmitEvent(event, userId, properties, sessionId);
        } else {
          mockEmitEvent(event, userId, properties);
        }
      } catch {
        // analytics failure must not affect business flow
      }
    },
  };
});

import { emitEvent } from '../src/application/services/analytics.service';

const USER_UUID   = '550e8400-e29b-41d4-a716-446655440000';
const DONOR_UUID  = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';
const ITEM_UUID   = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const REQUEST_UUID = 'ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb';

const mockUser = {
  id: USER_UUID,
  email: 'requester@example.com',
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

const mockDonor = {
  ...mockUser,
  id: DONOR_UUID,
  email: 'donor@example.com',
};

const defaultOwnership = {
  id: ITEM_UUID,
  donorId: DONOR_UUID,
  status: 'active',
  requestsPaused: false,
  title: 'Mesa de madera',
  category: 'furniture' as const,
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
};

const defaultItemRepo = {
  createWithImages: vi.fn(),
  findActiveInRadius: vi.fn(),
  findById: vi.fn(),
  findItemOwnership: vi.fn().mockResolvedValue(defaultOwnership),
  hasActiveDeliverySession: vi.fn().mockResolvedValue(false),
  cancelItem: vi.fn(),
  setPauseStatus: vi.fn(),
  findNewlyDegradedItems: vi.fn(),
};

const defaultRequestRepo = {
  create: vi.fn().mockResolvedValue({
    requestId: REQUEST_UUID,
    status: 'pending',
    createdAt: new Date('2026-05-07T10:00:00.000Z'),
  }),
  findRankedCandidates: vi.fn().mockResolvedValue([]),
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
      findById: vi.fn().mockImplementation((id: string) =>
        id === DONOR_UUID ? Promise.resolve(mockDonor) : Promise.resolve(mockUser)
      ),
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
  return { app, itemRepo: deps.itemRepo, requestRepo: deps.requestRepo, mailService: deps.mailService };
}

const ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('POST /items/:id/requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(emitEvent).mockClear();
    defaultItemRepo.findItemOwnership.mockResolvedValue(defaultOwnership);
    defaultRequestRepo.create.mockResolvedValue({
      requestId: REQUEST_UUID,
      status: 'pending',
      createdAt: new Date('2026-05-07T10:00:00.000Z'),
    });
  });

  it('13.1 — éxito: objeto activo, no paused, no propio → 201 con requestId/status/createdAt', async () => {
    const { app, requestRepo, mailService } = buildTestApp();
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'WhatsApp: +34600000000' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ requestId: REQUEST_UUID, status: 'pending' });
    expect(requestRepo.create).toHaveBeenCalledWith({ itemId: ITEM_UUID, requesterId: USER_UUID, contactChannel: 'WhatsApp: +34600000000' });
    expect(emitEvent).toHaveBeenCalledWith('item.requested', USER_UUID, {
      itemId: ITEM_UUID,
      category: 'furniture',
    });
    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'TPL-006',
        to: 'donor@example.com',
        variables: expect.objectContaining({ firstName: 'Test', recipientEmail: 'donor@example.com', itemTitle: 'Mesa de madera', itemId: ITEM_UUID }),
      }),
    );
  });

  it('13.2 — propio objeto (donorId === requesterId) → 400', async () => {
    const { app, requestRepo } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue({
          donorId: USER_UUID,
          status: 'active',
          requestsPaused: false,
        }),
      },
    });
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'WhatsApp: +34600000000' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'No puedes solicitar tu propio objeto');
    expect(requestRepo.create).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('13.3 — límite de solicitudes alcanzado (repo lanza LimitExceededException) → 409 y AE-031', async () => {
    const { app } = buildTestApp({
      requestRepo: {
        create: vi.fn().mockRejectedValue(new LimitExceededException()),
      },
    });
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'WhatsApp: +34600000000' });

    expect(res.status).toBe(409);
    expect(emitEvent).toHaveBeenCalledWith(
      'limit.reached',
      USER_UUID,
      expect.objectContaining({
        windowStart: expect.stringMatching(ISO8601_REGEX),
        windowEnd: expect.stringMatching(ISO8601_REGEX),
      }),
    );
    const limitProps = vi.mocked(emitEvent).mock.calls[0]![2] as {
      windowStart: string;
      windowEnd: string;
    };
    expect(new Date(limitProps.windowEnd).getTime() - new Date(limitProps.windowStart).getTime()).toBe(
      30 * 24 * 60 * 60 * 1000,
    );
    expect(emitEvent).toHaveBeenCalledTimes(1);
  });

  it('13.4 — solicitud duplicada (repo lanza ConflictException) → 409 sin AE', async () => {
    const { app } = buildTestApp({
      requestRepo: {
        create: vi.fn().mockRejectedValue(new ConflictException('Already requested this item')),
      },
    });
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'WhatsApp: +34600000000' });

    expect(res.status).toBe(409);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('13.5 — objeto con requests_paused = true → 409', async () => {
    const { app, requestRepo } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue({
          donorId: DONOR_UUID,
          status: 'active',
          requestsPaused: true,
        }),
      },
    });
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'WhatsApp: +34600000000' });

    expect(res.status).toBe(409);
    expect(requestRepo.create).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('13.6 — objeto no existe → 404', async () => {
    const { app, requestRepo } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue(null),
      },
    });
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'WhatsApp: +34600000000' });

    expect(res.status).toBe(404);
    expect(requestRepo.create).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('13.7 — UUID inválido → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/items/not-a-valid-uuid/requests')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });

  it('13.8 — sin token de autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post(`/items/${ITEM_UUID}/requests`);

    expect(res.status).toBe(401);
  });

  it('13.9 — objeto no en estado active → 409', async () => {
    const { app, requestRepo } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue({
          donorId: DONOR_UUID,
          status: 'cancelled',
          requestsPaused: false,
        }),
      },
    });
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'WhatsApp: +34600000000' });

    expect(res.status).toBe(409);
    expect(requestRepo.create).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('13.10 — fallo de email no aborta la respuesta exitosa → 201', async () => {
    const { app } = buildTestApp({
      mailService: { send: vi.fn().mockRejectedValue(new Error('Resend error')) },
    });
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'WhatsApp: +34600000000' });

    expect(res.status).toBe(201);
  });

  it('13.11 — sin contactChannel en body → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({});

    expect(res.status).toBe(400);
  });

  it('13.12 — contactChannel vacío → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: '' });

    expect(res.status).toBe(400);
  });
});
