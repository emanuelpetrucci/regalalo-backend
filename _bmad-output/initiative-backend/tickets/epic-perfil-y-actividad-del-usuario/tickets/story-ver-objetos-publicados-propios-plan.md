---
title: "Ver objetos publicados propios"
type: feature
ticket: 4
status: done
created: 2026-10-25
---

# Historia 5.4: Ver objetos publicados propios

Status: done

## Historia

Como donante autenticado,
quiero ver todos los objetos que publiqué con filtro por estado,
para gestionar mi actividad como donante.

## Acceptance Criteria

1. **Dado** que envío `GET /users/me/items` con autenticación válida, **cuando** el servidor procesa la petición, **entonces** responde `200` con `{ items: [{ id, title, condition, status, degradedAt, images, createdAt, completedAt }], pagination }`.

2. **Dado** que envío `GET /users/me/items?status=active`, **cuando** el servidor procesa la petición, **entonces** solo se retornan objetos en estado `active`.

3. **Dado** que un objeto tiene `status IN ('completed','cancelled')` y `completed_at < NOW() - 30 días`, **cuando** aparece en la respuesta, **entonces** el campo `images` se retorna como `[]` aunque el job de purga aún no haya ejecutado (FR34).

4. **Dado** que envío parámetros de paginación inválidos (ej. `limit=51` o `page=0`), **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request`.

5. **Dado** que envío la petición sin autenticación, **cuando** el servidor procesa la petición, **entonces** responde `401 Unauthorized`.

## Tasks / Subtasks

- [x] Task 1: Añadir `UserItemRecord`, `FindMyItemsInput` y `findMyItems()` a `IUserRepository` (AC: #1, #2, #3)
  - [x] En `src/domain/repositories/user.repository.ts`: añadir interfaz `UserItemRecord` con campos `id`, `title`, `condition`, `status`, `degradedAt`, `imagePaths`, `createdAt`, `completedAt`
  - [x] Añadir interfaz `FindMyItemsInput` con `userId`, `status?`, `page`, `limit`
  - [x] Añadir `findMyItems(input: FindMyItemsInput): Promise<{ items: UserItemRecord[]; total: number }>` a `IUserRepository`

- [x] Task 2: Implementar `findMyItems()` en `PostgresUserRepository` (AC: #1, #2, #3)
  - [x] En `src/infrastructure/database/supabase/user.repository.ts`: añadir método `findMyItems`
  - [x] Query con CASE WHEN para FR34 (images vacío si completado/cancelado > 30 días), filtro opcional de `status`, paginación con COUNT separado
  - [x] Actualizar import desde el repositorio de dominio

- [x] Task 3: Crear validador `list-my-items.validator.ts` (AC: #4)
  - [x] Crear `src/interfaces/validators/list-my-items.validator.ts`
  - [x] Schema Zod: `status` enum opcional `['active','reserved','completed','cancelled']`, `page` coerce number min 1 default 1, `limit` coerce number min 1 max 50 default 20
  - [x] Exportar `validateListMyItemsQuery` siguiendo el patrón de `list-items.validator.ts`

- [x] Task 4: Crear DTO y use case `GetMyItemsUseCase` (AC: #1, #2, #3)
  - [x] Crear `src/application/dtos/get-my-items.dto.ts` con `MyItemDto`, `GetMyItemsRequestDto` y `GetMyItemsResponseDto`
  - [x] Crear `src/application/use-cases/user/get-my-items.use-case.ts`
  - [x] Constructor: `(userRepo: IUserRepository)`. `execute(input)` llama `findMyItems`, mapea a DTO (campo `images` ← `imagePaths`)

- [x] Task 5: Extender `UserController` con `getMyItems` (AC: #1–#5)
  - [x] En `src/interfaces/http/controllers/user.controller.ts`: añadir `GetMyItemsUseCase` como 4to parámetro del constructor
  - [x] Añadir método `getMyItems(req, res, next)` con null-guard `!req.currentUser`, extrae `status`, `page`, `limit` de `req.query`, responde `200`

- [x] Task 6: Extender `users.routes.ts` con `GET /me/items` (AC: #1–#5)
  - [x] En `src/interfaces/http/routes/users.routes.ts`: importar `GetMyItemsUseCase` y `validateListMyItemsQuery`
  - [x] Instanciar `getMyItemsUseCase` y añadirlo como 4to argumento del constructor de `UserController`
  - [x] Añadir ruta `GET /me/items` con `authMiddleware`, `validateListMyItemsQuery`

- [x] Task 7: Escribir tests (AC: #1–#5)
  - [x] Crear `tests/users-items.test.ts`
  - [x] Test 24.1: sin auth → 401
  - [x] Test 24.2: sin filtros → 200 con `items` y `pagination`
  - [x] Test 24.3: `status=active` → llama `findMyItems` con status active
  - [x] Test 24.4: FR34 — objeto purgado → `images: []`
  - [x] Test 24.5: `limit=51` → 400
  - [x] Actualizar mocks en `tests/users-me.test.ts`, `tests/users-reputation-history.test.ts` y `tests/users-delivery-sessions.test.ts` para incluir `findMyItems`

---

## Notas para el Dev Agent

### Contexto de la Épica 5: patrón incremental

`UserController` y `users.routes.ts` se extienden historia a historia — NUNCA reescribir desde cero:
- **5.1 creó**: constructor con 1 use case, 1 ruta (`GET /me`)
- **5.2 añadió**: 2do use case, 1 ruta (`GET /me/reputation-history`), null-guard establecido en ambos métodos
- **5.3 añadió**: 3er use case, validador Zod para query params, 1 ruta (`GET /me/delivery-sessions`)
- **Esta historia (5.4) añade**: 4to use case, nuevo validador, 1 ruta (`GET /me/items`)

**null-guard obligatorio**: Todos los métodos del controlador usan el patrón establecido en 5.2:
```typescript
if (!req.currentUser) { next(new UnauthorizedException()); return; }
```

### Estado actual de archivos a modificar

**`src/domain/repositories/user.repository.ts`** — estado post-5.3:
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

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  findReputationHistory(userId: string): Promise<ReputationEventRecord[]>;
  findMyDeliverySessions(input: FindMyDeliverySessionsInput): Promise<{ sessions: UserDeliverySessionRecord[]; total: number }>;
  // ← añadir aquí: UserItemRecord + FindMyItemsInput + findMyItems
}
```

Añadir antes de `IUserRepository`:
```typescript
export interface UserItemRecord {
  id: string;
  title: string;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  status: 'active' | 'reserved' | 'completed' | 'cancelled';
  degradedAt: Date | null;
  imagePaths: string[];
  createdAt: Date;
  completedAt: Date | null;
}

export interface FindMyItemsInput {
  userId: string;
  status?: 'active' | 'reserved' | 'completed' | 'cancelled';
  page: number;
  limit: number;
}
```

Y en `IUserRepository`:
```typescript
findMyItems(input: FindMyItemsInput): Promise<{ items: UserItemRecord[]; total: number }>;
```

**`src/interfaces/http/controllers/user.controller.ts`** — estado post-5.3 (3 use cases, null-guard en todos):
```typescript
import { GetPrivateProfileUseCase } from '...';
import { GetReputationHistoryUseCase } from '...';
import { GetMyDeliverySessionsUseCase } from '...';
import { GetMyItemsUseCase } from '...';  // ← NUEVO
import { UnauthorizedException } from '...';

export class UserController {
  constructor(
    private readonly getPrivateProfileUseCase: GetPrivateProfileUseCase,
    private readonly getReputationHistoryUseCase: GetReputationHistoryUseCase,
    private readonly getMyDeliverySessionsUseCase: GetMyDeliverySessionsUseCase,
    private readonly getMyItemsUseCase: GetMyItemsUseCase,  // ← NUEVO
  ) {}

  // getPrivateProfile, getReputationHistory, getMyDeliverySessions — sin cambios

  async getMyItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.currentUser) { next(new UnauthorizedException()); return; }
      const result = await this.getMyItemsUseCase.execute({
        userId: req.currentUser.id,
        status: req.query.status as 'active' | 'reserved' | 'completed' | 'cancelled' | undefined,
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

**`src/interfaces/http/routes/users.routes.ts`** — estado post-5.4:
```typescript
// Imports existentes + nuevos:
import { GetMyItemsUseCase } from '../../../application/use-cases/user/get-my-items.use-case';
import { validateListMyItemsQuery } from '../../validators/list-my-items.validator';

export function createUserRouter(deps: UserRouterDeps = {}): Router {
  // ... setup existente ...
  const getMyItemsUseCase = new GetMyItemsUseCase(userRepo);
  const controller = new UserController(
    getPrivateProfileUseCase,
    getReputationHistoryUseCase,
    getMyDeliverySessionsUseCase,
    getMyItemsUseCase,            // ← 4to argumento
  );

  // Rutas existentes (GET /me, /me/reputation-history, /me/delivery-sessions) sin cambios
  router.get('/me/items', authMiddleware, validateListMyItemsQuery,
    (req, res, next) => controller.getMyItems(req, res, next));

  return router;
}
```

### Código completo de los archivos nuevos

**`src/interfaces/validators/list-my-items.validator.ts`:**
```typescript
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

const listMyItemsSchema = z.object({
  status: z.enum(['active', 'reserved', 'completed', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function validateListMyItemsQuery(req: Request, res: Response, next: NextFunction): void {
  const result = listMyItemsSchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid query parameters', errors: result.error.issues });
    return;
  }
  req.query = result.data as unknown as typeof req.query;
  next();
}
```

**`src/application/dtos/get-my-items.dto.ts`:**
```typescript
export interface MyItemDto {
  id: string;
  title: string;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  status: 'active' | 'reserved' | 'completed' | 'cancelled';
  degradedAt: Date | null;
  images: string[];
  createdAt: Date;
  completedAt: Date | null;
}

export interface GetMyItemsRequestDto {
  userId: string;
  status?: 'active' | 'reserved' | 'completed' | 'cancelled';
  page: number;
  limit: number;
}

export interface GetMyItemsResponseDto {
  items: MyItemDto[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

**`src/application/use-cases/user/get-my-items.use-case.ts`:**
```typescript
import { IUserRepository, FindMyItemsInput } from '../../../domain/repositories/user.repository';
import { GetMyItemsRequestDto, GetMyItemsResponseDto } from '../../dtos/get-my-items.dto';

export class GetMyItemsUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(dto: GetMyItemsRequestDto): Promise<GetMyItemsResponseDto> {
    const input: FindMyItemsInput = {
      userId: dto.userId,
      status: dto.status,
      page: dto.page,
      limit: dto.limit,
    };
    const { items, total } = await this.userRepo.findMyItems(input);
    return {
      items: items.map(item => ({
        id: item.id,
        title: item.title,
        condition: item.condition,
        status: item.status,
        degradedAt: item.degradedAt,
        images: item.imagePaths,
        createdAt: item.createdAt,
        completedAt: item.completedAt,
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

Añadir al final de la clase (después de `findMyDeliverySessions`, antes de `private mapRow`). Importar también los nuevos tipos:

```typescript
import {
  IUserRepository, CreateUserInput, ReputationEventRecord,
  UserDeliverySessionRecord, FindMyDeliverySessionsInput,
  UserItemRecord, FindMyItemsInput,              // ← NUEVO
} from '../../../domain/repositories/user.repository';
```

```typescript
async findMyItems(input: FindMyItemsInput): Promise<{ items: UserItemRecord[]; total: number }> {
  const { userId, status, page, limit } = input;
  const params: unknown[] = [userId];

  let statusCondition = '';
  if (status) {
    params.push(status);
    statusCondition = `AND i.status = $${params.length}`;
  }

  const countResult = await this.db.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM items i WHERE i.donor_id = $1 ${statusCondition}`,
    params,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  params.push(limit, offset);

  const result = await this.db.query<{
    id: string;
    title: string;
    condition: 'new' | 'like_new' | 'good' | 'fair';
    status: 'active' | 'reserved' | 'completed' | 'cancelled';
    degraded_at: Date | null;
    image_paths: string[];
    created_at: Date;
    completed_at: Date | null;
  }>(
    `SELECT
       i.id,
       i.title,
       i.condition,
       i.status,
       i.degraded_at,
       CASE
         WHEN i.status IN ('completed','cancelled')
          AND COALESCE(i.completed_at, NOW()) < NOW() - INTERVAL '30 days'
         THEN ARRAY[]::text[]
         ELSE COALESCE(
           (SELECT ARRAY_AGG(ii.storage_path ORDER BY ii.created_at)
            FROM item_images ii
            WHERE ii.item_id = i.id),
           ARRAY[]::text[]
         )
       END AS image_paths,
       i.created_at,
       i.completed_at
     FROM items i
     WHERE i.donor_id = $1 ${statusCondition}
     ORDER BY i.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    items: result.rows.map(row => ({
      id: row.id,
      title: row.title,
      condition: row.condition,
      status: row.status,
      degradedAt: row.degraded_at,
      imagePaths: row.image_paths,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    })),
    total,
  };
}
```

**CRÍTICO — FR34:** El CASE WHEN en SQL es el mismo patrón que usa `findById` en `src/infrastructure/database/supabase/item.repository.ts` (líneas ~199–209). No reinventar — usar `COALESCE(i.completed_at, NOW())` para manejar el caso donde `completed_at` es NULL.

### Estructura del test

```typescript
// tests/users-items.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUserRouter } from '../src/interfaces/http/routes/users.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { UserItemRecord } from '../src/domain/repositories/user.repository';

const USER_UUID = '550e8400-e29b-41d4-a716-446655440000';

const mockUser = {
  id: USER_UUID, email: 'user@example.com', passwordHash: '$argon2id$...',
  postalCode: '28001', reputationScore: 10, totalReceived: 1, totalDonated: 1,
  consecutiveNoShows: 0, cyclesAtLimit: 0, lastCycleIncrementedAt: null,
  jwtVersion: 1, createdAt: new Date('2026-01-01T00:00:00.000Z'), lastActiveAt: null,
};

const mockActiveItem: UserItemRecord = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  title: 'Mesa de madera',
  condition: 'good',
  status: 'active',
  degradedAt: null,
  imagePaths: ['items/abc/photo1.webp'],
  createdAt: new Date('2026-05-01T10:00:00.000Z'),
  completedAt: null,
};

const mockPurgedItem: UserItemRecord = {
  id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
  title: 'Silla vieja',
  condition: 'fair',
  status: 'completed',
  degradedAt: null,
  imagePaths: [],  // ya purgado (retornado vacío por el CASE WHEN SQL)
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  completedAt: new Date('2026-01-15T10:00:00.000Z'),
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
      findMyItems: vi.fn().mockResolvedValue({ items: [mockActiveItem], total: 1 }),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/users', createUserRouter(deps));
  app.use(errorHandler);
  return { app, userRepo: deps.userRepo };
}

describe('GET /users/me/items', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('24.1 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/users/me/items');
    expect(res.status).toBe(401);
  });

  it('24.2 — sin filtros → 200 con items y pagination', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/items')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
  });

  it('24.3 — status=active → llama findMyItems con status active', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .get('/users/me/items?status=active')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(userRepo.findMyItems).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('24.4 — objeto purgado → images retorna []', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockResolvedValue(mockUser),
        create: vi.fn(),
        findReputationHistory: vi.fn().mockResolvedValue([]),
        findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
        findMyItems: vi.fn().mockResolvedValue({ items: [mockPurgedItem], total: 1 }),
      },
    });
    const res = await request(app)
      .get('/users/me/items')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.items[0].images).toEqual([]);
  });

  it('24.5 — limit=51 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/items?limit=51')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });
});
```

### Impacto en tests existentes

**IMPORTANTE:** El mock de `userRepo` en los tests anteriores debe incluir `findMyItems`. Añadir a TODOS los objetos `userRepo` en:

- `tests/users-me.test.ts` — 4 objetos `userRepo` (default + 2 overrides)
- `tests/users-reputation-history.test.ts` — 2 objetos `userRepo`
- `tests/users-delivery-sessions.test.ts` — 2 objetos `userRepo`

En todos, añadir:
```typescript
findMyItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
```

### Schema de DB relevante

```sql
CREATE TABLE items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id     UUID NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  condition    TEXT NOT NULL CHECK (condition IN ('new','like_new','good','fair')),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','reserved','completed','cancelled')),
  requests_paused BOOLEAN NOT NULL DEFAULT FALSE,
  degraded_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reserved_at  TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE item_images (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Regresiones a verificar

- Tests de `users-me.test.ts`, `users-reputation-history.test.ts` y `users-delivery-sessions.test.ts` deben seguir pasando con los mocks actualizados.
- El resto de tests del proyecto no se ven afectados.
- Correr `vitest run` después de implementar para confirmar cero regresiones.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

Implementación completada el 2026-05-19. Se añadieron `UserItemRecord` y `FindMyItemsInput` a la interfaz de dominio. Se implementó `findMyItems` en `PostgresUserRepository` con query SQL dinámica (filtro opcional de status, CASE WHEN para FR34 — images vacío si completado/cancelado hace más de 30 días, subquery ARRAY_AGG para imágenes, índices explícitos de LIMIT/OFFSET). Se creó el validador Zod con coerción y defaults. Se creó el DTO y use case correspondiente. Se extendió `UserController` con null-guard explícito en `getMyItems`. Se extendió `users.routes.ts` siguiendo el patrón incremental de la Épica 5. Se actualizaron los mocks en `users-me.test.ts`, `users-reputation-history.test.ts` y `users-delivery-sessions.test.ts`. Suite completa: 181 tests, 0 regresiones.

### File List

- `src/domain/repositories/user.repository.ts` (modificado)
- `src/infrastructure/database/supabase/user.repository.ts` (modificado)
- `src/application/dtos/get-my-items.dto.ts` (nuevo)
- `src/application/use-cases/user/get-my-items.use-case.ts` (nuevo)
- `src/interfaces/validators/list-my-items.validator.ts` (nuevo)
- `src/interfaces/http/controllers/user.controller.ts` (modificado)
- `src/interfaces/http/routes/users.routes.ts` (modificado)
- `tests/users-items.test.ts` (nuevo)
- `tests/users-me.test.ts` (modificado — mocks actualizados)
- `tests/users-reputation-history.test.ts` (modificado — mocks actualizados)
- `tests/users-delivery-sessions.test.ts` (modificado — mocks actualizados)

## Change Log

- 2026-05-19: Implementación de historia 5.4 — endpoint `GET /users/me/items` con filtro por status, FR34 CASE WHEN para purga de imágenes, paginación y 5 tests (24.1–24.5). 181 tests totales, 0 regresiones.

### Review Findings

- [x] [Review][Patch] Controller re-parsea query con Number() en vez de confiar en la salida del validador — riesgo de NaN si el middleware es salteado [src/interfaces/http/controllers/user.controller.ts:68-71]
- [x] [Review][Patch] Falta test para page=0 → 400 (AC4 nombra explícitamente page=0 como ejemplo) [tests/users-items.test.ts]
- [x] [Review][Patch] Falta test para limit=0 → 400 (Task 3 especifica min 1; solo se cubre el límite superior) [tests/users-items.test.ts]
- [x] [Review][Defer] Test 24.4 prueba solo el mapeo DTO, no la lógica SQL CASE WHEN de FR34 [tests/users-items.test.ts] — diferido, patrón pre-existente (tests unitarios sin DB real)
- [x] [Review][Defer] TOCTOU: COUNT y SELECT corren en queries separadas sin transacción [src/infrastructure/database/supabase/user.repository.ts] — diferido, pre-existente en findMyDeliverySessions
- [x] [Review][Defer] Sin cota superior en page — OFFSET arbitrariamente grande posible [src/interfaces/validators/list-my-items.validator.ts] — diferido, pre-existente en findMyDeliverySessions
- [x] [Review][Defer] Sin índice compuesto en (donor_id, status, created_at) — scan completo para donors con muchos items [migrations] — diferido, limitación pre-existente del schema
- [x] [Review][Defer] page > totalPages retorna 200 vacío sin error — diferido, consistente con findMyDeliverySessions
