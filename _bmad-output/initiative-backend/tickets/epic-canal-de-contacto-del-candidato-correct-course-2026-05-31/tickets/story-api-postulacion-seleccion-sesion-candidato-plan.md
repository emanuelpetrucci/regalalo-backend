---
title: "API postulación, selección y sesión"
type: feature
ticket: 2
status: done
created: 2026-10-25
---

# Historia 12.2: API postulación, selección y sesión

Status: done

## Historia

Como plataforma,
quiero exigir el canal de contacto en la postulación, copiarlo a la sesión al seleccionar receptor y exponerlo al donante bajo SEC-002c,
para desbloquear la comunicación proactiva del donante con el candidato seleccionado.

## Criterios de aceptación

**Dado** `POST /items/:id/requests` con body `{ "contactChannel": "string no vacío" }` y usuario autenticado
**Cuando** se crea la solicitud
**Entonces** responde `201` y `item_requests.contact_channel` almacena el valor

**Dado** `POST /items/:id/requests` sin `contactChannel` o con valor vacío
**Entonces** responde `400` con error de validación

**Dado** `GET /items/:id/requests` como donante
**Entonces** la respuesta **no** incluye el canal de ningún candidato (decisión 2B — sin cambio en este endpoint)

**Dado** `POST /items/:id/requests/:requestId/select` con `contactChannel` del donante válido
**Cuando** la transacción atómica completa
**Entonces** `delivery_sessions.receiver_contact_channel` = `contact_channel` leído de `item_requests` de la solicitud seleccionada
**Y** todas las filas `item_requests` del mismo `item_id` (seleccionada + rechazadas) tienen `contact_channel = NULL`
**Y** la solicitud seleccionada queda `selected` y las rechazadas `rejected`

**Dado** fallo en cualquier paso de `SelectReceiver`
**Entonces** no hay copia parcial; el canal permanece en `item_requests` hasta commit exitoso

**Dado** `GET /delivery-sessions/:id` con `current_user = donor_id`, sesión `active`, `receiver_contact_purged = FALSE`
**Entonces** `receiverContactChannel` contiene el valor del candidato seleccionado

**Dado** `current_user = receiver_id`, o sesión no `active`, o `receiver_contact_purged = TRUE`
**Entonces** `receiverContactChannel` es `null`

**Dado** reglas SEC-002 y SEC-002b existentes (contactChannel al receptor, sharedContactChannel al donante)
**Entonces** permanecen sin cambio de semántica

**Dado** `npm test` y `npm run openapi:generate && npm run build` al cerrar la historia
**Entonces** pasan sin regresiones

## Alcance explícito (IN / OUT)

| IN (12.2) | OUT |
|---|---|
| Validator `request-item.validator.ts` (body `contactChannel`) | Schema SQL — ya en 12-1 |
| `CreateRequestInput` + `requestRepo.create()` con `contact_channel` | Jobs pg_cron — ya en 12-1 |
| `RequestItemUseCase` recibe `contactChannel` | Frontend Angular / cliente generado |
| `requestItem` controller lee `req.body.contactChannel` | Emails (EVT-006 sin canal — decisión 4A) |
| Ruta POST `/items/:id/requests` agrega `validateRequestItemBody` | `docs/prd.md`, `docs/architecture.md`, `epics.md` — 12-3 |
| `selectReceiver()` repo: leer canal pre-tx, INSERT `receiver_contact_channel`, NULL en `item_requests` | Historial de solicitudes (`GET /users/me/requests`) |
| `DeliverySessionDetail` + `DeliverySessionParticipantView` + `findByIdForParticipant()` + `findById()` | |
| `GetDeliverySessionResponseDto` + `GetDeliverySessionUseCase` SEC-002c | |
| `deliverySessionSchema` OpenAPI + `requestItemRequestSchema` OpenAPI | |
| `register-paths.ts` body en `POST /items/:id/requests` | |
| Tests actualizados en `items-request`, `items-select`, `delivery-sessions-get` | |
| `npm run openapi:generate` | |

## Tareas / Subtareas

- [x] **Task 1 — Validator y schema OpenAPI para RequestItem**
  - [x] Crear `src/interfaces/validators/request-item.validator.ts` (patrón: `select-receiver.validator.ts`)
    - Schema: `z.object({ contactChannel: z.string().min(1) })`
    - Exportar `requestItemBodySchema` y `validateRequestItemBody`
  - [x] En `src/openapi/schemas/item.schemas.ts`: importar `requestItemBodySchema` y exportar `requestItemRequestSchema = requestItemBodySchema.openapi('RequestItemRequest')`

- [x] **Task 2 — RequestItem: dominio + repo + use-case + controller + ruta**
  - [x] `src/domain/repositories/request.repository.ts`: agregar `contactChannel: string` a `CreateRequestInput`
  - [x] `src/infrastructure/database/supabase/request.repository.ts`: actualizar INSERT en `create()` — ver SQL exacto en Dev Notes
  - [x] `src/application/use-cases/item/request-item.use-case.ts`: agregar parámetro `contactChannel: string` a `execute()` y pasarlo al repo
  - [x] `src/interfaces/http/controllers/item.controller.ts`: actualizar `requestItem()` — pasar `req.body.contactChannel`
  - [x] `src/interfaces/http/routes/items.routes.ts`: importar y agregar `validateRequestItemBody` antes del controller en `POST /:id/requests`

- [x] **Task 3 — SelectReceiver: copia y purga en transacción atómica**
  - [x] `src/infrastructure/database/supabase/delivery-session.repository.ts`: actualizar `selectReceiver()` — ver cambios exactos en Dev Notes
  - [x] El `SelectReceiverInput` y `SelectReceiverUseCase` **no cambian** — la copia es responsabilidad interna del repo

- [x] **Task 4 — GetDeliverySession SEC-002c: dominio + infra + use-case + DTO**
  - [x] `src/domain/repositories/delivery-session.repository.ts`: agregar `receiverContactChannel: string | null` y `receiverContactPurged: boolean` a `DeliverySessionDetail`
  - [x] `src/infrastructure/database/supabase/delivery-session.repository.ts`:
    - Actualizar `findByIdForParticipant()`: tipo de fila + SQL SELECT + return mapping
    - Actualizar `findById()`: tipo de fila + SQL SELECT + return mapping
  - [x] `src/application/dtos/get-delivery-session.dto.ts`: agregar `receiverContactChannel: string | null` a `GetDeliverySessionResponseDto`
  - [x] `src/application/use-cases/delivery-session/get-delivery-session.use-case.ts`: agregar lógica SEC-002c y campo en return

- [x] **Task 5 — OpenAPI: body POST requests + campo receiverContactChannel**
  - [x] `src/openapi/register-paths.ts`: agregar `body` a `POST /items/{id}/requests` — ver Dev Notes
  - [x] `src/openapi/schemas/delivery.schemas.ts`: agregar `receiverContactChannel: z.string().nullable()` en `deliverySessionSchema`
  - [x] Ejecutar `npm run openapi:generate` y verificar `openapi/openapi.json` actualizado

- [x] **Task 6 — Tests**
  - [x] Actualizar `tests/items-request.test.ts` — ver cambios en Dev Notes
  - [x] Actualizar `tests/items-select.test.ts` — verificar copia `receiverContactChannel` (no requirió cambios)
  - [x] Actualizar `tests/delivery-sessions-get.test.ts` — agregar `receiverContactChannel/Purged` + casos SEC-002c
  - [x] Ejecutar `npm test` y confirmar 0 fallos (494 passed, 8 skipped)

- [x] **Task 7 — Verificación final**
  - [x] `npm run build` (incluye OpenAPI + tsc) pasa sin errores TypeScript
  - [x] `npm test` completo sin regresiones

---

## Notas para el Dev Agent

### Contexto de épica 12

Correct Course 2026-05-31 aprobó `docs/delta-candidato-contacto.md` v1.0. La historia 12-1 añadió las columnas SQL y rescheduló el job pg_cron — **debe estar aplicada antes del deploy de 12-2**. Esta historia implementa toda la lógica de aplicación. 12-3 sincronizará documentación.

**Referencia técnica canónica:** `docs/delta-candidato-contacto.md` §3–4 (use cases y contratos de API).

### CRÍTICO: Estado actual del código — qué existe y qué cambiar

#### 1. RequestItem — 5 archivos a cambiar, 1 nuevo

**`src/interfaces/validators/request-item.validator.ts` — CREAR (no existe)**

Patrón exacto de `select-receiver.validator.ts`:
```typescript
import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

export const requestItemBodySchema = z.object({
  contactChannel: z.string().min(1),
});

export function validateRequestItemBody(req: Request, res: Response, next: NextFunction): void {
  const result = requestItemBodySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request body', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
```

**`src/domain/repositories/request.repository.ts` — CAMBIAR `CreateRequestInput`**

```typescript
// ANTES:
export interface CreateRequestInput {
  itemId: string;
  requesterId: string;
}

// DESPUÉS:
export interface CreateRequestInput {
  itemId: string;
  requesterId: string;
  contactChannel: string;
}
```

**`src/infrastructure/database/supabase/request.repository.ts` — CAMBIAR el INSERT en `create()`**

```typescript
// ANTES (líneas 37-43):
result = await client.query<{ id: string; status: string; created_at: Date }>(
  `INSERT INTO item_requests (item_id, requester_id)
   VALUES ($1, $2)
   RETURNING id, status, created_at`,
  [input.itemId, input.requesterId],
);

// DESPUÉS:
result = await client.query<{ id: string; status: string; created_at: Date }>(
  `INSERT INTO item_requests (item_id, requester_id, contact_channel)
   VALUES ($1, $2, $3)
   RETURNING id, status, created_at`,
  [input.itemId, input.requesterId, input.contactChannel],
);
```

**`src/application/use-cases/item/request-item.use-case.ts` — CAMBIAR firma y llamada al repo**

```typescript
// ANTES (línea 21):
async execute(itemId: string, requesterId: string): Promise<RequestItemResponseDto> {

// DESPUÉS:
async execute(itemId: string, requesterId: string, contactChannel: string): Promise<RequestItemResponseDto> {

// ANTES (línea 29):
const result = await this.requestRepo.create({ itemId, requesterId });

// DESPUÉS:
const result = await this.requestRepo.create({ itemId, requesterId, contactChannel });
```

**`src/interfaces/http/controllers/item.controller.ts` — CAMBIAR `requestItem()`**

```typescript
// ANTES (líneas 104-113):
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

// DESPUÉS:
async requestItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await this.requestItemUseCase.execute(
      req.params.id,
      req.currentUser!.id,
      req.body.contactChannel,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}
```

**`src/interfaces/http/routes/items.routes.ts` — AGREGAR validator en POST `/:id/requests`**

```typescript
// Agregar import (junto a los otros validators):
import { validateRequestItemBody } from '../../validators/request-item.validator';

// ANTES (líneas 140-145):
router.post(
  '/:id/requests',
  authMiddleware,
  validateUuidParam('id'),
  (req, res, next) => controller.requestItem(req, res, next),
);

// DESPUÉS:
router.post(
  '/:id/requests',
  authMiddleware,
  validateUuidParam('id'),
  validateRequestItemBody,
  (req, res, next) => controller.requestItem(req, res, next),
);
```

---

#### 2. SelectReceiver — 1 archivo a cambiar

**`src/infrastructure/database/supabase/delivery-session.repository.ts` — CAMBIAR `selectReceiver()`**

El método `SelectReceiverUseCase` y `SelectReceiverInput`/`SelectReceiverResult` **no cambian**. Solo cambia la implementación interna del repo.

Cambios dentro de `selectReceiver()`:

**Paso 1 — SELECT con `contact_channel` incluido** (actualmente líneas 24-41):
```typescript
// ANTES — tipo de fila:
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

// DESPUÉS — agregar contact_channel al tipo y al SQL:
const reqResult = await client.query<{
  requester_id: string;
  req_status: string;
  requester_contact_channel: string | null;
  item_status: string;
  title: string;
  condition: string;
}>(
  `SELECT ir.requester_id,
          ir.status           AS req_status,
          ir.contact_channel  AS requester_contact_channel,
          i.status            AS item_status,
          i.title,
          i.condition
   FROM item_requests ir
   JOIN items i ON i.id = ir.item_id
   WHERE ir.id = $1 AND ir.item_id = $2
   FOR UPDATE`,
  [input.requestId, input.itemId],
);
```

**Paso 2 — Destructuring** (actualmente línea 48):
```typescript
// ANTES:
const { requester_id, req_status, item_status, title, condition } = reqResult.rows[0];

// DESPUÉS:
const { requester_id, req_status, requester_contact_channel, item_status, title, condition } = reqResult.rows[0];
```

**Paso 3 — INSERT en `delivery_sessions`** (actualmente líneas 57-65):
```typescript
// ANTES:
const sessionResult = await client.query<{
  id: string;
  deadline_at: Date;
}>(
  `INSERT INTO delivery_sessions (item_id, donor_id, receiver_id, contact_channel)
   VALUES ($1, $2, $3, $4)
   RETURNING id, deadline_at`,
  [input.itemId, input.donorId, requester_id, input.contactChannel],
);

// DESPUÉS:
const sessionResult = await client.query<{
  id: string;
  deadline_at: Date;
}>(
  `INSERT INTO delivery_sessions (item_id, donor_id, receiver_id, contact_channel, receiver_contact_channel)
   VALUES ($1, $2, $3, $4, $5)
   RETURNING id, deadline_at`,
  [input.itemId, input.donorId, requester_id, input.contactChannel, requester_contact_channel],
);
```

**Paso 4 — UPDATE solicitud seleccionada: agregar `contact_channel = NULL`** (actualmente líneas 67-69):
```typescript
// ANTES:
await client.query(
  `UPDATE item_requests SET status = 'selected' WHERE id = $1`,
  [input.requestId],
);

// DESPUÉS:
await client.query(
  `UPDATE item_requests SET status = 'selected', contact_channel = NULL WHERE id = $1`,
  [input.requestId],
);
```

**Paso 5 — UPDATE solicitudes rechazadas: agregar `contact_channel = NULL`** (actualmente líneas 71-75):
```typescript
// ANTES:
await client.query(
  `UPDATE item_requests SET status = 'rejected'
   WHERE item_id = $1 AND id != $2 AND status = 'pending'`,
  [input.itemId, input.requestId],
);

// DESPUÉS:
await client.query(
  `UPDATE item_requests SET status = 'rejected', contact_channel = NULL
   WHERE item_id = $1 AND id != $2 AND status = 'pending'`,
  [input.itemId, input.requestId],
);
```

---

#### 3. GetDeliverySession — 4 archivos a cambiar

**`src/domain/repositories/delivery-session.repository.ts` — CAMBIAR `DeliverySessionDetail`**

```typescript
// ANTES:
export interface DeliverySessionDetail {
  id: string;
  itemId: string;
  donorId: string;
  receiverId: string;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  contactChannel: string | null;
  contactPurged: boolean;
  donorConfirmed: boolean;
  noShowDeclared: boolean;
  deadlineAt: Date;
  createdAt: Date;
  completedAt: Date | null;
}

// DESPUÉS (agregar al final de la interface):
export interface DeliverySessionDetail {
  id: string;
  itemId: string;
  donorId: string;
  receiverId: string;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  contactChannel: string | null;
  contactPurged: boolean;
  receiverContactChannel: string | null;
  receiverContactPurged: boolean;
  donorConfirmed: boolean;
  noShowDeclared: boolean;
  deadlineAt: Date;
  createdAt: Date;
  completedAt: Date | null;
}
```

`DeliverySessionParticipantView` extiende `DeliverySessionDetail` → hereda automáticamente los campos nuevos.

**`src/infrastructure/database/supabase/delivery-session.repository.ts` — CAMBIAR `findByIdForParticipant()` y `findById()`**

En `findByIdForParticipant()`:

Agregar al tipo de fila del query (junto a `contact_purged`):
```typescript
receiver_contact_channel: string | null;
receiver_contact_purged: boolean;
```

Agregar al SELECT SQL (junto a `ds.contact_purged`):
```sql
ds.receiver_contact_channel,
ds.receiver_contact_purged,
```

Agregar al return object (junto a `contactPurged`):
```typescript
receiverContactChannel: row.receiver_contact_channel,
receiverContactPurged: row.receiver_contact_purged,
```

En `findById()` (método más simple al final del archivo):

Agregar al tipo de fila:
```typescript
receiver_contact_channel: string | null;
receiver_contact_purged: boolean;
```

Agregar al SELECT SQL (en la línea del SELECT existente):
```sql
SELECT id, item_id, donor_id, receiver_id, status, contact_channel, contact_purged,
       receiver_contact_channel, receiver_contact_purged,
       donor_confirmed, no_show_declared, deadline_at, created_at, completed_at
FROM delivery_sessions
WHERE id = $1
```

Agregar al return object:
```typescript
receiverContactChannel: row.receiver_contact_channel,
receiverContactPurged: row.receiver_contact_purged,
```

**`src/application/dtos/get-delivery-session.dto.ts` — AGREGAR campo**

```typescript
// ANTES:
export interface GetDeliverySessionResponseDto {
  id: string;
  itemId: string;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  contactChannel: string | null;
  sharedContactChannel: string | null;
  deadlineAt: Date;
  // ...resto sin cambio
}

// DESPUÉS (agregar receiverContactChannel junto a sharedContactChannel):
export interface GetDeliverySessionResponseDto {
  id: string;
  itemId: string;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  contactChannel: string | null;
  sharedContactChannel: string | null;
  receiverContactChannel: string | null;
  deadlineAt: Date;
  // ...resto sin cambio
}
```

**`src/application/use-cases/delivery-session/get-delivery-session.use-case.ts` — AGREGAR SEC-002c**

```typescript
// ANTES (alrededor de líneas 27-58):
const isDonor = currentUserId === session.donorId;
const isReceiver = currentUserId === session.receiverId;
const isActive = session.status === 'active';
const canRevealContact = isActive && !session.contactPurged;

const revealContactChannel = isReceiver && canRevealContact;
const revealSharedContactChannel =
  isDonor && canRevealContact && session.contactChannel !== null;

return {
  id: session.id,
  // ...
  contactChannel: revealContactChannel ? session.contactChannel : null,
  sharedContactChannel: revealSharedContactChannel ? session.contactChannel : null,
  // ...
};

// DESPUÉS (agregar SEC-002c):
const isDonor = currentUserId === session.donorId;
const isReceiver = currentUserId === session.receiverId;
const isActive = session.status === 'active';
const canRevealContact = isActive && !session.contactPurged;

const revealContactChannel = isReceiver && canRevealContact;
const revealSharedContactChannel =
  isDonor && canRevealContact && session.contactChannel !== null;
const revealReceiverContactChannel =
  isDonor && isActive && !session.receiverContactPurged;  // SEC-002c

return {
  id: session.id,
  // ...
  contactChannel: revealContactChannel ? session.contactChannel : null,
  sharedContactChannel: revealSharedContactChannel ? session.contactChannel : null,
  receiverContactChannel: revealReceiverContactChannel ? session.receiverContactChannel : null,
  // ...
};
```

---

#### 4. OpenAPI — 2 archivos a cambiar + regenerar

**`src/openapi/schemas/item.schemas.ts` — AGREGAR `requestItemRequestSchema`**

```typescript
// Agregar import al inicio (junto a los otros imports de validators):
import { requestItemBodySchema } from '../../interfaces/validators/request-item.validator';

// Agregar export (justo antes o después de selectReceiverRequestSchema):
export const requestItemRequestSchema = requestItemBodySchema.openapi('RequestItemRequest');
```

**`src/openapi/register-paths.ts` — AGREGAR body a POST /items/{id}/requests**

```typescript
// Agregar import de requestItemRequestSchema (en el bloque de imports de item.schemas):
import {
  // ...existentes...
  requestItemRequestSchema,
} from './schemas/item.schemas';

// ANTES (líneas 272-289):
registry.registerPath({
  method: 'post',
  path: '/items/{id}/requests',
  tags: ['Items'],
  summary: 'Solicitar un objeto',
  security: [...secured],
  request: { params: z.object({ id: uuidParamSchema }) },
  responses: { ... },
});

// DESPUÉS (agregar body):
registry.registerPath({
  method: 'post',
  path: '/items/{id}/requests',
  tags: ['Items'],
  summary: 'Solicitar un objeto',
  security: [...secured],
  request: {
    params: z.object({ id: uuidParamSchema }),
    body: { content: { 'application/json': { schema: requestItemRequestSchema } } },
  },
  responses: { ... },
});
```

**`src/openapi/schemas/delivery.schemas.ts` — AGREGAR `receiverContactChannel` a `deliverySessionSchema`**

```typescript
// ANTES:
export const deliverySessionSchema = z
  .object({
    id: z.string().uuid(),
    itemId: z.string().uuid(),
    status: deliverySessionStatusSchema,
    contactChannel: z.string().nullable(),
    sharedContactChannel: z.string().nullable(),
    deadlineAt: z.string().datetime(),
    // ...resto sin cambio
  })
  .openapi('DeliverySession');

// DESPUÉS (agregar receiverContactChannel junto a sharedContactChannel):
export const deliverySessionSchema = z
  .object({
    id: z.string().uuid(),
    itemId: z.string().uuid(),
    status: deliverySessionStatusSchema,
    contactChannel: z.string().nullable(),
    sharedContactChannel: z.string().nullable(),
    receiverContactChannel: z.string().nullable(),
    deadlineAt: z.string().datetime(),
    // ...resto sin cambio
  })
  .openapi('DeliverySession');
```

---

#### 5. Tests — cambios necesarios

**`tests/items-request.test.ts`**

Los tests existentes (13.1–13.10) actualmente hacen `POST` sin body. TypeScript fallará en compilación porque el use case ahora exige `contactChannel`. Además, el test 13.1 debe verificar que el repo recibe `contactChannel`.

Cambios en tests existentes:
- **13.1**: Agregar `.send({ contactChannel: 'WhatsApp: +34600000000' })` al request. Actualizar `expect(requestRepo.create).toHaveBeenCalledWith(...)` para incluir `contactChannel: 'WhatsApp: +34600000000'`.
- **13.2–13.10**: Agregar `.send({ contactChannel: 'WhatsApp: +34600000000' })` a cada llamada que necesite body (las que esperan 4xx por otras razones pueden omitirlo o incluirlo).

Nuevos casos a agregar:
```typescript
it('13.11 — sin contactChannel en body → 400', async () => {
  const { app } = buildTestApp();
  const res = await request(app)
    .post(`/items/${ITEM_UUID}/requests`)
    .set('Authorization', 'Bearer mock-jwt-token')
    .send({});

  expect(res.status).toBe(400);
});

it('13.12 — contactChannel vacío → 400', async () => {
  const { app } = buildTestApp();
  const res = await request(app)
    .post(`/items/${ITEM_UUID}/requests`)
    .set('Authorization', 'Bearer mock-jwt-token')
    .send({ contactChannel: '' });

  expect(res.status).toBe(400);
});
```

**`tests/items-select.test.ts`**

El test 15.1 verifica que `deliverySessionRepo.selectReceiver` recibe `{ itemId, requestId, donorId, contactChannel }`. **No necesita cambiar** — estos parámetros son los mismos. El `receiver_contact_channel` es responsabilidad interna del repo y no se verifica en tests de use case.

Si hay un test de integración del repo (`delivery-session.repository.integration.test.ts` o similar), ese sí necesitaría verificar la copia. Pero no existe actualmente — se cubre con tests HTTP.

**`tests/delivery-sessions-get.test.ts`**

El `mockSessionBase` debe extenderse con los nuevos campos para cumplir con `DeliverySessionParticipantView` (TypeScript los exigirá):

```typescript
const mockSessionBase = {
  // ...campos existentes...
  contactChannel: 'Telegram: @donante',
  contactPurged: false,
  receiverContactChannel: 'WhatsApp: +34611222333',  // NUEVO
  receiverContactPurged: false,                        // NUEVO
  // ...resto sin cambio
};
```

Nuevos casos a agregar (SEC-002c):
```typescript
it('16.13 — donante, sesión activa, receiver_contact_purged false → receiverContactChannel tiene valor', async () => {
  const { app } = buildTestApp({
    deliverySessionRepo: {
      selectReceiver: vi.fn(),
      findById: vi.fn(),
      findByIdForParticipant: vi.fn().mockResolvedValue(
        toParticipantView({
          donorId: USER_UUID,
          receiverId: DONOR_UUID,
          otherPartyUserId: DONOR_UUID,
          receiverContactChannel: 'WhatsApp: +34611222333',
          receiverContactPurged: false,
        }),
      ),
    },
  });
  const res = await request(app)
    .get(SESSION_URL)
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(200);
  expect(res.body.receiverContactChannel).toBe('WhatsApp: +34611222333');
});

it('16.14 — donante, sesión activa, receiver_contact_purged true → receiverContactChannel null', async () => {
  const { app } = buildTestApp({
    deliverySessionRepo: {
      selectReceiver: vi.fn(),
      findById: vi.fn(),
      findByIdForParticipant: vi.fn().mockResolvedValue(
        toParticipantView({
          donorId: USER_UUID,
          receiverId: DONOR_UUID,
          otherPartyUserId: DONOR_UUID,
          receiverContactPurged: true,
        }),
      ),
    },
  });
  const res = await request(app)
    .get(SESSION_URL)
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(200);
  expect(res.body.receiverContactChannel).toBeNull();
});

it('16.15 — receptor → receiverContactChannel siempre null', async () => {
  const { app } = buildTestApp();  // USER_UUID es receiver por defecto en mockSessionBase
  const res = await request(app)
    .get(SESSION_URL)
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(200);
  expect(res.body.receiverContactChannel).toBeNull();
});

it('16.16 — donante, sesión completed → receiverContactChannel null', async () => {
  const { app } = buildTestApp({
    deliverySessionRepo: {
      selectReceiver: vi.fn(),
      findById: vi.fn(),
      findByIdForParticipant: vi.fn().mockResolvedValue(
        toParticipantView({
          donorId: USER_UUID,
          receiverId: DONOR_UUID,
          otherPartyUserId: DONOR_UUID,
          status: 'completed',
          receiverContactPurged: false,
        }),
      ),
    },
  });
  const res = await request(app)
    .get(SESSION_URL)
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(200);
  expect(res.body.receiverContactChannel).toBeNull();
});
```

También actualizar el test 16.1 (donante ve null para `contactChannel`) para verificar que `receiverContactChannel` SÍ tiene valor cuando corresponde (o simplemente que no sea `undefined`).

---

### Guardrails arquitectónicos críticos

1. **SEC-002c es paralelo a SEC-002 y SEC-002b** — revisar lógica existente en `GetDeliverySessionUseCase` para entender el patrón antes de añadir.

2. **La purga de `contact_channel` en `item_requests` ocurre en `selectReceiver()` del repo, no en el job pg_cron**. El job solo purga canales de `delivery_sessions`. Esto está en el delta §3.2 y §5 explícitamente.

3. **`requester_contact_channel` puede ser `NULL`** si la solicitud fue creada antes del deploy de 12-1 (datos legacy). El INSERT en `delivery_sessions` con `NULL` para `receiver_contact_channel` es correcto y esperado — la columna es nullable.

4. **`SelectReceiverInput` y `SelectReceiverUseCase` no cambian** — la firma pública no se altera. Solo cambia la implementación interna del repo infra.

5. **Tabla de visibilidad resultante** (canónica según delta §3.3):

| Campo | Donante (sesión `active`, no purgado) | Receptor (sesión `active`) |
|---|---|---|
| `contactChannel` | `null` siempre | valor (SEC-002) |
| `sharedContactChannel` | valor (SEC-002b) | `null` siempre |
| `receiverContactChannel` | valor (SEC-002c) | `null` siempre |

6. **`revealReceiverContactChannel`** solo depende de `isDonor`, `isActive`, `!receiverContactPurged`. **No** depende de `session.receiverContactChannel !== null` (a diferencia de `revealSharedContactChannel`). Si el canal es `null` (legacy), simplemente se expone `null` al donante — correcto.

7. **No exponer `contact_channel` de candidatos en `GET /items/:id/requests`** — el `RankedCandidateDto` y su repositorio no se tocan. La decisión 2B es definitiva.

8. **OpenAPI**: siempre regenerar con `npm run openapi:generate` (nunca editar `openapi/openapi.json` a mano).

### Cumplimiento arquitectónico

- SQL explícito, sin ORM.
- Transacción en `selectReceiver()` continúa siendo `BEGIN`/`COMMIT` con `FOR UPDATE` — patrón ya establecido.
- Use cases no contienen SQL; repos no contienen lógica de negocio.
- Validación en `interfaces/validators/` → 400 antes del controlador (patrón existente).
- `BadRequestException` para `contactChannel` ausente/vacío — el middleware `error-handler` mapea a HTTP 400.
- Tests de integración HTTP en `tests/*.test.ts` con `vi.mock` para repos.

### Estructura de archivos

| Acción | Ruta |
|---|---|
| **NEW** | `src/interfaces/validators/request-item.validator.ts` |
| **UPDATE** | `src/openapi/schemas/item.schemas.ts` |
| **UPDATE** | `src/domain/repositories/request.repository.ts` |
| **UPDATE** | `src/infrastructure/database/supabase/request.repository.ts` |
| **UPDATE** | `src/application/use-cases/item/request-item.use-case.ts` |
| **UPDATE** | `src/interfaces/http/controllers/item.controller.ts` |
| **UPDATE** | `src/interfaces/http/routes/items.routes.ts` |
| **UPDATE** | `src/infrastructure/database/supabase/delivery-session.repository.ts` |
| **UPDATE** | `src/domain/repositories/delivery-session.repository.ts` |
| **UPDATE** | `src/application/dtos/get-delivery-session.dto.ts` |
| **UPDATE** | `src/application/use-cases/delivery-session/get-delivery-session.use-case.ts` |
| **UPDATE** | `src/openapi/register-paths.ts` |
| **UPDATE** | `src/openapi/schemas/delivery.schemas.ts` |
| **REGEN** | `openapi/openapi.json` (via `npm run openapi:generate`) |
| **UPDATE** | `tests/items-request.test.ts` |
| **UPDATE** | `tests/items-select.test.ts` (verificar si necesita cambios) |
| **UPDATE** | `tests/delivery-sessions-get.test.ts` |
| **NO TOCAR** | `tests/candidate-contact-channel-migration.test.ts` (12-1) |
| **NO TOCAR** | `src/application/use-cases/item/select-receiver.use-case.ts` |
| **NO TOCAR** | `src/openapi/schemas/common.schemas.ts` |

### Requisitos de testing

- Tests HTTP con Vitest + Supertest — `vi.mock` para repos/services.
- `LOG_LEVEL: silent` en tests (`vitest.config.ts`).
- Patrones de naming `describe` / `it`: usar IDs de historia (`12.2 — ...`) para nuevos casos.
- Cubrir obligatoriamente:
  - `POST /items/:id/requests` sin `contactChannel` → 400
  - `POST /items/:id/requests` con `contactChannel: ''` → 400
  - `POST /items/:id/requests` con `contactChannel` válido → 201 + verificar que repo recibe `contactChannel`
  - `GET /delivery-sessions/:id` donante activa no purgada → `receiverContactChannel` tiene valor
  - `GET /delivery-sessions/:id` receptor → `receiverContactChannel` null
  - `GET /delivery-sessions/:id` donante sesión no activa → `receiverContactChannel` null
  - `GET /delivery-sessions/:id` donante `receiver_contact_purged=true` → `receiverContactChannel` null
- `npm test` completo sin regresiones — los 13.1–13.10 existentes necesitan body en las llamadas que antes iban sin body.

### Inteligencia de historias relacionadas

**Historia 12-1** (`12-1-schema-y-jobs-purga-canal-candidato.md`):
- Añadió `item_requests.contact_channel TEXT` nullable y `delivery_sessions.receiver_contact_channel/receiver_contact_purged`.
- Amplió índice `idx_sessions_contact_purge` (condición OR).
- Amplió job `purge-contact-channel` para purgar ambos canales.
- **Debe estar aplicada (migración 018 ejecutada) antes de desplegar 12-2**.

**Historia 4.1** (`4-1-seleccionar-receptor-para-un-objeto.md`):
- Creó `SelectReceiver` con `contact_channel` del donante — este repo es el que modificamos.
- Patrón TX con `FOR UPDATE` + `BEGIN`/`COMMIT` ya establecido aquí.

**Historia 4.2** (`4-2-ver-detalle-de-sesion-de-entrega.md`):
- Creó `GetDeliverySession` con SEC-002 y SEC-002b — extensión simétrica para SEC-002c.

### Git intelligence

Trabajo reciente (4bb32e8, 344933f) en CORS/env — sin conflicto con estos archivos. Épica 11 (ranking, historias 11-3/11-4) está en `review` — verificar que los archivos de tests compartidos no tienen conflictos de merge antes de commit.

### Información técnica

- `pg` pool: `client = await this.db.connect()` + `client.release()` en `finally`. **No cambiar este patrón.**
- `SERIALIZABLE` en `requestRepo.create()` para el límite de 3/30 días — **mantener**.
- `delivery-session.repository.ts` usa `BEGIN` simple (no SERIALIZABLE) en `selectReceiver()` — **mantener** (patrón 4.1, SEC-006 dice TX atómica, no SERIALIZABLE aquí).
- `z` solo desde `src/zod.ts` en validators (no importar de `zod` directamente).

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (2026-05-31)

### Debug Log References

Sin bloqueos. Implementación directa siguiendo las notas del Dev Agent al pie de la letra.

### Completion Notes List

- Task 1: Creado `request-item.validator.ts` siguiendo patrón exacto de `select-receiver.validator.ts`. Exportado `requestItemRequestSchema` en `item.schemas.ts`.
- Task 2: `CreateRequestInput` extendido con `contactChannel`. INSERT actualizado con `$3`. Use-case y controller actualizados. Validator añadido a la ruta POST.
- Task 3: `selectReceiver()` actualizado: SELECT incluye `contact_channel` del requester, INSERT en `delivery_sessions` añade `receiver_contact_channel`, UPDATE de solicitudes purga `contact_channel = NULL` en seleccionada y rechazadas.
- Task 4: `DeliverySessionDetail` extendida con `receiverContactChannel/receiverContactPurged`. Ambos métodos de repo actualizados (tipo + SQL + mapping). DTO y use-case actualizados con lógica SEC-002c (`revealReceiverContactChannel` = isDonor && isActive && !receiverContactPurged).
- Task 5: OpenAPI actualizado — body en POST /items/{id}/requests, campo `receiverContactChannel` en `deliverySessionSchema`. `npm run openapi:generate` ejecutado exitosamente.
- Task 6: Tests 13.1–13.10 actualizados con `.send({ contactChannel: ... })`. Casos 13.11 y 13.12 añadidos (validación 400). `mockSessionBase` extendido con campos nuevos. Casos 16.13–16.16 añadidos (SEC-002c). `items-select.test.ts` no requirió cambios. 494 tests pasan, 0 fallos.
- Task 7: `npm run build` (OpenAPI + tsc) limpio.

### File List

- `src/interfaces/validators/request-item.validator.ts` — NEW
- `src/openapi/schemas/item.schemas.ts` — UPDATE
- `src/domain/repositories/request.repository.ts` — UPDATE
- `src/infrastructure/database/supabase/request.repository.ts` — UPDATE
- `src/application/use-cases/item/request-item.use-case.ts` — UPDATE
- `src/interfaces/http/controllers/item.controller.ts` — UPDATE
- `src/interfaces/http/routes/items.routes.ts` — UPDATE
- `src/infrastructure/database/supabase/delivery-session.repository.ts` — UPDATE
- `src/domain/repositories/delivery-session.repository.ts` — UPDATE
- `src/application/dtos/get-delivery-session.dto.ts` — UPDATE
- `src/application/use-cases/delivery-session/get-delivery-session.use-case.ts` — UPDATE
- `src/openapi/register-paths.ts` — UPDATE
- `src/openapi/schemas/delivery.schemas.ts` — UPDATE
- `openapi/openapi.json` — REGEN
- `tests/items-request.test.ts` — UPDATE
- `tests/delivery-sessions-get.test.ts` — UPDATE

---

### Review Findings

- [x] [Review][Patch] Restaurar `contact_channel` en cancelación — en `cancelDelivery`, tras resetear statuses a `pending`, copiar `delivery_sessions.receiver_contact_channel` de vuelta a `item_requests.contact_channel` del requester seleccionado (JOIN por `requester_id = receiver_id`). Así un requester que fue seleccionado y luego cancelado puede ser reseleccionado con su canal original. [`src/infrastructure/database/supabase/delivery-session.repository.ts`]
- [x] [Review][Patch] Agregar `.max()` al validator `contactChannel` — sin límite de longitud, un payload enorme pasa validación y puede disparar un error 23514 de PostgreSQL (CHECK constraint) no manejado → 500 [`src/interfaces/validators/request-item.validator.ts`]
- [x] [Review][Patch] Agregar `.trim()` al validator `contactChannel` — `" "` (espacio) pasa `z.string().min(1)` y se persiste como canal inútil [`src/interfaces/validators/request-item.validator.ts`]
- [x] [Review][Patch] Tests 16.13 y 16.14 dependen implícitamente de `mockSessionBase.receiverContactChannel` — deben declarar el valor explícitamente en su propio override para no romperse si el base cambia [`tests/delivery-sessions-get.test.ts`]
- [x] [Review][Patch] Falta test 16.17: donante elegible pero `receiverContactChannel = null` en DB (datos legacy) — el use-case devuelve null (correcto por spec), pero no hay test que lo verifique [`tests/delivery-sessions-get.test.ts`]
- [x] [Review][Defer] `revealSharedContactChannel` gatea en `session.contactChannel !== null` — comportamiento pre-existente de SEC-002b, no introducido en este diff [`src/application/use-cases/delivery-session/get-delivery-session.use-case.ts`] — deferred, pre-existing
- [x] [Review][Defer] AC-4 filas ya en `rejected` de ciclos previos no se purgan — teórico, el flujo normal las purga en su propio `selectReceiver` [`src/infrastructure/database/supabase/delivery-session.repository.ts`] — deferred, pre-existing
- [x] [Review][Defer] Sin test que verifique ausencia de `contactChannel` en respuesta de candidatos rankeados (AC-3) — la SQL no selecciona ese campo, gap de cobertura pre-existente — deferred, pre-existing

## Change Log

- 2026-05-31: Implementación completa de historia 12.2. Validator `contactChannel` en POST /items/:id/requests, copia atómica a `delivery_sessions.receiver_contact_channel` en SelectReceiver, exposición SEC-002c al donante en GetDeliverySession. 494 tests pasando, build limpio.
