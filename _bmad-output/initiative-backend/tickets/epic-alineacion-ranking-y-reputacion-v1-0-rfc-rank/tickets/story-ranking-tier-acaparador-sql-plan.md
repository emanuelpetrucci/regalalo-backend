---
title: "SQL ranking Tier 1 / Tier 2 y requestCount"
type: feature
ticket: 3
status: done
created: 2026-10-25
---

# Historia 11.3: SQL ranking Tier 1 / Tier 2 y requestCount

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como donante,
quiero ver candidatos según las reglas RFC-003 y que `requestCount` refleje la misma visibilidad,
para elegir receptores con el nuevo control de acaparador (Tier 1 penalización / Tier 2 exclusión).

## Criterios de aceptación

1. **Dado** un solicitante con `cycles_at_limit >= 2` y `total_donated = 0`, **cuando** el donante consulta `GET /items/:id/requests`, **entonces** ese usuario **no** aparece en `candidates[]` (QA-09).

2. **Dado** el mismo usuario Tier 2 con solicitud `pending` sobre el ítem, **cuando** el donante consulta `GET /users/me/items`, **entonces** `requestCount` del ítem **no** lo incluye (QA-09, QA-14).

3. **Dado** un solicitante con `cycles_at_limit >= 1`, `total_donated = 0` y **no** excluido por FR17 (pasivo), **cuando** se genera el ranking, **entonces** aparece en `candidates[]` ordenado con penalización **-15** sobre `effective_score` (sin modificar `reputation_score` en respuesta) (QA-08).

4. **Dado** un solicitante con `total_donated >= 1` (cualquier `cycles_at_limit`), **cuando** se genera el ranking, **entonces** **no** aplica penalización Tier 1 ni exclusión Tier 2 (QA-11).

5. **Dado** un usuario pasivo (FR17) con `cycles_at_limit = 1` y `total_donated = 0`, **cuando** se genera el ranking, **entonces** queda excluido por FR17; la penalización Tier 1 no se evalúa (QA-12).

6. **Dado** la implementación en `ranked-candidate-filters.ts`, **entonces** `findRankedCandidates` y el subquery `pending_count` de `findMyItems` importan los **mismos** fragmentos SQL para exclusión (FR17 + Tier 2) y la penalización Tier 1 solo vive en el ranking (CASE de `effective_score`).

## Alcance explícito (IN / OUT)

| IN (11.3) | OUT (otras historias) |
|---|---|
| Reemplazar lógica FR18 obsoleta (`cycles_at_limit >= 3` + ratio recepciones) por RFC-003 | Migración `role` / MIGR-001 — **11.1** |
| `ranked-candidate-filters.ts` — constantes Tier 1/Tier 2 + composición con FR17 | Deltas reputación (+15/+1, -10×n) — **11.2** |
| `request.repository.ts` → `findRankedCandidates` | Matriz QA-01–QA-06 — **11.2** / **11.4** |
| `user.repository.ts` → subquery `requestCount` / `pending_count` | Tests integración exhaustivos QA-07–QA-14 — **11.4** (mínimos recomendados aquí) |
| Tests unitarios de constantes SQL + smoke de repos si hay BD | Sync `docs/architecture.md`, PRD, guías — **11.5** |
| | Exponer `effectiveScore` en API — prohibido (contrato actual) |
| | Añadir `ST_DWithin` 50 km en ranking — cambio de comportamiento fuera de RFC-003 |

**Prerrequisito blando:** Ninguna migración nueva. Depende de columnas existentes (`cycles_at_limit`, `total_donated`, `total_received`, `last_active_at`). **11.2** no bloquea esta historia (solo reputación en confirm/cancel).

**Paralelizable con 11.2:** Sí — archivos distintos salvo convivencia en el mismo PR de épica 11.

## Tareas / Subtareas

- [x] **Task 1 — Extender `ranked-candidate-filters.ts`** (AC: #6)
  - [x] Añadir `HOARDER_TIER2_EXCLUSION_SQL` (alias `u`): `(u.cycles_at_limit >= 2 AND u.total_donated = 0)`
  - [x] Añadir `RANKED_ELIGIBLE_REQUESTER_SQL` = `RANKED_VISIBLE_REQUESTER_SQL AND NOT ${HOARDER_TIER2_EXCLUSION_SQL}` (o equivalente legible)
  - [x] Añadir `HOARDER_TIER1_PENALTY_CASE_SQL` para el CASE de `effective_score`: `-15` cuando `(u.cycles_at_limit >= 1 AND u.total_donated = 0)`, si no `0`
  - [x] Comentarios JSDoc citando RFC-003 y que Tier 2 prevalece sobre Tier 1 (excluidos no llegan al CASE)
  - [x] Actualizar `tests/ranked-candidate-filters.test.ts` (composición, Tier 2, Tier 1)

- [x] **Task 2 — `findRankedCandidates` en `request.repository.ts`** (AC: #1, #3, #4, #5)
  - [x] **Eliminar** el CASE FR18: `cycles_at_limit >= 3 AND total_received > 5 * total_donated`
  - [x] **Insertar** `HOARDER_TIER1_PENALTY_CASE_SQL` en el cálculo de `effective_score` (restar 15, mismo signo que antes)
  - [x] En el `WHERE` interno, usar `RANKED_ELIGIBLE_REQUESTER_SQL` (o `RANKED_VISIBLE_REQUESTER_SQL` + `NOT HOARDER_TIER2`)
  - [x] Mantener orden: `effective_score DESC`, `distance_meters ASC`, `request_date ASC`
  - [x] **No** añadir `ST_DWithin` ni cambiar joins existentes

- [x] **Task 3 — `requestCount` en `user.repository.ts`** (AC: #2, #6)
  - [x] En el subquery `pending_count` (~L416–421), reemplazar solo `RANKED_VISIBLE_REQUESTER_SQL` por `RANKED_ELIGIBLE_REQUESTER_SQL` (misma exclusión Tier 2 + FR17 que ranking)
  - [x] **No** incluir penalización Tier 1 en el COUNT (solo visibilidad)

- [x] **Task 4 — Tests** (AC: #1–#6)
  - [x] `ranked-candidate-filters.test.ts`: asserts sobre nuevas constantes
  - [x] (Recomendado) Test integración repositorio con BD migrada: seed 3 usuarios (Tier 0, Tier 1, Tier 2) + 1 pasivo; assert filas devueltas por `findRankedCandidates` y `requestCount` — patrón `tests/user-repository-email-verification.test.ts`
  - [x] `items-candidates.test.ts`: sin cambio de contrato HTTP; sigue sin `effectiveScore` en body
  - [x] `npm test` + `npm run build`

---

## Notas para el Dev Agent

### Contexto de épica 11 (RFC-RANK v1.0)

Correct Course **2026-05-29** — `docs/ranking-spec-v1.0.md` §4 (RFC-003) y §8 reemplazan FR18 de épicas 3–4 `done`. **No reabrir** historias 3.2/3.3 en el tracker; alinear SQL aquí.

**Historias relacionadas:**

| Historia | Relación con 11.3 |
|----------|-------------------|
| **11.1** | Sin dependencia directa |
| **11.2** | Tras confirm, `total_donated >= 1` rehabilita ranking (QA-10) — probar en 11.4 si 11.2 no está mergeada |
| **11.4** | Matriz QA-07–QA-14 completa |
| **11.5** | Actualizar `architecture.md` §6.3/6.5, PRD §11, guías ranking |

**Referencias obligatorias:**

- [Source: docs/ranking-spec-v1.0.md#4-rfc-003--nuevos-niveles-de-control-de-acaparador-reemplaza-fr18]
- [Source: docs/ranking-spec-v1.0.md#8-sql-actualizado--findrankedcandidates]
- [Source: docs/ranking-spec-v1.0.md#12-matriz-de-verificación-qa] — QA-07 a QA-14
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md#historia-113-sql-ranking-tier-1--tier-2-y-requestcount]
- [Source: _bmad-output/initiative-backend/tickets/epic-alineacion-ranking-y-reputacion-v1-0-rfc-rank/tickets/story-reputacion-asimetrica-confirm-cancel-plan.md] — QA-10 (rehabilitación vía `total_donated`)

### Estado actual del código (leer antes de editar)

**`findRankedCandidates`** (`request.repository.ts` L73–122):

- Penalización **obsoleta** en `effective_score`:

```sql
- CASE
    WHEN u.cycles_at_limit >= 3 AND u.total_received > 5 * u.total_donated
    THEN 15
    ELSE 0
  END
```

- `WHERE` usa solo `RANKED_VISIBLE_REQUESTER_SQL` (FR17) — **falta** exclusión Tier 2.
- Subquery con `ORDER BY effective_score DESC` — patrón correcto; conservar.
- **No** usa `ST_DWithin` (diferencia vs spec §8 / architecture §6.3); **no introducir** en 11.3.

**`requestCount`** (`user.repository.ts` L416–421):

```sql
(SELECT COUNT(*)
 FROM item_requests ir
 JOIN users u ON u.id = ir.requester_id
 WHERE ir.item_id = i.id
   AND ir.status = 'pending'
   AND ${RANKED_VISIBLE_REQUESTER_SQL}) AS pending_count
```

Debe alinearse con candidatos visibles (FR17 + Tier 2), no con penalización Tier 1.

**`ranked-candidate-filters.ts`** (commit `2a57817`):

- Solo `PASSIVE_REQUESTER_SQL` y `RANKED_VISIBLE_REQUESTER_SQL`.
- Extender aquí; **no** duplicar strings en repos.

**API / DTO:**

- `GET /items/:id/requests` devuelve `reputationScore` oficial, **no** `effectiveScore` (`tests/items-candidates.test.ts` L116).
- La penalización Tier 1 solo afecta **orden**, no el campo expuesto.

### Task 1 — Constantes SQL canónicas (sugerencia)

```typescript
/** RFC-003 Tier 2 — excluded from ranking and requestCount. Users aliased as `u`. */
export const HOARDER_TIER2_EXCLUSION_SQL = `(
  u.cycles_at_limit >= 2
  AND u.total_donated = 0
)`;

/** FR17 + RFC-003 Tier 2 — use in WHERE for visibility (ranking + requestCount). */
export const RANKED_ELIGIBLE_REQUESTER_SQL = `(
  ${RANKED_VISIBLE_REQUESTER_SQL}
  AND NOT ${HOARDER_TIER2_EXCLUSION_SQL}
)`;

/** RFC-003 Tier 1 — subtract from effective_score only (ranking ORDER BY). */
export const HOARDER_TIER1_PENALTY_CASE_SQL = `CASE
  WHEN (u.cycles_at_limit >= 1 AND u.total_donated = 0)
  THEN 15
  ELSE 0
END`;
```

**Tabla de comportamiento esperado:**

| cycles_at_limit | total_donated | FR17 pasivo | En lista | Penalización orden |
|-----------------|---------------|-------------|----------|-------------------|
| 0 | 0 | No | Sí | 0 |
| 1 | 0 | No | Sí | -15 |
| 2+ | 0 | No | **No** | — |
| * | >= 1 | No | Sí | 0 |
| 1 | 0 | **Sí** | **No** | — |

### Task 2 — SQL `findRankedCandidates` objetivo

Fragmento interior (adaptar a subquery existente):

```sql
(
  u.reputation_score
  + FLOOR(RANDOM() * 5 - 2)::int
  - ${HOARDER_TIER1_PENALTY_CASE_SQL}
) AS effective_score
...
WHERE ir.item_id = $1
  AND ir.status = 'pending'
  AND ${RANKED_ELIGIBLE_REQUESTER_SQL}
```

**Eliminar por completo** el CASE con `total_received > 5 * total_donated`.

### Task 3 — requestCount

Un solo cambio: sustituir `RANKED_VISIBLE_REQUESTER_SQL` → `RANKED_ELIGIBLE_REQUESTER_SQL` en el subquery `pending_count`.

Verificar manualmente: ítem con 2 pending (uno Tier 2, uno normal) → `requestCount === 1`.

### Arquitectura y convenciones

- **Clean Architecture:** SQL compartido en `infrastructure/database/sql/`; repos importan constantes (patrón FR17).
- **Sin ORM:** `pg` + strings interpolados solo para fragmentos **estáticos** exportados (nunca input de usuario).
- **NFR6:** rate limit `GET /items/:id/requests` sin cambios.
- **NFR2:** `location` no aparece en DTOs.
- **Transacciones:** lectura sola; sin cambios en use cases salvo comportamiento de listado.

### Testing

| Archivo | Acción |
|---------|--------|
| `tests/ranked-candidate-filters.test.ts` | Tier 2, `RANKED_ELIGIBLE`, Tier 1 CASE |
| `tests/request-repository-ranking.test.ts` (nuevo, opcional) | BD: QA-08, QA-09, QA-11, QA-12, QA-14 |
| `tests/items-candidates.test.ts` | Sin cambios de contrato |
| `tests/users-items.test.ts` | Si mock repo: actualizar expectativas si el mock filtra; si integración, assert `requestCount` |

**Cómo verificar Tier 1 sin `effectiveScore` en API:**

- Test de integración que lea filas con el **mismo SQL** que el repo (o compare orden de `userId` entre dos usuarios con mismo `reputation_score` y distancias iguales: Tier 1 debe ir después).
- O assert directo contra query interna en test de repositorio.

**QA cubierta en 11.3 vs 11.4:**

| ID | 11.3 | 11.4 |
|----|------|------|
| QA-07 | Sí (implícito) | Refuerzo |
| QA-08 | Sí | Refuerzo |
| QA-09 | Sí | Refuerzo |
| QA-10 | Parcial (doc; delta +15 es 11.2) | Integración E2E |
| QA-11 | Sí | Refuerzo |
| QA-12 | Sí | Refuerzo |
| QA-13 | No (aleatoriedad) | Sí |
| QA-14 | Sí | Refuerzo |

Comandos:

```bash
npm test
npm run build
```

### Riesgos y anti-patrones

| Anti-patrón | Correcto en 11.3 |
|-------------|------------------|
| Copiar SQL Tier 2 solo en `request.repository` | Centralizar en `ranked-candidate-filters.ts` |
| Aplicar -15 en `requestCount` | COUNT solo usa elegibilidad, no penalización |
| Dejar condición FR18 “por si acaso” | Eliminar ratio `5 × total_donated` |
| Exponer `effectiveScore` en OpenAPI | Prohibido |
| Penalizar con `total_donated >= 1` | Tier 1/2 solo si `total_donated = 0` |
| Implementar QA-01–06 aquí | 11.2 / 11.4 |
| Añadir `ST_DWithin` “para alinear spec” | Fuera de alcance; cambiaría quién puede solicitar vs quién aparece |

### Dependencias y handoff

- **Desbloquea:** 11.4 (tests matriz ranking), validación manual donante en app.
- **Frontend:** sin cambios de contrato; listado y badge `requestCount` reflejan reglas nuevas automáticamente.
- **Analytics:** sin eventos nuevos.

### Project Structure Notes

```
src/infrastructure/database/
├── sql/
│   └── ranked-candidate-filters.ts     # FR17 + RFC-003 Tier 1/2 (Task 1)
└── supabase/
    ├── request.repository.ts           # findRankedCandidates (Task 2)
    └── user.repository.ts              # pending_count / requestCount (Task 3)
tests/
├── ranked-candidate-filters.test.ts
└── request-repository-ranking.test.ts  # opcional integración
```

---

## Dev Agent Record

### Agent Model Used

Composer (Cursor)

### Debug Log References

- Implementación RFC-003: constantes centralizadas; FR18 eliminado de `findRankedCandidates`.
- Tests de repositorio con mock Pool (mismo patrón que email-verification); sin BD real en CI.

### Completion Notes List

- Añadidas `HOARDER_TIER2_EXCLUSION_SQL`, `RANKED_ELIGIBLE_REQUESTER_SQL`, `HOARDER_TIER1_PENALTY_CASE_SQL` con JSDoc RFC-003.
- `findRankedCandidates`: WHERE usa elegibilidad FR17+Tier2; `effective_score` resta penalización Tier 1.
- `findMyItems` `pending_count`: alineado con `RANKED_ELIGIBLE_REQUESTER_SQL` (sin penalización Tier 1).
- Tests: 5 unitarios filtros + smoke SQL en request/user repos. `npm test` 438 passed; `npm run build` OK.

### File List

- src/infrastructure/database/sql/ranked-candidate-filters.ts
- src/infrastructure/database/supabase/request.repository.ts
- src/infrastructure/database/supabase/user.repository.ts
- tests/ranked-candidate-filters.test.ts
- tests/request-repository-ranking.test.ts
- tests/user-repository-ranking.test.ts

### Change Log

- 2026-05-29: RFC-003 ranking Tier 1/2 y requestCount alineado; FR18 eliminado.

---

Ultimate context engine analysis completed - comprehensive developer guide created

---

### Review Findings

- [x] [Review][Decision] `HOARDER_TIER1_PENALTY_CASE_SQL` no está auto-guardado contra solapamiento Tier 2 — Resuelto: WHEN ahora incluye `AND NOT ${HOARDER_TIER2_EXCLUSION_SQL}` explícitamente. [src/infrastructure/database/sql/ranked-candidate-filters.ts]

- [x] [Review][Patch] Aserción vacua `not.toContain('HOARDER_TIER1')` siempre pasa — Resuelto: reemplazado con `not.toContain(HOARDER_TIER1_PENALTY_CASE_SQL.trim())`. [tests/user-repository-ranking.test.ts]

- [x] [Review][Patch] Falta test de frontera cycles_at_limit=1 (penalizado) vs cycles_at_limit=2 (excluido) — Resuelto: añadido test 'Tier 1 CASE boundary' en ranked-candidate-filters.test.ts. [tests/ranked-candidate-filters.test.ts]

- [x] [Review][Patch] Índice frágil `mock.calls[1][0]` en test de findMyItems — Resuelto: reemplazado con find por `pending_count` substring. [tests/user-repository-ranking.test.ts]

- [x] [Review][Defer] Riesgo latente de inyección SQL por patrón template literal — fragmentos SQL estáticos; sin vector activo hoy. Pre-existente en todo el proyecto. [src/infrastructure/database/sql/ranked-candidate-filters.ts] — deferred, pre-existing

- [x] [Review][Defer] Riesgo de double-negation en composición futura de `RANKED_ELIGIBLE_REQUESTER_SQL` — teórico, no causado por este diff. [src/infrastructure/database/sql/ranked-candidate-filters.ts] — deferred, pre-existing

- [x] [Review][Defer] Falta índice en `(cycles_at_limit, total_donated)` para subquery `pending_count` — rendimiento pre-existente, no causado por este diff. [src/infrastructure/database/supabase/user.repository.ts:420] — deferred, pre-existing
