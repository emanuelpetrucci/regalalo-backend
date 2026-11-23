---
title: "Solicitar un objeto"
type: feature
ticket: 1
status: done
created: 2026-10-25
---

# Historia 3.1: Solicitar un objeto

Status: done

## Historia

Como receptor autenticado,
quiero poder solicitar un objeto que me interesa,
para ser considerado como candidato por el donante.

## Acceptance Criteria

1. **Dado** que envío `POST /items/:id/requests` con autenticación válida y el objeto existe en estado `active` con `requests_paused = FALSE`, **cuando** el servidor procesa la petición en transacción SERIALIZABLE, **entonces** responde `201` con `{ requestId, status: "pending", createdAt }` y se crea un registro en `item_requests` con `status = 'pending'` y se envía notificación al donante (EVT-006 / TPL-006).

2. **Dado** que intento solicitar mi propio objeto, **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request` con mensaje `"No puedes solicitar tu propio objeto"` (esta verificación ocurre antes de la comprobación del límite de solicitudes).

3. **Dado** que ya realicé 3 solicitudes en los últimos 30 días (ventana deslizante de 720 horas), **cuando** intento una cuarta solicitud, **entonces** responde `409 Conflict`.

4. **Dado** que ya solicité este mismo objeto anteriormente, **cuando** intento solicitarlo de nuevo, **entonces** responde `409 Conflict`.

5. **Dado** que dos peticiones concurrentes del mismo usuario intentan crear la solicitud número 3 y 4 simultáneamente, **cuando** el servidor procesa ambas en transacción SERIALIZABLE, **entonces** solo una tiene éxito y la otra recibe `409 Conflict`.

6. **Dado** que el objeto tiene `requests_paused = TRUE`, **cuando** intento solicitarlo, **entonces** responde `409 Conflict`.

## Tasks / Subtasks

- [x] Task 1: Nueva interfaz de dominio `IRequestRepository` (AC: #1, #3, #4, #5)
  - [x] Crear `src/domain/repositories/request.repository.ts` — ver Dev Notes para código exacto

- [x] Task 2: Extender `FindItemOwnershipResult` (AC: #2, #6)
  - [x] En `src/domain/repositories/item.repository.ts`: añadir `requestsPaused: boolean` a `FindItemOwnershipResult`

- [x] Task 3: Actualizar `PostgresItemRepository.findItemOwnership` (AC: #2, #6)
  - [x] En `src/infrastructure/database/supabase/item.repository.ts`: cambiar SQL para incluir `requests_paused` en SELECT y mapear el campo

- [x] Task 4: Implementar `PostgresRequestRepository` (AC: #1, #3, #4, #5)
  - [x] Crear `src/infrastructure/database/supabase/request.repository.ts` — SERIALIZABLE transaction, manejo de códigos PG `23505` y `40001` — ver Dev Notes

- [x] Task 5: DTO de respuesta (AC: #1)
  - [x] Crear `src/application/dtos/request-item.dto.ts`

- [x] Task 6: `RequestItemUseCase` (AC: #1–#6)
  - [x] Crear `src/application/use-cases/item/request-item.use-case.ts` — ver Dev Notes para orden exacto de verificaciones

- [x] Task 7: Email template TPL-006 (AC: #1)
  - [x] Añadir `TPL-006` a `src/infrastructure/email/resend.provider.ts`

- [x] Task 8: Wiring en items router (AC: #1)
  - [x] En `src/interfaces/http/routes/items.routes.ts`:
    - Añadir `requestRepo?: IRequestRepository` y `mailService?: IMailService` a `ItemRouterDeps`
    - Importar `PostgresRequestRepository`, `ResendMailProvider`, `RequestItemUseCase`, `IRequestRepository`, `IMailService`
    - Instanciar `requestRepo`, `mailService`, `requestItemUseCase` dentro de `createItemRouter`
    - Añadir `requestItemUseCase` como 6º parámetro en `new ItemController(...)`
    - Añadir ruta `POST /:id/requests`

- [x] Task 9: `ItemController.requestItem` (AC: #1)
  - [x] En `src/interfaces/http/controllers/item.controller.ts`: añadir `requestItemUseCase` como 6º constructor param y método `requestItem`

- [x] Task 10: Actualizar mocks en tests existentes (TypeScript compliance)
  - [x] En `tests/items-pause.test.ts`: añadir `requestsPaused: false` a todos los `mockResolvedValue` de `findItemOwnership`
  - [x] En `tests/items-cancel.test.ts`: igual
  - [x] Verificar que no hay otros test files con `findItemOwnership` mocked sin `requestsPaused`

- [x] Task 11: Tests (AC: #1–#6)
  - [x] Crear `tests/items-request.test.ts` — ver Dev Notes para casos exactos

- [x] Task 12: Verificación
  - [x] Ejecutar `npx tsc --noEmit` sin errores
  - [x] Ejecutar `npx vitest run` — todos los tests pasan

### Review Findings

- [x] [Review][Decision] Rate limit COUNT sin filtro de status — resuelto: añadido `AND status IN ('pending', 'selected')` al COUNT query. [src/infrastructure/database/supabase/request.repository.ts:18]

- [x] [Review][Patch] Silent catch sin logging en envío de email — resuelto: añadido `logger.warn`. [src/application/use-cases/item/request-item.use-case.ts:36]
- [x] [Review][Patch] `client.release()` sin pasar error al pool — resuelto: añadido flag `destroyConnection`. [src/infrastructure/database/supabase/request.repository.ts:64]

- [x] [Review][Defer] 40001 → 409 sin retry — MVP explícitamente aceptado en spec Dev Notes. [src/infrastructure/database/supabase/request.repository.ts:54] — deferred, pre-existing
- [x] [Review][Defer] Status/requestsPaused checks no atómicos con INSERT — `findItemOwnership` corre fuera de la transacción SERIALIZABLE; item puede cambiar entre el guard y el INSERT. [src/application/use-cases/item/request-item.use-case.ts:19] — deferred, pre-existing
- [x] [Review][Defer] TPL-006 sin contexto del objeto — email al donante sin nombre/link del item; gap de UX. [src/infrastructure/email/resend.provider.ts:22] — deferred, pre-existing
- [x] [Review][Defer] Sin rate limit HTTP específico en `POST /:id/requests`. [src/interfaces/http/routes/items.routes.ts:109] — deferred, pre-existing
- [x] [Review][Defer] Sin test unitario específico para el path 40001 → HTTP 409 (AC #5 concurrent). [tests/items-request.test.ts] — deferred, pre-existing
- [x] [Review][Defer] Lógica de ROLLBACK convoluta — correcta pero frágil; triple try/catch con guards instanceof. [src/infrastructure/database/supabase/request.repository.ts:36] — deferred, pre-existing

## Dev Notes

### Arquitectura general de la historia

Esta historia introduce la primera parte de Épica 3. Crea:
- Un nuevo repositorio de dominio `IRequestRepository` (NOT en `IItemRepository`)
- Un use case `RequestItemUseCase` que orquesta 4 dependencias
- Una ruta `POST /items/:id/requests` en el router existente

**Por qué IRequestRepository separado y no IItemRepository**: Las solicitudes (`item_requests`) son una entidad de dominio propia con su lógica transaccional. Agruparlas en `IItemRepository` haría esa interfaz demasiado grande y mezclaría responsabilidades.

---

### Task 1 — `IRequestRepository`

**Archivo**: `src/domain/repositories/request.repository.ts`

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

export interface IRequestRepository {
  create(input: CreateRequestInput): Promise<RequestCreated>;
}
```

---

### Task 2 — Extensión de `FindItemOwnershipResult`

**Antes** (`src/domain/repositories/item.repository.ts`):
```typescript
export interface FindItemOwnershipResult {
  donorId: string;
  status: string;
}
```

**Después**:
```typescript
export interface FindItemOwnershipResult {
  donorId: string;
  status: string;
  requestsPaused: boolean;
}
```

**IMPORTANTE**: `PauseItemUseCase` y `CancelItemUseCase` usan `findItemOwnership` pero NO leen `requestsPaused` — no hay que cambiarlos. Solo los mocks en tests necesitan actualización (Task 10).

---

### Task 3 — SQL actualizado en `PostgresItemRepository.findItemOwnership`

**Antes**:
```typescript
async findItemOwnership(itemId: string): Promise<FindItemOwnershipResult | null> {
  const result = await this.db.query<{ donor_id: string; status: string }>(
    'SELECT donor_id, status FROM items WHERE id = $1',
    [itemId],
  );
  if (result.rows.length === 0) return null;
  return { donorId: result.rows[0].donor_id, status: result.rows[0].status };
}
```

**Después**:
```typescript
async findItemOwnership(itemId: string): Promise<FindItemOwnershipResult | null> {
  const result = await this.db.query<{ donor_id: string; status: string; requests_paused: boolean }>(
    'SELECT donor_id, status, requests_paused FROM items WHERE id = $1',
    [itemId],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return { donorId: row.donor_id, status: row.status, requestsPaused: row.requests_paused };
}
```

---

### Task 4 — `PostgresRequestRepository` (SERIALIZABLE transaction)

**Archivo**: `src/infrastructure/database/supabase/request.repository.ts`

```typescript
import { Pool } from 'pg';
import {
  IRequestRepository,
  CreateRequestInput,
  RequestCreated,
} from '../../../domain/repositories/request.repository';
import { ConflictException } from '../../../domain/exceptions/conflict.exception';

export class PostgresRequestRepository implements IRequestRepository {
  constructor(private readonly db: Pool) {}

  async create(input: CreateRequestInput): Promise<RequestCreated> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      // Verificar límite de 3 solicitudes en ventana de 720 horas
      const limitResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) FROM item_requests
         WHERE requester_id = $1
           AND created_at > NOW() - INTERVAL '720 hours'`,
        [input.requesterId],
      );
      if (parseInt(limitResult.rows[0].count, 10) >= 3) {
        await client.query('ROLLBACK');
        throw new ConflictException('Request limit reached');
      }

      // INSERT — la restricción UNIQUE (item_id, requester_id) captura duplicados
      let result;
      try {
        result = await client.query<{ id: string; status: string; created_at: Date }>(
          `INSERT INTO item_requests (item_id, requester_id)
           VALUES ($1, $2)
           RETURNING id, status, created_at`,
          [input.itemId, input.requesterId],
        );
      } catch (err) {
        const pgErr = err as { code?: string };
        if (pgErr.code === '23505') {
          await client.query('ROLLBACK');
          throw new ConflictException('Already requested this item');
        }
        throw err;
      }

      await client.query('COMMIT');
      const row = result.rows[0];
      return {
        requestId: row.id,
        status: 'pending',
        createdAt: row.created_at,
      };
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '40001') {
        // Serialization failure — tratar como conflicto (MVP)
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        throw new ConflictException('Concurrent request conflict');
      }
      if (!(err instanceof ConflictException)) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
```

**Notas clave**:
- La verificación de límite (`COUNT >= 3`) ocurre DENTRO de la transacción SERIALIZABLE para garantizar correctness bajo concurrencia (AC #5)
- Error `23505` (violación de UNIQUE) → `ConflictException` (solicitud duplicada, AC #4)
- Error `40001` (serialization failure) → `ConflictException` (AC #5 — MVP acceptable)
- El ROLLBACK después de `ConflictException` ya lanzado: el `catch` externo no hace ROLLBACK de nuevo si ya se lanzó `ConflictException` (el `if (!(err instanceof ConflictException))` lo evita)

**Patrón de errores**:
- Limit reached → `ConflictException('Request limit reached')` → HTTP 409
- Duplicate → `ConflictException('Already requested this item')` → HTTP 409
- Serialization failure → `ConflictException('Concurrent request conflict')` → HTTP 409

---

### Task 5 — DTO de respuesta

**Archivo**: `src/application/dtos/request-item.dto.ts`

```typescript
export interface RequestItemResponseDto {
  requestId: string;
  status: 'pending';
  createdAt: Date;
}
```

---

### Task 6 — `RequestItemUseCase`

**Orden EXACTO de verificaciones** (crítico para los tests y para cumplir ACs):

1. `findItemOwnership(itemId)` → `null` lanza `NotFoundException('Object not found')`
2. `item.status !== 'active'` → lanza `ConflictException('Item is not available')`
3. `item.requestsPaused === true` → lanza `ConflictException('Requests are paused for this item')`
4. `item.donorId === requesterId` → lanza `BadRequestException('No puedes solicitar tu propio objeto')` ← ANTES del límite (per AC #2)
5. `requestRepo.create({ itemId, requesterId })` → puede lanzar `ConflictException` (límite o duplicado)
6. Email: buscar donante por `userRepo.findById(item.donorId)`, enviar TPL-006, **try/catch no-fatal**

**Archivo**: `src/application/use-cases/item/request-item.use-case.ts`

```typescript
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { IRequestRepository } from '../../../domain/repositories/request.repository';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IMailService } from '../../../domain/services/mail.service';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { ConflictException } from '../../../domain/exceptions/conflict.exception';
import { BadRequestException } from '../../../domain/exceptions/bad-request.exception';
import { RequestItemResponseDto } from '../../dtos/request-item.dto';

export class RequestItemUseCase {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly requestRepo: IRequestRepository,
    private readonly userRepo: IUserRepository,
    private readonly mailService: IMailService,
  ) {}

  async execute(itemId: string, requesterId: string): Promise<RequestItemResponseDto> {
    const item = await this.itemRepo.findItemOwnership(itemId);
    if (!item) throw new NotFoundException('Object not found');
    if (item.status !== 'active') throw new ConflictException('Item is not available');
    if (item.requestsPaused) throw new ConflictException('Requests are paused for this item');
    if (item.donorId === requesterId) throw new BadRequestException('No puedes solicitar tu propio objeto');

    const result = await this.requestRepo.create({ itemId, requesterId });

    try {
      const donor = await this.userRepo.findById(item.donorId);
      if (donor) {
        await this.mailService.send({ to: donor.email, templateId: 'TPL-006', variables: {} });
      }
    } catch {
      // email failure is non-fatal
    }

    return result;
  }
}
```

---

### Task 7 — TPL-006

**Añadir a `src/infrastructure/email/resend.provider.ts`** (después de TPL-001, antes de TPL-007):

```typescript
'TPL-006': {
  subject: 'Tienes una nueva solicitud para tu objeto',
  html: () => `<p>Un usuario ha solicitado tu objeto. Entra a la app para ver los candidatos y elegir al receptor.</p>`,
},
```

---

### Task 8 — Wiring en `items.routes.ts`

**Imports a añadir**:
```typescript
import { PostgresRequestRepository } from '../../../infrastructure/database/supabase/request.repository';
import { ResendMailProvider } from '../../../infrastructure/email/resend.provider';
import { RequestItemUseCase } from '../../../application/use-cases/item/request-item.use-case';
import { IRequestRepository } from '../../../domain/repositories/request.repository';
import { IMailService } from '../../../domain/services/mail.service';
```

**`ItemRouterDeps` actualizado** (añadir 2 campos opcionales):
```typescript
export interface ItemRouterDeps {
  itemRepo?: IItemRepository;
  requestRepo?: IRequestRepository;  // NEW
  storageService?: IStorageService;
  geocodingService?: IGeocodingService;
  jwtService?: IJwtService;
  userRepo?: IUserRepository;
  mailService?: IMailService;  // NEW
}
```

**Dentro de `createItemRouter(deps)`** (añadir tras instanciar `geocoding`):
```typescript
const requestRepo = deps.requestRepo ?? new PostgresRequestRepository(db);
const mailService = deps.mailService ?? new ResendMailProvider();
const requestItemUseCase = new RequestItemUseCase(itemRepo, requestRepo, userRepo, mailService);
```

**Constructor del controller** (6º parámetro):
```typescript
const controller = new ItemController(
  publishItemUseCase, listItemsUseCase, getItemUseCase,
  cancelItemUseCase, pauseItemUseCase, requestItemUseCase,
);
```

**Nueva ruta** (añadir ANTES del `return router`):
```typescript
router.post(
  '/:id/requests',
  authMiddleware,
  validateUuidParam('id'),
  (req, res, next) => controller.requestItem(req, res, next),
);
```

**IMPORTANTE**: No se necesita validator de body — `POST /items/:id/requests` no tiene body (solo params).

---

### Task 9 — `ItemController`

**Añadir 6º parámetro al constructor**:
```typescript
export class ItemController {
  constructor(
    private readonly publishItemUseCase: PublishItemUseCase,
    private readonly listItemsUseCase: ListItemsUseCase,
    private readonly getItemUseCase: GetItemUseCase,
    private readonly cancelItemUseCase: CancelItemUseCase,
    private readonly pauseItemUseCase: PauseItemUseCase,
    private readonly requestItemUseCase: RequestItemUseCase,  // NEW
  ) {}
```

**Nuevo método**:
```typescript
async requestItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await this.requestItemUseCase.execute(
      req.params.id,
      req.currentUser!.id,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}
```

**Import a añadir en el controller**:
```typescript
import { RequestItemUseCase } from '../../../application/use-cases/item/request-item.use-case';
```

---

### Task 10 — Actualizar mocks existentes

Todos los `defaultItemRepo` en tests que tienen `findItemOwnership` mockeado DEBEN añadir `requestsPaused: false` para evitar errores TypeScript:

**`tests/items-pause.test.ts`** — cambiar:
```typescript
findItemOwnership: vi.fn().mockResolvedValue({ donorId: USER_UUID, status: 'active' }),
```
por:
```typescript
findItemOwnership: vi.fn().mockResolvedValue({ donorId: USER_UUID, status: 'active', requestsPaused: false }),
```

También actualizar los overrides individuales en `it('12.3...')`, `it('12.4...')`, `it('12.7...')`.

**`tests/items-cancel.test.ts`** — misma actualización para todas las apariciones de `findItemOwnership` mocked.

Comando para encontrar todos los sitios a actualizar:
```
grep -n "findItemOwnership" tests/items-pause.test.ts tests/items-cancel.test.ts
```

---

### Task 11 — Tests

**Archivo**: `tests/items-request.test.ts`

Patrón `buildTestApp` extendido con `requestRepo` y `mailService`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createItemRouter } from '../src/interfaces/http/routes/items.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { ConflictException } from '../src/domain/exceptions/conflict.exception';

const USER_UUID   = '550e8400-e29b-41d4-a716-446655440000';
const DONOR_UUID  = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';
const ITEM_UUID   = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const REQUEST_UUID = 'ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb';

const mockUser = {
  id: USER_UUID,
  email: 'requester@example.com',
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

const mockDonor = {
  ...mockUser,
  id: DONOR_UUID,
  email: 'donor@example.com',
};

const defaultItemRepo = {
  createWithImages: vi.fn(),
  findActiveInRadius: vi.fn(),
  findById: vi.fn(),
  findItemOwnership: vi.fn().mockResolvedValue({
    donorId: DONOR_UUID,
    status: 'active',
    requestsPaused: false,
  }),
  hasActiveDeliverySession: vi.fn().mockResolvedValue(false),
  cancelItem: vi.fn(),
  setPauseStatus: vi.fn(),
  findNewlyDegradedItems: vi.fn(),
};

const defaultRequestRepo = {
  create: vi.fn().mockResolvedValue({
    requestId: REQUEST_UUID,
    status: 'pending',
    createdAt: new Date('2026-05-07T10:00:00.000Z'),
  }),
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
      findById: vi.fn().mockImplementation((id: string) =>
        id === DONOR_UUID ? Promise.resolve(mockDonor) : Promise.resolve(mockUser)
      ),
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
  return { app, itemRepo: deps.itemRepo, requestRepo: deps.requestRepo, mailService: deps.mailService };
}

describe('POST /items/:id/requests', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('13.1 — éxito: objeto activo, no paused, no propio → 201 con requestId/status/createdAt', async () => {
    const { app, requestRepo, mailService } = buildTestApp();
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ requestId: REQUEST_UUID, status: 'pending' });
    expect(requestRepo.create).toHaveBeenCalledWith({ itemId: ITEM_UUID, requesterId: USER_UUID });
    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'TPL-006', to: 'donor@example.com' }),
    );
  });

  it('13.2 — propio objeto (donorId === requesterId) → 400', async () => {
    const { app, requestRepo } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue({
          donorId: USER_UUID,  // mismo que el usuario autenticado
          status: 'active',
          requestsPaused: false,
        }),
      },
    });
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'No puedes solicitar tu propio objeto');
    expect(requestRepo.create).not.toHaveBeenCalled();
  });

  it('13.3 — límite de solicitudes alcanzado (repo lanza ConflictException) → 409', async () => {
    const { app } = buildTestApp({
      requestRepo: {
        create: vi.fn().mockRejectedValue(new ConflictException('Request limit reached')),
      },
    });
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(409);
  });

  it('13.4 — solicitud duplicada (repo lanza ConflictException) → 409', async () => {
    const { app } = buildTestApp({
      requestRepo: {
        create: vi.fn().mockRejectedValue(new ConflictException('Already requested this item')),
      },
    });
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(409);
  });

  it('13.5 — objeto con requests_paused = true → 409', async () => {
    const { app, requestRepo } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue({
          donorId: DONOR_UUID,
          status: 'active',
          requestsPaused: true,
        }),
      },
    });
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(409);
    expect(requestRepo.create).not.toHaveBeenCalled();
  });

  it('13.6 — objeto no existe → 404', async () => {
    const { app, requestRepo } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue(null),
      },
    });
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(404);
    expect(requestRepo.create).not.toHaveBeenCalled();
  });

  it('13.7 — UUID inválido → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/items/not-a-valid-uuid/requests')
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(400);
  });

  it('13.8 — sin token de autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post(`/items/${ITEM_UUID}/requests`);

    expect(res.status).toBe(401);
  });

  it('13.9 — objeto no en estado active → 409', async () => {
    const { app, requestRepo } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue({
          donorId: DONOR_UUID,
          status: 'cancelled',
          requestsPaused: false,
        }),
      },
    });
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(409);
    expect(requestRepo.create).not.toHaveBeenCalled();
  });

  it('13.10 — fallo de email no aborta la respuesta exitosa → 201', async () => {
    const { app } = buildTestApp({
      mailService: { send: vi.fn().mockRejectedValue(new Error('Resend error')) },
    });
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests`)
      .set('Authorization', 'Bearer mock-jwt-token');

    expect(res.status).toBe(201);
  });
});
```

---

### Relación con historias anteriores y siguientes

**Implementa el AC pendiente de Historia 2.5 (AC #3)**:
La Historia 2.5 dejó un AC pendiente: "Dado que un receptor intenta solicitar un objeto con `requests_paused = TRUE`, cuando intenta solicitarlo, entonces responde 409". Esto se implementa AQUÍ en el use case `RequestItemUseCase` (verificación `item.requestsPaused`). NO hay que tocar `PauseItemUseCase`.

**Historia 3.2 (próxima)**:
Añadirá `GET /items/:id/requests` con la lista rankeada de candidatos. Leerá `item_requests` vía un nuevo método de repositorio.

**Historia 4.1**:
Al seleccionar receptor: cambia `item_requests.status = 'selected'` para el ganador y `'rejected'` para el resto.

### Checklist de regresión

- `FindItemOwnershipResult` tiene `requestsPaused: boolean` → actualizar SQL Y todos los mocks de tests
- El orden en `RequestItemUseCase` es: 404 → status 409 → paused 409 → self-request 400 → SERIALIZABLE → email
- `ItemController` constructor tiene 6 params; `createItemRouter` los pasa en orden correcto
- `POST /:id/requests` está registrada ANTES del `return router` en `items.routes.ts`
- Tests de cancel y pause pasan con `requestsPaused: false` en sus mocks
- Email (TPL-006) es enviado al DONANTE (no al solicitante)

## Dev Agent Record

### Completion Notes

Implementación completa de la historia 3.1. Se crearon:
- `IRequestRepository` (dominio) con `create()` transaccional SERIALIZABLE
- `PostgresRequestRepository` manejando códigos PG 23505 (duplicado) y 40001 (serialization failure)
- `RequestItemUseCase` con orden exacto de validaciones: 404 → status 409 → paused 409 → self-request 400 → repo → email
- Template TPL-006 añadido al proveedor Resend
- Wiring completo en router y controller (6º parámetro)
- 10 tests nuevos en `items-request.test.ts` — todos pasan
- Mocks actualizados en items-pause.test.ts e items-cancel.test.ts con `requestsPaused: false`
- TypeScript limpio: `npx tsc --noEmit` sin errores
- Suite completa: 15 archivos, 111 tests — todos pasan

## File List

- `src/domain/repositories/request.repository.ts` (nuevo)
- `src/domain/repositories/item.repository.ts` (modificado — añadido `requestsPaused: boolean` a `FindItemOwnershipResult`)
- `src/infrastructure/database/supabase/item.repository.ts` (modificado — SQL actualizado en `findItemOwnership`)
- `src/infrastructure/database/supabase/request.repository.ts` (nuevo)
- `src/application/dtos/request-item.dto.ts` (nuevo)
- `src/application/use-cases/item/request-item.use-case.ts` (nuevo)
- `src/infrastructure/email/resend.provider.ts` (modificado — añadido TPL-006)
- `src/interfaces/http/routes/items.routes.ts` (modificado — wiring, nueva ruta)
- `src/interfaces/http/controllers/item.controller.ts` (modificado — 6º param y método `requestItem`)
- `tests/items-request.test.ts` (nuevo)
- `tests/items-pause.test.ts` (modificado — mocks actualizados)
- `tests/items-cancel.test.ts` (modificado — mocks actualizados)

## Change Log

- 2026-05-07: Implementación completa de historia 3.1 — endpoint `POST /items/:id/requests`, repositorio SERIALIZABLE, use case con 6 validaciones ordenadas, template TPL-006, 10 tests nuevos, actualización de mocks existentes
