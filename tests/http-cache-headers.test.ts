import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { app } from '../src/app';
import { httpCacheMiddleware } from '../src/interfaces/http/middlewares/http-cache.middleware';
import { createUserRouter } from '../src/interfaces/http/routes/users.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { vi } from 'vitest';

const USER_UUID = '550e8400-e29b-41d4-a716-446655440000';

function buildUsersApp() {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(httpCacheMiddleware);
  testApp.use(
    '/api/users',
    createUserRouter({
      jwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockReturnValue({ sub: USER_UUID, jwtVersion: 1 }),
      },
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockResolvedValue({
          id: USER_UUID,
          email: 'user@example.com',
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
        }),
        create: vi.fn(),
        findReputationHistory: vi.fn(),
        findMyDeliverySessions: vi.fn(),
        findMyItems: vi.fn(),
        findMyRequests: vi.fn(),
      },
    }),
  );
  testApp.use(errorHandler);
  return testApp;
}

describe('HTTP Cache-Control headers', () => {
  it('GET /api/health — no-cache', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('GET /api/openapi.json — no-store', async () => {
    const res = await request(app).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /api/users/me autenticado — no-store', async () => {
    const testApp = buildUsersApp();
    const res = await request(testApp)
      .get('/api/users/me')
      .set('Authorization', 'Bearer mock-jwt');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
