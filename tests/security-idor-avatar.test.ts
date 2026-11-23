import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUserRouter } from '../src/interfaces/http/routes/users.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { env } from '../src/config/env';

const MY_USER_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000002';

const MY_USER = {
  id: MY_USER_ID,
  email: 'me@example.com',
  passwordHash: 'hash',
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
  firstName: 'Me',
  lastName: 'Me',
  avatarUrl: null,
  phone: null,
  emailVerified: true,
  verificationTokenHash: null,
  verificationTokenExpiresAt: null,
  verificationResendAt: null,
  isActive: true,
  preferredLanguage: 'es',
};

function buildTestApp(userOverrides: Partial<typeof MY_USER> = {}) {
  const app = express();
  app.use(express.json());

  const user = { ...MY_USER, ...userOverrides };

  const mockUpdateProfile = vi.fn().mockImplementation((input) => ({
    id: input.userId,
    firstName: input.firstName ?? user.firstName,
    lastName: input.lastName ?? user.lastName,
    avatarUrl: input.avatarUrl,
    phone: input.phone,
    postalCode: input.postalCode,
    preferredLanguage: input.preferredLanguage ?? user.preferredLanguage,
  }));

  const mockDeps = {
    jwtService: {
      sign: vi.fn(),
      verify: vi.fn().mockReturnValue({ sub: MY_USER_ID, jwtVersion: 1 }),
    },
    userRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn().mockResolvedValue(user),
      create: vi.fn(),
      updateProfile: mockUpdateProfile,
      findReputationHistory: vi.fn().mockResolvedValue([]),
      findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
      findMyItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findMyRequests: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
    } as any,
    geocodingService: {
      geocode: vi.fn().mockResolvedValue({ lat: 0, lon: 0 }),
    },
  };

  app.use('/users', createUserRouter(mockDeps));
  app.use(errorHandler);
  return { app, userRepo: mockDeps.userRepo };
}

describe('Security: IDOR Avatar Ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('avatarUrl de otro usuario → 403 sin llamar a updateProfile', async () => {
    const { app, userRepo } = buildTestApp();
    const otherUserAvatar = `${env.APP_PUBLIC_URL}/api/storage/avatars/${OTHER_USER_ID}/stolen.webp`;

    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', 'Bearer mock-token')
      .send({ avatarUrl: otherUserAvatar });

    expect(res.status).toBe(403);
    expect(userRepo.updateProfile).not.toHaveBeenCalled();
  });

  it('avatarUrl propio → 200', async () => {
    const { app, userRepo } = buildTestApp();
    const ownAvatar = `${env.APP_PUBLIC_URL}/api/storage/avatars/${MY_USER_ID}/photo.webp`;

    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', 'Bearer mock-token')
      .send({ avatarUrl: ownAvatar });

    expect(res.status).toBe(200);
    expect(userRepo.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ avatarUrl: ownAvatar }),
    );
  });

  it('avatarUrl null con avatar previo de otro usuario en BD → updateProfile con previousAvatarUrl (guard en repositorio)', async () => {
    const maliciousPreviousAvatar = `${env.APP_PUBLIC_URL}/api/storage/avatars/${OTHER_USER_ID}/victim.webp`;
    const { app, userRepo } = buildTestApp({ avatarUrl: maliciousPreviousAvatar });

    const res = await request(app)
      .patch('/users/me')
      .set('Authorization', 'Bearer mock-token')
      .send({ avatarUrl: null });

    expect(res.status).toBe(200);
    // El use-case pasa previousAvatarUrl al repositorio; el guard real está en PostgresUserRepository
    // que verifica startsWith(`avatars/${userId}/`) antes de encolar la eliminación.
    expect(userRepo.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ previousAvatarUrl: maliciousPreviousAvatar }),
    );
  });
});
