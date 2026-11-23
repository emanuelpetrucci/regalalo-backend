import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { validateUuidParam } from '../src/interfaces/validators/uuid-param.validator';

const testApp = express();
testApp.get('/items/:id', validateUuidParam('id'), (_req, res) => {
  res.json({ ok: true });
});

describe('validateUuidParam', () => {
  it('UUID v4 válido pasa al siguiente handler', async () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    const res = await request(testApp).get(`/items/${validUuid}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('UUID inválido retorna 400 Bad Request', async () => {
    const res = await request(testApp).get('/items/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message');
  });

  it('string que parece UUID pero no es v4 retorna 400', async () => {
    const notV4 = '550e8400-e29b-31d4-a716-446655440000';
    const res = await request(testApp).get(`/items/${notV4}`);
    expect(res.status).toBe(400);
  });
});
