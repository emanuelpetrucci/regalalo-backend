import { describe, it, expect } from 'vitest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';

describe('rate limiting', () => {
  it('retorna 429 al superar el límite de peticiones', async () => {
    const testApp = express();
    const testLimit = rateLimit({
      windowMs: 60_000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
    });
    testApp.use(testLimit);
    testApp.get('/test', (_req, res) => res.json({ ok: true }));

    const first = await request(testApp).get('/test');
    expect(first.status).toBe(200);

    const second = await request(testApp).get('/test');
    expect(second.status).toBe(200);

    const third = await request(testApp).get('/test');
    expect(third.status).toBe(429);
  });
});
