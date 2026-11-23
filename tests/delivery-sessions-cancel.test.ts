import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createDeliverySessionRouter } from '../src/interfaces/http/routes/delivery-sessions.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { ConflictException } from '../src/domain/exceptions/conflict.exception';
import { ForbiddenException } from '../src/domain/exceptions/forbidden.exception';
import { NotFoundException } from '../src/domain/exceptions/not-found.exception';

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

const DONOR_UUID    = '550e8400-e29b-41d4-a716-446655440000';
const RECEIVER_UUID = '660e8400-e29b-41d4-a716-446655440001';
const SESSION_UUID  = '11111111-2222-4333-8444-555555555555';
const ITEM_UUID     = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const mockCancelResult = {
  noShowDeclared: false,
  completedAt: new Date('2026-05-13T10:00:00.000Z'),
  itemId: ITEM_UUID,
  sessionCreatedAt: new Date('2026-05-12T10:00:00.000Z'),
  category: 'furniture' as const,
};

const mockNoShowCancelResult = {
  noShowDeclared: true,
  completedAt: new Date('2026-05-13T10:00:00.000Z'),
  itemId: ITEM_UUID,
  sessionCreatedAt: new Date('2026-05-12T10:00:00.000Z'),
  category: 'furniture' as const,
  receiverId: RECEIVER_UUID,
  receiverNewScore: 22,
  receiverConsecutiveNoShows: 1,
  receiverDelta: -10,
};

const mockUser = {
  id: DONOR_UUID,
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

const FORBIDDEN_PROPERTY_KEYS = ['email', 'contactChannel', 'firstName', 'lastName', 'title', 'weightRange'];

function assertNoPiiInProperties(properties: Record<string, unknown>): void {
  for (const key of FORBIDDEN_PROPERTY_KEYS) {
    expect(properties).not.toHaveProperty(key);
  }
}

function buildTestApp(depOverrides: Partial<Parameters<typeof createDeliverySessionRouter>[0]> = {}) {
  const app = express();
  app.use(express.json());

  const defaultDeps = {
    jwtService: {
      sign: vi.fn(),
      verify: vi.fn().mockReturnValue({ sub: DONOR_UUID, jwtVersion: 1 }),
    },
    userRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn().mockResolvedValue(mockUser),
      create: vi.fn(),
    },
    deliverySessionRepo: {
      selectReceiver: vi.fn(),
      findById: vi.fn(),
      confirmDelivery: vi.fn(),
      cancelDelivery: vi.fn().mockResolvedValue(mockCancelResult),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/delivery-sessions', createDeliverySessionRouter(deps));
  app.use(errorHandler);
  return { app, deliverySessionRepo: deps.deliverySessionRepo };
}

describe('POST /delivery-sessions/:id/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(emitEvent).mockClear();
  });

  it('CASO-10 — noShow=false, sesión activa → 200 sin modificar reputación (18.1)', async () => {
    const { app, deliverySessionRepo } = buildTestApp();
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/cancel`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ noShow: false });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'cancelled', noShowDeclared: false });
    expect(res.body).toHaveProperty('completedAt');
    expect(res.body).not.toHaveProperty('receiverDelta');
    expect(deliverySessionRepo.cancelDelivery).toHaveBeenCalledWith({
      sessionId: SESSION_UUID,
      donorId: DONOR_UUID,
      noShow: false,
    });

    expect(emitEvent).toHaveBeenCalledWith(
      'session.cancelled_donor',
      DONOR_UUID,
      expect.objectContaining({
        sessionId: SESSION_UUID,
        itemId: ITEM_UUID,
        category: 'furniture',
        durationMs: expect.any(Number),
      }),
      SESSION_UUID,
    );
    expect(emitEvent).toHaveBeenCalledTimes(1);

    const cancelProps = vi.mocked(emitEvent).mock.calls[0]![2] as Record<string, unknown>;
    assertNoPiiInProperties(cancelProps);
  });

  it('18.2 — noShow=true, sesión activa → 200 con noShowDeclared: true', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        confirmDelivery: vi.fn(),
        cancelDelivery: vi.fn().mockResolvedValue(mockNoShowCancelResult),
      },
    });
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/cancel`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ noShow: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'cancelled', noShowDeclared: true });

    expect(emitEvent).toHaveBeenCalledWith(
      'session.cancelled_no_show',
      DONOR_UUID,
      expect.objectContaining({
        sessionId: SESSION_UUID,
        itemId: ITEM_UUID,
        category: 'furniture',
        durationMs: expect.any(Number),
      }),
      SESSION_UUID,
    );
    expect(emitEvent).toHaveBeenCalledWith(
      'reputation.changed',
      RECEIVER_UUID,
      expect.objectContaining({
        delta: -10,
        type: 'no_show',
        newScore: 22,
        consecutiveNoShows: 1,
      }),
    );
    expect(emitEvent).toHaveBeenCalledTimes(2);
  });

  it('18.2b — second no-show (receiverDelta -20) emite AE-030 con delta escalado', async () => {
    const secondNoShowResult = {
      ...mockNoShowCancelResult,
      receiverNewScore: 0,
      receiverConsecutiveNoShows: 2,
      receiverDelta: -20,
    };
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        confirmDelivery: vi.fn(),
        cancelDelivery: vi.fn().mockResolvedValue(secondNoShowResult),
      },
    });
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/cancel`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ noShow: true });

    expect(res.status).toBe(200);
    expect(emitEvent).toHaveBeenCalledWith(
      'reputation.changed',
      RECEIVER_UUID,
      expect.objectContaining({
        delta: -20,
        type: 'no_show',
        newScore: 0,
        consecutiveNoShows: 2,
      }),
    );
  });

  it('18.2c — third no-show (receiverDelta -30) emite AE-030 con delta escalado', async () => {
    const thirdNoShowResult = {
      ...mockNoShowCancelResult,
      receiverNewScore: -10,
      receiverConsecutiveNoShows: 3,
      receiverDelta: -30,
    };
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        confirmDelivery: vi.fn(),
        cancelDelivery: vi.fn().mockResolvedValue(thirdNoShowResult),
      },
    });
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/cancel`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ noShow: true });

    expect(res.status).toBe(200);
    expect(emitEvent).toHaveBeenCalledWith(
      'reputation.changed',
      RECEIVER_UUID,
      expect.objectContaining({
        delta: -30,
        type: 'no_show',
        newScore: -10,
        consecutiveNoShows: 3,
      }),
    );
  });

  it('18.3 — sesión no activa → 409', async () => {
    const deliverySessionRepo = {
      selectReceiver: vi.fn(),
      findById: vi.fn(),
      confirmDelivery: vi.fn(),
      cancelDelivery: vi.fn().mockRejectedValue(new ConflictException('Session is not active')),
    };
    const { app } = buildTestApp({ deliverySessionRepo });
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/cancel`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ noShow: false });

    expect(res.status).toBe(409);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('18.4 — no es el donante → 403', async () => {
    const deliverySessionRepo = {
      selectReceiver: vi.fn(),
      findById: vi.fn(),
      confirmDelivery: vi.fn(),
      cancelDelivery: vi.fn().mockRejectedValue(new ForbiddenException('Forbidden')),
    };
    const { app } = buildTestApp({ deliverySessionRepo });
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/cancel`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ noShow: false });

    expect(res.status).toBe(403);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('18.5 — sesión no existe → 404', async () => {
    const deliverySessionRepo = {
      selectReceiver: vi.fn(),
      findById: vi.fn(),
      confirmDelivery: vi.fn(),
      cancelDelivery: vi.fn().mockRejectedValue(new NotFoundException('Sesión no encontrada')),
    };
    const { app } = buildTestApp({ deliverySessionRepo });
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/cancel`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ noShow: false });

    expect(res.status).toBe(404);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('18.6 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/cancel`)
      .send({ noShow: false });

    expect(res.status).toBe(401);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('18.7 — ID no es UUID v4 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/delivery-sessions/not-a-uuid/cancel')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ noShow: false });

    expect(res.status).toBe(400);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('18.8 — body sin noShow → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/cancel`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({});

    expect(res.status).toBe(400);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('18.9 — noShow es string, no boolean → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/cancel`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ noShow: 'true' });

    expect(res.status).toBe(400);
    expect(emitEvent).not.toHaveBeenCalled();
  });
});
