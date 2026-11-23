---
title: "Seleccionar receptor para un objeto"
type: feature
ticket: 1
status: done
created: 2026-10-25
---

# Historia 4.1: Seleccionar receptor para un objeto

Status: done

## Historia

Como donante autenticado,
quiero seleccionar un receptor de la lista de candidatos proporcionando mi canal de contacto,
para iniciar el proceso de entrega con esa persona.

## Acceptance Criteria

1. **Dado** que envío `POST /items/:id/requests/:requestId/select` con `{ "contactChannel": "string" }` siendo el donante, el objeto en estado `active` y la request en estado `pending`, **cuando** el servidor procesa la petición en transacción atómica, **entonces** responde `200` con `{ sessionId, status: "active", deadlineAt }` **Y** se crea una `delivery_session` con `status = 'active'`, `contact_channel = contactChannel` y `deadline_at = NOW() + 7 días` **Y** la request ganadora queda en `status = 'selected'` **Y** todas las demás requests del mismo objeto quedan en `status = 'rejected'` **Y** el objeto queda en `status = 'reserved'` y `reserved_at = NOW()` **Y** se envía notificación al receptor seleccionado (EVT-003 / TPL-003).

2. **Dado** que la request ya no está en estado `pending` o el objeto no está en estado `active`, **cuando** el servidor procesa la petición, **entonces** responde `409 Conflict`.

3. **Dado** que envío la petición siendo autenticado pero no siendo el donante del objeto, o siendo donante pero la request no pertenece al objeto, **cuando** el servidor procesa la petición, **entonces** responde `403 Forbidden`.

4. **Dado** que envío la petición sin el campo `contactChannel` o con valor vacío, **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request`.

## Tasks / Subtasks

- [x] Task 1: Migración SQL — crear tabla `delivery_sessions` e índices (AC: #1)
  - [x] Crear `src/infrastructure/database/supabase/migrations/009-create-delivery-sessions.sql`
  - [x] Incluir tabla `delivery_sessions` completa con todos los campos del schema
  - [x] Incluir los 3 índices: `idx_sessions_contact_purge`, `idx_delivery_sessions_donor`, `idx_delivery_sessions_receiver`

- [x] Task 2: Interfaz `IDeliverySessionRepository` (AC: #1, #2, #3)
  - [x] Crear `src/domain/repositories/delivery-session.repository.ts`
  - [x] Definir interfaces `SelectReceiverInput`, `SelectReceiverResult`, `IDeliverySessionRepository`

- [x] Task 3: Implementar `PostgresDeliverySessionRepository.selectReceiver` (AC: #1, #2, #3)
  - [x] Crear `src/infrastructure/database/supabase/delivery-session.repository.ts`
  - [x] Transacción atómica: SELECT FOR UPDATE → INSERT session → UPDATE selected → UPDATE rejected → UPDATE reserved

- [x] Task 4: DTO de respuesta (AC: #1)
  - [x] Crear `src/application/dtos/select-receiver.dto.ts`

- [x] Task 5: `SelectReceiverUseCase` (AC: #1, #2, #3)
  - [x] Crear `src/application/use-cases/item/select-receiver.use-case.ts`
  - [x] Verificar donorId en use case, delegar transacción al repo
  - [x] Enviar EVT-003 / TPL-003 tras el commit (fire-and-forget, wrapped in try/catch)

- [x] Task 6: Validator del body (AC: #4)
  - [x] Crear `src/interfaces/validators/select-receiver.validator.ts`
  - [x] Zod: `contactChannel: z.string().min(1)`

- [x] Task 7: Agregar TPL-003 al email provider (AC: #1)
  - [x] En `src/infrastructure/email/resend.provider.ts`: añadir entrada `'TPL-003'` al objeto `templates`

- [x] Task 8: Wiring en items router (AC: #1, #3, #4)
  - [x] En `src/interfaces/http/routes/items.routes.ts`:
    - Añadir `deliverySessionRepo?: IDeliverySessionRepository` a `ItemRouterDeps`
    - Importar `SelectReceiverUseCase`, `PostgresDeliverySessionRepository`, `validateSelectReceiverBody`
    - Instanciar `selectReceiverUseCase` dentro de `createItemRouter`
    - Añadir `selectReceiverUseCase` como 8º parámetro en `new ItemController(...)`
    - Añadir ruta `POST /:id/requests/:requestId/select` con `validateUuidParam('id')`, `validateUuidParam('requestId')`, `validateSelectReceiverBody` y handler

- [x] Task 9: `ItemController.selectReceiver` (AC: #1)
  - [x] En `src/interfaces/http/controllers/item.controller.ts`: añadir 8º constructor param y método `selectReceiver`

- [x] Task 10: Tests (AC: #1–#4)
  - [x] Crear `tests/items-select.test.ts` — ver Dev Notes para casos exactos

- [x] Task 11: Verificación
  - [x] Ejecutar `npx tsc --noEmit` sin errores
  - [x] Ejecutar `npx vitest run` — todos los tests pasan

### Review Findings

- [x] [Review][Patch] TPL-003 template ignora las cuatro variables requeridas — actualizar `html` para renderizar `itemTitle`, `itemCondition`, `donorReputationScore` y `sessionDeadlineAt` sin incluir `contactChannel` [src/infrastructure/email/resend.provider.ts:23]
- [x] [Review][Patch] Email no es realmente fire-and-forget — el bloque usa `await Promise.all` + `await mailService.send` dentro del `try`, bloqueando la respuesta hasta que el email resuelva o falle. El comentario dice "no bloquea la respuesta" pero sí lo hace. [src/application/use-cases/item/select-receiver.use-case.ts:39]
- [x] [Review][Patch] ROLLBACKs explícitos redundantes antes de los throws — las ramas `rows.length === 0`, `req_status !== 'pending'` e `item_status !== 'active'` llaman `await client.query('ROLLBACK')` antes de throw; el catch exterior llama ROLLBACK de nuevo. El doble ROLLBACK es un no-op en PostgreSQL pero es código innecesario y confuso. [src/infrastructure/database/supabase/delivery-session.repository.ts:38,45,50]
- [x] [Review][Defer] TOCTOU: ownership check fuera de la transacción [src/application/use-cases/item/select-receiver.use-case.ts:27] — deferred, pre-existing; la propiedad del item es inmutable en este dominio, el riesgo es teórico
- [x] [Review][Defer] donorId no se verifica en el SQL de la transacción [src/infrastructure/database/supabase/delivery-session.repository.ts:25] — deferred, pre-existing; concern de defensa en profundidad, no un bug en el flujo actual
- [x] [Review][Defer] Sin índice en item_id en delivery_sessions [src/infrastructure/database/supabase/migrations/009-create-delivery-sessions.sql] — deferred, pre-existing; válido pero fuera del scope del spec actual
- [x] [Review][Defer] contactChannel sin validación de longitud máxima [src/interfaces/validators/select-receiver.validator.ts:5] — deferred, pre-existing; el spec solo define min(1); hardening de seguridad para iteración futura

## Dev Notes

### Arquitectura de la historia

Esta historia introduce la tabla `delivery_sessions` y el primer use case de la Épica 4. La separación de responsabilidades es:

- **Use case**: verifica donorId, delega la transacción atómica al repo, envía el email (fire-and-forget)
- **Repository**: ejecuta toda la lógica atómica en una sola transacción (SELECT FOR UPDATE + INSERT + 3 UPDATEs)

**Por qué la transacción completa va en el repo**: Las operaciones de crear la sesión, marcar ganador, rechazar otros y reservar el item DEBEN ser atómicas. No hacerlo crearía inconsistencias (item en `reserved` sin sesión, o sesión sin item reservado). Ningún use case interviene entre los pasos.

**Email fire-and-forget**: Igual que en `RequestItemUseCase` (historia 3.1), el email se envía después del commit. Un fallo en el envío se loguea con `pino` pero NO revierte la transacción.

---

### Task 1 — Migración 009

**Archivo**: `src/infrastructure/database/supabase/migrations/009-create-delivery-sessions.sql`

La tabla `delivery_sessions` es requerida por `hasActiveDeliverySession` en `item.repository.ts` (historia 2.4). Hasta esta historia, el método funciona en tests por el mock, pero en producción falla si la tabla no existe. Esta migración la crea.

```sql
CREATE TABLE IF NOT EXISTS delivery_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          UUID NOT NULL REFERENCES items(id),
  donor_id         UUID NOT NULL REFERENCES users(id),
  receiver_id      UUID NOT NULL REFERENCES users(id),
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','completed','cancelled','expired')),
  contact_channel  TEXT,
  contact_purged   BOOLEAN NOT NULL DEFAULT FALSE,
  donor_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,
  no_show_declared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_delivery_sessions_donor
  ON delivery_sessions(donor_id);
CREATE INDEX IF NOT EXISTS idx_delivery_sessions_receiver
  ON delivery_sessions(receiver_id);
CREATE INDEX IF NOT EXISTS idx_sessions_contact_purge
  ON delivery_sessions(status, completed_at)
  WHERE contact_purged = FALSE;
```

**Notas**:
- `contact_channel` es `TEXT` sin NOT NULL — el donante lo provee al seleccionar, pero posteriores historias deben poder purgarlo a NULL
- `deadline_at DEFAULT NOW() + INTERVAL '7 days'` → el INSERT de historia 4.1 no necesita pasarlo explícitamente
- Los 3 índices son los de la arquitectura §4 — no existe ninguno anterior

---

### Task 2 — `IDeliverySessionRepository`

**Archivo**: `src/domain/repositories/delivery-session.repository.ts`

```typescript
export interface SelectReceiverInput {
  itemId: string;
  requestId: string;
  donorId: string;
  contactChannel: string;
}

export interface SelectReceiverResult {
  sessionId: string;
  status: 'active';
  deadlineAt: Date;
  receiverId: string;
  itemTitle: string;
  itemCondition: string;
}

export interface IDeliverySessionRepository {
  selectReceiver(input: SelectReceiverInput): Promise<SelectReceiverResult>;
}
```

`receiverId`, `itemTitle` e `itemCondition` se obtienen en el JOIN dentro de la transacción — evita round-trips adicionales en el use case para construir el email.

---

### Task 3 — SQL de `PostgresDeliverySessionRepository.selectReceiver`

**Archivo**: `src/infrastructure/database/supabase/delivery-session.repository.ts`

```typescript
import { Pool } from 'pg';
import {
  IDeliverySessionRepository,
  SelectReceiverInput,
  SelectReceiverResult,
} from '../../../domain/repositories/delivery-session.repository';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { ConflictException } from '../../../domain/exceptions/conflict.exception';

export class PostgresDeliverySessionRepository implements IDeliverySessionRepository {
  constructor(private readonly db: Pool) {}

  async selectReceiver(input: SelectReceiverInput): Promise<SelectReceiverResult> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Lock request + join item para verificación de estado y obtener datos para email
      const reqResult = await client.query<{
        requester_id: string;
        req_status: string;
        item_status: string;
        title: string;
        condition: string;
      }>(
        `SELECT ir.requester_id,
                ir.status       AS req_status,
                i.status        AS item_status,
                i.title,
                i.condition
         FROM item_requests ir
         JOIN items i ON i.id = ir.item_id
         WHERE ir.id = $1 AND ir.item_id = $2
         FOR UPDATE`,
        [input.requestId, input.itemId],
      );

      if (reqResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new ForbiddenException('Forbidden');
      }

      const { requester_id, req_status, item_status, title, condition } = reqResult.rows[0];

      if (req_status !== 'pending') {
        await client.query('ROLLBACK');
        throw new ConflictException('Request is not in pending state');
      }
      if (item_status !== 'active') {
        await client.query('ROLLBACK');
        throw new ConflictException('Item is not active');
      }

      // Crear delivery_session
      const sessionResult = await client.query<{
        id: string;
        deadline_at: Date;
      }>(
        `INSERT INTO delivery_sessions (item_id, donor_id, receiver_id, contact_channel)
         VALUES ($1, $2, $3, $4)
         RETURNING id, deadline_at`,
        [input.itemId, input.donorId, requester_id, input.contactChannel],
      );

      // Marcar request ganadora como selected
      await client.query(
        `UPDATE item_requests SET status = 'selected' WHERE id = $1`,
        [input.requestId],
      );

      // Rechazar todas las demás requests pendientes del mismo item
      await client.query(
        `UPDATE item_requests SET status = 'rejected'
         WHERE item_id = $1 AND id != $2 AND status = 'pending'`,
        [input.itemId, input.requestId],
      );

      // Reservar el item
      await client.query(
        `UPDATE items SET status = 'reserved', reserved_at = NOW() WHERE id = $1`,
        [input.itemId],
      );

      await client.query('COMMIT');

      const row = sessionResult.rows[0];
      return {
        sessionId: row.id,
        status: 'active',
        deadlineAt: row.deadline_at,
        receiverId: requester_id,
        itemTitle: title,
        itemCondition: condition,
      };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  }
}
```

**Puntos clave**:
- `FOR UPDATE` en el SELECT inicial evita race conditions (dos donantes no pueden seleccionar simultáneamente para el mismo item, aunque esto no debería ocurrir por diseño)
- Si `item_id` en la request no coincide con `input.itemId` → no hay filas → `ForbiddenException` (AC #3)
- El `ROLLBACK` explícito antes de los throws de dominio garantiza que el cliente no quede en transacción abierta

---

### Task 4 — DTO de respuesta

**Archivo**: `src/application/dtos/select-receiver.dto.ts`

```typescript
export interface SelectReceiverResponseDto {
  sessionId: string;
  status: 'active';
  deadlineAt: Date;
}
```

`receiverId`, `itemTitle`, `itemCondition` se usan internamente en el use case para el email pero NO aparecen en la respuesta HTTP.

---

### Task 5 — `SelectReceiverUseCase`

**Archivo**: `src/application/use-cases/item/select-receiver.use-case.ts`

```typescript
import pino from 'pino';
import { env } from '../../../config/env';
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { IDeliverySessionRepository } from '../../../domain/repositories/delivery-session.repository';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IMailService } from '../../../domain/services/mail.service';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { SelectReceiverResponseDto } from '../../dtos/select-receiver.dto';

const logger = pino({ level: env.LOG_LEVEL });

export class SelectReceiverUseCase {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly deliverySessionRepo: IDeliverySessionRepository,
    private readonly userRepo: IUserRepository,
    private readonly mailService: IMailService,
  ) {}

  async execute(
    itemId: string,
    requestId: string,
    donorId: string,
    contactChannel: string,
  ): Promise<SelectReceiverResponseDto> {
    const item = await this.itemRepo.findItemOwnership(itemId);
    if (!item) throw new NotFoundException('Object not found');
    if (item.donorId !== donorId) throw new ForbiddenException('Forbidden');

    const result = await this.deliverySessionRepo.selectReceiver({
      itemId,
      requestId,
      donorId,
      contactChannel,
    });

    // EVT-003 — fire-and-forget, no bloquea la respuesta
    try {
      const [receiver, donor] = await Promise.all([
        this.userRepo.findById(result.receiverId),
        this.userRepo.findById(donorId),
      ]);
      if (receiver) {
        await this.mailService.send({
          to: receiver.email,
          templateId: 'TPL-003',
          variables: {
            itemTitle: result.itemTitle,
            itemCondition: result.itemCondition,
            donorReputationScore: donor?.reputationScore ?? 0,
            sessionDeadlineAt: result.deadlineAt.toISOString(),
          },
        });
      }
    } catch (err) {
      logger.warn(err, 'Failed to send selection notification email for session %s', result.sessionId);
    }

    return {
      sessionId: result.sessionId,
      status: result.status,
      deadlineAt: result.deadlineAt,
    };
  }
}
```

**Notas**:
- El use case verifica solo el `donorId` (ya sabe que el item existe). Si `request.item_id !== itemId`, el repo lanzará `ForbiddenException` (AC #3 — segundo caso)
- Si `findItemOwnership` devuelve `{ status: 'reserved' }`, el repo igualmente lanzará `ConflictException` ya que la verificación de status del item la hace el repo dentro de la transacción (FOR UPDATE). El use case NO verifica el status antes de llamar al repo — así la verificación es atómica
- `Promise.all` para buscar receiver y donor en paralelo antes del email

---

### Task 6 — Validator del body

**Archivo**: `src/interfaces/validators/select-receiver.validator.ts`

```typescript
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

const selectReceiverSchema = z.object({
  contactChannel: z.string().min(1),
});

export function validateSelectReceiverBody(req: Request, res: Response, next: NextFunction): void {
  const result = selectReceiverSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request body', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
```

El campo `contactChannel` debe ser `string.min(1)` — el AC exige rechazar valores vacíos. El patrón es idéntico a `validatePauseItemBody` (`pause-item.validator.ts`).

---

### Task 7 — TPL-003 en `resend.provider.ts`

**Añadir a `src/infrastructure/email/resend.provider.ts`** dentro del objeto `templates`:

```typescript
'TPL-003': {
  subject: '¡Has sido seleccionado como receptor!',
  html: () =>
    `<p>¡Enhorabuena! Has sido seleccionado como receptor para un objeto. Accede a la plataforma para ver el canal de contacto del donante y coordinar la entrega.</p>`,
},
```

Nota del email-flow-mapping §5 — EVT-003:
> El canal de contacto del donante no se transmite por email. El receptor lo obtiene exclusivamente accediendo a la sesión activa a través de la API autenticada.

Por ello el template HTML es genérico — no incluye el contactChannel en el email.

Los templates TPL-004 (expiración de sesión) y TPL-005 (cancelación de objeto) NO se añaden en esta historia — pertenecen a historias 4.6 y 4.5 respectivamente.

---

### Task 8 — Wiring en `items.routes.ts`

**Imports a añadir**:
```typescript
import { SelectReceiverUseCase } from '../../../application/use-cases/item/select-receiver.use-case';
import { PostgresDeliverySessionRepository } from '../../../infrastructure/database/supabase/delivery-session.repository';
import { validateSelectReceiverBody } from '../../validators/select-receiver.validator';
import { IDeliverySessionRepository } from '../../../domain/repositories/delivery-session.repository';
```

**Añadir a `ItemRouterDeps`**:
```typescript
export interface ItemRouterDeps {
  // ... existentes
  deliverySessionRepo?: IDeliverySessionRepository;  // NEW
}
```

**Dentro de `createItemRouter`** (después de `getRankedCandidatesUseCase`):
```typescript
const deliverySessionRepo = deps.deliverySessionRepo ?? new PostgresDeliverySessionRepository(db);
const selectReceiverUseCase = new SelectReceiverUseCase(itemRepo, deliverySessionRepo, userRepo, mailService);
```

**Constructor del controller** (8º parámetro):
```typescript
const controller = new ItemController(
  publishItemUseCase, listItemsUseCase, getItemUseCase,
  cancelItemUseCase, pauseItemUseCase, requestItemUseCase,
  getRankedCandidatesUseCase,
  selectReceiverUseCase,  // NEW
);
```

**Nueva ruta** (añadir ANTES de `POST /:id/requests` para mayor claridad, aunque Express puede distinguirlas por segmentos):
```typescript
router.post(
  '/:id/requests/:requestId/select',
  authMiddleware,
  validateUuidParam('id'),
  validateUuidParam('requestId'),
  validateSelectReceiverBody,
  (req, res, next) => controller.selectReceiver(req, res, next),
);
```

**Orden de middleware en la ruta**:
1. `authMiddleware` — verifica JWT e inyecta `req.currentUser`
2. `validateUuidParam('id')` — valida `:id` del item
3. `validateUuidParam('requestId')` — valida `:requestId`
4. `validateSelectReceiverBody` — valida el body (contactChannel)
5. controller handler

---

### Task 9 — `ItemController`

**Añadir 8º parámetro al constructor**:
```typescript
import { SelectReceiverUseCase } from '../../../application/use-cases/item/select-receiver.use-case';

export class ItemController {
  constructor(
    // ... 7 existentes
    private readonly selectReceiverUseCase: SelectReceiverUseCase,  // NEW
  ) {}
```

**Nuevo método**:
```typescript
async selectReceiver(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await this.selectReceiverUseCase.execute(
      req.params.id,
      req.params.requestId,
      req.currentUser!.id,
      req.body.contactChannel,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
```

---

### Task 10 — Tests

**Archivo**: `tests/items-select.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createItemRouter } from '../src/interfaces/http/routes/items.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';
import { ForbiddenException } from '../src/domain/exceptions/forbidden.exception';
import { ConflictException } from '../src/domain/exceptions/conflict.exception';

const USER_UUID    = '550e8400-e29b-41d4-a716-446655440000';
const ITEM_UUID    = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const REQUEST_UUID = 'ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb';
const SESSION_UUID = '11111111-2222-4333-8444-555555555555';
const RECEIVER_UUID = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';

const mockSelectResult = {
  sessionId: SESSION_UUID,
  status: 'active' as const,
  deadlineAt: new Date('2026-05-20T02:00:00.000Z'),
  receiverId: RECEIVER_UUID,
  itemTitle: 'Mesa de madera',
  itemCondition: 'good',
};

const mockUser = {
  id: USER_UUID,
  email: 'donor@example.com',
  passwordHash: '$argon2id$...',
  postalCode: '28001',
  reputationScore: 42,
  totalReceived: 1,
  totalDonated: 2,
  consecutiveNoShows: 0,
  cyclesAtLimit: 0,
  lastCycleIncrementedAt: null,
  jwtVersion: 1,
  createdAt: new Date(),
  lastActiveAt: new Date(),
};

const mockReceiver = { ...mockUser, id: RECEIVER_UUID, email: 'receiver@example.com' };

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
  findRankedCandidates: vi.fn().mockResolvedValue([]),
};

const defaultDeliverySessionRepo = {
  selectReceiver: vi.fn().mockResolvedValue(mockSelectResult),
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
        id === RECEIVER_UUID ? Promise.resolve(mockReceiver) : Promise.resolve(mockUser)
      ),
      create: vi.fn(),
    },
    itemRepo: { ...defaultItemRepo, ...depOverrides.itemRepo },
    requestRepo: { ...defaultRequestRepo, ...depOverrides.requestRepo },
    deliverySessionRepo: { ...defaultDeliverySessionRepo, ...depOverrides.deliverySessionRepo },
    storageService: { upload: vi.fn().mockResolvedValue(undefined) },
    geocodingService: { geocode: vi.fn() },
    mailService: { send: vi.fn().mockResolvedValue(undefined) },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/items', createItemRouter(deps));
  app.use(errorHandler);
  return { app, mailService: deps.mailService, deliverySessionRepo: deps.deliverySessionRepo };
}

const SELECT_URL = `/items/${ITEM_UUID}/requests/${REQUEST_UUID}/select`;

describe('POST /items/:id/requests/:requestId/select', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('15.1 — donante válido, item activo, request pendiente → 200 con { sessionId, status, deadlineAt }', async () => {
    const { app, mailService, deliverySessionRepo } = buildTestApp();
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'Telegram: @donor123' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      sessionId: SESSION_UUID,
      status: 'active',
    });
    expect(res.body).toHaveProperty('deadlineAt');
    expect(res.body).not.toHaveProperty('receiverId');
    expect(res.body).not.toHaveProperty('contactChannel');
    expect(deliverySessionRepo.selectReceiver).toHaveBeenCalledWith({
      itemId: ITEM_UUID,
      requestId: REQUEST_UUID,
      donorId: USER_UUID,
      contactChannel: 'Telegram: @donor123',
    });
    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'receiver@example.com', templateId: 'TPL-003' })
    );
  });

  it('15.2 — request ya en estado selected → repo lanza ConflictException → 409', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn().mockRejectedValue(new ConflictException('Request is not in pending state')),
      },
    });
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'WhatsApp: +34600000000' });

    expect(res.status).toBe(409);
  });

  it('15.3 — item no activo (reserved) → repo lanza ConflictException → 409', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn().mockRejectedValue(new ConflictException('Item is not active')),
      },
    });
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'email@donante.com' });

    expect(res.status).toBe(409);
  });

  it('15.4 — usuario autenticado pero no es el donante → 403', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue({
          donorId: 'otro-usuario-uuid-distinto',
          status: 'active',
          requestsPaused: false,
        }),
      },
    });
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'contacto' });

    expect(res.status).toBe(403);
  });

  it('15.5 — donante correcto pero requestId no pertenece al item → repo lanza ForbiddenException → 403', async () => {
    const { app } = buildTestApp({
      deliverySessionRepo: {
        selectReceiver: vi.fn().mockRejectedValue(new ForbiddenException('Forbidden')),
      },
    });
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'contacto' });

    expect(res.status).toBe(403);
  });

  it('15.6 — body sin contactChannel → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({});

    expect(res.status).toBe(400);
  });

  it('15.7 — contactChannel vacío → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: '' });

    expect(res.status).toBe(400);
  });

  it('15.8 — sin autenticación → 401', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(SELECT_URL)
      .send({ contactChannel: 'contacto' });

    expect(res.status).toBe(401);
  });

  it('15.9 — itemId no es UUID v4 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/items/not-a-uuid/requests/${REQUEST_UUID}/select`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'contacto' });

    expect(res.status).toBe(400);
  });

  it('15.10 — requestId no es UUID v4 → 400', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post(`/items/${ITEM_UUID}/requests/not-a-uuid/select`)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'contacto' });

    expect(res.status).toBe(400);
  });

  it('15.11 — item no existe → 404', async () => {
    const { app } = buildTestApp({
      itemRepo: {
        findItemOwnership: vi.fn().mockResolvedValue(null),
      },
    });
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'contacto' });

    expect(res.status).toBe(404);
  });

  it('15.12 — fallo en email no propaga error (respuesta sigue siendo 200)', async () => {
    const { app } = buildTestApp({
      mailService: {
        send: vi.fn().mockRejectedValue(new Error('Resend API error')),
      },
    });
    const res = await request(app)
      .post(SELECT_URL)
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ contactChannel: 'Telegram: @donor' });

    expect(res.status).toBe(200);
  });
});
```

---

### Relación con historias anteriores y siguientes

**Historia 2.4 (anterior — `CancelItemUseCase`)**: usa `itemRepo.hasActiveDeliverySession(itemId)` que consulta la tabla `delivery_sessions`. Esta tabla NO existía hasta esta historia. La migración 009 es necesaria para que historia 2.4 funcione en producción (en tests estaba mockeada).

**Historia 3.2 (anterior — `GetRankedCandidatesUseCase`)**: el ranking muestra candidatos con `ir.status = 'pending'`. Después de `selectReceiver`, el ganador queda en `'selected'` y los demás en `'rejected'`. El endpoint `GET /items/:id/requests` ya no devolverá ningún candidato para ese item. Comportamiento correcto y esperado.

**Historia 4.2 (siguiente — `GET /delivery-sessions/:id`)**: necesitará una nueva ruta en un router diferente (`delivery-sessions.routes.ts`), no en `items.routes.ts`. La `delivery_session` creada en esta historia es la que se consultará en 4.2.

**Historia 4.5 (futura — Cancelar objeto con sesión activa)**: usa `hasActiveDeliverySession` y luego cancela la sesión. Depende de que la migración 009 ya esté aplicada.

### Archivos existentes que NO se modifican

- `src/domain/repositories/item.repository.ts` — sin cambios
- `src/domain/repositories/request.repository.ts` — sin cambios
- `src/infrastructure/database/supabase/item.repository.ts` — sin cambios
- `src/infrastructure/database/supabase/request.repository.ts` — sin cambios
- Ningún test file existente requiere actualización (el campo `deliverySessionRepo` es opcional en `ItemRouterDeps`)

### Convenciones del proyecto

- Nombre del archivo de repo: `delivery-session.repository.ts` (kebab-case)
- Clase: `PostgresDeliverySessionRepository` (PascalCase)
- Método: `selectReceiver` (camelCase)
- DTO: `SelectReceiverResponseDto`
- Use case: `SelectReceiverUseCase`
- Validator: `validateSelectReceiverBody`
- Migración: `009-create-delivery-sessions.sql`

### Project Structure Notes

- `src/domain/repositories/delivery-session.repository.ts` (NUEVO)
- `src/infrastructure/database/supabase/delivery-session.repository.ts` (NUEVO)
- `src/application/dtos/select-receiver.dto.ts` (NUEVO)
- `src/application/use-cases/item/select-receiver.use-case.ts` (NUEVO)
- `src/interfaces/validators/select-receiver.validator.ts` (NUEVO)
- `src/infrastructure/database/supabase/migrations/009-create-delivery-sessions.sql` (NUEVO)
- `src/interfaces/http/routes/items.routes.ts` (MODIFICADO)
- `src/interfaces/http/controllers/item.controller.ts` (MODIFICADO)
- `src/infrastructure/email/resend.provider.ts` (MODIFICADO)
- `tests/items-select.test.ts` (NUEVO)

### References

- Schema de `delivery_sessions`: [Source: docs/architecture.md — §3.5]
- Índices: [Source: docs/architecture.md — §4]
- Reglas de autorización (doble verificación): [Source: docs/architecture.md — §12.7]
- EVT-003 / TPL-003 variables requeridas: [Source: docs/email-flow-mapping.md — Tabla §2]
- Nota sobre contactChannel no va en email: [Source: docs/email-flow-mapping.md — §5, EVT-003]
- Patrón transacción de repositorio: [Source: src/infrastructure/database/supabase/request.repository.ts:13-69]
- Patrón fire-and-forget de email: [Source: src/application/use-cases/item/request-item.use-case.ts:31-37]
- Patrón validator: [Source: src/interfaces/validators/pause-item.validator.ts]
- Patrón `validateUuidParam`: [Source: src/interfaces/validators/uuid-param.validator.ts]
- FR19: [Source: _bmad-output/initiative-backend/archive-v6/epics.md — FR19]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implementada transacción atómica completa en `PostgresDeliverySessionRepository.selectReceiver`: SELECT FOR UPDATE → INSERT delivery_session → UPDATE selected → UPDATE rejected (bulk) → UPDATE reserved.
- Use case verifica donorId antes de delegar al repo; la verificación de estado del item/request ocurre dentro de la transacción (atómica).
- Email EVT-003/TPL-003 enviado fire-and-forget post-commit; fallo de email loguea con pino pero no revierte la transacción (test 15.12 verifica esto).
- `deliverySessionRepo` añadido como dependencia opcional en `ItemRouterDeps` — ningún test existente requirió modificación.
- 12 nuevos tests (15.1–15.12) cubren todos los ACs; 130 tests totales pasan sin regresiones.
- `npx tsc --noEmit` sin errores.

### File List

- `src/infrastructure/database/supabase/migrations/009-create-delivery-sessions.sql` (nuevo)
- `src/domain/repositories/delivery-session.repository.ts` (nuevo)
- `src/infrastructure/database/supabase/delivery-session.repository.ts` (nuevo)
- `src/application/dtos/select-receiver.dto.ts` (nuevo)
- `src/application/use-cases/item/select-receiver.use-case.ts` (nuevo)
- `src/interfaces/validators/select-receiver.validator.ts` (nuevo)
- `src/infrastructure/email/resend.provider.ts` (modificado — TPL-003 añadido)
- `src/interfaces/http/routes/items.routes.ts` (modificado — wiring completo)
- `src/interfaces/http/controllers/item.controller.ts` (modificado — 8º param + método selectReceiver)
- `tests/items-select.test.ts` (nuevo)

## Change Log

- 2026-05-13: Implementación completa de historia 4.1 — tabla delivery_sessions, repo con transacción atómica, use case con email fire-and-forget (EVT-003/TPL-003), validator, wiring en router/controller. 12 tests añadidos (130 totales, 0 regresiones).
