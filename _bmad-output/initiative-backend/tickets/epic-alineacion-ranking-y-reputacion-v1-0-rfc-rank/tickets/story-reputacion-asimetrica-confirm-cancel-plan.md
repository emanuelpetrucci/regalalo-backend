---
title: "Reputación asimétrica en confirm y cancel"
type: feature
ticket: 2
status: done
created: 2026-10-25
---

# Historia 11.2: Reputación asimétrica en confirm y cancel

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como plataforma,
quiero aplicar los deltas RFC-001, RFC-002 y RFC-004 en confirmación de entrega y no-show,
para incentivar la donación y equilibrar penalizaciones según `docs/ranking-spec-v1.0.md`.

## Criterios de aceptación

1. **Dado** confirmación de entrega con `total_donated` del donante = 0 **antes** del `UPDATE` de reputación, **cuando** se completa la transacción atómica, **entonces** donante `+15`, receptor `+1`, dos filas en `reputation_events` con `role` distintos (`donor` delta=15, `receiver` delta=1) y `users.reputation_score` actualizado en consecuencia (QA-02).

2. **Dado** confirmación con donante que ya donó antes (`total_donated > 0` antes del UPDATE), **entonces** donante `+10`, receptor `+1`; mismas dos filas con roles y deltas distintos (QA-01).

3. **Dado** cancelación con `noShow: true`, **entonces** `delta = -10 × consecutive_no_shows` (tras incrementar racha) en el receptor; fila `reputation_events` con `type = 'no_show'`, `role = 'receiver'` (QA-03, QA-04, QA-05).

4. **Dado** entrega completada después de una racha de no-shows del receptor, **entonces** `consecutive_no_shows = 0` en **donante y receptor** al confirmar; el siguiente no-show del receptor vuelve a aplicar base `-10` (QA-06).

5. **Dado** eventos AE-030 (`reputation.changed`) tras confirm o no-show, **entonces** emiten los deltas reales aplicados: `{1, 10, 15, -10n}` — no valores fijos `10` ni `-20` (§11 spec).

6. **Dado** filas históricas en `reputation_events` con `role = NULL`, **entonces** no se recalcula `users.reputation_score` ni se hace backfill.

## Alcance explícito (IN / OUT)

| IN (11.2) | OUT (otras historias) |
|---|---|
| Deltas asimétricos en `confirmDelivery` / `cancelDelivery` | Migración MIGR-001 y columna `role` sola — **11.1** (prerrequisito) |
| `reputation.service.ts` — AE-030 con deltas reales | Tier 1/Tier 2 SQL ranking — **11.3** |
| Extender `ConfirmDeliveryResult` / `CancelDeliveryResult` si hace falta para analytics | Matriz QA-07–QA-14 — **11.4** |
| Actualizar `tests/delivery-sessions-confirm.test.ts`, `delivery-sessions-cancel.test.ts` | Tests integración BD QA-01–06 exhaustivos — **11.4** |
| Tests mínimos de repositorio (opcional pero recomendado) para QA-01/02/03 | Sync PRD/architecture/guías — **11.5** |
| | OpenAPI / DTO HTTP con `role` — **11.6 opcional** |
| | Copy frontend `+10` — handoff Angular aparte |

**Prerrequisito bloqueante:** Historia **11.1** (`017-reputation-events-role.sql` + `INSERT` con `role`). Si 11.1 no está mergeada, implementar 11.1 primero en el mismo PR o en orden estricto; los `INSERT` de 11.2 **deben** incluir `role` y deltas correctos a la vez.

**Regla de despliegue:** Tras merge, `npm run db:migrate` antes de API si 11.1 aún no estaba en el entorno.

## Tareas / Subtareas

- [x] **Task 0 — Verificar 11.1 aplicada** (AC: #1–#3)
  - [x] Confirmar existe `017-reputation-events-role.sql` y columna `role` en BD local
  - [x] Si falta, completar 11.1 antes de continuar (no duplicar migración en 11.2)

- [x] **Task 1 — `confirmDelivery` en `delivery-session.repository.ts`** (AC: #1, #2, #4)
  - [x] Tras validar sesión y **antes** de `UPDATE users` del donante: `SELECT total_donated FROM users WHERE id = $donor_id`
  - [x] `donorDelta = total_donated === 0 ? 15 : 10` (RFC-004 + RFC-001)
  - [x] Donante: `reputation_score += donorDelta`, `consecutive_no_shows = 0`, `total_donated += 1`
  - [x] Receptor: `reputation_score += 1`, `consecutive_no_shows = 0`, `total_received += 1` (no +10)
  - [x] `INSERT reputation_events` con `role` y deltas: `(donor, delivery_completed, donorDelta, 'donor')`, `(receiver, delivery_completed, 1, 'receiver')`
  - [x] Devolver en `ConfirmDeliveryResult`: `donorDelta`, `receiverDelta: 1` (para analytics)

- [x] **Task 2 — `cancelDelivery` rama no-show** (AC: #3, #4)
  - [x] Cambiar `const delta = -20 * n` → `const delta = -10 * n` (RFC-002)
  - [x] Mantener secuencia: incrementar `consecutive_no_shows`, luego aplicar delta al score
  - [x] `INSERT` con `role = 'receiver'` y `delta` calculado
  - [x] `receiverDelta` en resultado ya existe — solo cambia magnitud

- [x] **Task 3 — Dominio + analytics** (AC: #5)
  - [x] Extender `ConfirmDeliveryResult` en `delivery-session.repository.ts` (domain) con `donorDelta: number` y `receiverDelta: number`
  - [x] Actualizar `emitDeliveryCompletedReputation` en `src/application/services/reputation.service.ts` para recibir y emitir deltas reales (no hardcode `10`)
  - [x] `confirm-delivery.use-case.ts`: pasar `result.donorDelta` y `result.receiverDelta` al emitter
  - [x] `emitNoShowReputation`: sin cambio de firma; el delta ya viene del repo (-10n)

- [x] **Task 4 — Tests** (AC: #1–#5)
  - [x] `delivery-sessions-confirm.test.ts`: donante `delta: 10` (mock con `totalDonated > 0` implícito en repo mock) — ajustar a parametrizar o documentar que el mock debe devolver `donorDelta`/`receiverDelta`; asserts AE-030: donante según delta devuelto, receptor `delta: 1`
  - [x] Añadir caso mock primera donación: `donorDelta: 15`, `receiverDelta: 1` → asserts AE-030
  - [x] `delivery-sessions-cancel.test.ts`: `mockNoShowCancelResult.receiverDelta: -10`; assert AE-030 `delta: -10`
  - [x] (Recomendado) Test integración repositorio: confirm con donante `total_donated=0` → scores y `reputation_events.delta` (QA-02); no-show 1.º → `-10` (QA-03)
  - [x] `npm test` + `npm run build`

---

## Notas para el Dev Agent

### Contexto de épica 11 (RFC-RANK v1.0)

Correct Course **2026-05-29** — `docs/ranking-spec-v1.0.md` es fuente de verdad. Épicas 3–4 `done` con reglas MVP; **no reabrir** historias 4.3/4.4 en git; esta épica alinea código.

**Historia anterior (11.1):** Solo MIGR-001 + columna `role` en INSERT con **deltas MVP** (+10/+10, -20×n). **Esta historia cambia los números**, no la migración.

**Referencias obligatorias:**

- [Source: docs/ranking-spec-v1.0.md#2-rfc-001--asimetría-de-deltas-en-delivery_completed]
- [Source: docs/ranking-spec-v1.0.md#3-rfc-002--reducción-de-base-de-penalización-por-no-show]
- [Source: docs/ranking-spec-v1.0.md#5-rfc-004--incentivo-de-primera-donación-evento-de-rehabilitación]
- [Source: docs/ranking-spec-v1.0.md#7-cambios-en-capa-de-servicio] — pseudocódigo canónico
- [Source: docs/ranking-spec-v1.0.md#12-matriz-de-verificación-qa] — QA-01 a QA-06
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md#historia-112-reputación-asimétrica-en-confirm-y-cancel]
- [Source: _bmad-output/initiative-backend/tickets/epic-alineacion-ranking-y-reputacion-v1-0-rfc-rank/tickets/story-migracion-role-reputation-events-plan.md] — prerrequisito `role`

### Estado actual del código (leer antes de editar)

**`confirmDelivery`** (`delivery-session.repository.ts` ~L102–214):

- Donante y receptor: `reputation_score + 10` (incorrecto para receptor).
- No lee `total_donated` antes del UPDATE → no puede aplicar +15.
- `INSERT` sin `role` (11.1 lo añade).
- Retorna `donorNewScore` / `receiverNewScore` pero no los deltas aplicados.

**`cancelDelivery` no-show** (~L272–304):

- `delta = -20 * newConsecutiveNoShows` — debe ser `-10 * n`.
- `INSERT` sin `role` hasta 11.1.

**Analytics** (`reputation.service.ts`):

```typescript
// Hoy — incorrecto post-RFC
safeEmitEvent('reputation.changed', donorId, { delta: 10, ... });
safeEmitEvent('reputation.changed', receiverId, { delta: 10, ... });
```

**Tests HTTP** esperan `delta: 10` en confirm y `delta: -20` en primer no-show — actualizar en Task 4.

**Nota de ruta:** La spec §10 lista `src/domain/services/reputation.service.ts`; en este repo la implementación real es `src/application/services/reputation.service.ts`. Editar el archivo existente, no crear duplicado en `domain/`.

### Task 1 — Secuencia `confirmDelivery` (obligatoria)

Orden dentro de la misma transacción `BEGIN`/`COMMIT` (spec §7):

```
1. Validar sesión (activa, donor, no confirmada) — sin cambio
2. UPDATE delivery_sessions → completed
3. SELECT total_donated FROM users WHERE id = donor_id   ← ANTES de mutar donante
4. donorDelta := total_donated === 0 ? 15 : 10
5. UPDATE donor: score += donorDelta, consecutive_no_shows = 0, total_donated += 1
6. UPDATE receiver: score += 1, consecutive_no_shows = 0, total_received += 1
7. INSERT reputation_events (2 filas con role + delta correctos)
8. UPDATE items → completed
9. COMMIT
```

**Implementación sugerida (TypeScript en repo, no SQL CASE obligatorio):**

```typescript
const donorBefore = await client.query<{ total_donated: number }>(
  `SELECT total_donated FROM users WHERE id = $1`,
  [donor_id],
);
const donorDelta = donorBefore.rows[0].total_donated === 0 ? 15 : 10;
const receiverDelta = 1;

// UPDATE donor con $donorDelta dinámico
// UPDATE receiver con +1
// INSERT con role y deltas
```

**Anti-patrón:** Usar `total_donated + 1` después del incremento para decidir +15 — la condición RFC-004 es el valor **previo** a la transacción.

### Task 1 — SQL INSERT post-11.1

```sql
INSERT INTO reputation_events (user_id, type, delta, session_id, role) VALUES
  ($1, 'delivery_completed', $donorDelta, $3, 'donor'),
  ($2, 'delivery_completed', 1, $3, 'receiver')
```

Parámetros: `[donor_id, receiver_id, sessionId, donorDelta]` o binds equivalentes.

### Task 2 — No-show

```typescript
const delta = -10 * newConsecutiveNoShows;  // era -20
```

Progresión esperada (QA-03–05):

| Racha tras cancel | Delta |
|-------------------|-------|
| 1 | -10 |
| 2 | -20 |
| 3 | -30 |

### Task 3 — Contrato de dominio y use case

```typescript
// domain/repositories/delivery-session.repository.ts
export interface ConfirmDeliveryResult {
  // ... campos existentes ...
  donorDelta: number;
  receiverDelta: number;  // siempre 1 en v1.0
}
```

```typescript
// reputation.service.ts
export function emitDeliveryCompletedReputation(
  donorId: string,
  receiverId: string,
  donorDelta: number,
  receiverDelta: number,
  donorNewScore: number,
  receiverNewScore: number,
): void {
  safeEmitEvent('reputation.changed', donorId, {
    delta: donorDelta,
    type: 'delivery_completed',
    newScore: donorNewScore,
    consecutiveNoShows: 0,
  });
  safeEmitEvent('reputation.changed', receiverId, {
    delta: receiverDelta,
    type: 'delivery_completed',
    newScore: receiverNewScore,
    consecutiveNoShows: 0,
  });
}
```

OpenAPI y respuestas HTTP de confirm/cancel **no cambian** — solo propiedades internas de analytics.

### Arquitectura y convenciones

- **Clean Architecture:** lógica de deltas en repositorio (transacción atómica); analytics en capa application vía `reputation.service.ts`.
- **Sin ORM:** SQL directo `pg`.
- **`users.reputation_score`:** fuente de verdad operativa; `reputation_events` es auditoría.
- **Transacciones:** no extraer reputación a servicio de dominio en esta historia — mantener patrón de 4.3/11.1.
- **Idempotencia / errores:** mismas excepciones `ConflictException`, `ForbiddenException`, `NotFoundException` — no alterar contratos HTTP.

### Testing

| Archivo | Cambio |
|---------|--------|
| `tests/delivery-sessions-confirm.test.ts` | AE-030 receptor `delta: 1`; donante `10` o `15` según mock `donorDelta` |
| `tests/delivery-sessions-cancel.test.ts` | `receiverDelta: -10`, assert AE-030 |
| Nuevo (opcional) `tests/delivery-session-reputation-deltas.test.ts` | Integración BD: QA-01, QA-02, QA-03 |

**Patrón integración:** igual que `tests/user-repository-email-verification.test.ts` — BD migrada, fixtures mínimos, assert `users.reputation_score` y `reputation_events.delta`/`role`.

Comandos:

```bash
npm run db:migrate
npm test
npm run build
```

### Riesgos y anti-patrones

| Anti-patrón | Correcto en 11.2 |
|-------------|------------------|
| Evaluar primera donación después de `total_donated++` | `SELECT total_donated` antes del UPDATE donante |
| Dejar receptor en +10 | Receptor siempre +1 en confirm |
| Emitir AE-030 con delta fijo 10 | Pasar deltas desde `ConfirmDeliveryResult` |
| Implementar Tier 1/Tier 2 SQL “de paso” | Solo 11.3 |
| Backfill scores históricos | Prohibido (spec §6) |
| Crear `domain/services/reputation.service.ts` nuevo | Editar `application/services/reputation.service.ts` |
| Omitir `role` en INSERT porque “solo deltas” | Depende de 11.1; ambos van juntos |

### Dependencias y handoff

- **Requiere:** 11.1 mergeada o incluida en el mismo PR.
- **Desbloquea:** 11.3 (ranking usa `total_donated` actualizado en confirm), 11.4 (tests QA completos).
- **Frontend:** `no-lo-vendo` puede seguir mostrando copy `+10` hasta historia Angular; API response de confirm no expone deltas.

### Project Structure Notes

```
src/
├── domain/repositories/delivery-session.repository.ts  # ConfirmDeliveryResult + deltas
├── application/
│   ├── services/reputation.service.ts                # AE-030 deltas reales
│   └── use-cases/delivery-session/
│       ├── confirm-delivery.use-case.ts
│       └── cancel-delivery.use-case.ts
├── infrastructure/database/supabase/
│   └── delivery-session.repository.ts                  # confirmDelivery + cancelDelivery
tests/
├── delivery-sessions-confirm.test.ts
├── delivery-sessions-cancel.test.ts
└── delivery-session-reputation-deltas.test.ts          # opcional integración
```

### Matriz QA cubierta por esta historia

| ID | Cubierto en 11.2 |
|----|------------------|
| QA-01 | Sí — confirm, donante ya donó |
| QA-02 | Sí — primera donación +15 |
| QA-03–05 | Sí — no-show -10×n |
| QA-06 | Sí — reset racha en confirm |
| QA-07–14 | No — 11.3 / 11.4 |

---

## Dev Agent Record

### Agent Model Used

Composer (Cursor)

### Debug Log References

- Prerrequisito 11.1 verificado: migración `017-reputation-events-role.sql` presente.
- `confirmDelivery`: SELECT `total_donated` antes del UPDATE donante; deltas asimétricos +15/+10 donante, +1 receptor.
- `cancelDelivery` no-show: base penalización -10×n (era -20×n).
- AE-030 emite deltas reales desde `ConfirmDeliveryResult`.

### Completion Notes List

- ✅ RFC-001/004: primera donación +15, donaciones posteriores +10; receptor siempre +1.
- ✅ RFC-002: no-show base -10×consecutive_no_shows.
- ✅ Reset `consecutive_no_shows` en donante y receptor al confirmar entrega.
- ✅ `emitDeliveryCompletedReputation` recibe `donorDelta`/`receiverDelta` del repositorio.
- ✅ Tests HTTP actualizados + unitarios repositorio + integración QA-01/02/03.
- ✅ `npm test` (431 passed, 5 skipped) y `npm run build` OK.

### File List

- src/domain/repositories/delivery-session.repository.ts
- src/infrastructure/database/supabase/delivery-session.repository.ts
- src/application/services/reputation.service.ts
- src/application/use-cases/delivery-session/confirm-delivery.use-case.ts
- tests/delivery-sessions-confirm.test.ts
- tests/delivery-sessions-cancel.test.ts
- tests/delivery-session-reputation-role.test.ts
- tests/delivery-session-reputation-deltas.integration.test.ts
- _bmad-output/initiative-backend/archive-v6/sprint-status.yaml

### Change Log

- 2026-05-29: Code review — FOR UPDATE en SELECT total_donated; tests QA-01/04/05/06 + HTTP AE-030 escalado.

### Review Findings

- [x] [Review][Decision→Patch] **Alcance QA-06 (reset racha + no-show posterior)** — Resuelto: **1A** — test integración QA-06 añadido.

- [x] [Review][Decision→Patch] **Alcance QA-04/QA-05 (escalado no-show n=2,3)** — Resuelto: **2A** — tests integración + HTTP AE-030 añadidos.

- [x] [Review][Patch] **Race condition en bonus primera donación** [src/infrastructure/database/supabase/delivery-session.repository.ts:163-168] — `SELECT total_donated ... FOR UPDATE` aplicado.

- [x] [Review][Patch] **QA-01 no verifica filas `reputation_events`** [tests/delivery-session-reputation-deltas.integration.test.ts] — Assert de eventos con roles añadido.

- [x] [Review][Patch] **Test integración QA-06** — Confirm resetea racha; siguiente no-show aplica `-10`.

- [x] [Review][Patch] **Tests QA-04/QA-05** — Integración n=2/n=3; HTTP 18.2b/18.2c AE-030.

- [x] [Review][Defer] **RETURNING vacío en UPDATE donante/receptor** [delivery-session.repository.ts:171-210] — deferred, pre-existing: patrón del repo sin guard en `rows[0]`; `donor_id`/`receiver_id` vienen de sesión validada.

- [x] [Review][Defer] **`total_donated` negativo en BD corrupta** [delivery-session.repository.ts:168] — deferred, pre-existing: `=== 0` estricto; schema asume contador no negativo.

- [x] [Review][Defer] **Overflow entero en penalización no-show extrema** [delivery-session.repository.ts:297] — deferred, pre-existing: `-10*n` sin tope; escenario irreal en MVP.

- [x] [Review][Defer] **AE-030 HTTP sin deltas escalados (-20/-30)** [tests/delivery-sessions-cancel.test.ts] — deferred, pre-existing: solo asserta `-10`; cobertura n>1 planificada en 11.4.

- [x] [Review][Defer] **Unitarios no inspeccionan SQL `consecutive_no_shows = 0`** [tests/delivery-session-reputation-role.test.ts] — deferred, pre-existing: reset verificado en SQL de producción, no en mocks.

- [x] [Review][Defer] **Round-trip SQL extra por confirm** [delivery-session.repository.ts:163-168] — deferred, pre-existing: coste aceptado para RFC-004; requerido por spec.
