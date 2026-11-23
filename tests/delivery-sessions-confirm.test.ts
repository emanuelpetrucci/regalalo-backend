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

const mockConfirmResult = {
  completedAt: new Date('2026-05-13T10:00:00.000Z'),
  donorId: DONOR_UUID,
  receiverId: RECEIVER_UUID,
  donorNewScore: 52,
  receiverNewScore: 30,
  donorDelta: 10,
  receiverDelta: 1,
  itemId: ITEM_UUID,
  sessionCreatedAt: new Date('2026-05-12T10:00:00.000Z'),
  category: 'furniture' as const,
  weightRange: '1to5' as const,
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

const FORBIDDEN_PROPERTY_KEYS = ['email', 'contactChannel', 'firstName', 'lastName', 'title'];

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
      confirmDelivery: vi.fn().mockResolvedValue(mockConfirmResult),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/delivery-sessions', createDeliverySessionRouter(deps));
  app.use(errorHandler);
  return { app, deliverySessionRepo: deps.deliverySessionRepo };
}

describe('POST /delivery-sessions/:id/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(emitEvent).mockClear();
  });

  it('17.1 — donante confirma sesión activa no confirmada → 200 { status, completedAt }', async () => {
    const { app, deliverySessionRepo } = buildTestApp();
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/confirm`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'completed' });
    expect(res.body.completedAt).toBe('2026-05-13T10:00:00.000Z');
    expect(deliverySessionRepo.confirmDelivery).toHaveBeenCalledWith(SESSION_UUID, DONOR_UUID);

    expect(emitEvent).toHaveBeenCalledWith(
      'session.completed',
      DONOR_UUID,
      expect.objectContaining({
        itemId: ITEM_UUID,
        category: 'furniture',
        weightRange: '1to5',
        durationMs: expect.any(Number),
      }),
      SESSION_UUID,
    );
    expect(emitEvent).toHaveBeenCalledWith(
      'reputation.changed',
      DONOR_UUID,
      expect.objectContaining({
        delta: 10,
        type: 'delivery_completed',
        newScore: 52,
        consecutiveNoShows: 0,
      }),
    );
    expect(emitEvent).toHaveBeenCalledWith(
      'reputation.changed',
      RECEIVER_UUID,
      expect.objectContaining({
        delta: 1,
        type: 'delivery_completed',
        newScore: 30,
        consecutiveNoShows: 0,
      }),
    );
    expect(emitEvent).toHaveBeenCalledTimes(3);

    const completedProps = vi.mocked(emitEvent).mock.calls.find(
      ([event]) => event === 'session.completed',
    )![2] as Record<string, unknown>;
    assertNoPiiInProperties(completedProps);
    expect(completedProps).not.toHaveProperty('sessionId');
  });

  it('17.1b — primera donación (donorDelta 15) emite AE-030 con deltas reales', async () => {
    const firstDonationResult = {
      ...mockConfirmResult,
      donorNewScore: 57,
      donorDelta: 15,
      receiverDelta: 1,
    };
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        confirmDelivery: vi.fn().mockResolvedValue(firstDonationResult),
      },
    });
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/confirm`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(emitEvent).toHaveBeenCalledWith(
      'reputation.changed',
      DONOR_UUID,
      expect.objectContaining({
        delta: 15,
        type: 'delivery_completed',
        newScore: 57,
        consecutiveNoShows: 0,
      }),
    );
    expect(emitEvent).toHaveBeenCalledWith(
      'reputation.changed',
      RECEIVER_UUID,
      expect.objectContaining({
        delta: 1,
        type: 'delivery_completed',
        newScore: 30,
        consecutiveNoShows: 0,
      }),
    );
  });

  it('17.2 — sesión no activa (ej. completed) → 409', async () => {
    const deliverySessionRepo = {
      selectReceiver: vi.fn(),
      findById: vi.fn(),
      confirmDelivery: vi.fn().mockRejectedValue(new ConflictException('Session is not active')),
    };
    const { app } = buildTestApp({ deliverySessionRepo });
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/confirm`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(409);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('17.3 — ya confirmada (donor_confirmed=TRUE) → 409', async () => {
    const deliverySessionRepo = {
      selectReceiver: vi.fn(),
      findById: vi.fn(),
      confirmDelivery: vi.fn().mockRejectedValue(new ConflictException('Delivery already confirmed')),
    };
    const { app } = buildTestApp({ deliverySessionRepo });
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/confirm`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(409);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('17.4 — no es el donante → 403', async () => {
    const deliverySessionRepo = {
      selectReceiver: vi.fn(),
      findById: vi.fn(),
      confirmDelivery: vi.fn().mockRejectedValue(new ForbiddenException('Forbidden')),
    };
    const { app } = buildTestApp({ deliverySessionRepo });
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/confirm`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(403);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('17.5 — sesión no encontrada → 404', async () => {
    const deliverySessionRepo = {
      selectReceiver: vi.fn(),
      findById: vi.fn(),
      confirmDelivery: vi.fn().mockRejectedValue(new NotFoundException('Sesión no encontrada')),
    };
    const { app } = buildTestApp({ deliverySessionRepo });
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/confirm`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(404);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('17.6 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/confirm`);

    expect(res.status).toBe(401);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('17.7 — ID no es UUID v4 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/delivery-sessions/not-a-uuid/confirm')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('17.8 — sesión en estado expired → 409', async () => {
    const deliverySessionRepo = {
      selectReceiver: vi.fn(),
      findById: vi.fn(),
      confirmDelivery: vi.fn().mockRejectedValue(new ConflictException('Session is not active')),
    };
    const { app } = buildTestApp({ deliverySessionRepo });
    const res = await request(app)
      .post(`/delivery-sessions/${SESSION_UUID}/confirm`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(409);
    expect(emitEvent).not.toHaveBeenCalled();
  });
});
