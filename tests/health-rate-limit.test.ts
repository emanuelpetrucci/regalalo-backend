import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { globalRateLimit } from '../src/interfaces/http/middlewares/rate-limit';

describe('globalRateLimit skip logic', () => {
  it('should skip /api/health now', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const testApp = express();
    testApp.use(globalRateLimit);
    testApp.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok' }));

    // Let's send 70 requests (more than the max: 60)
    for (let i = 0; i < 70; i++) {
        const res = await request(testApp).get('/api/health');
        expect(res.status).toBe(200);
    }

    vi.unstubAllEnvs();
  });

  it('should still rate limit other paths', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const testApp = express();
    testApp.use(globalRateLimit);
    testApp.get('/api/other', (_req, res) => res.status(200).json({ status: 'ok' }));

    for (let i = 0; i < 60; i++) {
        await request(testApp).get('/api/other');
    }

    const res = await request(testApp).get('/api/other');
    expect(res.status).toBe(429);

    vi.unstubAllEnvs();
  });
});
