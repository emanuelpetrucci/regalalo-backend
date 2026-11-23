import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

describe('OpenAPI', () => {
  it('GET /api/openapi.json expone el contrato con rutas clave', async () => {
    const res = await request(app).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.paths).toHaveProperty('/auth/login');
    expect(res.body.paths).toHaveProperty('/items');
    expect(res.body.paths).toHaveProperty('/users/me');
    expect(res.body.components.securitySchemes).toHaveProperty('bearerAuth');
  });
});
