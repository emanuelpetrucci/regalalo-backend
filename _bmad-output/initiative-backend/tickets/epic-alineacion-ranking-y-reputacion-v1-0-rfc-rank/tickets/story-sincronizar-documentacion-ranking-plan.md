---
title: "Sincronizar documentación ranking v1.0"
type: feature
ticket: 5
status: done
created: 2026-10-25
---

# Historia 11.5: Sincronizar documentación ranking v1.0

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como mantenedor,
quiero que PRD, arquitectura y guías de ranking coincidan con `docs/ranking-spec-v1.0.md` (aprobada 2026-05-29),
para que ningún PR mergee sin documentación al día y los agentes/desarrolladores no reintroduzcan reglas MVP obsoletas.

## Criterios de aceptación

1. **Dado** la lista §14 de `docs/ranking-spec-v1.0.md`, **cuando** se cierra esta historia, **entonces** los cuatro documentos listados están sincronizados con la spec v1.0 (RFC-001 a RFC-004, MIGR-001).

2. **Dado** `docs/prd.md` §10 (reputación), **cuando** un lector consulta deltas y ejemplos, **entonces** refleja: donante `+10`/`+15` (primera donación), receptor `+1`, no-show `-10 × consecutive_no_shows`; **no** aparece el patrón simétrico `+10/+10` ni base `-20`.

3. **Dado** `docs/prd.md` §11 (comportamiento), **cuando** se describe acaparador, **entonces** FR18 MVP (`cycles_at_limit >= 3 AND total_received > 5 × total_donated`) está **reemplazado** por Tier 1 (penalización `-15` en orden) y Tier 2 (exclusión total); usuario pasivo (FR17) sin cambios.

4. **Dado** `docs/architecture.md`, **cuando** se revisan §5.1–5.3, §6.3, §6.5, §12.5 y §12.6, **entonces** coinciden con spec §7–§8 (pseudocódigo asimétrico, SQL Tier 1/Tier 2, secuencias Confirm/Cancel).

5. **Dado** `docs/architecture.md` §3.6 (`reputation_events`), **cuando** se documenta el esquema, **entonces** incluye columna `role VARCHAR(8) CHECK (role IN ('donor','receiver')) NULL` (MIGR-001) y nota de filas históricas con `role = NULL`.

6. **Dado** `docs/ranking-system.md` y `docs/ranking-guia-producto.md`, **cuando** se comparan con la spec, **entonces** tablas de reputación, progresión no-show, acaparador (dos niveles), `requestCount` vs `candidates[]` y fórmula `effective_score` están alineadas; referencias a FR18 obsoleto eliminadas o marcadas como superseded.

7. **Dado** el diff del PR, **cuando** se buscan literales obsoletos en los cuatro archivos, **entonces** **no** quedan: `cycles_at_limit >= 3`, `total_received > 5 * total_donated`, `+10` simétrico donante/receptor en entrega, `-20 ×` en no-show (salvo bloques explícitos «estado anterior / histórico MVP» si se documentan).

8. **Dado** historias 11.1–11.4 implementadas, **cuando** se valida coherencia doc↔código, **entonces** los fragmentos SQL/c pseudocódigo citados en docs coinciden con `ranked-candidate-filters.ts`, `request.repository.ts`, `delivery-session.repository.ts` (verificación manual en Task 6).

## Alcance explícito (IN / OUT)

| IN (11.5) | OUT (otras historias / repos) |
|---|---|
| Sync `docs/prd.md` §10–11 | Implementar lógica — **11.1–11.3** |
| Sync `docs/architecture.md` §3.6, §5–6, §12.5–12.6 | Tests QA — **11.4** |
| Sync `docs/ranking-system.md` §2, §3.2, §4 (+ requestCount/Tier 2) | Cambios OpenAPI / regeneración frontend |
| Sync `docs/ranking-guia-producto.md` (tablas reputación, no-show, acaparador) | Copy UI Angular (`no-lo-vendo`) — historia aparte post-11.2 |
| Cross-refs entre docs (`ranking-spec-v1.0.md` como fuente de verdad) | Editar `docs/ranking-spec-v1.0.md` (ya aprobada, sin cambios) |
| Grep de regresión documental en los 4 archivos | Reabrir historias épicas 3–4 `done` en tracker |
| Task 6: verificación doc↔código post-11.1–11.4 | `epics.md` — ya actualizado en Correct Course 2026-05-29 |

**Prerrequisitos:** Historias **11.1–11.4** implementadas y mergeadas (o en la misma rama de épica con código v1.0). Esta historia es **solo documentación**; no modifica `src/` salvo que un comentario JSDoc obsoleto requiera una línea (evitar scope creep).

**Orden recomendado:** 11.1 → 11.2 → 11.3 → 11.4 → **11.5** (cierre documental de épica 11).

## Tareas / Subtareas

- [x] **Task 0 — Baseline y prerrequisitos** (AC: #8)
  - [x] Leer `docs/ranking-spec-v1.0.md` completa (fuente de verdad)
  - [x] Confirmar código v1.0 en: `delivery-session.repository.ts`, `ranked-candidate-filters.ts`, `request.repository.ts`, `user.repository.ts`
  - [x] Si código aún MVP, **detener** y completar 11.1–11.3 antes de editar docs

- [x] **Task 1 — `docs/prd.md`** (AC: #2, #3, #7)
  - [x] **§10 Sistema de reputación** — reemplazar tabla y reglas:

| Evento | Delta v1.0 (nuevo) |
|--------|-------------------|
| Entrega completada — donante (ya donó antes) | +10 |
| Entrega completada — donante (primera donación histórica) | +15 |
| Entrega completada — receptor | +1 |
| No-show (receptor) | -10 × consecutive_no_shows |

  - [x] Actualizar ejemplo de acumulación: `-10, -20, +1/+10/+15 según rol, racha reset`
  - [x] Añadir nota RFC-001: ratio castigo/recuperación receptor 10:1 (opcional, 1 párrafo desde spec §2)
  - [x] **§11 Usuario acaparador** — reemplazar bloque FR18 por:

**Tier 1 (penalización):** `cycles_at_limit >= 1 AND total_donated = 0` → `-15` sobre score efectivo; visible en ranking.

**Tier 2 (exclusión):** `cycles_at_limit >= 2 AND total_donated = 0` → no aparece en candidatos ni en `requestCount`.

**Rehabilitación:** `total_donated >= 1` elimina Tier 1 y Tier 2 de inmediato.

  - [x] Mantener §11 usuario pasivo (FR17) sin cambios
  - [x] Grep en `prd.md`: cero hits de `>= 3` con ratio 5×, `-20 ×`, `+10` simétrico en §10

- [x] **Task 2 — `docs/architecture.md`** (AC: #4, #5, #7)
  - [x] **§3.6** — añadir columna `role` a DDL y nota MIGR-001
  - [x] **§5.1** — tabla deltas asimétricos (donante +10/+15, receptor +1, no-show -10×n)
  - [x] **§5.2** — pseudocódigo `onDeliveryCompleted(donor, receiver)` y `onNoShow(receiver)` desde spec §7
  - [x] **§5.3** — fórmula consolidada spec §9 (estado nuevo)
  - [x] **§6.3** — SQL `findRankedCandidates` spec §8 (Tier 1 CASE, Tier 2 WHERE, FR17, `FLOOR(RANDOM()*5-2)`)
  - [x] **§6.5** — reemplazar acaparador FR18 por Tier 1/Tier 2 (texto + condiciones)
  - [x] **§6.4** nota: `requestCount` usa mismo filtro que ranking (FR17 + Tier 2) — referencia `RANKED_ELIGIBLE_REQUESTER_SQL`
  - [x] **§12.5 ConfirmDelivery** — secuencia spec §7 (leer `total_donated` antes UPDATE, dos INSERT con `role`, deltas +15/+10 y +1)
  - [x] **§12.6 CancelDelivery** — `delta = -10 × consecutive_no_shows`, INSERT con `role = 'receiver'`
  - [x] **Nota ST_DWithin:** si el código en `request.repository.ts` **no** usa `ST_DWithin` (diferencia conocida pre-11.3), documentar el SQL **tal como está implementado** y añadir nota «spec §8 incluye ST_DWithin; implementación actual omite filtro geo en ranking de candidatos» — **no inventar** SQL que el repo no ejecuta

- [x] **Task 3 — `docs/ranking-system.md`** (AC: #6, #7)
  - [x] **§2 Eventos** — tabla `delivery_completed` con deltas por rol; `no_show` con `-10 × n`; mencionar campo `role` en historial si aplica
  - [x] **§2 fórmula no-show** — `-10 * newConsecutiveNoShows`; ejemplos -10, -20, -30
  - [x] **§2 tabla «no cambia reputation_score»** — acaparador: «Tier 1 -15 en effective_score; Tier 2 exclusión»
  - [x] **§3.2** — renombrar a «Control acaparador RFC-003 (Tier 1)»; condición `cycles_at_limit >= 1 AND total_donated = 0`
  - [x] **§4** — añadir subsección **«Reglas de exclusión: acaparador Tier 2 (RFC-003)»** con condición `cycles_at_limit >= 2 AND total_donated = 0`; matriz interacción FR17 vs Tier 2 (copiar tabla spec §4)
  - [x] **§ cycles_at_limit** (L~115) — actualizar texto: ya no ratio 5×; explicar Tier 1/Tier 2
  - [x] **requestCount** — explicitar exclusión Tier 2 además de pasivo
  - [x] **Diagrama diagnóstico** — añadir nodo «¿Tier 2 acaparador?» entre pasivo y 403
  - [x] Actualizar header FR18 → «RFC-003 (supersede FR18 MVP)»

- [x] **Task 4 — `docs/ranking-guia-producto.md`** (AC: #6, #7)
  - [x] Tabla «Cómo se gana o pierde reputación» — filas separadas donante/receptor; +15 primera donación
  - [x] Tabla no-show — base **10** (no 20); progresión -10, -20, -30
  - [x] Ejemplo racha — alinear con PRD v1.0
  - [x] Sección «Recuperación de puntos» — donante +10/+15; receptor +1; recuperación significativa vía donación
  - [x] Sección «Penalización acaparador» — dos niveles: Tier 1 visible penalizado; Tier 2 **no aparece** en lista
  - [x] Eliminar criterio «recibió más de cinco veces lo que donó»
  - [x] FAQ «¿Cómo sube reputación?» — +10/+15 donante, +1 receptor; no-show -10n
  - [x] Tabla relación ranking — añadir fila Tier 2 exclusión

- [x] **Task 5 — Cross-references y coherencia** (AC: #1, #6)
  - [x] En cada doc editado, enlace a `[ranking-spec-v1.0.md](./ranking-spec-v1.0.md)` como fuente de verdad
  - [x] Verificar que `architecture.md` §6.3 enlace a `ranking-system.md` sigue siendo válido
  - [x] `sprint-change-proposal-2026-05-29-ranking-rfc-v1.md` — opcional: marcar fila docs ranking como resuelta (solo si el equipo lo usa como checklist)

- [x] **Task 6 — Verificación final** (AC: #7, #8)
  - [x] Grep en los 4 archivos:

```bash
rg "cycles_at_limit >= 3|total_received > 5|× 5 \×|-20 ×|-20 \*|\\+10.*receptor.*\\+10" docs/prd.md docs/architecture.md docs/ranking-system.md docs/ranking-guia-producto.md
# Resultado esperado: 0 matches obsoletos (excepto bloques «estado anterior» si se conservan)
```

  - [x] Comparar SQL en `architecture.md` §6.3 con `request.repository.ts` + constantes en `ranked-candidate-filters.ts`
  - [x] Comparar deltas en §5 con `delivery-session.repository.ts` / `reputation.service.ts`
  - [x] `npm test && npm run build` — sin cambios de código, debe seguir verde

---

## Notas para el Dev Agent

### Contexto de épica 11 (RFC-RANK v1.0)

Correct Course **2026-05-29** — Implementación en 11.1–11.4; **11.5 cierra la deuda documental** exigida en spec §14 y sprint-change-proposal. Sin esta story, PRs futuros pueden reintroducir FR18, +10 simétrico o -20 no-show porque PRD/architecture/guías siguen describiendo MVP.

**Fuente de verdad (no editar salvo errata):** `docs/ranking-spec-v1.0.md`

**Referencias obligatorias:**

- [Source: docs/ranking-spec-v1.0.md#14-documentos-que-requieren-actualización]
- [Source: docs/ranking-spec-v1.0.md#7-cambios-en-capa-de-servicio]
- [Source: docs/ranking-spec-v1.0.md#8-sql-actualizado--findrankedcandidates]
- [Source: docs/ranking-spec-v1.0.md#9-fórmula-consolidada-de-reputación]
- [Source: _bmad-output/initiative-backend/sprint-change-proposal-2026-05-29-ranking-rfc-v1.md]
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md#historia-115-sincronizar-documentación-ranking-v10]
- [Source: _bmad-output/initiative-backend/tickets/epic-alineacion-ranking-y-reputacion-v1-0-rfc-rank/tickets/story-tests-ranking-reputacion-qa-plan.md] — matriz QA como checklist doc↔código

### Mapa de desalineación actual (baseline pre-11.5)

Documentar **qué reemplazar** en cada archivo — no copiar ciegamente la spec si el código difiere en detalles menores (p. ej. ST_DWithin).

| Ubicación | Contenido obsoleto (MVP) | Contenido v1.0 (spec) |
|-----------|-------------------------|----------------------|
| `prd.md` §10 tabla | Entrega +10; No-show -20×n | Donante +10/+15, receptor +1; -10×n |
| `prd.md` §10 ejemplo | -20, -40, +10 | -10, -20, +1/+10/+15 |
| `prd.md` §11 acaparador | `cycles>=3 AND ratio 5×` → -15 | Tier 1: `cycles>=1, donated=0`; Tier 2: `cycles>=2, donated=0` exclusión |
| `architecture.md` §5.1–5.3 | Simétrico +10; onNoShow -20 | Asimétrico; -10×n; fórmula §9 |
| `architecture.md` §6.3 SQL | FR18 CASE + WHERE pasivo | Tier 1 CASE + Tier 2 WHERE + pasivo |
| `architecture.md` §6.5 | cycles>=3, ratio 5× | Tier 1 / Tier 2 |
| `architecture.md` §12.5 | +10 ambos | +15/+10 donante, +1 receptor, role |
| `architecture.md` §12.6 | -20×n | -10×n, role receiver |
| `architecture.md` §3.6 | Sin `role` | MIGR-001 `role` nullable |
| `ranking-system.md` §2 | +10/+10; -20×n | Deltas v1.0 |
| `ranking-system.md` §3.2 | FR18 ratio | Tier 1 |
| `ranking-system.md` §4 | Solo FR17 pasivo | + Tier 2 exclusión |
| `ranking-guia-producto.md` | +10 ambos; -20 base; ratio 5× acaparador | Tablas v1.0 producto |

### Contenido canónico para copy-paste/adaptación

**Deltas reputación (PRD §10 / architecture §5.1):**

```
delivery_completed → donante:  +15 si total_donated_prev=0, si no +10
delivery_completed → receptor: +1
no_show            → receptor: -10 × consecutive_no_shows (tras incrementar contador)
```

**Acaparador RFC-003 (PRD §11 / architecture §6.5 / guías):**

| Nivel | Condición | Efecto en ranking | ¿Modifica reputation_score? |
|-------|-----------|-------------------|----------------------------|
| Tier 1 | `cycles_at_limit >= 1 AND total_donated = 0` | -15 en effective_score | No |
| Tier 2 | `cycles_at_limit >= 2 AND total_donated = 0` | Excluido de candidates[] y requestCount | No |
| Rehabilitación | `total_donated >= 1` | Sin Tier 1 ni Tier 2 | — |

**Progresión no-show (guía producto / ranking-system):**

| No-show consecutivo | Delta |
|--------------------|-------|
| 1.º | -10 |
| 2.º | -20 |
| 3.º | -30 |
| Tras entrega OK | racha → 0; receptor +1 |

### ST_DWithin — discrepancia doc vs spec

La spec §8 incluye `ST_DWithin(u.location, i.location, 50000)`. El código en `request.repository.ts` (pre/post 11.3) **puede no** filtrar por distancia en candidatos — las solicitudes ya implican interés en el objeto. Al actualizar §6.3:

1. Priorizar el SQL **real** del repositorio + constantes importadas.
2. Si difiere de spec §8, añadir nota explícita en architecture (no silenciar la diferencia).
3. **No** añadir ST_DWithin al código en 11.5 — fuera de alcance.

### `reputation_events.role` y API historial

MIGR-001 añade `role` en BD. `GET /users/me/reputation-history` **puede** no exponer `role` aún (sin cambio de contrato en épica 11). En docs:

- Documentar columna en architecture §3.6.
- En ranking-system §2 API historial: opcional nota «campo `role` en BD; exposición HTTP evaluable en historia futura» — **no** modificar OpenAPI en 11.5 salvo que ya esté implementado.

### Intelligencia de historias previas (11.1–11.4)

| Historia | Lo que el código debería reflejar (validar en Task 0) |
|----------|------------------------------------------------------|
| **11.1** | `reputation_events.role` en migración |
| **11.2** | Deltas +15/+10/+1, -10×n; dos INSERT confirm; AE-030 deltas reales |
| **11.3** | `HOARDER_TIER1/TIER2`, `RANKED_ELIGIBLE_REQUESTER_SQL`; requestCount alineado |
| **11.4** | Tests QA-01–QA-14 — usar como checklist: si doc dice X y test assert Y, doc debe decir Y |

### Arquitectura y convenciones

- **Idioma docs:** español (igual que spec y PRD)
- **Formato tablas:** mantener estilo markdown existente en cada archivo
- **Versionado architecture:** si el repo usa `v1.x` en cabecera, incrementar patch o añadir nota «Correct Course 2026-05-29 ranking v1.0» — seguir convención del archivo
- **No editar:** `src/`, `openapi/`, `tests/` (salvo typo en comentario detectado incidentalmente — evitar)
- **No editar:** `_bmad-output/initiative-backend/archive-v6/epics.md` (ya tiene FR18 v1.0)

### Project Structure Notes

```
docs/
├── ranking-spec-v1.0.md          # Fuente de verdad — SOLO LECTURA
├── prd.md                        # Task 1 — §10, §11
├── architecture.md               # Task 2 — §3.6, §5, §6, §12.5–12.6
├── ranking-system.md             # Task 3 — §2, §3.2, §4, requestCount
└── ranking-guia-producto.md      # Task 4 — tablas producto

src/ (lectura para Task 6 — NO modificar en 11.5)
├── infrastructure/database/sql/ranked-candidate-filters.ts
├── infrastructure/database/supabase/request.repository.ts
├── infrastructure/database/supabase/delivery-session.repository.ts
└── application/services/reputation.service.ts
```

### Riesgos y anti-patrones

| Anti-patrón | Correcto en 11.5 |
|-------------|------------------|
| Copiar SQL spec §8 sin leer repo | Task 6: doc = código implementado |
| Dejar FR18 ratio en un doc «porque es histórico» | Eliminar o bloque «superseded by RFC-003» único |
| Editar ranking-spec-v1.0.md | Prohibido — ya aprobada |
| Cambiar código «para que coincida con doc» | Docs siguen al código mergeado |
| Sync frontend copy | Fuera de alcance — handoff en sprint-change-proposal |
| Omitir §3.6 role en architecture | AC #5 explícito |
| Mezclar Tier 1 y Tier 2 en una sola regla | Dos niveles claramente separados |

### Dependencias y handoff

- **Requiere:** 11.1–11.4 implementadas (código v1.0 en rama)
- **Desbloquea:** marcar épica 11 completa en tracker; merge final RFC-RANK
- **Frontend:** tras 11.5, opcional story en `no-lo-vendo` para copy `+10` → +15/+1 en pantallas entrega (ver sprint-change-proposal § conflictos frontend)

Comandos verificación:

```bash
# Regresión documental
rg "cycles_at_limit >= 3|total_received > 5 \*|5 × total_donated|-20 ×|-20 \*" docs/prd.md docs/architecture.md docs/ranking-system.md docs/ranking-guia-producto.md

# Suite sin cambios de código
npm test && npm run build
```

---

## Dev Agent Record

### Agent Model Used

Composer (Cursor)

### Debug Log References

- Task 0: código v1.0 verificado en repos — deltas +15/+10/+1, -10×n, HOARDER_TIER1/TIER2, RANKED_ELIGIBLE_REQUESTER_SQL.
- Task 6: grep en 4 docs → 0 literales obsoletos; SQL §6.3 alineado con `request.repository.ts` (sin ST_DWithin; nota explícita añadida).
- `npm test`: 457 passed | 8 skipped; `npm run build`: OK.

### Completion Notes List

- Sincronizados los 4 documentos de §14 spec con RFC-001 a RFC-004 y MIGR-001.
- PRD §10–11: deltas asimétricos, no-show -10×n, acaparador Tier 1/Tier 2 (RFC-003 supersede FR18).
- architecture.md: DDL `role`, §5–6, §12.5–12.6, diagrama flujo sesión; SQL refleja implementación real.
- ranking-system.md: §2 eventos, §3.2 Tier 1, nueva § Tier 2, diagrama diagnóstico, requestCount.
- ranking-guia-producto.md: tablas producto, FAQ y secciones acaparador en dos niveles.
- Cross-refs a ranking-spec-v1.0.md en todos los docs editados.
- sprint-change-proposal: filas docs marcadas resueltas (11.5).

### File List

- docs/prd.md
- docs/architecture.md
- docs/ranking-system.md
- docs/ranking-guia-producto.md
- _bmad-output/initiative-backend/sprint-change-proposal-2026-05-29-ranking-rfc-v1.md
- _bmad-output/initiative-backend/archive-v6/sprint-status.yaml
- _bmad-output/initiative-backend/tickets/epic-alineacion-ranking-y-reputacion-v1-0-rfc-rank/tickets/story-sincronizar-documentacion-ranking-plan.md

### Change Log

- 2026-05-29: Historia 11.5 — sync documentación ranking v1.0 (RFC-RANK Correct Course).

### Review Findings

- [x] [Review][Patch] Referencia obsoleta a ST_DWithin como «borrador» en architecture.md [docs/ranking-system.md:445]

- [x] [Review][Defer] prd.md §9 no menciona exclusión Tier 2 acaparador [docs/prd.md:163] — deferred, fuera de alcance spec §14 (solo §10–11)
- [x] [Review][Defer] Cabecera architecture.md sin nota Correct Course ranking v1.0 [docs/architecture.md:1-8] — deferred, convención opcional story
- [x] [Review][Defer] Ventana timing Job 4 pg_cron vs rehabilitación instantánea post-donación — deferred, edge case operacional no requerido en sync doc

---

Ultimate context engine analysis completed - comprehensive developer guide created
