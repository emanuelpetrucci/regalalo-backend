---
title: "Ver historial de reputación"
type: feature
ticket: 2
status: done
created: 2026-10-25
---

# Historia 5.2: Ver historial de reputación

Status: done

## Historia

Como usuario autenticado,
quiero ver el historial de eventos que afectaron mi reputación,
para entender cómo evolucionó mi score y qué acciones lo modificaron.

## Acceptance Criteria

1. **Dado** que envío `GET /users/me/reputation-history` con autenticación válida, **cuando** el servidor procesa la petición, **entonces** responde `200` con `{ events: [{ id, type, delta, sessionId, createdAt }] }` **Y** `type` puede ser `delivery_completed` o `no_show` **Y** `delta` refleja el valor real aplicado (positivo o negativo).

2. **Dado** que el usuario no tiene ningún evento de reputación, **cuando** el servidor procesa la petición, **entonces** responde `200` con `{ events: [] }`.

3. **Dado** que envío la petición sin autenticación, **cuando** el servidor procesa la petición, **entonces** responde `401 Unauthorized`.

## Tasks / Subtasks

- [x] Task 1: Añadir `ReputationEventRecord` y `findReputationHistory()` a `IUserRepository` (AC: #1, #2)
  - [x] En `src/domain/repositories/user.repository.ts`: añadir interfaz `ReputationEventRecord` con campos `id`, `type`, `delta`, `sessionId`, `createdAt`
  - [x] Añadir `findReputationHistory(userId: string): Promise<ReputationEventRecord[]>` a `IUserRepository`

- [x] Task 2: Implementar `findReputationHistory()` en `PostgresUserRepository` (AC: #1, #2)
  - [x] En `src/infrastructure/database/supabase/user.repository.ts`: añadir método `findReputationHistory`
  - [x] Query: `SELECT id, type, delta, session_id, created_at FROM reputation_events WHERE user_id = $1 ORDER BY created_at DESC`

- [x] Task 3: Crear DTO y use case `GetReputationHistoryUseCase` (AC: #1, #2)
  - [x] Crear `src/application/dtos/get-reputation-history.dto.ts` con `ReputationEventDto` y `GetReputationHistoryResponseDto`
  - [x] Crear `src/application/use-cases/user/get-reputation-history.use-case.ts`
  - [x] Constructor: `(userRepo: IUserRepository)`. `execute(userId)` llama `findReputationHistory`, mapea a DTO

- [x] Task 4: Extender `UserController` con `getReputationHistory` (AC: #1, #2, #3)
  - [x] En `src/interfaces/http/controllers/user.controller.ts`: añadir `GetReputationHistoryUseCase` como parámetro adicional del constructor
  - [x] Añadir método `getReputationHistory(req, res, next)`: llama `execute(req.currentUser!.id)`, responde `200`

- [x] Task 5: Extender `users.routes.ts` con `GET /me/reputation-history` (AC: #1, #3)
  - [x] En `src/interfaces/http/routes/users.routes.ts`: importar `GetReputationHistoryUseCase`
  - [x] Instanciar `getReputationHistoryUseCase` dentro del factory y pasarlo al constructor del `UserController`
  - [x] Añadir ruta `GET /me/reputation-history` con `authMiddleware`
  - [x] **Sin** `validateUuidParam` — es ruta literal, no parámetro `:id`

- [x] Task 6: Escribir tests (AC: #1, #2, #3)
  - [x] Crear `tests/users-reputation-history.test.ts`
  - [x] Test 22.1: sin auth → 401
  - [x] Test 22.2: hay eventos → 200 con array de eventos completo
  - [x] Test 22.3: sin eventos → 200 con `events: []`
  - [x] Test 22.4: los eventos del mock incluyen todos los campos esperados (id, type, delta, sessionId, createdAt)

### Review Findings

- [x] [Review][Patch] `getReputationHistory` carece de null-guard para `req.currentUser`, a diferencia de `getPrivateProfile` — si el middleware no popula currentUser sin lanzar error, el método lanza `TypeError` en lugar de `UnauthorizedException` (HTTP 500 en vez de 401) [src/interfaces/http/controllers/user.controller.ts]

- [x] [Review][Defer] `type` de `reputation_events` no validado en runtime — TypeScript no protege si el CHECK constraint del DB es alterado; valor inesperado pasa silenciosamente al cliente [src/infrastructure/database/supabase/user.repository.ts] — deferred, patrón pre-existente en todos los repositorios del proyecto
- [x] [Review][Defer] `createdAt` declarado como `Date` en DTO pero serializado como string ISO-8601 sobre HTTP — contrato de tipos engañoso para consumidores; `toHaveProperty('createdAt')` en 22.4 no verifica el shape del valor [src/application/dtos/get-reputation-history.dto.ts] — deferred, patrón pre-existente en el proyecto
- [x] [Review][Defer] `delta` no validado en runtime — si la columna cambia de INTEGER a NUMERIC/BIGINT en una migración futura, el valor pasa sin conversión [src/infrastructure/database/supabase/user.repository.ts] — deferred, patrón pre-existente en todos los repositorios
- [x] [Review][Defer] Test 22.2 solo verifica longitud del array, no los campos del evento — cobertura débil; un mapeo roto con todos los campos `undefined` pasaría igual [tests/users-reputation-history.test.ts] — deferred, campo a campo ya cubierto por 22.4
- [x] [Review][Defer] Sin test para JWT expirado/inválido en la nueva ruta `/me/reputation-history` — el escenario de middleware con token inválido no está cubierto en el nuevo test file [tests/users-reputation-history.test.ts] — deferred, comportamiento del auth middleware ya probado en users-me.test.ts
- [x] [Review][Defer] Sin índice compuesto en `(user_id, created_at DESC)` — el índice simple en `user_id` obliga a filesort en cada llamada [schema/reputation_events] — deferred, requiere cambio de schema aprobado explícitamente
- [x] [Review][Defer] `userRouter` singleton en `users.routes.ts` crea conexión real a DB al importar el módulo — riesgo latente para tests futuros que importen el módulo transitivamente [src/interfaces/http/routes/users.routes.ts] — deferred, pre-existente (mismo patrón que authRouter, itemRouter, deliverySessionRouter)

---

## Notas para el Dev Agent

### Contexto de la Épica 5: patrón incremental

`UserController` y `users.routes.ts` se extienden historia a historia:
- **5.1 creó**: controlador con 1 use case, router con 1 ruta
- **Esta historia (5.2) añade**: 1 use case más al controlador, 1 ruta más al router
- **5.3–5.6 añadirán**: más métodos y rutas siguiendo el mismo patrón

Nunca reescribir desde cero — siempre añadir a los archivos existentes.

### Estado actual de los archivos a modificar

**`src/domain/repositories/user.repository.ts`** — estado post-5.1 (sin cambios en 5.1):
```typescript
import { User } from '../entities/user.entity';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  postalCode: string;
  lat: number;
  lon: number;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  // ← añadir aquí: ReputationEventRecord + findReputationHistory
}
```

Añadir antes de `IUserRepository`:
```typescript
export interface ReputationEventRecord {
  id: string;
  type: 'delivery_completed' | 'no_show';
  delta: number;
  sessionId: string | null;
  createdAt: Date;
}
```

Y en `IUserRepository`:
```typescript
findReputationHistory(userId: string): Promise<ReputationEventRecord[]>;
```

**`src/interfaces/http/controllers/user.controller.ts`** — estado post-5.1:
```typescript
import { Request, Response, NextFunction } from 'express';
import { GetPrivateProfileUseCase } from '../../../application/use-cases/user/get-private-profile.use-case';

export class UserController {
  constructor(
    private readonly getPrivateProfileUseCase: GetPrivateProfileUseCase,
  ) {}

  async getPrivateProfile(req, res, next): Promise<void> { /* ... */ }
}
```

Resultado post-5.2:
```typescript
import { Request, Response, NextFunction } from 'express';
import { GetPrivateProfileUseCase } from '../../../application/use-cases/user/get-private-profile.use-case';
import { GetReputationHistoryUseCase } from '../../../application/use-cases/user/get-reputation-history.use-case';

export class UserController {
  constructor(
    private readonly getPrivateProfileUseCase: GetPrivateProfileUseCase,
    private readonly getReputationHistoryUseCase: GetReputationHistoryUseCase,
  ) {}

  async getPrivateProfile(req, res, next): Promise<void> { /* sin cambios */ }

  async getReputationHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.getReputationHistoryUseCase.execute(req.currentUser!.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
```

**`src/interfaces/http/routes/users.routes.ts`** — estado post-5.1:
```typescript
// factory crea: getPrivateProfileUseCase, controller con 1 param, 1 ruta GET /me
```

Resultado post-5.2:
```typescript
import { Router } from 'express';
import { db } from '../../../infrastructure/database/supabase/db';
import { JwtService } from '../../../infrastructure/security/jwt.service';
import { PostgresUserRepository } from '../../../infrastructure/database/supabase/user.repository';
import { GetPrivateProfileUseCase } from '../../../application/use-cases/user/get-private-profile.use-case';
import { GetReputationHistoryUseCase } from '../../../application/use-cases/user/get-reputation-history.use-case';
import { UserController } from '../controllers/user.controller';
import { createAuthMiddleware } from '../middlewares/auth.middleware';
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
  const controller = new UserController(getPrivateProfileUseCase, getReputationHistoryUseCase);

  const router = Router();

  router.get(
    '/me',
    authMiddleware,
    (req, res, next) => controller.getPrivateProfile(req, res, next),
  );

  router.get(
    '/me/reputation-history',
    authMiddleware,
    (req, res, next) => controller.getReputationHistory(req, res, next),
  );

  return router;
}

export const userRouter = createUserRouter();
```

### Código completo de los archivos nuevos

**`src/application/dtos/get-reputation-history.dto.ts`:**
```typescript
export interface ReputationEventDto {
  id: string;
  type: 'delivery_completed' | 'no_show';
  delta: number;
  sessionId: string | null;
  createdAt: Date;
}

export interface GetReputationHistoryResponseDto {
  events: ReputationEventDto[];
}
```

**`src/application/use-cases/user/get-reputation-history.use-case.ts`:**
```typescript
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { GetReputationHistoryResponseDto } from '../../dtos/get-reputation-history.dto';

export class GetReputationHistoryUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(userId: string): Promise<GetReputationHistoryResponseDto> {
    const events = await this.userRepo.findReputationHistory(userId);
    return {
      events: events.map(e => ({
        id: e.id,
        type: e.type,
        delta: e.delta,
        sessionId: e.sessionId,
        createdAt: e.createdAt,
      })),
    };
  }
}
```

### Implementación en `PostgresUserRepository`

Añadir al final de la clase (después de `mapRow`):

```typescript
async findReputationHistory(userId: string): Promise<ReputationEventRecord[]> {
  const result = await this.db.query<{
    id: string;
    type: 'delivery_completed' | 'no_show';
    delta: number;
    session_id: string | null;
    created_at: Date;
  }>(
    `SELECT id, type, delta, session_id, created_at
     FROM reputation_events
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map(row => ({
    id: row.id,
    type: row.type,
    delta: row.delta,
    sessionId: row.session_id,
    createdAt: row.created_at,
  }));
}
```

Añadir también el import de `ReputationEventRecord` en el archivo:
```typescript
import { IUserRepository, CreateUserInput, ReputationEventRecord } from '../../../domain/repositories/user.repository';
```

### Estructura del test

```typescript
// tests/users-reputation-history.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createUserRouter } from '../src/interfaces/http/routes/users.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { ReputationEventRecord } from '../src/domain/repositories/user.repository';

const USER_UUID    = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

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

const mockEvent: ReputationEventRecord = {
  id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
  type: 'delivery_completed',
  delta: 10,
  sessionId: SESSION_UUID,
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
      findReputationHistory: vi.fn().mockResolvedValue([mockEvent]),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/users', createUserRouter(deps));
  app.use(errorHandler);
  return { app, userRepo: deps.userRepo };
}

describe('GET /users/me/reputation-history', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('22.1 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/users/me/reputation-history');
    expect(res.status).toBe(401);
  });

  it('22.2 — hay eventos → 200 con lista de eventos', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/reputation-history')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('events');
    expect(res.body.events).toHaveLength(1);
  });

  it('22.3 — sin eventos → 200 con events vacío', async () => {
    const { app } = buildTestApp({
      userRepo: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockResolvedValue(mockUser),
        create: vi.fn(),
        findReputationHistory: vi.fn().mockResolvedValue([]),
      },
    });
    const res = await request(app)
      .get('/users/me/reputation-history')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
  });

  it('22.4 — el evento retorna todos los campos correctos', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/users/me/reputation-history')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    const event = res.body.events[0];
    expect(event).toHaveProperty('id', 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff');
    expect(event).toHaveProperty('type', 'delivery_completed');
    expect(event).toHaveProperty('delta', 10);
    expect(event).toHaveProperty('sessionId', SESSION_UUID);
    expect(event).toHaveProperty('createdAt');
  });
});
```

### Impacto en tests existentes de `users-me.test.ts`

**IMPORTANTE:** Al añadir un segundo parámetro al constructor de `UserController`, el mock en `tests/users-me.test.ts` sigue funcionando correctamente porque `createUserRouter(deps)` construye el controller internamente. El test de 5.1 no pasa el controller directamente — usa la factory. No se requieren cambios en `tests/users-me.test.ts`.

Sin embargo, el mock de `userRepo` en el test de 5.1 no tiene `findReputationHistory`. Esto NO es un problema porque ese test solo llama `GET /me` y el nuevo método solo se llama en `GET /me/reputation-history`. Vitest no se queja por propiedades faltantes en el mock si no se llaman.

Para prevenir posibles problemas: si el test 5.1 empieza a fallar por TypeScript complaining sobre la interfaz incompleta, añadir `findReputationHistory: vi.fn().mockResolvedValue([])` al mock de `userRepo` en `tests/users-me.test.ts`.

### Tabla `reputation_events` — esquema relevante

```sql
CREATE TABLE reputation_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL CHECK (type IN ('delivery_completed','no_show')),
  delta      INTEGER NOT NULL,
  session_id UUID REFERENCES delivery_sessions(id),  -- nullable
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- `session_id` es NULLABLE — el DTO expone `sessionId: string | null`.
- `delta` es INTEGER positivo o negativo — el AC dice "valor real aplicado positivo o negativo". Sin floor, sin truncado.
- No hay paginación en este endpoint — se retornan TODOS los eventos del usuario ordenados por fecha descendente.

### Regresiones a verificar

- Tests de `users-me.test.ts` (5.1) deben seguir pasando sin cambios.
- El resto de tests del proyecto no se ven afectados (no tocan `UserController` ni `users.routes.ts`).
- Correr `vitest run` después de implementar para confirmar cero regresiones.

---

## Dev Agent Record

### Completion Notes

Implementación completada el 2026-05-18. Se añadió `ReputationEventRecord` a la interfaz de dominio, se implementó `findReputationHistory` con SQL directo en el repositorio Postgres, se creó el DTO y use case correspondiente, se extendió `UserController` y `users.routes.ts` siguiendo el patrón incremental de la Épica 5. Se actualizó también el mock de `users-me.test.ts` para incluir `findReputationHistory` al ser ahora requerido por la interfaz. Suite completa: 170 tests, 0 regresiones.

---

## File List

- `src/domain/repositories/user.repository.ts` (modificado)
- `src/infrastructure/database/supabase/user.repository.ts` (modificado)
- `src/application/dtos/get-reputation-history.dto.ts` (nuevo)
- `src/application/use-cases/user/get-reputation-history.use-case.ts` (nuevo)
- `src/interfaces/http/controllers/user.controller.ts` (modificado)
- `src/interfaces/http/routes/users.routes.ts` (modificado)
- `tests/users-reputation-history.test.ts` (nuevo)
- `tests/users-me.test.ts` (modificado — mocks actualizados)

---

## Change Log

- 2026-05-18: Implementación de historia 5.2 — endpoint `GET /users/me/reputation-history` con 4 tests (22.1–22.4). 170 tests totales, 0 regresiones.
