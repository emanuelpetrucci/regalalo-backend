import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createDeliverySessionRouter } from '../src/interfaces/http/routes/delivery-sessions.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import type { DeliverySessionParticipantView } from '../src/domain/repositories/delivery-session.repository';

const USER_UUID    = '550e8400-e29b-41d4-a716-446655440000';
const DONOR_UUID   = '660e8400-e29b-41d4-a716-446655440001';
const SESSION_UUID = '11111111-2222-4333-8444-555555555555';
const ITEM_UUID    = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const mockUser = {
  id: USER_UUID,
  email: 'user@example.com',
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

const mockSessionBase = {
  id: SESSION_UUID,
  itemId: ITEM_UUID,
  donorId: DONOR_UUID,
  receiverId: USER_UUID,
  status: 'active' as const,
  contactChannel: 'Telegram: @donante',
  contactPurged: false,
  receiverContactChannel: 'WhatsApp: +34611222333',
  receiverContactPurged: false,
  donorConfirmed: false,
  noShowDeclared: false,
  deadlineAt: new Date('2026-05-20T02:00:00.000Z'),
  createdAt: new Date('2026-05-13T02:00:00.000Z'),
  completedAt: null,
  itemTitle: 'Mesa escritorio IKEA',
  itemCondition: 'good',
  itemImagePaths: ['items/test.jpg'],
  otherPartyUserId: DONOR_UUID,
  otherPartyFirstName: 'María',
  otherPartyLastName: 'Donante',
  otherPartyAvatarUrl: null,
  otherPartyReputationScore: 42,
  otherPartyDistanceMeters: 1200,
};

function toParticipantView(
  overrides: Partial<DeliverySessionParticipantView> = {},
): DeliverySessionParticipantView {
  return { ...mockSessionBase, ...overrides };
}

function buildTestApp(depOverrides: Partial<Parameters<typeof createDeliverySessionRouter>[0]> = {}) {
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
    deliverySessionRepo: {
      selectReceiver: vi.fn(),
      findById: vi.fn(),
      findByIdForParticipant: vi.fn().mockResolvedValue(toParticipantView()),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/delivery-sessions', createDeliverySessionRouter(deps));
  app.use(errorHandler);
  return { app, deliverySessionRepo: deps.deliverySessionRepo };
}

const SESSION_URL = `/delivery-sessions/${SESSION_UUID}`;

describe('GET /delivery-sessions/:id', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('16.1 — donante accede → 200, contactChannel null', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn().mockResolvedValue(
          toParticipantView({
            donorId: USER_UUID,
            receiverId: DONOR_UUID,
            otherPartyUserId: DONOR_UUID,
          }),
        ),
      },
    });
    const res = await request(app)
      .get(SESSION_URL)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.contactChannel).toBeNull();
    expect(res.body).toHaveProperty('id', SESSION_UUID);
    expect(res.body).toHaveProperty('itemId', ITEM_UUID);
    expect(res.body).toHaveProperty('status', 'active');
    expect(res.body).not.toHaveProperty('donorId');
    expect(res.body).not.toHaveProperty('receiverId');
    expect(res.body).not.toHaveProperty('contactPurged');
  });

  it('16.2 — receptor accede, sesión activa, no purgada → 200, contactChannel incluido', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get(SESSION_URL)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.contactChannel).toBe('Telegram: @donante');
    expect(res.body).toHaveProperty('id', SESSION_UUID);
    expect(res.body).toHaveProperty('itemId', ITEM_UUID);
  });

  it('16.3 — receptor accede pero sesión completed → 200, contactChannel null', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn().mockResolvedValue(
          toParticipantView({ status: 'completed' }),
        ),
      },
    });
    const res = await request(app)
      .get(SESSION_URL)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.contactChannel).toBeNull();
  });

  it('16.4 — receptor accede, activa, contact_purged true → 200, contactChannel null', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn().mockResolvedValue(
          toParticipantView({ contactPurged: true }),
        ),
      },
    });
    const res = await request(app)
      .get(SESSION_URL)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.contactChannel).toBeNull();
  });

  it('16.5 — usuario no participa → 403', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn().mockResolvedValue(
          toParticipantView({
            donorId: '00000000-0000-4000-8000-000000000001',
            receiverId: '00000000-0000-4000-8000-000000000002',
          }),
        ),
      },
    });
    const res = await request(app)
      .get(SESSION_URL)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(403);
  });

  it('16.6 — sesión no existe → 404', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn().mockResolvedValue(null),
      },
    });
    const res = await request(app)
      .get(SESSION_URL)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(404);
  });

  it('16.7 — ID no es UUID v4 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/delivery-sessions/not-a-uuid')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });

  it('16.8 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get(SESSION_URL);

    expect(res.status).toBe(401);
  });

  it('16.9 — donante → role, item, otherParty, sharedContactChannel', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn().mockResolvedValue(
          toParticipantView({
            donorId: USER_UUID,
            receiverId: DONOR_UUID,
            otherPartyUserId: DONOR_UUID,
          }),
        ),
      },
    });
    const res = await request(app)
      .get(SESSION_URL)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('donor');
    expect(res.body.sharedContactChannel).toBe('Telegram: @donante');
    expect(res.body.contactChannel).toBeNull();
    expect(res.body.item).toEqual({
      title: 'Mesa escritorio IKEA',
      condition: 'good',
      images: expect.arrayContaining([expect.stringContaining('items/test.jpg')]),
    });
    expect(res.body.otherParty).toEqual({
      userId: DONOR_UUID,
      firstName: 'María',
      lastName: 'Donante',
      avatarUrl: null,
      reputationScore: 42,
      distanceMeters: 1200,
    });
  });

  it('16.10 — receptor → contactChannel, sharedContactChannel null', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get(SESSION_URL)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('receiver');
    expect(res.body.contactChannel).toBe('Telegram: @donante');
    expect(res.body.sharedContactChannel).toBeNull();
  });

  it('16.11 — otherParty.reputationScore negativo permitido', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn().mockResolvedValue(
          toParticipantView({ otherPartyReputationScore: -15 }),
        ),
      },
    });
    const res = await request(app)
      .get(SESSION_URL)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.otherParty.reputationScore).toBe(-15);
  });

  it('16.12 — respuesta sin email ni teléfono de contraparte', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get(SESSION_URL)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.otherParty).not.toHaveProperty('email');
    expect(res.body.otherParty).not.toHaveProperty('phone');
    expect(res.body.otherParty).not.toHaveProperty('consecutiveNoShows');
  });

  it('16.13 — donante, sesión activa, receiver_contact_purged false → receiverContactChannel tiene valor', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn().mockResolvedValue(
          toParticipantView({
            donorId: USER_UUID,
            receiverId: DONOR_UUID,
            otherPartyUserId: DONOR_UUID,
            receiverContactChannel: 'WhatsApp: +34611222333',
            receiverContactPurged: false,
          }),
        ),
      },
    });
    const res = await request(app)
      .get(SESSION_URL)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.receiverContactChannel).toBe('WhatsApp: +34611222333');
  });

  it('16.14 — donante, sesión activa, receiver_contact_purged true → receiverContactChannel null', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn().mockResolvedValue(
          toParticipantView({
            donorId: USER_UUID,
            receiverId: DONOR_UUID,
            otherPartyUserId: DONOR_UUID,
            receiverContactChannel: 'WhatsApp: +34611222333',
            receiverContactPurged: true,
          }),
        ),
      },
    });
    const res = await request(app)
      .get(SESSION_URL)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.receiverContactChannel).toBeNull();
  });

  it('16.15 — receptor → receiverContactChannel siempre null', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get(SESSION_URL)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.receiverContactChannel).toBeNull();
  });

  it('16.16 — donante, sesión completed → receiverContactChannel null', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn().mockResolvedValue(
          toParticipantView({
            donorId: USER_UUID,
            receiverId: DONOR_UUID,
            otherPartyUserId: DONOR_UUID,
            status: 'completed',
            receiverContactPurged: false,
          }),
        ),
      },
    });
    const res = await request(app)
      .get(SESSION_URL)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.receiverContactChannel).toBeNull();
  });

  it('16.17 — donante elegible, receiverContactChannel null en DB (legacy) → null en respuesta', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn(),
        findById: vi.fn(),
        findByIdForParticipant: vi.fn().mockResolvedValue(
          toParticipantView({
            donorId: USER_UUID,
            receiverId: DONOR_UUID,
            otherPartyUserId: DONOR_UUID,
            receiverContactChannel: null,
            receiverContactPurged: false,
          }),
        ),
      },
    });
    const res = await request(app)
      .get(SESSION_URL)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.receiverContactChannel).toBeNull();
  });
});
