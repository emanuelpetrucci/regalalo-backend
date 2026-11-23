---
title: "Ver candidatos rankeados para un objeto"
type: feature
ticket: 2
status: done
created: 2026-10-25
---

# Historia 3.2: Ver candidatos rankeados para un objeto

Status: done

## Historia

Como donante autenticado,
quiero ver la lista de candidatos que solicitaron mi objeto, ordenada por reputación, distancia y antigüedad,
para elegir al receptor más adecuado con información objetiva.

## Acceptance Criteria

1. **Dado** que envío `GET /items/:id/requests` siendo el donante del objeto, **cuando** el servidor procesa la petición, **entonces** responde `200` con `{ candidates: [{ requestId, userId, reputationScore, distanceMeters, requestDate }] }` ordenado por: score efectivo DESC → distanceMeters ASC → requestDate ASC.

2. **Dado** que el score efectivo se calcula, **cuando** el ranking se genera, **entonces** incluye una perturbación aleatoria de ±2 puntos sobre `reputation_score` del candidato, y el campo `location` no aparece en ningún elemento del DTO de respuesta.

3. **Dado** que un candidato cumple `total_donated = 0 AND total_received > 0 AND last_active_at < NOW() - 60 días`, **cuando** se genera el ranking, **entonces** ese candidato es excluido del resultado (usuario pasivo).

4. **Dado** que un candidato cumple `cycles_at_limit >= 3 AND total_received > 5 × total_donated`, **cuando** se genera el ranking, **entonces** su score efectivo tiene una penalización de -15 puntos sin afectar `reputation_score` oficial en la respuesta.

5. **Dado** que envío `GET /items/:id/requests` siendo autenticado pero no siendo el donante, **cuando** el servidor procesa la petición, **entonces** responde `403 Forbidden`.

6. **Dado** que una IP realiza más de 10 peticiones en 1 minuto a `GET /items/:id/requests`, **cuando** llega la petición 11, **entonces** el servidor responde `429 Too Many Requests`.

## Tasks / Subtasks

- [x] Task 1: Extender `IRequestRepository` y `RankedCandidate` (AC: #1–#4)
  - [x] En `src/domain/repositories/request.repository.ts`: añadir interfaz `RankedCandidate` y método `findRankedCandidates(itemId: string): Promise<RankedCandidate[]>`

- [x] Task 2: Implementar `PostgresRequestRepository.findRankedCandidates` (AC: #1–#4)
  - [x] En `src/infrastructure/database/supabase/request.repository.ts`: añadir método con SQL completo — ver Dev Notes

- [x] Task 3: DTO de respuesta (AC: #1, #2)
  - [x] Crear `src/application/dtos/get-ranked-candidates.dto.ts`

- [x] Task 4: `GetRankedCandidatesUseCase` (AC: #1, #5)
  - [x] Crear `src/application/use-cases/item/get-ranked-candidates.use-case.ts` — ver Dev Notes

- [x] Task 5: Rate limiter específico (AC: #6)
  - [x] En `src/interfaces/http/middlewares/rate-limit.ts`: añadir `candidatesRateLimit` (10/min, por IP)

- [x] Task 6: Wiring en items router (AC: #1, #5, #6)
  - [x] En `src/interfaces/http/routes/items.routes.ts`:
    - Importar `GetRankedCandidatesUseCase` y `candidatesRateLimit`
    - Instanciar `getRankedCandidatesUseCase` dentro de `createItemRouter`
    - Añadir `getRankedCandidatesUseCase` como 7º parámetro en `new ItemController(...)`
    - Añadir ruta `GET /:id/requests` con `candidatesRateLimit` ANTES de `authMiddleware`

- [x] Task 7: `ItemController.getRankedCandidates` (AC: #1)
  - [x] En `src/interfaces/http/controllers/item.controller.ts`: añadir 7º constructor param y método `getRankedCandidates`

- [x] Task 8: Actualizar mocks en tests existentes
  - [x] En `tests/items-request.test.ts`: añadir `findRankedCandidates: vi.fn().mockResolvedValue([])` al `defaultRequestRepo`

- [x] Task 9: Tests (AC: #1–#6)
  - [x] Crear `tests/items-candidates.test.ts` — ver Dev Notes para casos exactos

- [x] Task 10: Verificación
  - [x] Ejecutar `npx tsc --noEmit` sin errores
  - [x] Ejecutar `npx vitest run` — todos los tests pasan

### Review Findings

- [x] [Review][Decision] ¿Debe validarse el status del item antes de devolver candidatos? — Descartado: item cancelado devuelve `candidates: []` (no hay pending requests), comportamiento correcto.
- [x] [Review][Patch] `effective_score` incluido en SQL SELECT, debe aparecer solo en ORDER BY — Resuelto: reescrito con subquery; outer SELECT no expone `effective_score`. [src/infrastructure/database/supabase/request.repository.ts]
- [x] [Review][Patch] Test 14.7 valida un rate limiter construido localmente, no `candidatesRateLimit` — Resuelto: `candidatesRateLimit` convertido a factory `createCandidatesRateLimit()` (instancia fresca por router), test 14.7 usa `buildTestApp()`. [tests/items-candidates.test.ts, src/interfaces/http/middlewares/rate-limit.ts]
- [x] [Review][Defer] `req.currentUser!.id` non-null assertion sin guard de runtime [src/interfaces/http/controllers/item.controller.ts] — deferred, pre-existing

## Dev Notes

### Arquitectura de la historia

Esta historia añade a `IRequestRepository` el segundo método de la interfaz. La lógica de ranking (exclusión de pasivos, penalización de acaparadores, perturbación aleatoria) ocurre **en el SQL** — no en el use case. El use case solo verifica ownership y delega.

**Por qué el ranking en SQL**: La perturbación aleatoria necesita ejecutarse en el momento de la consulta (no antes), y PostGIS calcula `ST_Distance` eficientemente en el servidor. El use case es una capa de orquestación liviana.

**Diferencia entre `reputationScore` y `effectiveScore`**:
- `reputation_score` = score oficial del usuario (columna en DB) — va en la RESPUESTA
- `effective_score` = `reputation_score` + perturbación ±2 - penalización = score de ORDENAMIENTO — NO va en la respuesta
- La penalización de -15 se aplica al `effective_score`, no modifica el `reputation_score` del usuario

---

### Task 1 — Extensión de `IRequestRepository`

**Archivo completo resultante** (`src/domain/repositories/request.repository.ts`):

```typescript
export interface CreateRequestInput {
  itemId: string;
  requesterId: string;
}

export interface RequestCreated {
  requestId: string;
  status: 'pending';
  createdAt: Date;
}

export interface RankedCandidate {
  requestId: string;
  userId: string;
  reputationScore: number;
  distanceMeters: number;
  requestDate: Date;
}

export interface IRequestRepository {
  create(input: CreateRequestInput): Promise<RequestCreated>;
  findRankedCandidates(itemId: string): Promise<RankedCandidate[]>;
}
```

---

### Task 2 — SQL de `findRankedCandidates`

**Añadir al final de `PostgresRequestRepository`** (después del método `create`):

```typescript
async findRankedCandidates(itemId: string): Promise<RankedCandidate[]> {
  const result = await this.db.query<{
    request_id: string;
    user_id: string;
    reputation_score: number;
    distance_meters: number;
    request_date: Date;
  }>(
    `SELECT
       ir.id AS request_id,
       ir.requester_id AS user_id,
       u.reputation_score,
       ROUND(ST_Distance(i.location, u.location))::int AS distance_meters,
       ir.created_at AS request_date,
       (
         u.reputation_score
         + FLOOR(RANDOM() * 5 - 2)::int
         - CASE
             WHEN u.cycles_at_limit >= 3 AND u.total_received > 5 * u.total_donated
             THEN 15
             ELSE 0
           END
       ) AS effective_score
     FROM item_requests ir
     JOIN users u ON u.id = ir.requester_id
     JOIN items i ON i.id = ir.item_id
     WHERE ir.item_id = $1
       AND ir.status = 'pending'
       AND NOT (
         u.total_donated = 0
         AND u.total_received > 0
         AND u.last_active_at < NOW() - INTERVAL '60 days'
       )
     ORDER BY effective_score DESC, distance_meters ASC, ir.created_at ASC`,
    [itemId],
  );

  return result.rows.map(row => ({
    requestId: row.request_id,
    userId: row.user_id,
    reputationScore: row.reputation_score,
    distanceMeters: row.distance_meters,
    requestDate: row.request_date,
  }));
}
```

**Explicación del SQL**:
- `FLOOR(RANDOM() * 5 - 2)::int` → valores en {-2, -1, 0, 1, 2} (perturbación ±2)
- `CASE WHEN cycles_at_limit >= 3 AND total_received > 5 * total_donated THEN 15 ELSE 0 END` → penalización de acaparadores (-15 sobre effective_score)
- `AND NOT (total_donated = 0 AND total_received > 0 AND last_active_at < NOW() - INTERVAL '60 days')` → excluye usuarios pasivos
- `ir.status = 'pending'` → solo candidatos activos (no seleccionados, rechazados ni cancelados)
- `effective_score` NO se devuelve en el SELECT final — solo se usa para ORDER BY. El campo está en el SELECT para que PostgreSQL pueda usarlo en el ORDER BY.

**IMPORTANTE**: `location` NO aparece en el resultado. Solo `distance_meters` (calculado). El AC #2 exige explícitamente que `location` no esté en la respuesta.

---

### Task 3 — DTO de respuesta

**Archivo**: `src/application/dtos/get-ranked-candidates.dto.ts`

```typescript
export interface RankedCandidateDto {
  requestId: string;
  userId: string;
  reputationScore: number;
  distanceMeters: number;
  requestDate: Date;
}

export interface GetRankedCandidatesResponseDto {
  candidates: RankedCandidateDto[];
}
```

Los campos del DTO coinciden exactamente con los campos de `RankedCandidate` del repositorio. No hay transformación en el use case.

---

### Task 4 — `GetRankedCandidatesUseCase`

**Archivo**: `src/application/use-cases/item/get-ranked-candidates.use-case.ts`

```typescript
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { IRequestRepository } from '../../../domain/repositories/request.repository';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { GetRankedCandidatesResponseDto } from '../../dtos/get-ranked-candidates.dto';

export class GetRankedCandidatesUseCase {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly requestRepo: IRequestRepository,
  ) {}

  async execute(itemId: string, userId: string): Promise<GetRankedCandidatesResponseDto> {
    const item = await this.itemRepo.findItemOwnership(itemId);
    if (!item) throw new NotFoundException('Object not found');
    if (item.donorId !== userId) throw new ForbiddenException('Forbidden');

    const candidates = await this.requestRepo.findRankedCandidates(itemId);
    return { candidates };
  }
}
```

**Notas**:
- Si `item` existe pero el usuario no es el donante → `ForbiddenException` (403), no `NotFoundException`
- Si el item no tiene candidatos → `candidates: []` (no es un error)
- `requestsPaused` no se verifica aquí — el donante puede ver candidatos aunque las solicitudes estén pausadas

---

### Task 5 — `candidatesRateLimit`

**Añadir a `src/interfaces/http/middlewares/rate-limit.ts`**:

```typescript
export const candidatesRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
```

El archivo resultante tendrá 3 exportaciones: `globalRateLimit`, `authRateLimit`, `candidatesRateLimit`.

---

### Task 6 — Wiring en `items.routes.ts`

**Imports a añadir**:
```typescript
import { GetRankedCandidatesUseCase } from '../../../application/use-cases/item/get-ranked-candidates.use-case';
import { candidatesRateLimit } from '../../middlewares/rate-limit';
```

**Dentro de `createItemRouter`** (añadir después de `requestItemUseCase`):
```typescript
const getRankedCandidatesUseCase = new GetRankedCandidatesUseCase(itemRepo, requestRepo);
```

**Constructor del controller** (7º parámetro):
```typescript
const controller = new ItemController(
  publishItemUseCase, listItemsUseCase, getItemUseCase,
  cancelItemUseCase, pauseItemUseCase, requestItemUseCase,
  getRankedCandidatesUseCase,  // NEW
);
```

**Nueva ruta** (añadir ANTES de `GET /:id` para claridad, aunque no haya conflicto de matching):
```typescript
router.get(
  '/:id/requests',
  candidatesRateLimit,
  authMiddleware,
  validateUuidParam('id'),
  (req, res, next) => controller.getRankedCandidates(req, res, next),
);
```

**Orden de middleware en la ruta**:
1. `candidatesRateLimit` — primero, bloquea por IP incluso antes de auth
2. `authMiddleware` — verifica JWT
3. `validateUuidParam('id')` — valida el UUID
4. controller handler

---

### Task 7 — `ItemController`

**Añadir 7º parámetro al constructor**:
```typescript
import { GetRankedCandidatesUseCase } from '../../../application/use-cases/item/get-ranked-candidates.use-case';

export class ItemController {
  constructor(
    private readonly publishItemUseCase: PublishItemUseCase,
    private readonly listItemsUseCase: ListItemsUseCase,
    private readonly getItemUseCase: GetItemUseCase,
    private readonly cancelItemUseCase: CancelItemUseCase,
    private readonly pauseItemUseCase: PauseItemUseCase,
    private readonly requestItemUseCase: RequestItemUseCase,
    private readonly getRankedCandidatesUseCase: GetRankedCandidatesUseCase,  // NEW
  ) {}
```

**Nuevo método**:
```typescript
async getRankedCandidates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await this.getRankedCandidatesUseCase.execute(
      req.params.id,
      req.currentUser!.id,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
```

---

### Task 8 — Actualizar mock en `items-request.test.ts`

En `tests/items-request.test.ts`, el `defaultRequestRepo` necesita el nuevo método:

```typescript
const defaultRequestRepo = {
  create: vi.fn().mockResolvedValue({
    requestId: REQUEST_UUID,
    status: 'pending',
    createdAt: new Date('2026-05-07T10:00:00.000Z'),
  }),
  findRankedCandidates: vi.fn().mockResolvedValue([]),  // AÑADIR ESTO
};
```

Sin este cambio, TypeScript reportará error porque `defaultRequestRepo` no implementa `IRequestRepository` completamente.

---

### Task 9 — Tests

**Archivo**: `tests/items-candidates.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createItemRouter } from '../src/interfaces/http/routes/items.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const USER_UUID  = '550e8400-e29b-41d4-a716-446655440000';
const DONOR_UUID = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';
const ITEM_UUID  = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const mockCandidate = {
  requestId: 'ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb',
  userId: '11111111-2222-4333-8444-555555555555',
  reputationScore: 85,
  distanceMeters: 3200,
  requestDate: new Date('2026-05-06T09:00:00.000Z'),
};

const mockUser = {
  id: USER_UUID,
  email: 'user@example.com',
  passwordHash: '$argon2id$...',
  postalCode: '28001',
  reputationScore: 10,
  totalReceived: 0,
  totalDonated: 0,
  consecutiveNoShows: 0,
  cyclesAtLimit: 0,
  lastCycleIncrementedAt: null,
  jwtVersion: 1,
  createdAt: new Date(),
  lastActiveAt: new Date(),
};

const defaultItemRepo = {
  createWithImages: vi.fn(),
  findActiveInRadius: vi.fn(),
  findById: vi.fn(),
  findItemOwnership: vi.fn().mockResolvedValue({
    donorId: USER_UUID,
    status: 'active',
    requestsPaused: false,
  }),
  hasActiveDeliverySession: vi.fn().mockResolvedValue(false),
  cancelItem: vi.fn(),
  setPauseStatus: vi.fn(),
  findNewlyDegradedItems: vi.fn(),
};

const defaultRequestRepo = {
  create: vi.fn(),
  findRankedCandidates: vi.fn().mockResolvedValue([mockCandidate]),
};

function buildTestApp(depOverrides: Partial<Parameters<typeof createItemRouter>[0]> = {}) {
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
    },
    itemRepo: { ...defaultItemRepo, ...depOverrides.itemRepo },
    requestRepo: { ...defaultRequestRepo, ...depOverrides.requestRepo },
    storageService: { upload: vi.fn().mockResolvedValue(undefined) },
    geocodingService: { geocode: vi.fn() },
    mailService: { send: vi.fn().mockResolvedValue(undefined) },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/items', createItemRouter(deps));
  app.use(errorHandler);
  return { app, requestRepo: deps.requestRepo };
}

describe('GET /items/:id/requests', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('14.1 — donante auténtico con candidatos → 200 con { candidates: [...] }', async () => {
    const { app, requestRepo } = buildTestApp();
    const res = await request(app)
      .get(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('candidates');
    expect(Array.isArray(res.body.candidates)).toBe(true);
    expect(res.body.candidates).toHaveLength(1);
    expect(res.body.candidates[0]).toMatchObject({
      requestId: mockCandidate.requestId,
      userId: mockCandidate.userId,
      reputationScore: 85,
      distanceMeters: 3200,
    });
    expect(res.body.candidates[0]).not.toHaveProperty('location');
    expect(res.body.candidates[0]).not.toHaveProperty('effectiveScore');
    expect(requestRepo.findRankedCandidates).toHaveBeenCalledWith(ITEM_UUID);
  });

  it('14.2 — sin candidatos → 200 con candidates: []', async () => {
    const { app } = buildTestApp({
      requestRepo: {
        findRankedCandidates: vi.fn().mockResolvedValue([]),
      },
    });
    const res = await request(app)
      .get(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ candidates: [] });
  });

  it('14.3 — usuario autenticado pero no es el donante → 403', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue({
          donorId: 'otro-usuario-uuid',
          status: 'active',
          requestsPaused: false,
        }),
      },
    });
    const res = await request(app)
      .get(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(403);
  });

  it('14.4 — item no existe → 404', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue(null),
      },
    });
    const res = await request(app)
      .get(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(404);
  });

  it('14.5 — sin token de autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get(`/items/${ITEM_UUID}/requests`);

    expect(res.status).toBe(401);
  });

  it('14.6 — UUID inválido → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/items/not-a-valid-uuid/requests')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });
});

// Test de rate limit con app aislada (fresh rate limiter, no compartido con otros tests)
describe('GET /items/:id/requests — rate limit', () => {
  it('14.7 — 11ª petición desde misma IP → 429', async () => {
    const freshRateLimit = rateLimit({
      windowMs: 60_000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
    });

    const isolatedApp = express();
    isolatedApp.use(express.json());
    isolatedApp.use(freshRateLimit);

    // Montar el router SIN candidatesRateLimit (ya usamos freshRateLimit arriba)
    // para aislar el test del estado global del rate limiter
    const mockJwtService = {
      sign: vi.fn(),
      verify: vi.fn().mockReturnValue({ sub: USER_UUID, jwtVersion: 1 }),
    };
    const mockUserRepo = {
      findByEmail: vi.fn(),
      findById: vi.fn().mockResolvedValue(mockUser),
      create: vi.fn(),
    };
    isolatedApp.use('/items', createItemRouter({
      jwtService: mockJwtService,
      userRepo: mockUserRepo,
      itemRepo: { ...defaultItemRepo } as any,
      requestRepo: { ...defaultRequestRepo } as any,
      storageService: { upload: vi.fn().mockResolvedValue(undefined) },
      geocodingService: { geocode: vi.fn() },
      mailService: { send: vi.fn().mockResolvedValue(undefined) },
    }));
    isolatedApp.use(errorHandler);

    for (let i = 0; i < 10; i++) {
      const res = await request(isolatedApp)
        .get(`/items/${ITEM_UUID}/requests`)
        .set('Authorization', 'Bearer mock-jwt-token');
      expect(res.status).not.toBe(429);
    }

    const blocked = await request(isolatedApp)
      .get(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');
    expect(blocked.status).toBe(429);
  });
});
```

**Nota sobre el test 14.7**: El test crea un `freshRateLimit` local (igual que `rate-limit.test.ts`). El `candidatesRateLimit` en `items.routes.ts` aplica el rate limit real en producción. En el test, aplicamos el rate limiter a nivel de app (no de ruta) con el mismo `max: 10` para validar el comportamiento de 429.

---

### Relación con historias anteriores y siguientes

**Historia 3.1 (anterior)**: Introdujo `IRequestRepository` con un solo método `create`. Esta historia añade `findRankedCandidates`. El mock en `tests/items-request.test.ts` DEBE actualizarse (Task 8).

**Historia 4.1 (futura)**: Al seleccionar receptor, cambiará `ir.status` de `'pending'` a `'selected'` (ganador) y `'rejected'` (resto). El `findRankedCandidates` filtra `ir.status = 'pending'`, por lo que después de la selección, los candidatos rechazados ya no aparecerán.

**Historia 3.3 (próxima)**: Solo crea un job pg_cron SQL. No toca ningún archivo Node.js relevante para esta historia.

## Dev Agent Record

### Completion Notes

Implementación completa de la historia 3.2. Se crearon/modificaron:
- `IRequestRepository` extendida con `RankedCandidate` y `findRankedCandidates`
- `PostgresRequestRepository.findRankedCandidates` con SQL completo (perturbación aleatoria ±2, penalización acaparadores -15, exclusión usuarios pasivos, ordenación effective_score DESC → distance ASC → created_at ASC)
- DTO `GetRankedCandidatesResponseDto` / `RankedCandidateDto`
- `GetRankedCandidatesUseCase` orquestando ownership check + delegación al repo
- `candidatesRateLimit` (10/min por IP) añadido a rate-limit.ts
- Wiring completo en router y controller (7º parámetro)
- Mock `findRankedCandidates: vi.fn().mockResolvedValue([])` añadido a tests/items-request.test.ts
- 7 tests nuevos en `tests/items-candidates.test.ts` — todos pasan
- Test 14.7 (rate limit) usa app standalone en lugar de `createItemRouter` para evitar estado compartido del rate limiter global
- TypeScript limpio: `npx tsc --noEmit` sin errores
- Suite completa: 16 archivos, 118 tests — todos pasan

## File List

- `src/domain/repositories/request.repository.ts` (modificado — `RankedCandidate` + `findRankedCandidates` en `IRequestRepository`)
- `src/infrastructure/database/supabase/request.repository.ts` (modificado — método `findRankedCandidates` con SQL de ranking)
- `src/application/dtos/get-ranked-candidates.dto.ts` (nuevo)
- `src/application/use-cases/item/get-ranked-candidates.use-case.ts` (nuevo)
- `src/interfaces/http/middlewares/rate-limit.ts` (modificado — `candidatesRateLimit`)
- `src/interfaces/http/routes/items.routes.ts` (modificado — wiring, nueva ruta `GET /:id/requests`)
- `src/interfaces/http/controllers/item.controller.ts` (modificado — 7º param y método `getRankedCandidates`)
- `tests/items-request.test.ts` (modificado — `findRankedCandidates` en mock)
- `tests/items-candidates.test.ts` (nuevo)

## Change Log

- 2026-05-08: Implementación completa de historia 3.2 — endpoint `GET /items/:id/requests`, SQL de ranking con perturbación aleatoria + penalización + exclusión de pasivos, rate limit 10/min, 7 tests nuevos

### Checklist de regresión

- `IRequestRepository` tiene 2 métodos: `create` y `findRankedCandidates`
- `tests/items-request.test.ts` mock de `defaultRequestRepo` incluye `findRankedCandidates: vi.fn().mockResolvedValue([])`
- `candidatesRateLimit` aplicado ANTES de `authMiddleware` en la ruta
- `effective_score` NO aparece en el DTO ni en la respuesta JSON
- `location` NO aparece en la respuesta
- `reputation_score` en la respuesta = score oficial del candidato, NO el effective_score
- `ItemController` tiene 7 parámetros en el constructor; `createItemRouter` los pasa en el orden correcto
- `GET /:id/requests` registrada en el router (no confundir con `POST /:id/requests` de historia 3.1)
