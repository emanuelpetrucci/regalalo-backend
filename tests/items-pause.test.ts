import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createItemRouter } from '../src/interfaces/http/routes/items.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

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

const USER_UUID = '550e8400-e29b-41d4-a716-446655440000';
const ITEM_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const mockUser = {
  id: USER_UUID,
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

const defaultOwnership = {
  id: ITEM_UUID,
  donorId: USER_UUID,
  status: 'active',
  requestsPaused: false,
  title: 'Test Item',
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
  setPauseStatus: vi.fn().mockResolvedValue(undefined),
  findNewlyDegradedItems: vi.fn(),
};

function buildTestApp(
  depOverrides: Partial<Parameters<typeof createItemRouter>[0]> = {},
) {
  const app = express();
  app.use(express.json());

  const defaultDeps = {
    jwtService: {
      sign: vi.fn(),
      verify: vi.fn().mockReturnValue({ sub: USER_UUID, jwtVersion: 1 }),
    },
    userRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn().mockResolvedValue(mockUser),
      create: vi.fn(),
    },
    itemRepo: { ...defaultItemRepo, ...depOverrides.itemRepo },
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
  return { app, itemRepo: deps.itemRepo };
}

describe('PATCH /items/:id/pause', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(emitEvent).mockClear();
  });

  it('12.1 — donante válido, paused: true → 200 con { requestsPaused: true }', async () => {
    const { app, itemRepo } = buildTestApp();
    const res = await request(app)
      .patch(`/items/${ITEM_UUID}/pause`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ paused: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requestsPaused: true });
    expect(itemRepo.setPauseStatus).toHaveBeenCalledWith(ITEM_UUID, true);
    expect(emitEvent).toHaveBeenCalledWith('item.requests_paused', USER_UUID, {
      itemId: ITEM_UUID,
      paused: true,
    });
  });

  it('12.2 — donante válido, paused: false → 200 con { requestsPaused: false }', async () => {
    const { app, itemRepo } = buildTestApp();
    const res = await request(app)
      .patch(`/items/${ITEM_UUID}/pause`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ paused: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requestsPaused: false });
    expect(itemRepo.setPauseStatus).toHaveBeenCalledWith(ITEM_UUID, false);
    expect(emitEvent).toHaveBeenCalledWith('item.requests_paused', USER_UUID, {
      itemId: ITEM_UUID,
      paused: false,
    });
  });

  it('12.3 — usuario autenticado pero no es el donante → 403', async () => {
    const { app, itemRepo } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue({ donorId: 'otro-usuario-uuid', status: 'active', requestsPaused: false }),
        setPauseStatus: vi.fn(),
      },
    });
    const res = await request(app)
      .patch(`/items/${ITEM_UUID}/pause`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ paused: true });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('message');
    expect(itemRepo.setPauseStatus).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('12.4 — item no existe → 404', async () => {
    const { app, itemRepo } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue(null),
        setPauseStatus: vi.fn(),
      },
    });
    const res = await request(app)
      .patch(`/items/${ITEM_UUID}/pause`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ paused: true });

    expect(res.status).toBe(404);
    expect(itemRepo.setPauseStatus).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('12.5 — sin token de autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .patch(`/items/${ITEM_UUID}/pause`)
      .send({ paused: true });

    expect(res.status).toBe(401);
  });

  it('12.6 — UUID inválido → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .patch('/items/not-a-valid-uuid/pause')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ paused: true });

    expect(res.status).toBe(400);
  });

  it('12.7 — item no está en estado active (cancelled) → 409', async () => {
    const { app, itemRepo } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue({ donorId: USER_UUID, status: 'cancelled', requestsPaused: false }),
        setPauseStatus: vi.fn(),
      },
    });
    const res = await request(app)
      .patch(`/items/${ITEM_UUID}/pause`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ paused: true });

    expect(res.status).toBe(409);
    expect(itemRepo.setPauseStatus).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('12.8 — campo paused ausente en body → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .patch(`/items/${ITEM_UUID}/pause`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({});

    expect(res.status).toBe(400);
  });

  it('12.9 — paused es string en lugar de boolean → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .patch(`/items/${ITEM_UUID}/pause`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ paused: 'true' });

    expect(res.status).toBe(400);
  });
});
