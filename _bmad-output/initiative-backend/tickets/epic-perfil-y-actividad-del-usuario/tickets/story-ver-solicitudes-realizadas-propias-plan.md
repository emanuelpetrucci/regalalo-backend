---
title: "Ver solicitudes realizadas propias"
type: feature
ticket: 5
status: done
created: 2026-10-25
---

# Historia 5.5: Ver solicitudes realizadas propias

Status: done

## Historia

Como receptor autenticado,
quiero ver todas las solicitudes que realicé con filtro por estado,
para hacer seguimiento de los objetos que pedí.

## Acceptance Criteria

1. **Dado** que envío `GET /users/me/requests` con autenticación válida, **cuando** el servidor procesa la petición, **entonces** responde `200` con `{ requests: [{ id, itemId, itemTitle, itemStatus, status, createdAt }], pagination }`.

2. **Dado** que envío `GET /users/me/requests?status=pending`, **cuando** el servidor procesa la petición, **entonces** solo se retornan solicitudes en estado `pending`.

3. **Dado** que envío `GET /users/me/requests?status=selected`, **cuando** el servidor procesa la petición, **entonces** solo se retornan solicitudes en estado `selected`.

4. **Dado** que envío parámetros de paginación inválidos (ej. `limit=51` o `page=0`), **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request`.

5. **Dado** que envío la petición sin autenticación, **cuando** el servidor procesa la petición, **entonces** responde `401 Unauthorized`.

## Tasks / Subtasks

- [x] Task 1: Añadir `UserRequestRecord`, `FindMyRequestsInput` y `findMyRequests()` a `IUserRepository` (AC: #1, #2, #3)
  - [x] En `src/domain/repositories/user.repository.ts`: añadir interfaz `UserRequestRecord` con campos `id`, `itemId`, `itemTitle`, `itemStatus`, `status`, `createdAt`
  - [x] Añadir interfaz `FindMyRequestsInput` con `userId`, `status?`, `page`, `limit`
  - [x] Añadir `findMyRequests(input: FindMyRequestsInput): Promise<{ requests: UserRequestRecord[]; total: number }>` a `IUserRepository`

- [x] Task 2: Implementar `findMyRequests()` en `PostgresUserRepository` (AC: #1, #2, #3)
  - [x] En `src/infrastructure/database/supabase/user.repository.ts`: añadir método `findMyRequests`
  - [x] Query con JOIN a `items` para obtener `title` y `status` del objeto, filtro opcional de `status` en `ir.status`, paginación con COUNT separado
  - [x] Actualizar import desde el repositorio de dominio para incluir los nuevos tipos

- [x] Task 3: Crear validador `list-my-requests.validator.ts` (AC: #4)
  - [x] Crear `src/interfaces/validators/list-my-requests.validator.ts`
  - [x] Schema Zod: `status` enum opcional `['pending', 'selected', 'rejected', 'cancelled']`, `page` coerce number min 1 default 1, `limit` coerce number min 1 max 50 default 20
  - [x] Exportar `validateListMyRequestsQuery` siguiendo el patrón de `list-my-items.validator.ts`

- [x] Task 4: Crear DTO y use case `GetMyRequestsUseCase` (AC: #1, #2, #3)
  - [x] Crear `src/application/dtos/get-my-requests.dto.ts` con `MyRequestDto`, `GetMyRequestsRequestDto` y `GetMyRequestsResponseDto`
  - [x] Crear `src/application/use-cases/user/get-my-requests.use-case.ts`
  - [x] Constructor: `(userRepo: IUserRepository)`. `execute(input)` llama `findMyRequests`, mapea a DTO

- [x] Task 5: Extender `UserController` con `getMyRequests` (AC: #1–#5)
  - [x] En `src/interfaces/http/controllers/user.controller.ts`: añadir `GetMyRequestsUseCase` como 5to parámetro del constructor
  - [x] Añadir método `getMyRequests(req, res, next)` con null-guard `!req.currentUser`, extrae `status`, `page`, `limit` de `req.query`, responde `200`

- [x] Task 6: Extender `users.routes.ts` con `GET /me/requests` (AC: #1–#5)
  - [x] En `src/interfaces/http/routes/users.routes.ts`: importar `GetMyRequestsUseCase` y `validateListMyRequestsQuery`
  - [x] Instanciar `getMyRequestsUseCase` y añadirlo como 5to argumento del constructor de `UserController`
  - [x] Añadir ruta `GET /me/requests` con `authMiddleware`, `validateListMyRequestsQuery`

- [x] Task 7: Escribir tests (AC: #1–#5)
  - [x] Crear `tests/users-requests.test.ts`
  - [x] Test 25.1: sin auth → 401
  - [x] Test 25.2: sin filtros → 200 con `requests` y `pagination`
  - [x] Test 25.3: `status=pending` → llama `findMyRequests` con status pending
  - [x] Test 25.4: `status=selected` → llama `findMyRequests` con status selected
  - [x] Test 25.5: `limit=51` → 400
  - [x] Actualizar mocks en `tests/users-me.test.ts`, `tests/users-reputation-history.test.ts`, `tests/users-delivery-sessions.test.ts` y `tests/users-items.test.ts` para incluir `findMyRequests`

### Review Findings

- [x] [Review][Decision] INNER JOIN silently drops orphaned requests + COUNT/SELECT mismatch — resuelto: JOIN añadido al COUNT para que ambas queries sean consistentes. [src/infrastructure/database/supabase/user.repository.ts]
- [x] [Review][Patch] Controller re-parsea `page`/`limit` con fallbacks `|| 1` / `|| 20` redundantes — eliminados; el validador Zod garantiza los valores. [src/interfaces/http/controllers/user.controller.ts]
- [x] [Review][Patch] Falta test para `page=0` → 400 — añadido test 25.6. [tests/users-requests.test.ts]
- [x] [Review][Patch] Falta test para `status=invalid` → 400 — añadido test 25.7. [tests/users-requests.test.ts]
- [x] [Review][Patch] Test 25.2 no verifica el shape individual de cada request — añadidas assertions de campos. [tests/users-requests.test.ts]
- [x] [Review][Patch] Indentación inconsistente en mocks de tests existentes — corregida a 8 espacios. [tests/users-me.test.ts, tests/users-reputation-history.test.ts]
- [x] [Review][Defer] `params` array mutado entre la query COUNT y la query SELECT [src/infrastructure/database/supabase/user.repository.ts] — deferred, pre-existing; mismo patrón en `findMyDeliverySessions` y `findMyItems`
- [x] [Review][Defer] `countResult.rows[0]` sin null-check [src/infrastructure/database/supabase/user.repository.ts] — deferred, pre-existing; PostgreSQL siempre retorna una fila para COUNT(*)
- [x] [Review][Defer] `createdAt: Date` en DTO pero serializado como string ISO por `res.json()` [src/application/dtos/get-my-requests.dto.ts] — deferred, pre-existing en todo el proyecto
- [x] [Review][Defer] Sin cota superior en `page` — offset arbitrariamente grande posible [src/interfaces/validators/list-my-requests.validator.ts] — deferred, pre-existing en todos los validadores hermanos
- [x] [Review][Defer] TOCTOU COUNT/SELECT sin transacción — total puede divergir de rows bajo escrituras concurrentes [src/infrastructure/database/supabase/user.repository.ts] — deferred, pre-existing en todos los endpoints de paginación

---

## Notas para el Dev Agent

### Contexto de la Épica 5: patrón incremental

`UserController` y `users.routes.ts` se extienden historia a historia — NUNCA reescribir desde cero:
- **5.1 creó**: constructor con 1 use case, 1 ruta (`GET /me`)
- **5.2 añadió**: 2do use case, 1 ruta (`GET /me/reputation-history`), null-guard establecido en todos los métodos
- **5.3 añadió**: 3er use case, validador Zod para query params, 1 ruta (`GET /me/delivery-sessions`)
- **5.4 añadió**: 4to use case, nuevo validador, 1 ruta (`GET /me/items`)
- **Esta historia (5.5) añade**: 5to use case, nuevo validador, 1 ruta (`GET /me/requests`)

**null-guard obligatorio**: Todos los métodos del controlador usan el patrón establecido en 5.2:
```typescript
if (!req.currentUser) { next(new UnauthorizedException()); return; }
```

### Estado actual de archivos a modificar

**`src/domain/repositories/user.repository.ts`** — estado post-5.4 (leer el archivo antes de modificar):
```typescript
import { User } from '../entities/user.entity';

export interface CreateUserInput { email, passwordHash, postalCode, lat, lon }

export interface ReputationEventRecord {
  id: string; type: 'delivery_completed' | 'no_show'; delta: number;
  sessionId: string | null; createdAt: Date;
}

export interface UserDeliverySessionRecord {
  id: string; itemId: string; itemTitle: string; role: 'donor' | 'receiver';
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  deadlineAt: Date; createdAt: Date; completedAt: Date | null;
}

export interface FindMyDeliverySessionsInput {
  userId: string; role?: 'donor' | 'receiver';
  status?: 'active' | 'completed' | 'cancelled' | 'expired';
  page: number; limit: number;
}

export interface UserItemRecord {
  id: string; title: string;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  status: 'active' | 'reserved' | 'completed' | 'cancelled';
  degradedAt: Date | null; imagePaths: string[];
  createdAt: Date; completedAt: Date | null;
}

export interface FindMyItemsInput {
  userId: string; status?: 'active' | 'reserved' | 'completed' | 'cancelled';
  page: number; limit: number;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  findReputationHistory(userId: string): Promise<ReputationEventRecord[]>;
  findMyDeliverySessions(input: FindMyDeliverySessionsInput): Promise<{ sessions: UserDeliverySessionRecord[]; total: number }>;
  findMyItems(input: FindMyItemsInput): Promise<{ items: UserItemRecord[]; total: number }>;
  // ← añadir aquí: UserRequestRecord + FindMyRequestsInput + findMyRequests
}
```

Añadir antes de `IUserRepository`:
```typescript
export interface UserRequestRecord {
  id: string;
  itemId: string;
  itemTitle: string;
  itemStatus: 'active' | 'reserved' | 'completed' | 'cancelled';
  status: 'pending' | 'selected' | 'rejected' | 'cancelled';
  createdAt: Date;
}

export interface FindMyRequestsInput {
  userId: string;
  status?: 'pending' | 'selected' | 'rejected' | 'cancelled';
  page: number;
  limit: number;
}
```

Y en `IUserRepository`:
```typescript
findMyRequests(input: FindMyRequestsInput): Promise<{ requests: UserRequestRecord[]; total: number }>;
```

**`src/infrastructure/database/supabase/user.repository.ts`** — estado post-5.4 (leer el archivo antes de modificar).

Import a actualizar:
```typescript
import {
  IUserRepository, CreateUserInput, ReputationEventRecord,
  UserDeliverySessionRecord, FindMyDeliverySessionsInput,
  UserItemRecord, FindMyItemsInput,
  UserRequestRecord, FindMyRequestsInput,   // ← NUEVOS
} from '../../../domain/repositories/user.repository';
```

**`src/interfaces/http/controllers/user.controller.ts`** — estado post-5.4:
```typescript
import { GetPrivateProfileUseCase } from '...';
import { GetReputationHistoryUseCase } from '...';
import { GetMyDeliverySessionsUseCase } from '...';
import { GetMyItemsUseCase } from '...';
import { GetMyRequestsUseCase } from '...';  // ← NUEVO
import { UnauthorizedException } from '...';

export class UserController {
  constructor(
    private readonly getPrivateProfileUseCase: GetPrivateProfileUseCase,
    private readonly getReputationHistoryUseCase: GetReputationHistoryUseCase,
    private readonly getMyDeliverySessionsUseCase: GetMyDeliverySessionsUseCase,
    private readonly getMyItemsUseCase: GetMyItemsUseCase,
    private readonly getMyRequestsUseCase: GetMyRequestsUseCase,  // ← NUEVO
  ) {}

  // getPrivateProfile, getReputationHistory, getMyDeliverySessions, getMyItems — sin cambios

  async getMyRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.currentUser) { next(new UnauthorizedException()); return; }
      const result = await this.getMyRequestsUseCase.execute({
        userId: req.currentUser.id,
        status: req.query.status as 'pending' | 'selected' | 'rejected' | 'cancelled' | undefined,
        page: Number(req.query.page),
        limit: Number(req.query.limit),
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
```

**`src/interfaces/http/routes/users.routes.ts`** — estado post-5.5:
```typescript
// Imports existentes + nuevos:
import { GetMyRequestsUseCase } from '../../../application/use-cases/user/get-my-requests.use-case';
import { validateListMyRequestsQuery } from '../../validators/list-my-requests.validator';

export function createUserRouter(deps: UserRouterDeps = {}): Router {
  // ... setup existente (jwtService, userRepo, authMiddleware, getPrivateProfileUseCase, etc.) ...
  const getMyRequestsUseCase = new GetMyRequestsUseCase(userRepo);
  const controller = new UserController(
    getPrivateProfileUseCase,
    getReputationHistoryUseCase,
    getMyDeliverySessionsUseCase,
    getMyItemsUseCase,
    getMyRequestsUseCase,            // ← 5to argumento
  );

  // Rutas existentes sin cambios
  router.get('/me/requests', authMiddleware, validateListMyRequestsQuery,
    (req, res, next) => controller.getMyRequests(req, res, next));

  return router;
}
```

### Código completo de los archivos nuevos

**`src/interfaces/validators/list-my-requests.validator.ts`:**
```typescript
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

const listMyRequestsSchema = z.object({
  status: z.enum(['pending', 'selected', 'rejected', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function validateListMyRequestsQuery(req: Request, res: Response, next: NextFunction): void {
  const result = listMyRequestsSchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid query parameters', errors: result.error.issues });
    return;
  }
  req.query = result.data as unknown as typeof req.query;
  next();
}
```

**`src/application/dtos/get-my-requests.dto.ts`:**
```typescript
export interface MyRequestDto {
  id: string;
  itemId: string;
  itemTitle: string;
  itemStatus: 'active' | 'reserved' | 'completed' | 'cancelled';
  status: 'pending' | 'selected' | 'rejected' | 'cancelled';
  createdAt: Date;
}

export interface GetMyRequestsRequestDto {
  userId: string;
  status?: 'pending' | 'selected' | 'rejected' | 'cancelled';
  page: number;
  limit: number;
}

export interface GetMyRequestsResponseDto {
  requests: MyRequestDto[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

**`src/application/use-cases/user/get-my-requests.use-case.ts`:**
```typescript
import { IUserRepository, FindMyRequestsInput } from '../../../domain/repositories/user.repository';
import { GetMyRequestsRequestDto, GetMyRequestsResponseDto } from '../../dtos/get-my-requests.dto';

export class GetMyRequestsUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(dto: GetMyRequestsRequestDto): Promise<GetMyRequestsResponseDto> {
    const input: FindMyRequestsInput = {
      userId: dto.userId,
      status: dto.status,
      page: dto.page,
      limit: dto.limit,
    };
    const { requests, total } = await this.userRepo.findMyRequests(input);
    return {
      requests: requests.map(r => ({
        id: r.id,
        itemId: r.itemId,
        itemTitle: r.itemTitle,
        itemStatus: r.itemStatus,
        status: r.status,
        createdAt: r.createdAt,
      })),
      pagination: {
        total,
        page: dto.page,
        limit: dto.limit,
        totalPages: Math.ceil(total / dto.limit),
      },
    };
  }
}
```

### Implementación en `PostgresUserRepository`

Añadir al final de la clase (después de `findMyItems`). Seguir el patrón idéntico de params dinámicos de `findMyDeliverySessions` y `findMyItems`.

```typescript
async findMyRequests(input: FindMyRequestsInput): Promise<{ requests: UserRequestRecord[]; total: number }> {
  const { userId, status, page, limit } = input;
  const params: unknown[] = [userId];

  let statusCondition = '';
  if (status) {
    params.push(status);
    statusCondition = `AND ir.status = $${params.length}`;
  }

  const countResult = await this.db.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM item_requests ir
     WHERE ir.requester_id = $1 ${statusCondition}`,
    params,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  params.push(limit, offset);

  const result = await this.db.query<{
    id: string;
    item_id: string;
    item_title: string;
    item_status: 'active' | 'reserved' | 'completed' | 'cancelled';
    status: 'pending' | 'selected' | 'rejected' | 'cancelled';
    created_at: Date;
  }>(
    `SELECT
       ir.id,
       ir.item_id,
       i.title  AS item_title,
       i.status AS item_status,
       ir.status,
       ir.created_at
     FROM item_requests ir
     JOIN items i ON i.id = ir.item_id
     WHERE ir.requester_id = $1 ${statusCondition}
     ORDER BY ir.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    requests: result.rows.map(row => ({
      id: row.id,
      itemId: row.item_id,
      itemTitle: row.item_title,
      itemStatus: row.item_status,
      status: row.status,
      createdAt: row.created_at,
    })),
    total,
  };
}
```

### Estructura del test

```typescript
// tests/users-requests.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUserRouter } from '../src/interfaces/http/routes/users.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { UserRequestRecord } from '../src/domain/repositories/user.repository';

const USER_UUID = '550e8400-e29b-41d4-a716-446655440000';

const mockUser = {
  id: USER_UUID,
  email: 'user@example.com',
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

const mockRequest: UserRequestRecord = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  itemId: 'cccccccc-dddd-4eee-8fff-000000000000',
  itemTitle: 'Mesa de madera',
  itemStatus: 'active',
  status: 'pending',
  createdAt: new Date('2026-05-01T10:00:00.000Z'),
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
      findById: vi.fn().mockResolvedValue(mockUser),
      create: vi.fn(),
      findReputationHistory: vi.fn().mockResolvedValue([]),
      findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
      findMyItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findMyRequests: vi.fn().mockResolvedValue({ requests: [mockRequest], total: 1 }),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/users', createUserRouter(deps));
  app.use(errorHandler);
  return { app, userRepo: deps.userRepo };
}

describe('GET /users/me/requests', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('25.1 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/users/me/requests');
    expect(res.status).toBe(401);
  });

  it('25.2 — sin filtros → 200 con requests y pagination', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/requests')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('requests');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
  });

  it('25.3 — status=pending → llama findMyRequests con status pending', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .get('/users/me/requests?status=pending')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(userRepo.findMyRequests).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
    );
  });

  it('25.4 — status=selected → llama findMyRequests con status selected', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .get('/users/me/requests?status=selected')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(userRepo.findMyRequests).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'selected' }),
    );
  });

  it('25.5 — limit=51 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/requests?limit=51')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });
});
```

### Impacto en tests existentes

**IMPORTANTE:** El mock de `userRepo` en los tests anteriores debe incluir `findMyRequests`. Añadir a TODOS los objetos `userRepo` en:

- `tests/users-me.test.ts` — objeto `userRepo` en `defaultDeps`
- `tests/users-reputation-history.test.ts` — objeto `userRepo` en `defaultDeps`
- `tests/users-delivery-sessions.test.ts` — objeto `userRepo` en `defaultDeps`
- `tests/users-items.test.ts` — objeto `userRepo` en `defaultDeps` Y en el override de test 24.4

En todos los `defaultDeps.userRepo`, añadir:
```typescript
findMyRequests: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
```

En el override de test 24.4 en `tests/users-items.test.ts` (el objeto `userRepo` completo dentro del `buildTestApp({...})`), también añadir:
```typescript
findMyRequests: vi.fn().mockResolvedValue({ requests: [], total: 0 }),
```

### Schema de DB relevante

```sql
-- item_requests (migración 006)
CREATE TABLE IF NOT EXISTS item_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES items(id),
  requester_id UUID NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','selected','rejected','cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, requester_id)
);

CREATE INDEX IF NOT EXISTS idx_requests_requester_date
  ON item_requests(requester_id, created_at);

-- items (referencia para el JOIN)
-- i.id, i.title, i.status
```

**Nota**: El índice `idx_requests_requester_date` ya existe en `(requester_id, created_at)` — el filtro por `requester_id = $1` y el ORDER BY `created_at DESC` son eficientes sin cambios de schema.

### Regresiones a verificar

- Tests de `users-me.test.ts`, `users-reputation-history.test.ts`, `users-delivery-sessions.test.ts` y `users-items.test.ts` deben seguir pasando con los mocks actualizados.
- El resto de tests del proyecto no se ven afectados.
- Correr `vitest run` después de implementar para confirmar cero regresiones.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

Implementación completada el 2026-05-19. Se añadieron `UserRequestRecord` y `FindMyRequestsInput` a la interfaz de dominio. Se implementó `findMyRequests` en `PostgresUserRepository` con JOIN a `items` para obtener `item_title` e `item_status`, filtro dinámico de `status` via params, paginación con COUNT separado e índices explícitos para LIMIT/OFFSET. Se creó el validador Zod siguiendo el patrón de `list-my-items.validator.ts`. Se creó el DTO y use case correspondientes. Se extendió `UserController` con null-guard explícito y fallbacks `|| 1` / `|| 20` para page/limit. Se extendió `users.routes.ts` siguiendo el patrón incremental de la Épica 5. Se actualizaron los mocks en `users-me.test.ts`, `users-reputation-history.test.ts`, `users-delivery-sessions.test.ts` y `users-items.test.ts`. Suite completa: 188 tests, 0 regresiones.

### File List

- `src/domain/repositories/user.repository.ts` (modificado)
- `src/infrastructure/database/supabase/user.repository.ts` (modificado)
- `src/application/dtos/get-my-requests.dto.ts` (nuevo)
- `src/application/use-cases/user/get-my-requests.use-case.ts` (nuevo)
- `src/interfaces/validators/list-my-requests.validator.ts` (nuevo)
- `src/interfaces/http/controllers/user.controller.ts` (modificado)
- `src/interfaces/http/routes/users.routes.ts` (modificado)
- `tests/users-requests.test.ts` (nuevo)
- `tests/users-me.test.ts` (modificado — mocks actualizados)
- `tests/users-reputation-history.test.ts` (modificado — mocks actualizados)
- `tests/users-delivery-sessions.test.ts` (modificado — mocks actualizados)
- `tests/users-items.test.ts` (modificado — mocks actualizados)

### Change Log

- 2026-05-19: Implementación de historia 5.5 — endpoint `GET /users/me/requests` con filtro por status, JOIN a items para title/status, paginación y 5 tests (25.1–25.5). 188 tests totales, 0 regresiones.
