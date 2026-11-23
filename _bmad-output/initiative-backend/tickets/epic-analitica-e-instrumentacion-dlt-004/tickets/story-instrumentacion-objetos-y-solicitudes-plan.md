---
title: "Instrumentación objetos y solicitudes"
type: feature
ticket: 5
status: done
created: 2026-10-25
---

# Historia 7.5: Instrumentación objetos y solicitudes

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como responsable de producto,
quiero eventos de analítica en el ciclo de vida del objeto y en los límites de solicitud,
para analizar conversión, fricción y decisiones del donante sin exponer PII en los logs.

## Criterios de aceptación

1. **Dado** una solicitud de ítem exitosa (`POST /items/:id/requests` → 201), **cuando** `requestRepo.create` ha hecho commit, **entonces** se emite AE-011 `item.requested` vía `emitEvent` con `userId` = solicitante, `properties: { itemId, category }` — fire-and-forget post-commit, sin alterar la respuesta HTTP.

2. **Dado** el límite 3/30 días alcanzado, **cuando** el repositorio lanza la excepción de límite (`LimitExceededException` o `ConflictException('Request limit reached')` según implementación), **entonces** el use case emite AE-031 `limit.reached` con `properties: { windowStart, windowEnd }` (ISO 8601, ventana 720 h) **antes** de relanzar — la operación sigue respondiendo 409 como hoy.

3. **Dado** selección de receptor exitosa (`POST /items/:id/requests/:requestId/select` → 200), **cuando** `deliverySessionRepo.selectReceiver` ha hecho commit, **entonces** se emite AE-012 `item.receiver_selected` con `userId` = donante, `properties: { itemId, candidateCount, timeToSelectMs }` y `sessionId` = id de la sesión creada (4.º argumento de `emitEvent`).

4. **Dado** cancelación de ítem exitosa (`DELETE /items/:id` → 200), **cuando** `itemRepo.cancelItem` ha hecho commit, **entonces** se emite AE-014 `item.cancelled` con `userId` = donante, `properties: { itemId, category, hadActiveSession }` — `hadActiveSession` refleja si existía sesión activa **antes** de la transacción de cancelación.

5. **Dado** pausa o reanudación exitosa (`PATCH /items/:id/pause` → 200), **cuando** `itemRepo.setPauseStatus` completa, **entonces** se emite AE-015 `item.requests_paused` con `userId` = donante, `properties: { itemId, paused }`.

6. **Dado** el job `degrade-inactive-items` procesado por `DegradeInactiveItemsUseCase`, **cuando** se itera cada ítem recién degradado (mismo batch que dispara EVT-012), **entonces** se emite AE-013 `item.degraded` por ítem con `userId` = `donorId`, `properties: { itemId, category, daysActiveBeforeDegradation }` — fire-and-forget; fallo de analítica no impide el email.

7. **Dado** intentos fallidos (404, 403, 409 distintos de límite, 400 propio objeto, etc.), **cuando** el use case lanza excepción o responde error, **entonces** `emitEvent` **no** se invoca (excepto AE-031 en el catch de límite).

8. **Dado** tests de integración/unitarios existentes de request, select, cancel, pause y degrade, **cuando** se ejecutan, **entonces** verifican llamada a `emitEvent` (mock/spy) con payload correcto en éxito, ausencia en fallos, y distinción entre límite alcanzado (AE-031) y otros 409 — cumpliendo SC-02 (sin PII prohibida en `properties`).

## Alcance explícito (IN / OUT)

| IN (7.5) | OUT (historias 7.6 / otras) |
|---|---|
| `request-item.use-case.ts` — AE-011, AE-031 | AE-010 `item.published` (7.3) |
| `select-receiver.use-case.ts` — AE-012 | AE-001/002 auth (7.4) |
| `cancel-item.use-case.ts` — AE-014 | AE-020…AE-030 sesiones/reputación (7.6) |
| `pause-item.use-case.ts` — AE-015 | Crear `analytics.service` / `loggers.ts` (7.2) |
| `degrade-inactive-items.use-case.ts` — AE-013 | Modificar SQL del job pg_cron |
| Extender `FindItemOwnershipResult` y/o `NewlyDegradedItem` si faltan campos analíticos | Regenerar OpenAPI |
| Opcional: `LimitExceededException` + ajuste en `request.repository.ts` | Instrumentar `get-ranked-candidates` (sin AE en catálogo) |
| Tests ampliados en 5 ficheros de test | Exponer `category` en DTOs HTTP de lectura |

**Prerrequisitos:**

| Story | Requisito |
|---|---|
| **7.2** | `analytics.service.ts` + `emitEvent` + `analyticsLogger` — **obligatorio** |
| **7.1** | Columnas `category`/`weight_range` y entidad `Item` — **obligatorio** para `category` en eventos |
| 7.3, 7.4 | Independientes — patrón `emitEvent` ya documentado |

**Orden recomendado:** `7.2` (+ `7.1`) → **7.5** tras o en paralelo con 7.3/7.4. **7.6** continúa el mismo patrón en delivery/reputación.

## Tareas / Subtareas

- [x] **Task 0 — Preparar datos de dominio para analítica** (AC: #1, #3, #4, #6)
  - [x] Extender `FindItemOwnershipResult` en `domain/repositories/item.repository.ts` con al menos: `id`, `category`, `createdAt` (tipos `ItemCategory`, `Date`)
  - [x] Actualizar `PostgresItemRepository.findItemOwnership` — SELECT `id, category, created_at` además de campos actuales
  - [x] Extender `NewlyDegradedItem` con `donorId`, `category`, `createdAt` (o `degradedAt` para calcular días)
  - [x] Actualizar `findNewlyDegradedItems` SQL para devolver esos campos
  - [x] Actualizar mocks en tests que usen `findItemOwnership` / `findNewlyDegradedItems`

- [x] **Task 1 — `LimitExceededException` (recomendado)** (AC: #2, #7)
  - [x] Crear `src/domain/exceptions/limit-exceeded.exception.ts` extendiendo `ConflictException` (mensaje `'Request limit reached'`)
  - [x] En `request.repository.ts`, reemplazar `throw new ConflictException('Request limit reached')` por `throw new LimitExceededException()`
  - [x] Verificar `error-handler` sigue mapeando a 409 (hereda de `ConflictException`)
  - [x] **Alternativa mínima:** catch en use case por `err instanceof ConflictException && err.message === 'Request limit reached'` — menos limpio pero válido si se evita nueva excepción

- [x] **Task 2 — `RequestItemUseCase` AE-011 y AE-031** (AC: #1, #2, #7)
  - [x] Importar `emitEvent` desde `../../services/analytics.service`
  - [x] Envolver `await this.requestRepo.create(...)` en try/catch:
  - [x] Usar `item.category` del `findItemOwnership` extendido (requiere Task 0)
  - [x] **No** emitir AE-011 si create no completó; **no** emitir AE-031 en duplicado/concurrente 409

- [x] **Task 3 — `SelectReceiverUseCase` AE-012** (AC: #3, #7)
  - [x] Inyectar `IRequestRepository` en constructor (actualizar wiring en `items.routes.ts` / factory si aplica)
  - [x] Antes de `selectReceiver`, obtener `candidateCount` vía `findRankedCandidates`
  - [x] Tras `selectReceiver` exitoso: emitir AE-012 con `sessionId` como 4.º argumento
  - [x] `sessionId` va como **4.º argumento** de `emitEvent`, no dentro de `properties` (schema canónico §5 prd-analytics)

- [x] **Task 4 — `CancelItemUseCase` AE-014** (AC: #4, #7)
  - [x] Antes de `cancelItem`, resolver `hadActiveSession` vía `hasActiveDeliverySession`
  - [x] Tras `cancelItem` exitoso (y si `!result.alreadyCancelled`): emitir AE-014
  - [x] **No** emitir si 403/404 previos; **no** emitir si `alreadyCancelled: true`

- [x] **Task 5 — `PauseItemUseCase` AE-015** (AC: #5, #7)
  - [x] Tras `setPauseStatus` exitoso: emitir AE-015

- [x] **Task 6 — `DegradeInactiveItemsUseCase` AE-013** (AC: #6)
  - [x] Importar `emitEvent`
  - [x] Por cada ítem en el loop (junto al email EVT-012): emitir AE-013 fire-and-forget
  - [x] Analítica **antes o después** del email — ambos fire-and-forget; no await `emitEvent`

- [x] **Task 7 — Tests** (AC: #8)
  - [x] Mock global `vi.mock('../src/application/services/analytics.service', () => ({ emitEvent: vi.fn() }))` en cada fichero de test afectado
  - [x] `tests/items-request.test.ts`: 13.1 éxito → AE-011; 13.3 límite → AE-031 + rethrow 409; 13.4 duplicado → sin AE; 13.2 propio objeto → sin AE
  - [x] `tests/items-select.test.ts`: éxito → AE-012 con sessionId 4.º arg; 403/409 → sin AE
  - [x] `tests/items-cancel.test.ts` + `items-cancel-with-session.test.ts`: éxito → AE-014 con `hadActiveSession` true/false; 403 → sin AE
  - [x] `tests/items-pause.test.ts`: pause/unpause éxito → AE-015; 403/409 → sin AE
  - [x] `tests/degrade-inactive-items.test.ts`: por ítem degradado → AE-013; batch vacío → sin AE; email falla → AE-013 igualmente emitido
  - [x] Assert SC-02: properties sin email, coordenadas, `contactChannel`, nombres

- [x] **Task 8 — Verificación** (AC: todos)
  - [x] `npm run build`
  - [x] `npm test`
  - [x] Confirmar regresión cero en status codes y DTOs HTTP

---

## Notas para el Dev Agent

### Contexto de épica 7 (DLT-004)

Correct Course (2026-05-24) añadió **architecture v1.4**, `docs/prd-analytics.md` y la Épica 7. **7.2** entrega `emitEvent`. **7.3** instrumenta AE-010 en publicación. **7.4** instrumenta auth. **7.5** cubre la **Fase 4** del roadmap (`prd-analytics.md` §8): flujo de objetos y límite de solicitudes — **6 eventos** en 5 use cases.

**Referencias obligatorias:**

- [Source: docs/delta-backend-DLT-004.md — §D RequestItem, SelectReceiver, CancelItem, PauseItemRequests, §D Job 1 AE-013]
- [Source: docs/prd-analytics.md — §6.2 AE-011…015, §6.4 AE-031, §7.4 regla post-commit, SC-02]
- [Source: docs/architecture.md — §12.9 catálogo AE]
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Historia 7.5]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-loggers-y-analytics-service-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-api-publicar-item-category-weight-range-plan.md — patrón AE-010]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-instrumentacion-autenticacion-ae-001-ae-002-plan.md — patrón emitEvent]
- [Source: _bmad-output/project-context.md — Analítica DLT-004, Testing Rules]

### Estado actual del código (leer antes de editar)

**RequestItemUseCase hoy** — sin analítica; create sin try/catch:

```typescript
// src/application/use-cases/item/request-item.use-case.ts
const item = await this.itemRepo.findItemOwnership(itemId);
// validaciones...
const result = await this.requestRepo.create({ itemId, requesterId });
// email fire-and-forget...
return result;
```

**LimitExceededException:** **no existe** en `src/domain/exceptions/`. El repo lanza `ConflictException('Request limit reached')` (línea 28 de `request.repository.ts`). La arquitectura y el delta asumen `LimitExceededException` — Task 1 recomienda introducirla para catch preciso sin confundir con duplicado (`'Already requested this item'`) o concurrencia (`'Concurrent request conflict'`).

**FindItemOwnershipResult hoy** — **sin** `id`, `category`, `createdAt`:

```typescript
export interface FindItemOwnershipResult {
  donorId: string;
  status: string;
  requestsPaused: boolean;
  title: string;
}
```

Necesario extender para AE-011 (`category`), AE-012 (`createdAt` → `timeToSelectMs`), AE-014 (`category`).

**SelectReceiverUseCase hoy** — no tiene `requestRepo`; no emite analítica:

```typescript
const result = await this.deliverySessionRepo.selectReceiver({ ... });
// email fire-and-forget...
return { sessionId, status, deadlineAt };
```

**CancelItemUseCase hoy** — no consulta `hasActiveDeliverySession` antes de cancel; `cancelItem` devuelve `receiverId` post-facto pero AE-014 pide `hadActiveSession` **antes** de la transacción (delta §D).

**PauseItemUseCase hoy** — mínimo; sin analítica post-`setPauseStatus`.

**DegradeInactiveItemsUseCase hoy** — solo emails EVT-012; `NewlyDegradedItem` sin `donorId`/`category`/`createdAt`:

```typescript
export interface NewlyDegradedItem {
  itemId: string;
  itemTitle: string;
  donorEmail: string;
  donorFirstName: string;
}
```

**analytics.service** — creado en **7.2** — pasar UUID crudo como `userId`; `emitEvent` hashea internamente.

### Catálogo de eventos — payloads exactos

| ID | Evento | Use case | userId | properties | sessionId |
|---|---|---|---|---|---|
| AE-011 | `item.requested` | RequestItem | `requesterId` | `{ itemId, category }` | — |
| AE-031 | `limit.reached` | RequestItem (catch límite) | `requesterId` | `{ windowStart, windowEnd }` ISO | — |
| AE-012 | `item.receiver_selected` | SelectReceiver | `donorId` | `{ itemId, candidateCount, timeToSelectMs }` | `result.sessionId` |
| AE-013 | `item.degraded` | DegradeInactiveItems | `donorId` | `{ itemId, category, daysActiveBeforeDegradation }` | — |
| AE-014 | `item.cancelled` | CancelItem | `donorId` | `{ itemId, category, hadActiveSession }` | — |
| AE-015 | `item.requests_paused` | PauseItem | `donorId` | `{ itemId, paused }` | — |

**Ventana AE-031:** 720 horas = 30 × 24 × 60 × 60 × 1000 ms — alineado al SQL `INTERVAL '720 hours'` del repo.

**timeToSelectMs:** `Date.now() - new Date(item.createdAt).getTime()` — número entero de ms.

**candidateCount:** longitud de `findRankedCandidates(itemId)` **inmediatamente antes** de la transacción de selección (incluye la request ganadora si sigue `pending`).

**daysActiveBeforeDegradation:** días enteros desde `createdAt` hasta momento de emisión (delta §D Job 1).

### Task 2 — Distinción AE-031 vs otros 409

| ConflictException message | Emitir AE-031 |
|---|---|
| `Request limit reached` (o `LimitExceededException`) | **Sí** |
| `Already requested this item` | No |
| `Concurrent request conflict` | No |
| Item not active / paused (use case, pre-repo) | No |

El test 13.3 ya simula límite con `ConflictException('Request limit reached')` — ampliar para assert AE-031.

### Task 3 — Wiring SelectReceiver

Verificar dónde se instancia `SelectReceiverUseCase` (probablemente `items.routes.ts` o `main.ts`). Añadir `requestRepo` al constructor — patrón ya usado en `GetRankedCandidatesUseCase`.

### Task 4 — hadActiveSession vs receiverId

`result.receiverId` post-cancel indica que **había** sesión, pero delta exige booleano resuelto **antes** de la transacción. Usar `hasActiveDeliverySession(itemId)` — método ya existe en `IItemRepository`.

Si `result.alreadyCancelled === true`, **no** emitir AE-014 (no hubo cambio de estado).

### Task 6 — Degrade: SQL objetivo

Extender query en `findNewlyDegradedItems`:

```sql
SELECT i.id AS item_id, i.title AS item_title,
       i.category, i.created_at,
       i.donor_id, u.email AS donor_email, u.first_name AS donor_first_name
FROM items i
JOIN users u ON u.id = i.donor_id
WHERE i.degraded_at IS NOT NULL
  AND i.degraded_at >= NOW() - INTERVAL '75 minutes'
  AND i.status = 'active'
```

### Estrategia de tests

Patrón establecido en 7.3/7.4:

```typescript
vi.mock('../src/application/services/analytics.service', () => ({
  emitEvent: vi.fn(),
}));

import { emitEvent } from '../src/application/services/analytics.service';

beforeEach(() => {
  vi.mocked(emitEvent).mockClear();
});
```

**SelectReceiver AE-012** — verificar 4 argumentos:

```typescript
expect(emitEvent).toHaveBeenCalledWith(
  'item.receiver_selected',
  USER_UUID,
  expect.objectContaining({
    itemId: ITEM_UUID,
    candidateCount: 2,
    timeToSelectMs: expect.any(Number),
  }),
  SESSION_UUID,
);
```

**Degrade AE-013** — test unitario (no HTTP):

```typescript
expect(emitEvent).toHaveBeenCalledWith(
  'item.degraded',
  donorId,
  expect.objectContaining({
    itemId: DEGRADED_ITEM.itemId,
    category: 'furniture',
    daysActiveBeforeDegradation: expect.any(Number),
  }),
);
```

### Anti-patrones (no hacer en 7.5)

- No usar `await emitEvent(...)` — no es async.
- No envolver `emitEvent` en try/catch que altere status HTTP.
- No emitir dentro de transacciones de repositorio (solo post-commit en use case).
- No pasar `userId` pre-hasheado.
- No incluir email, título, coordenadas, `contactChannel` en `properties`.
- No emitir AE-031 en duplicado/concurrente — solo límite 3/30d.
- No emitir AE-011 si validaciones previas fallaron (propio objeto, paused, etc.).
- No poner `sessionId` dentro de `properties` para AE-012 — va como 4.º arg.
- No modificar OpenAPI, DTOs HTTP ni contratos de respuesta.
- No implementar AE-020+ (7.6).
- No crear `analytics.service` ni `loggers.ts` (7.2).
- No modificar el SQL del job pg_cron de degradación.

### Cumplimiento de arquitectura

- **Clean Architecture:** instrumentación en `application/use-cases/`; import solo de `analytics.service`.
- **Capas:** use cases **no** importan `analyticsLogger` directamente.
- **Regresión cero:** mismos status codes, mismos DTOs, mismo comportamiento de email y transacciones.
- **Excepciones:** si se crea `LimitExceededException`, debe mapear a 409 vía herencia de `ConflictException`.

### Verificación

```bash
npm run build
npm test
```

Smoke opcional (requiere 7.2 merged):

```bash
npm run dev
# POST /items/:id/requests válido → JSON analytics "event":"item.requested"
```

### Inteligencia de historias previas

**7.2 (loggers/analytics.service) — CRÍTICO:**

- `emitEvent(event, userId, properties, sessionId?)` — firma exacta.
- Fire-and-forget post-commit — **patrón obligatorio**.
- Hash SHA-256 interno — no re-testear en tests HTTP (cubierto en 7.2).

**7.3 (AE-010 publish):**

- Mismo patrón post-commit tras repo exitoso.
- `category` ya persistido en items desde 7.1/7.3 — 7.5 lo **lee** vía ownership/degrade query, no valida publicación.

**7.4 (AE-001/002 auth):**

- Patrón mock + assert en tests HTTP.
- Catch específico para emitir antes de relanzar (AE-031 análogo a no emitir en auth fallido).

**7.1 (SQL/dominio):**

- `ItemCategory` y CHECK en BD — `category` en eventos debe ser enum válido persistido.

### Contexto cross-story épica 7

| Story | Relación con 7.5 |
|---|---|
| 7.2 analytics.service | **Prerrequisito** |
| 7.1 SQL/dominio items | **Prerrequisito** — `category` |
| 7.3 AE-010 | Paralelo; no bloquea 7.5 salvo category en BD |
| 7.4 Auth AE | Paralelo; mismo patrón |
| 7.6 Entrega AE | Siguiente — AE-020+ en delivery/reputación/jobs |

### Git reciente

- `9416bf1` — 6.5 emails firstName (épica 6 done).
- `11ba3f4` — docs DLT-004 (architecture v1.4, prd-analytics, epics 7.x).
- Use cases items sin instrumentación analítica; límite vía `ConflictException` en repo.

---

## Dev Agent Record

### Agent Model Used

Composer (dev-story 7-5)

### Debug Log References

- Patrón `emitEvent` alineado con historias 7.3/7.4: post-commit fire-and-forget, sin alterar respuestas HTTP.
- `LimitExceededException` extiende `ConflictException` para catch preciso de AE-031 sin confundir con duplicado/concurrencia.

### Completion Notes List

- Extendidos `FindItemOwnershipResult` y `NewlyDegradedItem` con campos analíticos (`id`, `category`, `createdAt`, `donorId`).
- Instrumentados 6 eventos (AE-011, AE-031, AE-012, AE-013, AE-014, AE-015) en 5 use cases.
- `SelectReceiverUseCase` recibe `IRequestRepository` para `candidateCount` pre-selección.
- `CancelItemUseCase` consulta `hasActiveDeliverySession` antes de cancelar para AE-014.
- Tests ampliados en 5 ficheros con mock de `analytics.service` y asserts SC-02.
- `npm run build` y `npm test` — 265 tests pasando, regresión cero.
- Parches CR: `safeEmitEvent`, helpers (`buildLimitReachedProperties`, `computeTimeToSelectMs`, `computeDaysActiveBeforeDegradation`), constante `REQUEST_LIMIT_WINDOW_MS`, validaciones pre-emisión, try/catch en `hasActiveDeliverySession`, mocks de test con reset de defaults e ISO8601.

### File List

- src/domain/exceptions/limit-exceeded.exception.ts (nuevo)
- src/domain/repositories/item.repository.ts
- src/infrastructure/database/supabase/item.repository.ts
- src/infrastructure/database/supabase/request.repository.ts
- src/application/services/analytics.service.ts
- src/application/use-cases/item/request-item.use-case.ts
- src/application/use-cases/item/select-receiver.use-case.ts
- src/application/use-cases/item/cancel-item.use-case.ts
- src/application/use-cases/item/pause-item.use-case.ts
- src/application/use-cases/item/degrade-inactive-items.use-case.ts
- src/interfaces/http/routes/items.routes.ts
- tests/items-request.test.ts
- tests/items-select.test.ts
- tests/items-cancel.test.ts
- tests/items-cancel-with-session.test.ts
- tests/items-pause.test.ts
- tests/degrade-inactive-items.test.ts
- tests/analytics-service.test.ts
- _bmad-output/initiative-backend/archive-v6/sprint-status.yaml
- _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-instrumentacion-objetos-y-solicitudes-plan.md

---

## Change Log

- 2026-05-25 — Instrumentación analítica Fase 4 (AE-011…015, AE-031) en ciclo de vida de objetos y límite de solicitudes.
- 2026-05-25 — Parches code review: safeEmitEvent, helpers analíticos, validaciones, tests payload ISO8601.

## Referencias

- [Source: docs/delta-backend-DLT-004.md — §D RequestItem, SelectReceiver, CancelItem, PauseItemRequests, Job 1]
- [Source: docs/prd-analytics.md — §6.2, §6.4 AE-031, §7.4, SC-02]
- [Source: docs/architecture.md — §12.9]
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Historia 7.5]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-loggers-y-analytics-service-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-api-publicar-item-category-weight-range-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-instrumentacion-autenticacion-ae-001-ae-002-plan.md]
- [Source: _bmad-output/project-context.md]
- [Source: src/application/use-cases/item/request-item.use-case.ts]
- [Source: src/application/use-cases/item/select-receiver.use-case.ts]
- [Source: src/application/use-cases/item/cancel-item.use-case.ts]
- [Source: src/application/use-cases/item/pause-item.use-case.ts]
- [Source: src/application/use-cases/item/degrade-inactive-items.use-case.ts]
- [Source: src/infrastructure/database/supabase/request.repository.ts]
- [Source: src/infrastructure/database/supabase/item.repository.ts]
- [Source: src/domain/repositories/item.repository.ts]
- [Source: tests/items-request.test.ts]
- [Source: tests/items-select.test.ts]
- [Source: tests/items-cancel.test.ts]
- [Source: tests/items-cancel-with-session.test.ts]
- [Source: tests/items-pause.test.ts]
- [Source: tests/degrade-inactive-items.test.ts]

---

### Review Findings

- [x] [Review][Patch] Manejo de errores inconsistente en catch de LimitExceededException [src/application/use-cases/item/request-item.use-case.ts:35-45]
- [x] [Review][Patch] Violación Clean Architecture - import directo analytics.service [Multiple use cases]
- [x] [Review][Patch] Validaciones faltantes de datos antes de emitEvent [Multiple locations]
- [x] [Review][Patch] Magic numbers hardcodeados sin constantes [src/application/use-cases/item/request-item.use-case.ts:43]
- [x] [Review][Patch] Cálculo timeToSelectMs vulnerable a fechas inválidas [src/application/use-cases/item/select-receiver.use-case.ts:32]
- [x] [Review][Patch] Fire-and-forget sin garantía de no-bloqueo [Multiple use cases]
- [x] [Review][Patch] Mock pollution en tests por reset incompleto [tests/items-request.test.ts]
- [x] [Review][Patch] Tests incompletos - falta validación de formatos payload [Multiple test files]
- [x] [Review][Patch] Manejo de excepciones faltante en hasActiveDeliverySession [src/application/use-cases/item/cancel-item.use-case.ts:15]
- [x] [Review][Defer] Dependency injection inestable en SelectReceiverUseCase [Constructor changes] — deferred, pre-existing

### Review Findings — CR 7-5 (2026-05-25)

- [x] [Review][Patch] Test faltante: `alreadyCancelled: true` → sin AE-014 [tests/items-cancel.test.ts] — **APLICADO** test 11.6 añadido, 266/266 tests pasan
- [x] [Review][Defer] `hadActiveSession` predeterminado a `false` cuando `hasActiveDeliverySession` falla [src/application/use-cases/item/cancel-item.use-case.ts:22-27] — deferred, analytics trade-off aceptable
- [x] [Review][Defer] Race condition en `candidateCount` (requests nuevas entre `findRankedCandidates` y `selectReceiver`) [src/application/use-cases/item/select-receiver.use-case.ts:31] — deferred, spec-acknowledged
- [x] [Review][Defer] Query DB extra por selección para obtener `candidateCount` [src/application/use-cases/item/select-receiver.use-case.ts:31] — deferred, coste aceptado por spec

---

Ultimate context engine analysis completed — comprehensive developer guide created.
