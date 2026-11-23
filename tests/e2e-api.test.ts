import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

const E2E_SECRET = 'test-e2e-secret-min-32-characters-long';

vi.mock('../src/e2e/database/purge-database', () => ({
  purgeDatabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/e2e/scenarios/registry', () => ({
  resolveScenarioBuilder: vi.fn((name: string) => {
    if (name !== 'donor-only') return undefined;
    return async () => ({
      actors: {
        donor: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'donor@test.com',
          password: 'Test1234!',
          firstName: 'Don',
          lastName: 'Or',
          jwtVersion: 1,
        },
      },
      entities: {},
    });
  }),
}));

vi.mock('../src/infrastructure/database/supabase/user.repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/infrastructure/database/supabase/user.repository')>();
  return {
    ...actual,
    PostgresUserRepository: vi.fn().mockImplementation(() => ({
      findById: vi.fn().mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'donor@test.com',
        passwordHash: 'hash',
        postalCode: '1001',
        reputationScore: 10,
        totalReceived: 0,
        totalDonated: 0,
        consecutiveNoShows: 0,
        cyclesAtLimit: 0,
        lastCycleIncrementedAt: null,
        jwtVersion: 1,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        firstName: 'Don',
        lastName: 'Or',
        avatarUrl: null,
        phone: null,
        emailVerified: true,
        verificationTokenHash: null,
        verificationTokenExpiresAt: null,
        verificationResendAt: null,
        isActive: true,
        preferredLanguage: 'es',
      }),
    })),
  };
});

describe('E2E API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without x-e2e-secret', async () => {
    const res = await request(app).post('/api/e2e/scenarios/donor-only');
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown scenario', async () => {
    const res = await request(app)
      .post('/api/e2e/scenarios/unknown')
      .set('x-e2e-secret', E2E_SECRET);
    expect(res.status).toBe(404);
  });

  it('returns 200 with JWT actors for donor-only', async () => {
    const res = await request(app)
      .post('/api/e2e/scenarios/donor-only')
      .set('x-e2e-secret', E2E_SECRET);
    expect(res.status).toBe(200);
    expect(res.body.scenario).toBe('donor-only');
    expect(res.body.actors.donor.token).toBeTruthy();
    expect(res.body.actors.donor.password).toBe('Test1234!');
  });

  it('accepts donor token on GET /users/me', async () => {
    const scenario = await request(app)
      .post('/api/e2e/scenarios/donor-only')
      .set('x-e2e-secret', E2E_SECRET);
    const token = scenario.body.actors.donor.token as string;

    const me = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('donor@test.com');
  });
});
