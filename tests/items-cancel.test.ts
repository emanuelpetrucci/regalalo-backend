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

function buildTestApp(
  depOverrides: Partial<Parameters<typeof createItemRouter>[0]> = {},
) {
  const app = express();

  const defaultItemRepo = {
    createWithImages: vi.fn(),
    findActiveInRadius: vi.fn(),
    findById: vi.fn(),
    findItemOwnership: vi.fn().mockResolvedValue(defaultOwnership),
    hasActiveDeliverySession: vi.fn().mockResolvedValue(false),
    cancelItem: vi.fn().mockResolvedValue({ receiverId: undefined, itemTitle: 'Test Item' }),
    setPauseStatus: vi.fn(),
    findNewlyDegradedItems: vi.fn(),
  };

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
    mailService: { send: vi.fn().mockResolvedValue(undefined) },
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

describe('DELETE /items/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(emitEvent).mockClear();
  });

  it('11.1 — donante válido, sin sesión activa: 200 con mensaje de confirmación', async () => {
    const { app, itemRepo } = buildTestApp();
    const res = await request(app)
      .delete(`/items/${ITEM_UUID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(itemRepo.cancelItem).toHaveBeenCalledWith(ITEM_UUID);
    expect(emitEvent).toHaveBeenCalledWith('item.cancelled', USER_UUID, {
      itemId: ITEM_UUID,
      category: 'furniture',
      hadActiveSession: false,
    });
    expect(emitEvent).toHaveBeenCalledTimes(1);
  });

  it('11.2 — usuario autenticado pero no es el donante: 403', async () => {
    const { app, itemRepo } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue({ donorId: 'otro-usuario-uuid-distinto', status: 'active', requestsPaused: false }),
        hasActiveDeliverySession: vi.fn(),
        cancelItem: vi.fn(),
      },
    });
    const res = await request(app)
      .delete(`/items/${ITEM_UUID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('message');
    expect(itemRepo.cancelItem).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('11.3 — item no existe: 404', async () => {
    const { app, itemRepo } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue(null),
        hasActiveDeliverySession: vi.fn(),
        cancelItem: vi.fn(),
      },
    });
    const res = await request(app)
      .delete(`/items/${ITEM_UUID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(404);
    expect(itemRepo.cancelItem).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('11.4 — sin token de autenticación: 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).delete(`/items/${ITEM_UUID}`);

    expect(res.status).toBe(401);
  });

  it('11.5 — UUID inválido: 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .delete('/items/not-a-valid-uuid')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });

  it('11.6 — alreadyCancelled: true → 200 sin AE-014 (idempotente, sin cambio de estado)', async () => {
    const { app, itemRepo } = buildTestApp();
    itemRepo.cancelItem.mockResolvedValue({ alreadyCancelled: true, itemTitle: 'Test Item' });
    const res = await request(app)
      .delete(`/items/${ITEM_UUID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(itemRepo.cancelItem).toHaveBeenCalledWith(ITEM_UUID);
    expect(emitEvent).not.toHaveBeenCalled();
  });

});
