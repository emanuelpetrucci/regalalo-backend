---
title: "Ver sesiones de entrega propias"
type: feature
ticket: 3
status: done
created: 2026-10-25
---

# Historia 5.3: Ver sesiones de entrega propias

Status: done

## Historia

Como usuario autenticado,
quiero poder ver mis sesiones de entrega como donante o receptor con filtros por rol y estado,
para hacer seguimiento de mis entregas activas e históricas.

## Acceptance Criteria

1. **Dado** que envío `GET /users/me/delivery-sessions` con autenticación válida, **cuando** el servidor procesa la petición, **entonces** responde `200` con `{ sessions: [{ id, itemId, itemTitle, role, status, deadlineAt, createdAt, completedAt, otherPartyUserId }], pagination }` **Y** el campo `contactChannel` no aparece en este listado **Y** `otherPartyUserId` es el UUID de la contraparte (`receiver_id` si el usuario es donante; `donor_id` si es receptor) — solo identificador, sin reputación ni distancia (eso vive en `GET /delivery-sessions/:id`, historia 4.1).

2. **Dado** que envío `GET /users/me/delivery-sessions?role=donor`, **cuando** el servidor procesa la petición, **entonces** solo se retornan sesiones donde el usuario es donante.

3. **Dado** que envío `GET /users/me/delivery-sessions?role=receiver`, **cuando** el servidor procesa la petición, **entonces** solo se retornan sesiones donde el usuario es receptor.

4. **Dado** que envío `GET /users/me/delivery-sessions?status=active`, **cuando** el servidor procesa la petición, **entonces** solo se retornan sesiones en estado `active`.

5. **Dado** que envío parámetros de paginación inválidos (ej. `limit=51` o `page=0`), **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request`.

6. **Dado** que envío la petición sin autenticación, **cuando** el servidor procesa la petición, **entonces** responde `401 Unauthorized`.

## Tasks / Subtasks

- [x] Task 1: Añadir `UserDeliverySessionRecord`, `FindMyDeliverySessionsInput` y `findMyDeliverySessions()` a `IUserRepository` (AC: #1, #2, #3, #4)
  - [x] En `src/domain/repositories/user.repository.ts`: añadir interfaz `UserDeliverySessionRecord` con campos `id`, `itemId`, `itemTitle`, `role`, `status`, `deadlineAt`, `createdAt`, `completedAt`, `otherPartyUserId`
  - [x] Añadir interfaz `FindMyDeliverySessionsInput` con `userId`, `role?`, `status?`, `page`, `limit`
  - [x] Añadir `findMyDeliverySessions(input: FindMyDeliverySessionsInput): Promise<{ sessions: UserDeliverySessionRecord[]; total: number }>` a `IUserRepository`

- [x] Task 2: Implementar `findMyDeliverySessions()` en `PostgresUserRepository` (AC: #1, #2, #3, #4)
  - [x] En `src/infrastructure/database/supabase/user.repository.ts`: añadir método `findMyDeliverySessions`
  - [x] Query con JOIN a `items` para obtener `item_title`, `CASE` para `other_party_user_id` (contraparte), condiciones dinámicas para `role` y `status`, paginación con COUNT separado
  - [x] Importar los nuevos tipos desde el repositorio de dominio

- [x] Task 3: Crear validador `list-my-delivery-sessions.validator.ts` (AC: #5)
  - [x] Crear `src/interfaces/validators/list-my-delivery-sessions.validator.ts`
  - [x] Schema Zod: `role` enum opcional `['donor','receiver']`, `status` enum opcional `['active','completed','cancelled','expired']`, `page` coerce number min 1 default 1, `limit` coerce number min 1 max 50 default 20
  - [x] Exportar `validateListMyDeliverySessionsQuery` siguiendo el mismo patrón que `list-items.validator.ts`

- [x] Task 4: Crear DTO y use case `GetMyDeliverySessionsUseCase` (AC: #1, #2, #3, #4)
  - [x] Crear `src/application/dtos/get-my-delivery-sessions.dto.ts` con `MyDeliverySessionDto`, `GetMyDeliverySessionsRequestDto` y `GetMyDeliverySessionsResponseDto`
  - [x] Crear `src/application/use-cases/user/get-my-delivery-sessions.use-case.ts`
  - [x] Constructor: `(userRepo: IUserRepository)`. `execute(input)` llama `findMyDeliverySessions`, mapea a DTO

- [x] Task 5: Extender `UserController` con `getMyDeliverySessions` (AC: #1, #2, #3, #4, #5, #6)
  - [x] En `src/interfaces/http/controllers/user.controller.ts`: añadir `GetMyDeliverySessionsUseCase` como 3er parámetro del constructor
  - [x] Añadir método `getMyDeliverySessions(req, res, next)`: extrae `role`, `status`, `page`, `limit` de `req.query`, llama `execute`, responde `200`

- [x] Task 6: Extender `users.routes.ts` con `GET /me/delivery-sessions` (AC: #1, #2, #3, #4, #5, #6)
  - [x] En `src/interfaces/http/routes/users.routes.ts`: importar `GetMyDeliverySessionsUseCase` y `validateListMyDeliverySessionsQuery`
  - [x] Instanciar `getMyDeliverySessionsUseCase` dentro del factory y añadirlo al constructor del `UserController`
  - [x] Añadir ruta `GET /me/delivery-sessions` con `authMiddleware`, `validateListMyDeliverySessionsQuery`
  - [x] **Sin** `validateUuidParam` — es ruta literal

- [x] Task 7: Escribir tests (AC: #1, #2, #3, #4, #5, #6)
  - [x] Crear `tests/users-delivery-sessions.test.ts`
  - [x] Test 23.1: sin auth → 401
  - [x] Test 23.2: sin filtros → 200 con `sessions`, `pagination` y `otherPartyUserId` en cada sesión
  - [x] Test 23.3: `role=donor` → solo sesiones como donante
  - [x] Test 23.4: `role=receiver` → solo sesiones como receptor
  - [x] Test 23.5: `status=active` → solo sesiones activas
  - [x] Test 23.6: `limit=51` → 400
  - [x] Actualizar mocks en `tests/users-me.test.ts` y `tests/users-reputation-history.test.ts` para incluir `findMyDeliverySessions`

### Review Findings

- [x] [Review][Patch] Índices LIMIT/OFFSET frágiles via `params.length - 1` / `params.length` [src/infrastructure/database/supabase/user.repository.ts]
- [x] [Review][Defer] COUNT/SELECT sin transacción — TOCTOU en paginación [src/infrastructure/database/supabase/user.repository.ts] — deferred, pre-existing
- [x] [Review][Defer] Sin cota superior en `page` — valores grandes devuelven vacío sin error [src/interfaces/validators/list-my-delivery-sessions.validator.ts] — deferred, pre-existing
- [x] [Review][Defer] `buildTestApp` shallow spread — overrides parciales de `userRepo` rompen el mock [tests/users-delivery-sessions.test.ts] — deferred, pre-existing

---

## Notas para el Dev Agent

### Contexto de la Épica 5: patrón incremental

`UserController` y `users.routes.ts` se extienden historia a historia — NUNCA reescribir desde cero:
- **5.1 creó**: constructor con 1 use case (`getPrivateProfileUseCase`), 1 ruta (`GET /me`)
- **5.2 añadió**: 2do use case (`getReputationHistoryUseCase`), 1 ruta (`GET /me/reputation-history`)
- **Esta historia (5.3) añade**: 3er use case (`getMyDeliverySessionsUseCase`), 1 ruta (`GET /me/delivery-sessions`)

### Estado actual de archivos a modificar

**`src/domain/repositories/user.repository.ts`** — estado post-5.2:
```typescript
import { User } from '../entities/user.entity';

export interface CreateUserInput { email, passwordHash, postalCode, lat, lon }

export interface ReputationEventRecord {
  id: string; type: 'delivery_completed' | 'no_show'; delta: number;
  sessionId: string | null; createdAt: Date;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  findReputationHistory(userId: string): Promise<ReputationEventRecord[]>;
  // ← añadir aquí: UserDeliverySessionRecord + FindMyDeliverySessionsInput + findMyDeliverySessions
}
```

Añadir antes de `IUserRepository`:
```typescript
export interface UserDeliverySessionRecord {
  id: string;
  itemId: string;
  itemTitle: string;
  role: 'donor' | 'receiver';
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  deadlineAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  otherPartyUserId: string;
}

export interface FindMyDeliverySessionsInput {
  userId: string;
  role?: 'donor' | 'receiver';
  status?: 'active' | 'completed' | 'cancelled' | 'expired';
  page: number;
  limit: number;
}
```

Y en `IUserRepository`:
```typescript
findMyDeliverySessions(input: FindMyDeliverySessionsInput): Promise<{ sessions: UserDeliverySessionRecord[]; total: number }>;
```

**`src/infrastructure/database/supabase/user.repository.ts`** — actualizar import y añadir método:

Import actualizado:
```typescript
import { IUserRepository, CreateUserInput, ReputationEventRecord, UserDeliverySessionRecord, FindMyDeliverySessionsInput } from '../../../domain/repositories/user.repository';
```

Método a añadir (después de `findReputationHistory`, antes de `private mapRow`):
```typescript
async findMyDeliverySessions(input: FindMyDeliverySessionsInput): Promise<{ sessions: UserDeliverySessionRecord[]; total: number }> {
  const { userId, role, status, page, limit } = input;
  const params: unknown[] = [userId];
  let roleCondition: string;

  if (role === 'donor') {
    roleCondition = 'ds.donor_id = $1';
  } else if (role === 'receiver') {
    roleCondition = 'ds.receiver_id = $1';
  } else {
    roleCondition = '(ds.donor_id = $1 OR ds.receiver_id = $1)';
  }

  let statusCondition = '';
  if (status) {
    params.push(status);
    statusCondition = `AND ds.status = $${params.length}`;
  }

  const countResult = await this.db.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM delivery_sessions ds
     WHERE ${roleCondition} ${statusCondition}`,
    params,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  params.push(limit, offset);

  const result = await this.db.query<{
    id: string;
    item_id: string;
    item_title: string;
    role: 'donor' | 'receiver';
    status: 'active' | 'completed' | 'cancelled' | 'expired';
    deadline_at: Date;
    created_at: Date;
    completed_at: Date | null;
    other_party_user_id: string;
  }>(
    `SELECT
       ds.id,
       ds.item_id,
       i.title AS item_title,
       CASE WHEN ds.donor_id = $1 THEN 'donor' ELSE 'receiver' END AS role,
       ds.status,
       ds.deadline_at,
       ds.created_at,
       ds.completed_at,
       CASE WHEN ds.donor_id = $1 THEN ds.receiver_id ELSE ds.donor_id END AS other_party_user_id
     FROM delivery_sessions ds
     JOIN items i ON i.id = ds.item_id
     WHERE ${roleCondition} ${statusCondition}
     ORDER BY ds.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    sessions: result.rows.map(row => ({
      id: row.id,
      itemId: row.item_id,
      itemTitle: row.item_title,
      role: row.role,
      status: row.status,
      deadlineAt: row.deadline_at,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      otherPartyUserId: row.other_party_user_id,
    })),
    total,
  };
}
```

**`src/interfaces/http/controllers/user.controller.ts`** — estado post-5.3:
```typescript
import { Request, Response, NextFunction } from 'express';
import { GetPrivateProfileUseCase } from '../../../application/use-cases/user/get-private-profile.use-case';
import { GetReputationHistoryUseCase } from '../../../application/use-cases/user/get-reputation-history.use-case';
import { GetMyDeliverySessionsUseCase } from '../../../application/use-cases/user/get-my-delivery-sessions.use-case';
import { UnauthorizedException } from '../../../domain/exceptions/unauthorized.exception';

export class UserController {
  constructor(
    private readonly getPrivateProfileUseCase: GetPrivateProfileUseCase,
    private readonly getReputationHistoryUseCase: GetReputationHistoryUseCase,
    private readonly getMyDeliverySessionsUseCase: GetMyDeliverySessionsUseCase,
  ) {}

  async getPrivateProfile(req, res, next) { /* sin cambios */ }
  async getReputationHistory(req, res, next) { /* sin cambios */ }

  async getMyDeliverySessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.getMyDeliverySessionsUseCase.execute({
        userId: req.currentUser!.id,
        role: req.query.role as 'donor' | 'receiver' | undefined,
        status: req.query.status as 'active' | 'completed' | 'cancelled' | 'expired' | undefined,
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

**`src/interfaces/http/routes/users.routes.ts`** — estado post-5.3:
```typescript
import { Router } from 'express';
import { db } from '../../../infrastructure/database/supabase/db';
import { JwtService } from '../../../infrastructure/security/jwt.service';
import { PostgresUserRepository } from '../../../infrastructure/database/supabase/user.repository';
import { GetPrivateProfileUseCase } from '../../../application/use-cases/user/get-private-profile.use-case';
import { GetReputationHistoryUseCase } from '../../../application/use-cases/user/get-reputation-history.use-case';
import { GetMyDeliverySessionsUseCase } from '../../../application/use-cases/user/get-my-delivery-sessions.use-case';
import { UserController } from '../controllers/user.controller';
import { createAuthMiddleware } from '../middlewares/auth.middleware';
import { validateListMyDeliverySessionsQuery } from '../../validators/list-my-delivery-sessions.validator';
import { IJwtService } from '../../../application/services/jwt.service';
import { IUserRepository } from '../../../domain/repositories/user.repository';

export interface UserRouterDeps {
  userRepo?: IUserRepository;
  jwtService?: IJwtService;
}

export function createUserRouter(deps: UserRouterDeps = {}): Router {
  const jwtService = deps.jwtService ?? new JwtService();
  const userRepo = deps.userRepo ?? new PostgresUserRepository(db);

  const authMiddleware = createAuthMiddleware(jwtService, userRepo);
  const getPrivateProfileUseCase = new GetPrivateProfileUseCase(userRepo);
  const getReputationHistoryUseCase = new GetReputationHistoryUseCase(userRepo);
  const getMyDeliverySessionsUseCase = new GetMyDeliverySessionsUseCase(userRepo);
  const controller = new UserController(
    getPrivateProfileUseCase,
    getReputationHistoryUseCase,
    getMyDeliverySessionsUseCase,
  );

  const router = Router();

  router.get('/me', authMiddleware, (req, res, next) => controller.getPrivateProfile(req, res, next));
  router.get('/me/reputation-history', authMiddleware, (req, res, next) => controller.getReputationHistory(req, res, next));
  router.get('/me/delivery-sessions', authMiddleware, validateListMyDeliverySessionsQuery, (req, res, next) => controller.getMyDeliverySessions(req, res, next));

  return router;
}

export const userRouter = createUserRouter();
```

### Código completo de los archivos nuevos

**`src/interfaces/validators/list-my-delivery-sessions.validator.ts`:**
```typescript
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

const listMyDeliverySessionsSchema = z.object({
  role: z.enum(['donor', 'receiver']).optional(),
  status: z.enum(['active', 'completed', 'cancelled', 'expired']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function validateListMyDeliverySessionsQuery(req: Request, res: Response, next: NextFunction): void {
  const result = listMyDeliverySessionsSchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid query parameters', errors: result.error.issues });
    return;
  }
  req.query = result.data as unknown as typeof req.query;
  next();
}
```

**`src/application/dtos/get-my-delivery-sessions.dto.ts`:**
```typescript
export interface MyDeliverySessionDto {
  id: string;
  itemId: string;
  itemTitle: string;
  role: 'donor' | 'receiver';
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  deadlineAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  otherPartyUserId: string;
}

export interface GetMyDeliverySessionsRequestDto {
  userId: string;
  role?: 'donor' | 'receiver';
  status?: 'active' | 'completed' | 'cancelled' | 'expired';
  page: number;
  limit: number;
}

export interface GetMyDeliverySessionsResponseDto {
  sessions: MyDeliverySessionDto[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

**`src/application/use-cases/user/get-my-delivery-sessions.use-case.ts`:**
```typescript
import { IUserRepository, FindMyDeliverySessionsInput } from '../../../domain/repositories/user.repository';
import { GetMyDeliverySessionsRequestDto, GetMyDeliverySessionsResponseDto } from '../../dtos/get-my-delivery-sessions.dto';

export class GetMyDeliverySessionsUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(dto: GetMyDeliverySessionsRequestDto): Promise<GetMyDeliverySessionsResponseDto> {
    const input: FindMyDeliverySessionsInput = {
      userId: dto.userId,
      role: dto.role,
      status: dto.status,
      page: dto.page,
      limit: dto.limit,
    };
    const { sessions, total } = await this.userRepo.findMyDeliverySessions(input);
    return {
      sessions: sessions.map(s => ({
        id: s.id,
        itemId: s.itemId,
        itemTitle: s.itemTitle,
        role: s.role,
        status: s.status,
        deadlineAt: s.deadlineAt,
        createdAt: s.createdAt,
        completedAt: s.completedAt,
        otherPartyUserId: s.otherPartyUserId,
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

### Estructura del test

```typescript
// tests/users-delivery-sessions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUserRouter } from '../src/interfaces/http/routes/users.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { UserDeliverySessionRecord } from '../src/domain/repositories/user.repository';

const USER_UUID = '550e8400-e29b-41d4-a716-446655440000';
const ITEM_UUID = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';
const SESSION_UUID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const OTHER_USER_UUID = '660e8400-e29b-41d4-a716-446655440001';

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

const mockSessionAsDonor: UserDeliverySessionRecord = {
  id: SESSION_UUID,
  itemId: ITEM_UUID,
  itemTitle: 'Mesa de madera',
  role: 'donor',
  status: 'active',
  deadlineAt: new Date('2026-05-25T00:00:00.000Z'),
  createdAt: new Date('2026-05-18T10:00:00.000Z'),
  completedAt: null,
  otherPartyUserId: OTHER_USER_UUID,
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
      findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [mockSessionAsDonor], total: 1 }),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/users', createUserRouter(deps));
  app.use(errorHandler);
  return { app, userRepo: deps.userRepo };
}

describe('GET /users/me/delivery-sessions', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('23.1 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/users/me/delivery-sessions');
    expect(res.status).toBe(401);
  });

  it('23.2 — sin filtros → 200 con sessions y pagination', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/delivery-sessions')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sessions');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0]).toMatchObject({
      id: SESSION_UUID,
      otherPartyUserId: OTHER_USER_UUID,
    });
    expect(res.body.pagination).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
  });

  it('23.3 — role=donor → llama findMyDeliverySessions con role donor', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .get('/users/me/delivery-sessions?role=donor')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(userRepo.findMyDeliverySessions).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'donor' }),
    );
  });

  it('23.4 — role=receiver → llama findMyDeliverySessions con role receiver', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .get('/users/me/delivery-sessions?role=receiver')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(userRepo.findMyDeliverySessions).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'receiver' }),
    );
  });

  it('23.5 — status=active → llama findMyDeliverySessions con status active', async () => {
    const { app, userRepo } = buildTestApp();
    const res = await request(app)
      .get('/users/me/delivery-sessions?status=active')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(userRepo.findMyDeliverySessions).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('23.6 — limit=51 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/delivery-sessions?limit=51')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });
});
```

### Impacto en tests existentes

**IMPORTANTE:** El mock de `userRepo` en `tests/users-me.test.ts` y `tests/users-reputation-history.test.ts` debe incluir `findMyDeliverySessions` porque es ahora parte de `IUserRepository`.

En **ambos** archivos de test, añadir a todos los objetos `userRepo` del mock:
```typescript
findMyDeliverySessions: vi.fn().mockResolvedValue({ sessions: [], total: 0 }),
```

Incluye los mocks de depOverrides en `tests/users-me.test.ts` (test 21.4 y 21.5 tienen sus propios objetos `userRepo`).

### Validación de query params — comportamiento del validador

El validador Zod con `z.coerce.number()` convierte strings a números. Si `limit=51`, el parse falla porque max es 50. Si `page=0`, falla porque min es 1. El middleware responde directamente 400 sin llegar al controlador — exactamente igual que `validateListItemsQuery` en `list-items.validator.ts`.

El validador **también aplica defaults**: si `page` o `limit` no están presentes, el `result.data` tendrá `page=1` y `limit=20`. El controlador recibe estos valores ya coercionados y con defaults mediante `req.query = result.data`.

### Esquema de base de datos relevante

```sql
-- delivery_sessions
CREATE TABLE delivery_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID NOT NULL REFERENCES items(id),
  donor_id    UUID NOT NULL REFERENCES users(id),
  receiver_id UUID NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL CHECK (status IN ('active','completed','cancelled','expired')),
  contact_channel TEXT,
  contact_purged  BOOLEAN NOT NULL DEFAULT FALSE,
  donor_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  no_show_declared BOOLEAN NOT NULL DEFAULT FALSE,
  deadline_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- items (JOIN para item_title)
CREATE TABLE items (
  id    UUID PRIMARY KEY,
  title TEXT NOT NULL,
  ...
);
```

La query JOIN es directa: `JOIN items i ON i.id = ds.item_id`. No hay riesgo de items huérfanos por FK constraints.

### Regresiones a verificar

- Tests de `users-me.test.ts` (5.1) y `users-reputation-history.test.ts` (5.2) deben seguir pasando con los mocks actualizados.
- El resto de tests del proyecto no se ven afectados.
- Correr `vitest run` después de implementar para confirmar cero regresiones.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

Implementación completada el 2026-05-19. Se añadieron `UserDeliverySessionRecord` y `FindMyDeliverySessionsInput` a la interfaz de dominio. Se implementó `findMyDeliverySessions` en `PostgresUserRepository` con query SQL dinámica (condiciones de role/status variables, JOIN a items para el título, `otherPartyUserId` vía CASE donante/receptor, COUNT separado para paginación). Se creó el validador Zod con coerción de tipos y defaults. Se creó el DTO y use case correspondiente. Se extendió `UserController` con null-guard explícito en `getMyDeliverySessions`. Se extendió `users.routes.ts` siguiendo el patrón incremental de la Épica 5. Se actualizaron los mocks en `users-me.test.ts` y `users-reputation-history.test.ts`. Suite completa: 176 tests, 0 regresiones. Documentación AC alineada con el contrato real (incl. `otherPartyUserId`) el 2026-05-24.

### File List

- `src/domain/repositories/user.repository.ts` (modificado)
- `src/infrastructure/database/supabase/user.repository.ts` (modificado)
- `src/application/dtos/get-my-delivery-sessions.dto.ts` (nuevo)
- `src/application/use-cases/user/get-my-delivery-sessions.use-case.ts` (nuevo)
- `src/interfaces/validators/list-my-delivery-sessions.validator.ts` (nuevo)
- `src/interfaces/http/controllers/user.controller.ts` (modificado)
- `src/interfaces/http/routes/users.routes.ts` (modificado)
- `tests/users-delivery-sessions.test.ts` (nuevo)
- `tests/users-me.test.ts` (modificado — mocks actualizados)
- `tests/users-reputation-history.test.ts` (modificado — mocks actualizados)

## Change Log

- 2026-05-19: Implementación de historia 5.3 — endpoint `GET /users/me/delivery-sessions` con filtros por role/status, paginación y 6 tests (23.1–23.6). 176 tests totales, 0 regresiones.
- 2026-05-24: Alineación de AC y notas de dev con el contrato implementado — campo `otherPartyUserId` (contraparte de la sesión; sin PII adicional en el listado).
