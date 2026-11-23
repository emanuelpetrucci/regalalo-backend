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
const RECEIVER_UUID = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';

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

const mockReceiver = {
  id: RECEIVER_UUID,
  email: 'receiver@example.com',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$...',
  postalCode: '28001',
  reputationScore: 10,
  totalReceived: 1,
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

const mockCancelWithSession = {
  receiverId: RECEIVER_UUID,
  itemTitle: 'Mesa de madera',
};

const defaultOwnership = {
  id: ITEM_UUID,
  donorId: USER_UUID,
  status: 'reserved',
  requestsPaused: false,
  title: 'Mesa de madera',
  category: 'furniture' as const,
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
};

function buildTestApp(depOverrides: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json());

  const defaultItemRepo = {
    createWithImages: vi.fn(),
    findActiveInRadius: vi.fn(),
    findById: vi.fn(),
    findItemOwnership: vi.fn().mockResolvedValue(defaultOwnership),
    hasActiveDeliverySession: vi.fn().mockResolvedValue(true),
    cancelItem: vi.fn().mockResolvedValue(mockCancelWithSession),
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
      findById: vi.fn().mockImplementation((id: string) =>
        id === RECEIVER_UUID ? Promise.resolve(mockReceiver) : Promise.resolve(mockUser),
      ),
      create: vi.fn(),
    },
    itemRepo: { ...defaultItemRepo, ...(depOverrides.itemRepo as object ?? {}) },
    mailService: { send: vi.fn().mockResolvedValue(undefined) },
    storageService: { upload: vi.fn() },
    geocodingService: { geocode: vi.fn() },
    requestRepo: { create: vi.fn(), findRankedCandidates: vi.fn() },
    deliverySessionRepo: {
      selectReceiver: vi.fn(),
      findById: vi.fn(),
      confirmDelivery: vi.fn(),
      cancelDelivery: vi.fn(),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/items', createItemRouter(deps));
  app.use(errorHandler);
  return { app, itemRepo: deps.itemRepo, mailService: deps.mailService };
}

describe('DELETE /items/:id — con sesión activa (Historia 4.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(emitEvent).mockClear();
  });

  it('19.1 — cancelar item con sesión activa → 200, TPL-005 enviado al receptor', async () => {
    const { app, mailService } = buildTestApp();
    const res = await request(app)
      .delete(`/items/${ITEM_UUID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(emitEvent).toHaveBeenCalledWith('item.cancelled', USER_UUID, {
      itemId: ITEM_UUID,
      category: 'furniture',
      hadActiveSession: true,
    });

    // Dar tiempo al fire-and-forget
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'receiver@example.com',
        templateId: 'TPL-005',
        variables: expect.objectContaining({ firstName: 'Test', recipientEmail: 'receiver@example.com' }),
      }),
    );
  });

  it('19.2 — email falla → sigue siendo 200 (fire-and-forget)', async () => {
    const { app } = buildTestApp({
      mailService: { send: vi.fn().mockRejectedValue(new Error('Resend API down')) },
    });
    const res = await request(app)
      .delete(`/items/${ITEM_UUID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
  });

  it('19.3 — receptor no encontrado en userRepo → 200 sin email', async () => {
    const mailSend = vi.fn().mockResolvedValue(undefined);
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockImplementation((id: string) =>
          id === RECEIVER_UUID ? Promise.resolve(null) : Promise.resolve(mockUser),
        ),
        create: vi.fn(),
      },
      mailService: { send: mailSend },
    });
    const res = await request(app)
      .delete(`/items/${ITEM_UUID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mailSend).not.toHaveBeenCalled();
  });
});
