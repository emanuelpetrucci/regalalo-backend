import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { createAdminRouter } from '../src/interfaces/http/routes/admin.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { createCorsOptions } from '../src/config/cors';

const mockAdmin = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'admin@test.example.com',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$...',
  jwtVersion: 1,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(),
};

const mockOtpToken = {
  id: '660e8400-e29b-41d4-a716-446655440002',
  adminUserId: mockAdmin.id,
  tokenHash: 'abc123hash',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  used: false,
  attempts: 0,
  createdAt: new Date(),
};

function buildTestApp(depOverrides: Partial<Parameters<typeof createAdminRouter>[0]> = {}) {
  const app = express();
  app.use(express.json());

  const defaultDeps = {
    adminUserRepo: {
      findByEmail: vi.fn().mockResolvedValue(mockAdmin),
      findById: vi.fn().mockResolvedValue(mockAdmin),
      updateLastLogin: vi.fn().mockResolvedValue(undefined),
      updateJwtVersion: vi.fn().mockResolvedValue(undefined),
    },
    adminOtpTokenRepo: {
      findActiveByAdminId: vi.fn().mockResolvedValue(mockOtpToken),
      invalidateByAdminId: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(mockOtpToken),
      markUsed: vi.fn().mockResolvedValue(undefined),
      incrementAttempts: vi.fn().mockResolvedValue(1),
    },
    adminAuditLogRepo: {
      create: vi.fn().mockResolvedValue(undefined),
    },
    hashService: {
      hash: vi.fn(),
      verify: vi.fn().mockResolvedValue(true),
    },
    adminJwtService: {
      sign: vi.fn().mockReturnValue('mock-admin-jwt-token'),
      verify: vi.fn().mockReturnValue({ sub: mockAdmin.id, role: 'admin', jwtVersion: 1 }),
    },
    mailService: {
      send: vi.fn().mockResolvedValue(undefined),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/admin', createAdminRouter(deps));
  app.use(errorHandler);
  return { app, deps };
}

const validLoginBody = { email: 'admin@test.example.com', password: 'Admin1234!' };

// Hash correcto para OTP "123456"
const crypto = await import('crypto');
const correctOtpHash = crypto.createHash('sha256').update('123456').digest('hex');

describe('POST /admin/auth/login', () => {
  it('AC1 — credenciales correctas → 200 con mensaje', async () => {
    const { app, deps } = buildTestApp();
    const res = await request(app).post('/admin/auth/login').send(validLoginBody);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Código enviado al email registrado');
    expect(deps.adminOtpTokenRepo.invalidateByAdminId).toHaveBeenCalledWith(mockAdmin.id);
    expect(deps.adminOtpTokenRepo.create).toHaveBeenCalledOnce();
    expect(deps.mailService.send).toHaveBeenCalledOnce();
    expect(deps.adminAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.otp_requested' }),
    );
  });

  it('AC2 — email inexistente → 401 INVALID_CREDENTIALS', async () => {
    const { app } = buildTestApp({
      adminUserRepo: {
        findByEmail: vi.fn().mockResolvedValue(null),
        findById: vi.fn(),
        updateLastLogin: vi.fn(),
        updateJwtVersion: vi.fn(),
      },
      hashService: {
        hash: vi.fn(),
        verify: vi.fn().mockResolvedValue(false),
      },
    });
    const res = await request(app).post('/admin/auth/login').send(validLoginBody);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('AC2 — contraseña incorrecta → 401 INVALID_CREDENTIALS (respuesta idéntica)', async () => {
    const { app } = buildTestApp({
      hashService: {
        hash: vi.fn(),
        verify: vi.fn().mockResolvedValue(false),
      },
    });
    const res = await request(app).post('/admin/auth/login').send(validLoginBody);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.message).toBe('Credenciales inválidas');
  });

  it('AC2 — respuesta 401 idéntica para email no existe y contraseña incorrecta', async () => {
    const { app: appNoUser } = buildTestApp({
      adminUserRepo: {
        findByEmail: vi.fn().mockResolvedValue(null),
        findById: vi.fn(),
        updateLastLogin: vi.fn(),
        updateJwtVersion: vi.fn(),
      },
      hashService: { hash: vi.fn(), verify: vi.fn().mockResolvedValue(false) },
    });
    const { app: appWrongPwd } = buildTestApp({
      hashService: { hash: vi.fn(), verify: vi.fn().mockResolvedValue(false) },
    });

    const res1 = await request(appNoUser).post('/admin/auth/login').send(validLoginBody);
    const res2 = await request(appWrongPwd).post('/admin/auth/login').send(validLoginBody);

    expect(res1.status).toBe(401);
    expect(res2.status).toBe(401);
    expect(res1.body.code).toBe(res2.body.code);
    expect(res1.body.message).toBe(res2.body.message);
  });

  it('AC14 — payload inválido (email malformado) → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/admin/auth/login')
      .send({ email: 'not-an-email', password: 'pass' });

    expect(res.status).toBe(400);
  });

  it('AC14 — payload inválido (falta password) → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/admin/auth/login')
      .send({ email: 'admin@test.example.com' });

    expect(res.status).toBe(400);
  });

  it('isActive: false en login → 401 INVALID_CREDENTIALS', async () => {
    const { app } = buildTestApp({
      adminUserRepo: {
        findByEmail: vi.fn().mockResolvedValue({ ...mockAdmin, isActive: false }),
        findById: vi.fn(),
        updateLastLogin: vi.fn(),
        updateJwtVersion: vi.fn(),
      },
      hashService: {
        hash: vi.fn(),
        verify: vi.fn().mockResolvedValue(false),
      },
    });
    const res = await request(app).post('/admin/auth/login').send(validLoginBody);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('POST /admin/auth/verify-otp', () => {
  it('AC3 — OTP correcto dentro del tiempo → 200 con token y admin', async () => {
    const { app, deps } = buildTestApp({
      adminOtpTokenRepo: {
        findActiveByAdminId: vi.fn().mockResolvedValue({
          ...mockOtpToken,
          tokenHash: correctOtpHash,
        }),
        invalidateByAdminId: vi.fn(),
        create: vi.fn(),
        markUsed: vi.fn().mockResolvedValue(undefined),
        incrementAttempts: vi.fn().mockResolvedValue(undefined),
      },
    });

    const res = await request(app)
      .post('/admin/auth/verify-otp')
      .send({ email: 'admin@test.example.com', otp: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe('mock-admin-jwt-token');
    expect(res.body.admin).toMatchObject({ id: mockAdmin.id, email: mockAdmin.email });
    expect(deps.adminOtpTokenRepo.markUsed).toHaveBeenCalledOnce();
    expect(deps.adminUserRepo.updateLastLogin).toHaveBeenCalledWith(mockAdmin.id);
    expect(deps.adminUserRepo.updateJwtVersion).toHaveBeenCalledWith(mockAdmin.id);
    expect(deps.adminAuditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.login' }),
    );
  });

  it('AC3 — JWT admin tiene claims sub, role: admin, jwtVersion', async () => {
    const mockSign = vi.fn().mockReturnValue('admin-token');
    const { app } = buildTestApp({
      adminUserRepo: {
        findByEmail: vi.fn().mockResolvedValue(mockAdmin),
        findById: vi.fn().mockResolvedValue(mockAdmin),
        updateLastLogin: vi.fn().mockResolvedValue(undefined),
        updateJwtVersion: vi.fn().mockResolvedValue(2),
      },
      adminOtpTokenRepo: {
        findActiveByAdminId: vi.fn().mockResolvedValue({
          ...mockOtpToken,
          tokenHash: correctOtpHash,
        }),
        invalidateByAdminId: vi.fn(),
        create: vi.fn(),
        markUsed: vi.fn().mockResolvedValue(undefined),
        incrementAttempts: vi.fn().mockResolvedValue(undefined),
      },
      adminJwtService: {
        sign: mockSign,
        verify: vi.fn(),
      },
    });

    await request(app)
      .post('/admin/auth/verify-otp')
      .send({ email: 'admin@test.example.com', otp: '123456' });

    expect(mockSign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: mockAdmin.id, role: 'admin', jwtVersion: 2 }),
    );
  });

  it('AC4 — OTP incorrecto con attempts < 3 → 401 OTP_INVALID', async () => {
    const { app, deps } = buildTestApp({
      adminOtpTokenRepo: {
        findActiveByAdminId: vi.fn().mockResolvedValue({ ...mockOtpToken, attempts: 0 }),
        invalidateByAdminId: vi.fn(),
        create: vi.fn(),
        markUsed: vi.fn().mockResolvedValue(undefined),
        incrementAttempts: vi.fn().mockResolvedValue(1),
      },
    });

    const res = await request(app)
      .post('/admin/auth/verify-otp')
      .send({ email: 'admin@test.example.com', otp: '000000' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('OTP_INVALID');
    expect(deps.adminOtpTokenRepo.incrementAttempts).toHaveBeenCalledWith(mockOtpToken.id);
    expect(deps.adminOtpTokenRepo.markUsed).not.toHaveBeenCalled();
  });

  it('AC5 — OTP incorrecto con attempts llega a 3 → 401 OTP_MAX_ATTEMPTS + mark used', async () => {
    const { app, deps } = buildTestApp({
      adminOtpTokenRepo: {
        findActiveByAdminId: vi.fn().mockResolvedValue({ ...mockOtpToken, attempts: 2 }),
        invalidateByAdminId: vi.fn(),
        create: vi.fn(),
        markUsed: vi.fn().mockResolvedValue(undefined),
        incrementAttempts: vi.fn().mockResolvedValue(3),
      },
    });

    const res = await request(app)
      .post('/admin/auth/verify-otp')
      .send({ email: 'admin@test.example.com', otp: '000000' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('OTP_MAX_ATTEMPTS');
    expect(deps.adminOtpTokenRepo.markUsed).toHaveBeenCalledWith(mockOtpToken.id);
  });

  it('AC6 — OTP expirado → 401 OTP_EXPIRED', async () => {
    const { app } = buildTestApp({
      adminOtpTokenRepo: {
        findActiveByAdminId: vi.fn().mockResolvedValue({
          ...mockOtpToken,
          expiresAt: new Date(Date.now() - 1000),
        }),
        invalidateByAdminId: vi.fn(),
        create: vi.fn(),
        markUsed: vi.fn(),
        incrementAttempts: vi.fn(),
      },
    });

    const res = await request(app)
      .post('/admin/auth/verify-otp')
      .send({ email: 'admin@test.example.com', otp: '123456' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  it('AC6 — no hay token activo → 401 OTP_EXPIRED', async () => {
    const { app } = buildTestApp({
      adminOtpTokenRepo: {
        findActiveByAdminId: vi.fn().mockResolvedValue(null),
        invalidateByAdminId: vi.fn(),
        create: vi.fn(),
        markUsed: vi.fn(),
        incrementAttempts: vi.fn(),
      },
    });

    const res = await request(app)
      .post('/admin/auth/verify-otp')
      .send({ email: 'admin@test.example.com', otp: '123456' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  it('AC14 — OTP no numérico → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/admin/auth/verify-otp')
      .send({ email: 'admin@test.example.com', otp: 'abcdef' });

    expect(res.status).toBe(400);
  });

  it('AC14 — OTP con menos de 6 dígitos → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/admin/auth/verify-otp')
      .send({ email: 'admin@test.example.com', otp: '12345' });

    expect(res.status).toBe(400);
  });
});

describe('requireAdminAuth middleware', () => {
  function buildProtectedApp(depOverrides: Partial<Parameters<typeof createAdminRouter>[0]> = {}) {
    const app = express();
    app.use(express.json());

    const defaultDeps = {
      adminUserRepo: {
        findByEmail: vi.fn().mockResolvedValue(mockAdmin),
        findById: vi.fn().mockResolvedValue(mockAdmin),
        updateLastLogin: vi.fn(),
        updateJwtVersion: vi.fn(),
      },
      adminOtpTokenRepo: {
        findActiveByAdminId: vi.fn(),
        invalidateByAdminId: vi.fn(),
        create: vi.fn(),
        markUsed: vi.fn(),
        incrementAttempts: vi.fn(),
      },
      adminAuditLogRepo: { create: vi.fn() },
      hashService: { hash: vi.fn(), verify: vi.fn() },
      adminJwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockReturnValue({ sub: mockAdmin.id, role: 'admin', jwtVersion: 1 }),
      },
      mailService: { send: vi.fn() },
    };

    const deps = { ...defaultDeps, ...depOverrides };
    const adminRouter = createAdminRouter(deps);
    adminRouter.get('/me', (req, res) => res.json({ adminUser: req.adminUser }));

    app.use('/admin', adminRouter);
    app.use(errorHandler);
    return { app, deps };
  }

  it('AC7 — sin header Authorization → 401', async () => {
    const { app } = buildProtectedApp();
    const res = await request(app).get('/admin/me');
    expect(res.status).toBe(401);
  });

  it('AC8 — token de usuario regular (falla verify con ADMIN_JWT_SECRET) → 401', async () => {
    const { app } = buildProtectedApp({
      adminJwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockImplementation(() => {
          throw new Error('invalid signature');
        }),
      },
    });
    const res = await request(app)
      .get('/admin/me')
      .set('Authorization', 'Bearer user.regular.token');
    expect(res.status).toBe(401);
  });

  it('AC9 — JWT admin válido con jwtVersion coincidente → pasa + req.adminUser inyectado', async () => {
    const { app } = buildProtectedApp();
    const res = await request(app)
      .get('/admin/me')
      .set('Authorization', 'Bearer valid.admin.token');

    expect(res.status).toBe(200);
    expect(res.body.adminUser).toMatchObject({ id: mockAdmin.id, email: mockAdmin.email });
    expect(res.body.adminUser).not.toHaveProperty('passwordHash');
    expect(res.body.adminUser).not.toHaveProperty('isActive');
  });

  it('AC10 — jwtVersion no coincide con admin_users.jwt_version → 401', async () => {
    const { app } = buildProtectedApp({
      adminJwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockReturnValue({ sub: mockAdmin.id, role: 'admin', jwtVersion: 99 }),
      },
    });
    const res = await request(app)
      .get('/admin/me')
      .set('Authorization', 'Bearer valid.admin.token');

    expect(res.status).toBe(401);
  });

  it('AC11 — admin inactivo → 401', async () => {
    const { app } = buildProtectedApp({
      adminUserRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockResolvedValue({ ...mockAdmin, isActive: false }),
        updateLastLogin: vi.fn(),
        updateJwtVersion: vi.fn(),
      },
    });
    const res = await request(app)
      .get('/admin/me')
      .set('Authorization', 'Bearer valid.admin.token');

    expect(res.status).toBe(401);
  });

  it('AC8 — payload sin role:admin → 401', async () => {
    const { app } = buildProtectedApp({
      adminJwtService: {
        sign: vi.fn(),
        verify: vi.fn().mockReturnValue({ sub: mockAdmin.id, jwtVersion: 1 }),
      },
    });
    const res = await request(app)
      .get('/admin/me')
      .set('Authorization', 'Bearer token.without.admin.role');

    expect(res.status).toBe(401);
  });
});

describe('CORS restrictivo (AC13)', () => {
  function buildCorsApp() {
    const app = express();
    app.use(cors(createCorsOptions({
      primaryOrigin: 'https://admin.regalalo.org',
      extraOrigins: [],
      allowVercelPreviews: false,
    })));
    app.use(express.json());
    app.use('/admin', createAdminRouter());
    app.use(errorHandler);
    return app;
  }

  it('AC13 — origin autorizado → ACAO presente', async () => {
    const app = buildCorsApp();
    const res = await request(app)
      .post('/admin/auth/login')
      .set('Origin', 'https://admin.regalalo.org')
      .send(validLoginBody);

    expect(res.headers['access-control-allow-origin']).toBe('https://admin.regalalo.org');
  });

  it('AC13 — origin no autorizado → ACAO ausente', async () => {
    const app = buildCorsApp();
    const res = await request(app)
      .post('/admin/auth/login')
      .set('Origin', 'https://evil.com')
      .send(validLoginBody);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
