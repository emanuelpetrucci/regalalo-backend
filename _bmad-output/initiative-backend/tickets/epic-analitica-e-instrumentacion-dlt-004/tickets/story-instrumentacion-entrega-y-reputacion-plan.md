---
title: "Instrumentación entrega y reputación"
type: feature
ticket: 6
status: done
created: 2026-10-25
---

# Historia 7.6: Instrumentación entrega y reputación

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como responsable de producto,
quiero eventos de analítica en sesiones de entrega y cambios de reputación,
para medir completitud de entregas, expiraciones, cancelaciones y conducta de usuarios sin exponer PII en los logs.

## Criterios de aceptación

1. **Dado** confirmación de entrega exitosa (`POST /delivery-sessions/:id/confirm` → 200), **cuando** `deliverySessionRepo.confirmDelivery` ha hecho commit, **entonces** se emite AE-020 `session.completed` vía `emitEvent` con `userId` = donante, `properties: { itemId, category, weightRange, durationMs }` y `sessionId` como 4.º argumento — fire-and-forget post-commit, sin alterar la respuesta HTTP.

2. **Dado** cancelación de sesión con `noShow: true` exitosa (`POST /delivery-sessions/:id/cancel` → 200), **cuando** `cancelDelivery` ha hecho commit, **entonces** se emite AE-022 `session.cancelled_no_show` con `userId` = donante, `properties: { sessionId, itemId, category, durationMs }` y `sessionId` como 4.º argumento.

3. **Dado** cancelación de sesión con `noShow: false` exitosa, **cuando** `cancelDelivery` ha hecho commit, **entonces** se emite AE-023 `session.cancelled_donor` con el mismo shape de properties que AE-022.

4. **Dado** el job `expire-delivery-sessions` procesado por `ExpireDeliverySessionsUseCase`, **cuando** se itera cada sesión recién expirada (mismo batch que dispara EVT-004), **entonces** se emite AE-021 `session.expired` por sesión con `userId` = `donorId`, `properties: { sessionId, itemId, category, durationMs }` y `sessionId` como 4.º argumento — fire-and-forget; fallo de analítica no impide el email.

5. **Dado** entrega completada con actualización de reputación (+10 donante y receptor), **cuando** el commit de `confirmDelivery` termina, **entonces** se emiten **dos** AE-030 `reputation.changed` (vía `ReputationService`) — uno por donante y uno por receptor — con `properties: { delta: 10, type: 'delivery_completed', newScore, consecutiveNoShows: 0 }`.

6. **Dado** cancelación con no-show y penalización de reputación, **cuando** el commit de `cancelDelivery` termina, **entonces** se emite **un** AE-030 `reputation.changed` para el receptor con `properties: { delta, type: 'no_show', newScore, consecutiveNoShows }` donde `delta = -20 × consecutiveNoShows` post-incremento.

7. **Dado** intentos fallidos (404, 403, 409, sesión no activa, ya confirmada, etc.), **cuando** el use case lanza excepción, **entonces** `emitEvent` **no** se invoca para ningún evento AE-020/022/023/030/021.

8. **Dado** tests existentes de confirm, cancel y expire, **cuando** se ejecutan, **entonces** verifican llamada a `emitEvent` (mock/spy) con payload correcto en éxito, ausencia en fallos, dos AE-030 en confirm, uno en no-show, y ninguno en cancel sin no-show — cumpliendo SC-01 (cobertura catálogo completo) y SC-02 (sin PII prohibida en `properties`).

## Alcance explícito (IN / OUT)

| IN (7.6) | OUT (otras historias) |
|---|---|
| `confirm-delivery.use-case.ts` — AE-020 + invocar ReputationService | AE-010…AE-015, AE-031 (7.3–7.5) |
| `cancel-delivery.use-case.ts` — AE-022/023 + ReputationService (no-show) | AE-001/002 auth (7.4) |
| `expire-delivery-sessions.use-case.ts` — AE-021 | Crear `analytics.service` / `loggers.ts` (7.2) |
| `reputation.service.ts` — AE-030 (nuevo módulo emisor) | Refactor completo de lógica SQL de reputación fuera del repo |
| Extender `ConfirmDeliveryResult`, `CancelDeliveryResult`, `ExpiredSessionForEmail` | Modificar SQL del job pg_cron de expiración |
| Extender queries SQL en `delivery-session.repository.ts` (RETURNING scores) | Regenerar OpenAPI |
| Extender `findExpiredSessions` con campos analíticos | Instrumentar `get-delivery-session` (sin AE en catálogo) |
| Tests ampliados en 3 ficheros de test | Exponer `category`/`weightRange` en DTOs HTTP de sesión |

**Prerrequisitos:**

| Story | Requisito |
|---|---|
| **7.2** | `analytics.service.ts` + `emitEvent` + `analyticsLogger` — **obligatorio** |
| **7.1** | Columnas `category`/`weight_range` en items — **obligatorio** para properties analíticas |
| 7.3–7.5 | Independientes — patrón `emitEvent` ya documentado |

**Orden recomendado:** `7.2` (+ `7.1`) → **7.6** tras o en paralelo con 7.3–7.5. **7.6 cierra el catálogo AE** de la épica 7 (SC-01).

## Tareas / Subtareas

- [x] **Task 0 — Preparar datos de dominio para analítica** (AC: #1–#6)
  - [x] Extender `ConfirmDeliveryResult` con: `donorId`, `receiverId`, `donorNewScore`, `receiverNewScore`, `itemId`, `sessionCreatedAt` (o leer sesión antes en use case — preferir RETURNING en repo para scores)
  - [x] Extender `CancelDeliveryResult` con: `itemId`, `sessionCreatedAt`, y si `noShow`: `receiverId`, `receiverNewScore`, `receiverConsecutiveNoShows`, `receiverDelta`
  - [x] Extender `ExpiredSessionForEmail` con: `donorId`, `createdAt`, `category`
  - [x] Actualizar SQL en `confirmDelivery`: añadir `RETURNING` de scores post-update (`reputation_score` donante/receptor) vía subquery o CTE
  - [x] Actualizar SQL en `cancelDelivery` (no-show): `RETURNING consecutive_no_shows, reputation_score` del receptor
  - [x] Actualizar `findExpiredSessions`: JOIN items para `category`, incluir `ds.donor_id`, `ds.created_at`
  - [x] Actualizar mocks en tests afectados

- [x] **Task 1 — `ReputationService` (AE-030)** (AC: #5, #6)
  - [x] Crear `src/application/services/reputation.service.ts`:
    ```typescript
    import { emitEvent } from './analytics.service';

    export function emitDeliveryCompletedReputation(
      donorId: string,
      receiverId: string,
      donorNewScore: number,
      receiverNewScore: number,
    ): void {
      emitEvent('reputation.changed', donorId, {
        delta: 10,
        type: 'delivery_completed',
        newScore: donorNewScore,
        consecutiveNoShows: 0,
      });
      emitEvent('reputation.changed', receiverId, {
        delta: 10,
        type: 'delivery_completed',
        newScore: receiverNewScore,
        consecutiveNoShows: 0,
      });
    }

    export function emitNoShowReputation(
      receiverId: string,
      delta: number,
      newScore: number,
      consecutiveNoShows: number,
    ): void {
      emitEvent('reputation.changed', receiverId, {
        delta,
        type: 'no_show',
        newScore,
        consecutiveNoShows,
      });
    }
    ```
  - [x] **No** mover lógica SQL de reputación del repositorio — solo emisión post-commit
  - [x] `newScore` es el valor numérico actualizado (no hasheado; el hash aplica solo a `userId` vía `emitEvent`)

- [x] **Task 2 — `ConfirmDeliveryUseCase` AE-020 + AE-030** (AC: #1, #5, #7)
  - [x] Inyectar `IItemRepository` (o método en delivery repo) para `category`/`weightRange` del ítem
  - [x] **Antes** de confirm: opcional `findById(sessionId)` si el result extendido no incluye `sessionCreatedAt`
  - [x] Tras `confirmDelivery` exitoso:
    ```typescript
    const durationMs = Date.now() - new Date(result.sessionCreatedAt).getTime();
    emitEvent(
      'session.completed',
      donorId,
      {
        itemId: result.itemId,
        category: item.category,
        weightRange: item.weightRange,
        durationMs,
      },
      sessionId,
    );
    emitDeliveryCompletedReputation(
      result.donorId,
      result.receiverId,
      result.donorNewScore,
      result.receiverNewScore,
    );
    ```
  - [x] Actualizar wiring en `delivery-sessions.routes.ts` si se añade `itemRepo`

- [x] **Task 3 — `CancelDeliveryUseCase` AE-022/023 + AE-030** (AC: #2, #3, #6, #7)
  - [x] Cargar sesión + ítem **antes** de cancel (para `createdAt`, `category`) o extender result del repo
  - [x] Tras `cancelDelivery` exitoso:
    ```typescript
    const eventName = noShow ? 'session.cancelled_no_show' : 'session.cancelled_donor';
    const durationMs = Date.now() - new Date(result.sessionCreatedAt).getTime();
    emitEvent(
      eventName,
      donorId,
      {
        sessionId,
        itemId: result.itemId,
        category: item.category,
        durationMs,
      },
      sessionId,
    );
    if (noShow && result.receiverId != null) {
      emitNoShowReputation(
        result.receiverId,
        result.receiverDelta!,
        result.receiverNewScore!,
        result.receiverConsecutiveNoShows!,
      );
    }
    ```
  - [x] **No** emitir AE-030 en cancel sin no-show

- [x] **Task 4 — `ExpireDeliverySessionsUseCase` AE-021** (AC: #4, #7)
  - [x] Importar `emitEvent`
  - [x] Por cada sesión en el loop (junto al email EVT-004):
    ```typescript
    emitEvent(
      'session.expired',
      session.donorId,
      {
        sessionId: session.sessionId,
        itemId: session.itemId,
        category: session.category,
        durationMs: Date.now() - new Date(session.createdAt).getTime(),
      },
      session.sessionId,
    );
    ```
  - [x] Analítica **antes o después** del email — ambos fire-and-forget; no await `emitEvent`

- [x] **Task 5 — Tests** (AC: #8)
  - [x] Mock global `vi.mock('../src/application/services/analytics.service', () => ({ emitEvent: vi.fn() }))` en cada fichero
  - [x] Mock `reputation.service.ts` solo si se prefiere aislar — **alternativa:** assert directo sobre `emitEvent` (2 calls en confirm)
  - [x] `tests/delivery-sessions-confirm.test.ts`: 17.1 éxito → AE-020 + 2× AE-030; 403/409 → sin AE
  - [x] `tests/delivery-sessions-cancel.test.ts`: noShow true → AE-022 + AE-030; noShow false → AE-023 sin AE-030; 403/409 → sin AE
  - [x] `tests/expire-delivery-sessions.test.ts`: por sesión → AE-021; batch vacío → sin AE; email falla → AE-021 igualmente emitido
  - [x] Assert SC-02: properties sin email, coordenadas, `contactChannel`, nombres, UUID crudo
  - [x] Assert AE-020: 4.º arg = sessionId; `weightRange` presente solo en completed (no en cancel/expire)

- [x] **Task 6 — Verificación SC-01** (AC: #8)
  - [x] Confirmar que tras 7.6 los 14 eventos del catálogo (AE-001…AE-031) tienen punto de emisión (checklist mental: 7.2 infra + 7.3–7.6 instrumentación)
  - [x] `npm run build`
  - [x] `npm test`
  - [x] Regresión cero en status codes y DTOs HTTP

---

## Notas para el Dev Agent

### Contexto de épica 7 (DLT-004)

Correct Course (2026-05-24) añadió **architecture v1.4**, `docs/prd-analytics.md` y la Épica 7. **7.2** entrega `emitEvent`. **7.5** instrumenta objetos/solicitudes. **7.6** cubre la **Fase 5–6** del roadmap (`prd-analytics.md` §8): sesiones de entrega y reputación — **5 eventos** en 3 use cases + servicio emisor.

**Referencias obligatorias:**

- [Source: docs/delta-backend-DLT-004.md — §D ConfirmDelivery, CancelDelivery, §Job 5 AE-021, §ReputationService AE-030]
- [Source: docs/prd-analytics.md — §6.3 AE-020…023, §6.4 AE-030, §7.4 regla post-commit, SC-01/SC-02]
- [Source: docs/architecture.md — §5.2 ReputationService, §12.9 catálogo AE]
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Historia 7.6]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-loggers-y-analytics-service-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-instrumentacion-objetos-y-solicitudes-plan.md — patrón emitEvent]
- [Source: _bmad-output/project-context.md — Analítica DLT-004, Testing Rules]

### Estado actual del código (leer antes de editar)

**ConfirmDeliveryUseCase hoy** — delegación mínima al repo, sin analítica:

```typescript
// src/application/use-cases/delivery-session/confirm-delivery.use-case.ts
const result = await this.deliverySessionRepo.confirmDelivery(sessionId, donorId);
return { status: 'completed', completedAt: result.completedAt.toISOString() };
```

**CancelDeliveryUseCase hoy** — igual, sin analítica:

```typescript
const result = await this.deliverySessionRepo.cancelDelivery({ sessionId, donorId, noShow });
return { status: 'cancelled', noShowDeclared: result.noShowDeclared, completedAt: result.completedAt };
```

**ExpireDeliverySessionsUseCase hoy** — solo emails EVT-004; **no** expira sesiones (eso lo hace pg_cron SQL):

```typescript
const sessions = await this.deliverySessionRepo.findExpiredSessions();
for (const session of sessions) {
  try { await this.mailService.send({ templateId: 'TPL-004', ... }); }
  catch (err) { logger.error(...); }
}
```

**ReputationService:** **no existe** en `src/`. La lógica de reputación vive **inline** en `PostgresDeliverySessionRepository.confirmDelivery` / `cancelDelivery` (UPDATE users + INSERT reputation_events). **7.6 crea el servicio solo para emisión AE-030** — no refactorizar SQL de negocio salvo RETURNING para scores.

**ConfirmDeliveryResult hoy** — solo `{ completedAt }` — insuficiente para AE-030.

**ExpiredSessionForEmail hoy** — sin `donorId`, `createdAt`, `category`:

```typescript
export interface ExpiredSessionForEmail {
  sessionId: string;
  donorEmail: string;
  donorFirstName: string;
  itemId: string;
  itemTitle: string;
}
```

**findExpiredSessions SQL hoy** — filtra `status = 'expired'` y `deadline_at >= NOW() - INTERVAL '75 minutes'` (ventana post-job, patrón idéntico a degrade 7.5).

**analytics.service** — creado en **7.2** — pasar UUID crudo como `userId`; `emitEvent` hashea internamente.

### Catálogo de eventos — payloads exactos

| ID | Evento | Use case / job | userId | properties | sessionId (4.º arg) |
|---|---|---|---|---|---|
| AE-020 | `session.completed` | ConfirmDelivery | `donorId` | `{ itemId, category, weightRange, durationMs }` | `sessionId` |
| AE-021 | `session.expired` | ExpireDeliverySessions | `donorId` | `{ sessionId, itemId, category, durationMs }` | `sessionId` |
| AE-022 | `session.cancelled_no_show` | CancelDelivery (noShow=true) | `donorId` | `{ sessionId, itemId, category, durationMs }` | `sessionId` |
| AE-023 | `session.cancelled_donor` | CancelDelivery (noShow=false) | `donorId` | `{ sessionId, itemId, category, durationMs }` | `sessionId` |
| AE-030 | `reputation.changed` | ReputationService | afectado | `{ delta, type, newScore, consecutiveNoShows }` | — |

**durationMs:** `Date.now() - new Date(session.createdAt).getTime()` — ms enteros desde creación de sesión hasta momento de emisión (prd-analytics §6.3 nota al pie).

**weightRange:** solo en AE-020 (delta §D ConfirmDelivery); cancel/expire no lo incluyen.

**AE-030 en confirm:** **dos** emisiones (donante + receptor), mismo `type: 'delivery_completed'`, `delta: 10`.

**AE-030 en no-show:** **una** emisión (receptor); `delta` negativo según `-20 × consecutiveNoShows` **después** del incremento en BD.

**sessionId en properties vs 4.º arg:** delta §D incluye `sessionId` en properties para cancel/expire; AE-020 lo omite en properties (solo 4.º arg). Seguir delta literalmente por evento.

### Task 0 — SQL objetivo confirmDelivery (RETURNING scores)

Patrón sugerido tras UPDATE users:

```sql
-- Donante: RETURNING reputation_score
-- Receptor: RETURNING reputation_score
-- Incluir item_id, created_at de delivery_sessions en SELECT inicial FOR UPDATE
```

Alternativa si diff mínimo: use case llama `findById(sessionId)` antes de confirm y `userRepo.findById` ×2 después — **menos preferido** (race teórico); preferir RETURNING en misma transacción ya commitada expuesta en result.

### Task 2 — Wiring ConfirmDelivery

Verificar `delivery-sessions.routes.ts` — probablemente instancia `ConfirmDeliveryUseCase` con solo `deliverySessionRepo`. Añadir `itemRepo` si category/weightRange no vienen del result extendido:

```typescript
const item = await this.itemRepo.findById(result.itemId);
// item.category, item.weightRange desde entidad 7.1
```

### Task 4 — Expire: SQL objetivo

Extender query en `findExpiredSessions`:

```sql
SELECT ds.id AS session_id,
       ds.donor_id,
       ds.created_at,
       u.email AS donor_email,
       u.first_name AS donor_first_name,
       i.id AS item_id,
       i.title AS item_title,
       i.category
FROM delivery_sessions ds
JOIN users u ON u.id = ds.donor_id
JOIN items i ON i.id = ds.item_id
WHERE ds.status = 'expired'
  AND ds.deadline_at >= NOW() - INTERVAL '75 minutes'
```

### Estrategia de tests

Patrón establecido en 7.4/7.5:

```typescript
vi.mock('../src/application/services/analytics.service', () => ({
  emitEvent: vi.fn(),
}));

import { emitEvent } from '../src/application/services/analytics.service';

beforeEach(() => {
  vi.mocked(emitEvent).mockClear();
});
```

**Confirm AE-020 + 2× AE-030:**

```typescript
expect(emitEvent).toHaveBeenCalledWith(
  'session.completed',
  DONOR_UUID,
  expect.objectContaining({
    itemId: expect.any(String),
    category: expect.any(String),
    weightRange: expect.any(String),
    durationMs: expect.any(Number),
  }),
  SESSION_UUID,
);
expect(emitEvent).toHaveBeenCalledWith(
  'reputation.changed',
  DONOR_UUID,
  expect.objectContaining({ delta: 10, type: 'delivery_completed' }),
);
expect(emitEvent).toHaveBeenCalledWith(
  'reputation.changed',
  RECEIVER_UUID,
  expect.objectContaining({ delta: 10, type: 'delivery_completed' }),
);
```

**Opción:** mockear `reputation.service` y verificar que ConfirmDelivery lo invoca — reduce asserts duplicados.

**Expire AE-021** — test unitario (no HTTP):

```typescript
expect(emitEvent).toHaveBeenCalledWith(
  'session.expired',
  EXPIRED_SESSION.donorId,
  expect.objectContaining({
    sessionId: EXPIRED_SESSION.sessionId,
    itemId: EXPIRED_SESSION.itemId,
    category: 'furniture',
    durationMs: expect.any(Number),
  }),
  EXPIRED_SESSION.sessionId,
);
```

### Anti-patrones (no hacer en 7.6)

- No usar `await emitEvent(...)` — no es async.
- No envolver `emitEvent` en try/catch que altere status HTTP.
- No emitir dentro de transacciones de repositorio (solo post-commit en use case / post-loop en job adapter).
- No pasar `userId` pre-hasheado.
- No incluir email, título, coordenadas, `contactChannel` en `properties`.
- No emitir AE-030 en cancel sin no-show.
- No emitir AE-020/022/023 si confirm/cancel falló (403/409/404).
- No refactorizar toda la lógica de reputación del repo a ReputationService (fuera de alcance).
- No modificar OpenAPI, DTOs HTTP ni contratos de respuesta.
- No modificar el SQL del job pg_cron de expiración (solo adaptador Node post-expiración).
- No crear `analytics.service` ni `loggers.ts` (7.2).
- No reimplementar AE-010…AE-031 ya cubiertos en 7.3–7.5.

### Cumplimiento de arquitectura

- **Clean Architecture:** instrumentación en `application/use-cases/` y `application/services/reputation.service.ts`; import solo de `analytics.service`.
- **Capas:** use cases **no** importan `analyticsLogger` directamente.
- **Regresión cero:** mismos status codes, mismos DTOs HTTP, mismo comportamiento de email y transacciones SQL.
- **ReputationService:** módulo emisor AE-030 según architecture §5.2 / §12.9 — la **persistencia** sigue en el repositorio (implementación MVP existente).

### Verificación

```bash
npm run build
npm test
```

Smoke opcional (requiere 7.2 merged):

```bash
npm run dev
# POST /delivery-sessions/:id/confirm válido → JSON analytics "event":"session.completed"
```

### Inteligencia de historias previas

**7.2 (loggers/analytics.service) — CRÍTICO:**

- `emitEvent(event, userId, properties, sessionId?)` — firma exacta.
- Fire-and-forget post-commit — **patrón obligatorio**.
- Hash SHA-256 interno — no re-testear en tests HTTP (cubierto en 7.2).

**7.5 (objetos/solicitudes) — PATRÓN DIRECTO:**

- Extender tipos de repo (`ExpiredSessionForEmail` análogo a `NewlyDegradedItem`).
- Emitir en loop de job adapter post-SQL (degrade → expire).
- `sessionId` como 4.º arg en eventos de sesión (AE-012 precedente).
- Tests: mock `emitEvent`, assert éxito/fallo, email falla ≠ bloquea analítica.

**7.1 (SQL/dominio items):**

- `ItemCategory`, `WeightRange` enums — `category`/`weightRange` en AE-020 deben ser valores persistidos.

**7.4 (auth):**

- Mismo mock + assert en tests HTTP.

### Contexto cross-story épica 7

| Story | Relación con 7.6 |
|---|---|
| 7.2 analytics.service | **Prerrequisito** |
| 7.1 SQL/dominio items | **Prerrequisito** — `category`, `weightRange` |
| 7.3–7.5 | Paralelo posible; 7.6 **cierra** catálogo AE |
| Epic 7 done | Tras 7.6 + dev de todas las stories → verificar SC-01 en review |

### Git reciente

- `9416bf1` — 6.5 emails firstName (épica 6 done).
- `11ba3f4` — docs DLT-004 (architecture v1.4, prd-analytics, epics 7.x).
- Use cases delivery sin instrumentación; reputación inline en `delivery-session.repository.ts`.

---

## Dev Agent Record

### Agent Model Used

Composer (dev-story 7-6)

### Debug Log References

(n/a)

### Completion Notes List

- Tipos de dominio extendidos (`ConfirmDeliveryResult`, `CancelDeliveryResult`, `ExpiredSessionForEmail`) con scores RETURNING en SQL — category/weightRange vía JOIN items en confirm/cancel (sin itemRepo extra).
- Nuevo `reputation.service.ts` emite AE-030 (`delivery_completed` ×2, `no_show` ×1) vía `safeEmitEvent`.
- Use cases instrumentados post-commit: AE-020 confirm, AE-022/023 cancel, AE-021 expire; `durationMs` con `computeTimeToSelectMs`; sin emisión en errores HTTP.
- Tests ampliados con mock `emitEvent`/`safeEmitEvent` y asserts SC-02; 266 tests pasan, build OK.
- CR 2026-05-25: parches HIGH/MEDIUM/LOW aplicados — `safeEmitEvent` en ReputationService, guardia finita durationMs, imports reordenados, test 20.3 con payload AE-021 por sesión.
- CR 2026-05-25 (2.ª pasada): HIGH previo verificado resuelto (`reputation.service.ts` usa `safeEmitEvent` en las 3 emisiones AE-030); AC #1–#8 cumplidos; 266 tests + build OK — aprobado.

### File List

- src/domain/repositories/delivery-session.repository.ts
- src/infrastructure/database/supabase/delivery-session.repository.ts
- src/application/services/reputation.service.ts (nuevo)
- src/application/use-cases/delivery-session/confirm-delivery.use-case.ts
- src/application/use-cases/delivery-session/cancel-delivery.use-case.ts
- src/application/use-cases/delivery/expire-delivery-sessions.use-case.ts
- tests/delivery-sessions-confirm.test.ts
- tests/delivery-sessions-cancel.test.ts
- tests/expire-delivery-sessions.test.ts

### Change Log

- 2026-05-25 — Instrumentación AE-020…AE-030 en sesiones de entrega y reputación (DLT-004 Fase 5–6); cierra catálogo AE épica 7.
- 2026-05-25 — Addressed code review findings — 4 items resolved (safeEmitEvent, computeTimeToSelectMs, imports, test 20.3).

---

## Referencias

- [Source: docs/delta-backend-DLT-004.md — §D ConfirmDelivery, CancelDelivery, §Job 5, §ReputationService]
- [Source: docs/prd-analytics.md — §6.3, §6.4 AE-030, §7.4, §8 Fase 5–6, SC-01/SC-02]
- [Source: docs/architecture.md — §5.2, §12.9]
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Historia 7.6]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-loggers-y-analytics-service-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-instrumentacion-objetos-y-solicitudes-plan.md]
- [Source: _bmad-output/project-context.md]
- [Source: src/application/use-cases/delivery-session/confirm-delivery.use-case.ts]
- [Source: src/application/use-cases/delivery-session/cancel-delivery.use-case.ts]
- [Source: src/application/use-cases/delivery/expire-delivery-sessions.use-case.ts]
- [Source: src/infrastructure/database/supabase/delivery-session.repository.ts]
- [Source: src/domain/repositories/delivery-session.repository.ts]
- [Source: tests/delivery-sessions-confirm.test.ts]
- [Source: tests/delivery-sessions-cancel.test.ts]
- [Source: tests/expire-delivery-sessions.test.ts]

---

### Review Findings — CR 7-6 (2026-05-25)

- [x] [Review][Patch][HIGH] `ReputationService` usa `emitEvent` sin `safeEmitEvent` — si el logger lanza tras commit exitoso, confirm/cancel responden 500 pese a operación completada; viola AC #1/#5 fire-and-forget [src/application/services/reputation.service.ts:9-34]
- [x] [Review][Patch][MEDIUM] `durationMs` sin guardia finita (NaN/negativo) en confirm, cancel y expire — reutilizar patrón `computeTimeToSelectMs` de analytics.service [confirm-delivery.use-case.ts:17, cancel-delivery.use-case.ts:19, expire-delivery-sessions.use-case.ts:22]
- [x] [Review][Patch][LOW] Import `ItemCategory`/`ItemWeightRange` intercalado entre interfaces de dominio — mover al tope del fichero [src/domain/repositories/delivery-session.repository.ts:41]
- [x] [Review][Patch][LOW] Test 20.3 no aserta payload AE-021 por sesión en batch multi-sesión — solo verifica `toHaveBeenCalledTimes(2)` [tests/expire-delivery-sessions.test.ts:108-125]
- [x] [Review][Defer] Mock `safeEmitEvent` duplicado en 3 ficheros de test — mismo patrón aceptado en CR 7-5 [tests/delivery-sessions-*.test.ts, tests/expire-delivery-sessions.test.ts] — deferred, consistencia con 7.5

### Review Findings — CR 7-6 2.ª pasada (2026-05-25)

**Verificación hallazgos previos:** todos resueltos (HIGH `safeEmitEvent` en ReputationService confirmado en código; MEDIUM `computeTimeToSelectMs`; LOW imports + test 20.3).

**Nuevos hallazgos:** ninguno accionable tras triage (Blind Hunter + Edge Case Hunter + Acceptance Auditor).

**Resultado:** ✅ Aprobado — story `done`.

---

Ultimate context engine analysis completed — comprehensive developer guide created.
