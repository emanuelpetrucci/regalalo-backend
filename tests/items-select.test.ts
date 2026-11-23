import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createItemRouter } from '../src/interfaces/http/routes/items.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { ForbiddenException } from '../src/domain/exceptions/forbidden.exception';
import { ConflictException } from '../src/domain/exceptions/conflict.exception';

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

const USER_UUID     = '550e8400-e29b-41d4-a716-446655440000';
const ITEM_UUID     = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const REQUEST_UUID  = 'ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb';
const SESSION_UUID  = '11111111-2222-4333-8444-555555555555';
const RECEIVER_UUID = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';

const mockSelectResult = {
  sessionId: SESSION_UUID,
  status: 'active' as const,
  deadlineAt: new Date('2026-05-20T02:00:00.000Z'),
  receiverId: RECEIVER_UUID,
  itemTitle: 'Mesa de madera',
  itemCondition: 'good',
};

const mockUser = {
  id: USER_UUID,
  email: 'donor@example.com',
  passwordHash: '$argon2id$...',
  postalCode: '28001',
  reputationScore: 42,
  totalReceived: 1,
  totalDonated: 2,
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

const mockReceiver = { ...mockUser, id: RECEIVER_UUID, email: 'receiver@example.com' };

const defaultOwnership = {
  id: ITEM_UUID,
  donorId: USER_UUID,
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
  create: vi.fn(),
  findRankedCandidates: vi.fn().mockResolvedValue([
    { requestId: REQUEST_UUID, userId: RECEIVER_UUID, reputationScore: 10, distanceMeters: 100, requestDate: new Date() },
    { requestId: '22222222-3333-4444-8555-666666666666', userId: 'dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb', reputationScore: 5, distanceMeters: 200, requestDate: new Date() },
  ]),
};

const defaultDeliverySessionRepo = {
  selectReceiver: vi.fn().mockResolvedValue(mockSelectResult),
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
        id === RECEIVER_UUID ? Promise.resolve(mockReceiver) : Promise.resolve(mockUser)
      ),
      create: vi.fn(),
    },
    itemRepo: { ...defaultItemRepo, ...depOverrides.itemRepo },
    requestRepo: { ...defaultRequestRepo, ...depOverrides.requestRepo },
    deliverySessionRepo: { ...defaultDeliverySessionRepo, ...depOverrides.deliverySessionRepo },
    storageService: { upload: vi.fn().mockResolvedValue(undefined) },
    geocodingService: { geocode: vi.fn() },
    mailService: { send: vi.fn().mockResolvedValue(undefined) },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/items', createItemRouter(deps));
  app.use(errorHandler);
  return { app, mailService: deps.mailService, deliverySessionRepo: deps.deliverySessionRepo };
}

const SELECT_URL = `/items/${ITEM_UUID}/requests/${REQUEST_UUID}/select`;

describe('POST /items/:id/requests/:requestId/select', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(emitEvent).mockClear();
  });

  it('15.1 — donante válido, item activo, request pendiente → 200 con { sessionId, status, deadlineAt }', async () => {
    const { app, mailService, deliverySessionRepo } = buildTestApp();
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'Telegram: @donor123' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      sessionId: SESSION_UUID,
      status: 'active',
    });
    expect(res.body).toHaveProperty('deadlineAt');
    expect(res.body).not.toHaveProperty('receiverId');
    expect(res.body).not.toHaveProperty('contactChannel');
    expect(deliverySessionRepo.selectReceiver).toHaveBeenCalledWith({
      itemId: ITEM_UUID,
      requestId: REQUEST_UUID,
      donorId: USER_UUID,
      contactChannel: 'Telegram: @donor123',
    });
    expect(emitEvent).toHaveBeenCalledWith(
      'item.receiver_selected',
      USER_UUID,
      expect.objectContaining({
        itemId: ITEM_UUID,
        candidateCount: 2,
        timeToSelectMs: expect.any(Number),
      }),
      SESSION_UUID,
    );
    const selectProps = vi.mocked(emitEvent).mock.calls[0]![2] as { timeToSelectMs: number };
    expect(selectProps.timeToSelectMs).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(selectProps.timeToSelectMs)).toBe(true);
    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'receiver@example.com',
        templateId: 'TPL-003',
        variables: expect.objectContaining({ firstName: 'Test', recipientEmail: 'receiver@example.com' }),
      }),
    );
  });

  it('15.2 — request ya en estado selected → repo lanza ConflictException → 409', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn().mockRejectedValue(new ConflictException('Request is not in pending state')),
      },
    });
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'WhatsApp: +34600000000' });

    expect(res.status).toBe(409);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('15.3 — item no activo (reserved) → repo lanza ConflictException → 409', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn().mockRejectedValue(new ConflictException('Item is not active')),
      },
    });
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'email@donante.com' });

    expect(res.status).toBe(409);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('15.4 — usuario autenticado pero no es el donante → 403', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue({
          donorId: 'otro-usuario-uuid-distinto',
          status: 'active',
          requestsPaused: false,
        }),
      },
    });
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'contacto' });

    expect(res.status).toBe(403);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('15.5 — donante correcto pero requestId no pertenece al item → repo lanza ForbiddenException → 403', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn().mockRejectedValue(new ForbiddenException('Forbidden')),
      },
    });
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'contacto' });

    expect(res.status).toBe(403);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('15.6 — body sin contactChannel → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({});

    expect(res.status).toBe(400);
  });

  it('15.7 — contactChannel vacío → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: '' });

    expect(res.status).toBe(400);
  });

  it('15.8 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(SELECT_URL)
      .send({ contactChannel: 'contacto' });

    expect(res.status).toBe(401);
  });

  it('15.9 — itemId no es UUID v4 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/items/not-a-uuid/requests/${REQUEST_UUID}/select`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'contacto' });

    expect(res.status).toBe(400);
  });

  it('15.10 — requestId no es UUID v4 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests/not-a-uuid/select`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'contacto' });

    expect(res.status).toBe(400);
  });

  it('15.11 — item no existe → 404', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue(null),
      },
    });
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'contacto' });

    expect(res.status).toBe(404);
  });

  it('15.12 — fallo en email no propaga error (respuesta sigue siendo 200)', async () => {
    const { app } = buildTestApp({
      mailService: {
        send: vi.fn().mockRejectedValue(new Error('Resend API error')),
      },
    });
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'Telegram: @donor' });

    expect(res.status).toBe(200);
  });
});
