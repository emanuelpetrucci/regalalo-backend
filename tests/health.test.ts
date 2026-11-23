import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

describe('GET /api/health', () => {
  it('responde 200 con { status: "ok" }', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('incluye cabeceras de seguridad de Helmet', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });
});
