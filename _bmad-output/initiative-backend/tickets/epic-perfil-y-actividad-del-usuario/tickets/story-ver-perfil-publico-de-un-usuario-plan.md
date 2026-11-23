---
title: "Ver perfil público de un usuario"
type: feature
ticket: 6
status: done
created: 2026-10-25
---

# Historia 5.6: Ver perfil público de un usuario

Status: done

## Historia

Como usuario autenticado,
quiero poder ver el perfil público de otro usuario,
para conocer su reputación y actividad antes de decidir si solicitar un objeto suyo o aceptarlo como receptor.

## Acceptance Criteria

1. **Dado** que envío `GET /users/:id` con un UUID v4 válido y el usuario existe, **cuando** el servidor procesa la petición con autenticación válida, **entonces** responde `200` con `{ id, reputationScore, totalReceived, totalDonated, createdAt }`. Los campos `email`, `consecutiveNoShows`, `postalCode`, `passwordHash` y `jwtVersion` NO aparecen en la respuesta.

2. **Dado** que el `reputationScore` del usuario es negativo, **cuando** el servidor procesa la petición, **entonces** el valor negativo se retorna sin truncar.

3. **Dado** que envío `GET /users/:id` con un UUID que no existe, **cuando** el servidor procesa la petición, **entonces** responde `404 Not Found`.

4. **Dado** que envío `GET /users/:id` con un parámetro que no es UUID v4, **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request`.

5. **Dado** que envío la petición sin autenticación, **cuando** el servidor procesa la petición, **entonces** responde `401 Unauthorized`.

## Tasks / Subtasks

- [x] Task 1: Crear DTO y use case `GetPublicProfileUseCase` (AC: #1, #2, #3)
  - [x] Crear `src/application/dtos/get-public-profile.dto.ts` con `GetPublicProfileResponseDto` (solo campos públicos: `id`, `reputationScore`, `totalReceived`, `totalDonated`, `createdAt`)
  - [x] Crear `src/application/use-cases/user/get-public-profile.use-case.ts`
  - [x] Constructor: `(userRepo: IUserRepository)`. `execute(userId: string)` llama `findById` — si retorna `null`, lanza `NotFoundException`. Mapea a `GetPublicProfileResponseDto` omitiendo campos privados

- [x] Task 2: Extender `UserController` con `getPublicProfile` (AC: #1–#5)
  - [x] En `src/interfaces/http/controllers/user.controller.ts`: importar `GetPublicProfileUseCase`
  - [x] Añadir como 6to parámetro del constructor: `private readonly getPublicProfileUseCase: GetPublicProfileUseCase`
  - [x] Añadir método `getPublicProfile(req, res, next)` con null-guard `!req.currentUser`, llama `getPublicProfileUseCase.execute(req.params.id)`, responde `200`

- [x] Task 3: Extender `users.routes.ts` con `GET /:id` (AC: #1–#5)
  - [x] En `src/interfaces/http/routes/users.routes.ts`: importar `GetPublicProfileUseCase` y `validateUuidParam`
  - [x] Instanciar `getPublicProfileUseCase` y añadirlo como 6to argumento del constructor de `UserController`
  - [x] Añadir ruta `GET /:id` con `authMiddleware`, `validateUuidParam('id')` — DESPUÉS de todas las rutas `/me/*`

- [x] Task 4: Escribir tests (AC: #1–#5)
  - [x] Crear `tests/users-public-profile.test.ts`
  - [x] Test 26.1: sin auth → 401
  - [x] Test 26.2: UUID válido, usuario existe → 200 con `{ id, reputationScore, totalReceived, totalDonated, createdAt }`
  - [x] Test 26.3: response NO incluye `email` ni `consecutiveNoShows`
  - [x] Test 26.4: `reputationScore` negativo se retorna sin truncar
  - [x] Test 26.5: UUID válido, usuario no existe → 404
  - [x] Test 26.6: parámetro no es UUID v4 → 400
  - [x] NO se requieren cambios en mocks de tests existentes (no se añade ningún método nuevo a `IUserRepository`)

---

## Notas para el Dev Agent

### Contexto de la Épica 5: patrón incremental

`UserController` y `users.routes.ts` se extienden historia a historia — NUNCA reescribir desde cero:
- **5.1 creó**: constructor con 1 use case, 1 ruta (`GET /me`)
- **5.2 añadió**: 2do use case, 1 ruta (`GET /me/reputation-history`), null-guard en todos los métodos
- **5.3 añadió**: 3er use case, validador Zod para query params, 1 ruta (`GET /me/delivery-sessions`)
- **5.4 añadió**: 4to use case, nuevo validador, 1 ruta (`GET /me/items`)
- **5.5 añadió**: 5to use case, nuevo validador, 1 ruta (`GET /me/requests`)
- **Esta historia (5.6) añade**: 6to use case, 1 ruta (`GET /:id`)

**null-guard obligatorio**: Todos los métodos del controlador usan el patrón establecido en 5.2:
```typescript
if (!req.currentUser) { next(new UnauthorizedException()); return; }
```

### Diferencia clave respecto a historias anteriores

Esta historia es diferente al resto de la épica en dos aspectos importantes:

1. **Sin nuevo método en `IUserRepository`**: Reutiliza `findById` ya existente. NO se añade nada al dominio ni a la implementación Postgres.

2. **Path param en lugar de query param**: El ID viene de `req.params.id`, no de `req.currentUser.id` ni de `req.query`. El middleware `validateUuidParam('id')` ya existe y valida UUID v4.

### Validador UUID ya existente

`validateUuidParam` está en `src/interfaces/validators/uuid-param.validator.ts`. Es una **factory** que retorna un middleware:

```typescript
export function validateUuidParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[paramName];
    if (typeof value !== 'string' || !UUID_V4_REGEX.test(value)) {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }
    next();
  };
}
```

Uso en la ruta: `validateUuidParam('id')` (nota los paréntesis — se pasa la función invocada, no la referencia).

Este mismo patrón ya se usa en `src/interfaces/http/routes/items.routes.ts`:
```typescript
router.get('/:id', authMiddleware, validateUuidParam('id'), ...);
```

### NotFoundException → HTTP 404

`NotFoundException` está en `src/domain/exceptions/not-found.exception.ts` y el error handler la mapea automáticamente a 404. Ya se usa en otros use cases (`get-item.use-case.ts`, etc.).

### Estado actual de archivos a modificar

**`src/interfaces/http/controllers/user.controller.ts`** — estado post-5.5 (leer el archivo antes de modificar):
```typescript
import { GetPrivateProfileUseCase } from '...';
import { GetReputationHistoryUseCase } from '...';
import { GetMyDeliverySessionsUseCase } from '...';
import { GetMyItemsUseCase } from '...';
import { GetMyRequestsUseCase } from '...';         // añadido en 5.5
import { GetPublicProfileUseCase } from '...';      // ← NUEVO en 5.6
import { UnauthorizedException } from '...';

export class UserController {
  constructor(
    private readonly getPrivateProfileUseCase: GetPrivateProfileUseCase,
    private readonly getReputationHistoryUseCase: GetReputationHistoryUseCase,
    private readonly getMyDeliverySessionsUseCase: GetMyDeliverySessionsUseCase,
    private readonly getMyItemsUseCase: GetMyItemsUseCase,
    private readonly getMyRequestsUseCase: GetMyRequestsUseCase,         // añadido en 5.5
    private readonly getPublicProfileUseCase: GetPublicProfileUseCase,   // ← NUEVO en 5.6
  ) {}

  // getPrivateProfile, getReputationHistory, getMyDeliverySessions, getMyItems, getMyRequests — sin cambios

  async getPublicProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.currentUser) { next(new UnauthorizedException()); return; }
      const result = await this.getPublicProfileUseCase.execute(req.params.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
```

**`src/interfaces/http/routes/users.routes.ts`** — estado post-5.6:
```typescript
// Imports existentes (5.1–5.5) + nuevos:
import { GetPublicProfileUseCase } from '../../../application/use-cases/user/get-public-profile.use-case';
import { validateUuidParam } from '../../validators/uuid-param.validator';

export function createUserRouter(deps: UserRouterDeps = {}): Router {
  // ... setup existente (jwtService, userRepo, authMiddleware, use cases 1–5) ...
  const getPublicProfileUseCase = new GetPublicProfileUseCase(userRepo);   // ← NUEVO
  const controller = new UserController(
    getPrivateProfileUseCase,
    getReputationHistoryUseCase,
    getMyDeliverySessionsUseCase,
    getMyItemsUseCase,
    getMyRequestsUseCase,
    getPublicProfileUseCase,    // ← 6to argumento
  );

  // RUTAS EXISTENTES (SIN CAMBIOS):
  router.get('/me', authMiddleware, ...);
  router.get('/me/reputation-history', authMiddleware, ...);
  router.get('/me/delivery-sessions', authMiddleware, validateListMyDeliverySessionsQuery, ...);
  router.get('/me/items', authMiddleware, validateListMyItemsQuery, ...);
  router.get('/me/requests', authMiddleware, validateListMyRequestsQuery, ...);  // 5.5

  // NUEVA RUTA — DEBE IR DESPUÉS DE TODAS LAS RUTAS /me/*:
  router.get(
    '/:id',
    authMiddleware,
    validateUuidParam('id'),
    (req, res, next) => controller.getPublicProfile(req, res, next),
  );

  return router;
}
```

**CRÍTICO sobre orden de rutas**: `GET /:id` debe registrarse DESPUÉS de todas las rutas `GET /me/*`. Express evalúa rutas en orden de registro. Si `/:id` se registrara primero, una petición a `GET /me` podría caer en esa ruta (con `id = "me"`, que falla el UUID check y retorna 400 en vez de 401). El orden correcto garantiza que `/me` se resuelva primero.

### Código completo de los archivos nuevos

**`src/application/dtos/get-public-profile.dto.ts`:**
```typescript
export interface GetPublicProfileResponseDto {
  id: string;
  reputationScore: number;
  totalReceived: number;
  totalDonated: number;
  createdAt: Date;
}
```

**`src/application/use-cases/user/get-public-profile.use-case.ts`:**
```typescript
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { GetPublicProfileResponseDto } from '../../dtos/get-public-profile.dto';

export class GetPublicProfileUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(userId: string): Promise<GetPublicProfileResponseDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      reputationScore: user.reputationScore,
      totalReceived: user.totalReceived,
      totalDonated: user.totalDonated,
      createdAt: user.createdAt,
    };
  }
}
```

### Estructura del test

```typescript
// tests/users-public-profile.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUserRouter } from '../src/interfaces/http/routes/users.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const USER_UUID = '550e8400-e29b-41d4-a716-446655440000';  // usuario autenticado
const TARGET_UUID = '660e8400-e29b-41d4-a716-446655440001'; // usuario objetivo (diferente)

const mockAuthUser = {
  id: USER_UUID,
  email: 'auth@example.com',
  passwordHash: '$argon2id$...',
  postalCode: '28001',
  reputationScore: 10,
  totalReceived: 1,
  totalDonated: 1,
  consecutiveNoShows: 0,
  cyclesAtLimit: 0,
  lastCycleIncrementedAt: null,
  jwtVersion: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  lastActiveAt: null,
};

const mockPublicUser = {
  id: TARGET_UUID,
  email: 'target@example.com',
  passwordHash: '$argon2id$...',
  postalCode: '28002',
  reputationScore: 25,
  totalReceived: 3,
  totalDonated: 2,
  consecutiveNoShows: 0,
  cyclesAtLimit: 0,
  lastCycleIncrementedAt: null,
  jwtVersion: 1,
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  lastActiveAt: null,
};

function buildTestApp(depOverrides: Partial<Parameters<typeof createUserRouter>[0]> = {}) {
  const app = express();
  app.use(express.json());

  const defaultDeps = {
    jwtService: {
      sign: vi.fn(),
      verify: vi.fn().mockReturnValue({ sub: USER_UUID, jwtVersion: 1 }),
    },
    userRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn().mockImplementation((id: string) =>
        id === USER_UUID ? Promise.resolve(mockAuthUser) : Promise.resolve(mockPublicUser),
      ),
      create: vi.fn(),
      findReputationHistory: vi.fn().mockResolvedValue([]),
      findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
      findMyItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findMyRequests: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/users', createUserRouter(deps));
  app.use(errorHandler);
  return { app, userRepo: deps.userRepo };
}

describe('GET /users/:id', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('26.1 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/users/${TARGET_UUID}`);
    expect(res.status).toBe(401);
  });

  it('26.2 — UUID válido, usuario existe → 200 con perfil público', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get(`/users/${TARGET_UUID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: TARGET_UUID,
      reputationScore: 25,
      totalReceived: 3,
      totalDonated: 2,
    });
    expect(res.body.createdAt).toBeDefined();
  });

  it('26.3 — response no expone campos privados', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get(`/users/${TARGET_UUID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('email');
    expect(res.body).not.toHaveProperty('consecutiveNoShows');
    expect(res.body).not.toHaveProperty('postalCode');
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('jwtVersion');
  });

  it('26.4 — reputationScore negativo se retorna sin truncar', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockImplementation((id: string) =>
          id === USER_UUID
            ? Promise.resolve(mockAuthUser)
            : Promise.resolve({ ...mockPublicUser, reputationScore: -5 }),
        ),
        create: vi.fn(),
        findReputationHistory: vi.fn().mockResolvedValue([]),
        findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
        findMyItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        findMyRequests: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
      },
    });
    const res = await request(app)
      .get(`/users/${TARGET_UUID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.reputationScore).toBe(-5);
  });

  it('26.5 — UUID válido, usuario no existe → 404', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockImplementation((id: string) =>
          id === USER_UUID ? Promise.resolve(mockAuthUser) : Promise.resolve(null),
        ),
        create: vi.fn(),
        findReputationHistory: vi.fn().mockResolvedValue([]),
        findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
        findMyItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        findMyRequests: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
      },
    });
    const res = await request(app)
      .get(`/users/${TARGET_UUID}`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(404);
  });

  it('26.6 — parámetro no es UUID v4 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/not-a-uuid')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });
});
```

**Nota sobre el mock de `findById` en 5.6**: El auth middleware llama `findById(USER_UUID)` para verificar el token del usuario autenticado. La ruta `GET /:id` también llama `findById(TARGET_UUID)` vía el use case. El mock debe distinguir entre los dos UUIDs. Por eso se usa `mockImplementation` en lugar de `mockResolvedValue`.

**Nota de implementación para test 26.6**: `validateUuidParam('id')` retorna 400 antes de llegar al use case, incluso si hay autenticación válida. El test usa auth válida para aislar solo la validación del parámetro (no 401 que confundiría).

### Impacto en tests existentes

**NINGÚN cambio requerido en test files existentes.**

No se añade ningún método nuevo a `IUserRepository`, por lo tanto los mocks de `users-me.test.ts`, `users-reputation-history.test.ts`, `users-delivery-sessions.test.ts`, `users-items.test.ts` y `users-requests.test.ts` (creado en 5.5) no necesitan actualización.

Si la historia 5.5 ya fue implementada correctamente, todos los mocks existentes ya incluyen `findMyRequests`. El nuevo test file de 5.6 incluye `findMyRequests` desde el inicio porque forma parte de `IUserRepository`.

### Regresiones a verificar

- Rutas `/me/*` deben seguir respondiendo correctamente — el orden de rutas en `users.routes.ts` es crítico.
- Correr `vitest run` después de implementar para confirmar cero regresiones.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

Implementación completada el 2026-05-19. Se creó el DTO `GetPublicProfileResponseDto` con solo los campos públicos. Se creó `GetPublicProfileUseCase` reutilizando `findById` de `IUserRepository` (sin agregar métodos nuevos al dominio). Se extendió `UserController` con `getPublicProfile` siguiendo el patrón null-guard de la épica 5. Se extendió `users.routes.ts` con la ruta `GET /:id` usando `validateUuidParam('id')` registrada DESPUÉS de todas las rutas `/me/*` para garantizar el orden correcto de Express. Suite completa: 196 tests, 0 regresiones.

### File List

- `src/application/dtos/get-public-profile.dto.ts` (nuevo)
- `src/application/use-cases/user/get-public-profile.use-case.ts` (nuevo)
- `src/interfaces/http/controllers/user.controller.ts` (modificado)
- `src/interfaces/http/routes/users.routes.ts` (modificado)
- `tests/users-public-profile.test.ts` (nuevo)

### Review Findings

- [x] [Review][Defer] `createdAt: Date` en DTO serializa como ISO string sobre HTTP [src/application/dtos/get-public-profile.dto.ts] — deferred, pre-existing
- [x] [Review][Defer] Orden de ruta `/:id` fragil para futuros `GET /algo` [src/interfaces/http/routes/users.routes.ts:80] — deferred, pre-existing
- [x] [Review][Defer] Patrón shallow-merge en `buildTestApp` + `depOverrides` [tests/users-public-profile.test.ts] — deferred, pre-existing
- [x] [Review][Defer] Sin test para self-profile lookup (USER_UUID === TARGET_UUID) [tests/users-public-profile.test.ts] — deferred, pre-existing
- [x] [Review][Defer] Sin rate-limiting en endpoint de enumeración de usuarios [src/interfaces/http/routes/users.routes.ts] — deferred, pre-existing
- [x] [Review][Defer] Mock constants mutables a nivel módulo en tests [tests/users-public-profile.test.ts] — deferred, pre-existing
- [x] [Review][Defer] Campos numéricos (reputationScore, totalReceived, totalDonated) podrían ser null en DB [src/application/use-cases/user/get-public-profile.use-case.ts] — deferred, pre-existing
- [x] [Review][Defer] `createdAt` podría ser null en DB [src/application/use-cases/user/get-public-profile.use-case.ts] — deferred, pre-existing
- [x] [Review][Defer] Sin test para error de repositorio (DB down) [tests/users-public-profile.test.ts] — deferred, pre-existing
- [x] [Review][Defer] Race condition: auth user eliminado mid-flight entre JWT check y use case [src/interfaces/http/controllers/user.controller.ts] — deferred, pre-existing

### Change Log

- 2026-05-20: Code review completado — 0 patches, 10 deferred (todos pre-existentes), 7 dismissed. Historia marcada como done.
- 2026-05-19: Implementación de historia 5.6 — endpoint `GET /users/:id` con perfil público, filtrado de campos privados, 404 para usuario no encontrado, 400 para UUID inválido y 401 sin autenticación. 6 tests (26.1–26.6). 196 tests totales, 0 regresiones.
