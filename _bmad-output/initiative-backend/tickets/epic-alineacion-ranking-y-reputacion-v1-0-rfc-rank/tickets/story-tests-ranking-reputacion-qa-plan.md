---
title: "Tests matriz QA ranking y reputación"
type: feature
ticket: 4
status: done
created: 2026-10-25
---

# Historia 11.4: Tests matriz QA ranking y reputación

Status: review

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como equipo,
quiero cobertura automatizada de los casos QA-01 a QA-14 de `docs/ranking-spec-v1.0.md`,
para evitar regresiones en ranking y reputación tras la alineación RFC-RANK v1.0.

## Criterios de aceptación

1. **Dado** `npm test` en el backend, **cuando** se ejecuta la suite, **entonces** existe al menos un test nombrado o documentado por ID (`QA-01` … `QA-14`) que verifica el resultado esperado de la matriz §12 de la spec.

2. **Dado** los casos QA-01 a QA-06 (reputación en confirm/cancel), **cuando** corren los tests, **entonces** verifican deltas `{+10/+1, +15/+1, -10n}`, `consecutive_no_shows`, filas `reputation_events` con `role` y AE-030 con deltas reales — no valores MVP obsoletos (`+10/+10`, `-20n`).

3. **Dado** los casos QA-07 a QA-12 y QA-14 (ranking Tier 1/Tier 2, FR17, requestCount), **cuando** corren los tests, **entonces** verifican visibilidad/exclusión/penalización según RFC-003 usando las constantes de `ranked-candidate-filters.ts` y el SQL de repos.

4. **Dado** QA-10 (rehabilitación tras primera donación), **cuando** el test simula confirm con donante previamente Tier 2, **entonces** assert `total_donated >= 1`, delta donante `+15`, y elegibilidad en ranking en consulta posterior.

5. **Dado** QA-13 (perturbación ±2), **cuando** el test evalúa el SQL de ranking, **entonces** documenta que el orden puede variar entre refrescos; el test no exige orden fijo cuando `reputation_score` y distancias son iguales.

6. **Dado** QA-14 (`requestCount` vs `candidates[]`), **cuando** el test compara ambos endpoints/repos, **entonces** el conteo excluye Tier 2 y pasivos (FR17) y coincide con la lista visible del donante.

7. **Dado** la suite completa, **cuando** termina `npm test && npm run build`, **entonces** pasa sin Supabase real (patrón mock Pool/Client existente en `vitest.config.ts`).

## Alcance explícito (IN / OUT)

| IN (11.4) | OUT (otras historias) |
|---|---|
| Tests automatizados QA-01–QA-14 con trazabilidad por ID | Implementar lógica reputación — **11.2** |
| Actualizar asserts obsoletos en tests HTTP de confirm/cancel si 11.2 no los tocó | Migración `role` — **11.1** |
| Tests repositorio + HTTP mínimos para matriz completa | SQL Tier 1/Tier 2 — **11.3** |
| Tabla de mapeo QA → archivo de test en esta story | Sync docs PRD/architecture — **11.5** |
| Helper/fixtures reutilizable para escenarios ranking/reputación | Tests E2E con BD real / CI Supabase |
| Documentar en comentarios el vínculo QA-ID ↔ spec §12 | Cambios OpenAPI o contratos HTTP |
| | Exponer `effectiveScore` en API |

**Prerrequisitos bloqueantes:** Historias **11.1**, **11.2** y **11.3** deben estar implementadas (código mergeado o en la misma rama de épica). Esta historia **solo añade/ajusta tests**; no reimplementa lógica de negocio salvo fixtures mínimos.

**Orden recomendado:** 11.1 → 11.2 → 11.3 → **11.4** → 11.5.

## Tareas / Subtareas

- [x] **Task 0 — Verificar prerrequisitos** (AC: #7)
  - [x] Confirmar 11.1: columna `reputation_events.role` y migración aplicada en tests locales
  - [x] Confirmar 11.2: `confirmDelivery`/`cancelDelivery` con deltas v1.0 y `role` en INSERT
  - [x] Confirmar 11.3: `HOARDER_TIER1/TIER2`, `RANKED_ELIGIBLE_REQUESTER_SQL` en repos
  - [x] Si algún prerrequisito falta, **detener** e implementar la historia correspondiente primero

- [x] **Task 1 — Archivo principal matriz reputación** (AC: #1, #2)
  - [x] Crear `tests/ranking-qa-reputation.test.ts`
  - [x] Patrón: mock `Pool.connect()` con cliente transaccional secuencial (ver `tests/user-repository-email-verification.test.ts`)
  - [x] Instanciar `PostgresDeliverySessionRepository` y ejecutar métodos reales
  - [x] Implementar casos:

| Test | QA | Setup clave | Assert principal |
|------|-----|-------------|------------------|
| `QA-01 confirm — donante ya donó` | QA-01 | Mock `SELECT total_donated` → 2 antes de UPDATE | INSERT donor delta=10, receiver delta=1; roles distintos |
| `QA-02 confirm — primera donación` | QA-02 | Mock `total_donated` → 0 | donor +15, receiver +1; `role='donor'` delta=15 |
| `QA-03 no-show 1.º consecutivo` | QA-03 | `consecutive_no_shows` previo 0 | delta=-10, `consecutive_no_shows=1` |
| `QA-04 no-show 2.º consecutivo` | QA-04 | previo 1 | delta=-20, `consecutive_no_shows=2` |
| `QA-05 no-show 3.º consecutivo` | QA-05 | previo 2 | delta=-30, `consecutive_no_shows=3` |
| `QA-06 confirm resetea racha` | QA-06 | Receptor con racha previa; confirm | ambos `consecutive_no_shows=0`; siguiente no-show -10 |

  - [x] Extraer helper `createMockTxClient(steps: QueryStep[])` si reduce duplicación (opcional, no over-engineer)

- [x] **Task 2 — Archivo matriz ranking Tier / visibilidad** (AC: #1, #3, #5, #6)
  - [x] Crear `tests/ranking-qa-tier.test.ts`
  - [x] Subsuite `ranked-candidate-filters` — extender o referenciar `tests/ranked-candidate-filters.test.ts`:
    - QA-07: Tier 0 visible, sin penalización en CASE
    - QA-08: Tier 1 — SQL incluye `-15` cuando `cycles_at_limit >= 1 AND total_donated = 0`
    - QA-09: Tier 2 — `RANKED_ELIGIBLE` excluye `cycles_at_limit >= 2 AND total_donated = 0`
    - QA-11: `total_donated >= 1` — ni Tier 1 ni Tier 2 aplican
    - QA-12: pasivo FR17 excluido antes de evaluar Tier 1
  - [x] Subsuite `PostgresRequestRepository.findRankedCandidates` (mock `pool.query`):
    - Seed filas simuladas: normal, Tier1, Tier2, pasivo
    - QA-07/08/09/11/12: assert `userId` presentes/ausentes en resultado
    - QA-08: dos usuarios mismo `reputation_score` y distancia — Tier1 ordenado después (si mock devuelve effective_score calculado)
  - [x] Subsuite `requestCount` vía `PostgresUserRepository.findMyItems` o query aislada del subquery `pending_count`:
    - QA-09 + QA-14: ítem con 3 pending (normal, Tier2, pasivo) → count = 1
    - QA-14: mismo escenario que `findRankedCandidates` → longitudes iguales

- [x] **Task 3 — QA-10 rehabilitación E2E en tests** (AC: #4)
  - [x] En `ranking-qa-reputation.test.ts` o `ranking-qa-tier.test.ts`, escenario encadenado:
    1. Usuario receptor: `cycles_at_limit=2`, `total_donated=0` → excluido de ranking (QA-09)
    2. Mismo usuario confirma entrega como donante (`total_donated` prev 0) → +15, `total_donated=1`
    3. Nueva consulta ranking → usuario visible (QA-10)
  - [x] Puede ser dos tests enlazados con estado mock compartido o un describe secuencial con mocks explícitos

- [x] **Task 4 — QA-13 perturbación aleatoria** (AC: #5)
  - [x] Test en `ranking-qa-tier.test.ts`:
    - Assert que el SQL de `findRankedCandidates` contiene `FLOOR(RANDOM() * 5 - 2)`
    - **Opcional:** invocar query mock dos veces con `effective_score` distinto en filas → no assert orden estricto; comentario `// QA-13: variación esperada`
  - [x] No flaky tests: evitar `expect(order1).not.toEqual(order2)` sin control de random — preferir assert estructural del SQL

- [x] **Task 5 — Consolidar tests HTTP existentes** (AC: #2)
  - [x] `tests/delivery-sessions-confirm.test.ts`: si aún assert `delta: 10` para receptor → cambiar a `delta: 1`; añadir caso `donorDelta: 15` (QA-02) con mock repo
  - [x] `tests/delivery-sessions-cancel.test.ts`: `receiverDelta: -10` primer no-show (QA-03); añadir casos QA-04/05 si el mock lo permite
  - [x] `tests/items-candidates.test.ts`: sin `effectiveScore`; opcional comentario cross-ref QA-07+
  - [x] `tests/users-items.test.ts`: test HTTP QA-14 si `findMyItems` mock puede simular `requestCount` filtrado — preferir test repositorio para QA-14

- [x] **Task 6 — Trazabilidad y CI** (AC: #1, #7)
  - [x] Cada `it('QA-XX — ...')` incluye ID en el nombre
  - [x] Al inicio de cada archivo, comentario block con link `[Source: docs/ranking-spec-v1.0.md#12-matriz-de-verificación-qa]`
  - [x] Ejecutar `npm test && npm run build` — suite verde

---

## Notas para el Dev Agent

### Contexto de épica 11 (RFC-RANK v1.0)

Correct Course **2026-05-29** — `docs/ranking-spec-v1.0.md` es fuente de verdad. Historias 11.1–11.3 implementan código; **11.4 cierra la deuda de verificación automatizada** antes de sync documental (11.5).

**Referencias obligatorias:**

- [Source: docs/ranking-spec-v1.0.md#12-matriz-de-verificación-qa] — matriz QA-01–QA-14
- [Source: docs/ranking-spec-v1.0.md#7-cambios-en-capa-de-servicio] — deltas esperados QA-01–06
- [Source: docs/ranking-spec-v1.0.md#8-sql-actualizado--findrankedcandidates] — SQL ranking QA-07–14
- [Source: _bmad-output/initiative-backend/tickets/epic-alineacion-ranking-y-reputacion-v1-0-rfc-rank/tickets/story-migracion-role-reputation-events-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-alineacion-ranking-y-reputacion-v1-0-rfc-rank/tickets/story-reputacion-asimetrica-confirm-cancel-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-alineacion-ranking-y-reputacion-v1-0-rfc-rank/tickets/story-ranking-tier-acaparador-sql-plan.md]
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md#historia-114-tests-matriz-qa-ranking-y-reputación]

### Matriz QA completa — resultados esperados

| ID | Caso | Resultado esperado (assert en test) |
|----|------|-------------------------------------|
| QA-01 | Confirm; donante ya donó | Donante +10, receptor +1; 2 events con roles distintos |
| QA-02 | Confirm; primera donación | Donante +15, receptor +1; event donor delta=15 |
| QA-03 | No-show 1.º | Receptor -10; consecutive_no_shows=1 |
| QA-04 | No-show 2.º | Receptor -20; consecutive_no_shows=2 |
| QA-05 | No-show 3.º | Receptor -30; consecutive_no_shows=3 |
| QA-06 | Confirm tras racha no-show | consecutive_no_shows=0 ambos; próximo no-show -10 |
| QA-07 | cycles=0, donated=0 | En ranking, sin penalización |
| QA-08 | cycles=1, donated=0 | En ranking; -15 effective_score (orden) |
| QA-09 | cycles=2, donated=0 | No en candidates[]; requestCount excluye |
| QA-10 | Tier 2 dona primera vez | Visible ranking; +15 donante |
| QA-11 | cycles=5, donated=1 | Sin Tier 1 ni Tier 2 |
| QA-12 | Pasivo + cycles=1 | Excluido FR17; Tier 1 no aplica |
| QA-13 | Dos refrescos ranking | Orden puede variar (±2); no test flaky de orden fijo |
| QA-14 | requestCount vs candidates | Misma visibilidad (excluye Tier2 + pasivos) |

### Estado actual de tests (pre-11.4 — actualizar)

| Archivo | Estado hoy | Acción 11.4 |
|---------|------------|-------------|
| `delivery-sessions-confirm.test.ts` | AE-030 donor/receiver `delta: 10` (MVP) | Ajustar a +10/+1 o +15/+1 según mock |
| `delivery-sessions-cancel.test.ts` | Primer no-show `delta: -20` (MVP) | Cambiar a `-10` (QA-03) |
| `ranked-candidate-filters.test.ts` | Solo FR17 (2 tests) | Extender Tier 1/2 o delegar a `ranking-qa-tier.test.ts` |
| `items-candidates.test.ts` | Contrato HTTP mock | Mantener; no cubre QA tier |
| `users-items.test.ts` | Mock `requestCount: 3` fijo | Añadir QA-14 en repo test |

**Código producción pre-RFC (referencia — 11.2/11.3 lo reemplazan):**

- `delivery-session.repository.ts` L163–187: +10/+10, INSERT sin `role`
- `request.repository.ts` L96–100: FR18 obsoleto `cycles_at_limit >= 3 AND ratio`
- `ranked-candidate-filters.ts`: solo FR17

### Estrategia de testing (sin BD real)

El proyecto **no** tiene tests de integración contra Postgres real en CI (`vitest.config.ts` usa `DATABASE_URL` dummy). Seguir el patrón establecido:

1. **Repositorio con mock transaccional** — capturar SQL/params en `client.query` mocks; assert strings INSERT/UPDATE y valores bind.
2. **Constantes SQL** — tests puros en `ranked-candidate-filters.test.ts` sin Pool.
3. **HTTP con repos mockeados** — solo para AE-030 y contratos; la verificación de reglas va en repos.

**No introducir** dependencia de Supabase local en `npm test` salvo instrucción explícita del usuario.

### Task 1 — Patrón mock transaccional (reputación)

Esqueleto recomendado para `confirmDelivery` / `cancelDelivery`:

```typescript
const client = {
  query: vi.fn()
    .mockResolvedValueOnce({}) // BEGIN
    .mockResolvedValueOnce({ rows: [sessionRow] }) // SELECT session FOR UPDATE
    .mockResolvedValueOnce({ rows: [{ completed_at: new Date() }] }) // UPDATE session
    .mockResolvedValueOnce({ rows: [{ total_donated: 0 }] }) // SELECT total_donated (post-11.2)
    // ... UPDATE users, INSERT reputation_events, UPDATE items, COMMIT
};
(pool.connect as Mock).mockResolvedValue({ query: client.query, release: vi.fn() });
```

**Assert críticos QA-01/02:**

```typescript
expect(insertCall[0]).toContain("role");
expect(insertCall[1]).toEqual(expect.arrayContaining([
  expect.anything(), // donor_id
  expect.anything(), // receiver_id
  sessionId,
]));
// Verificar deltas en VALUES o params según implementación 11.2
```

**Assert críticos QA-03–05:** en `cancelDelivery` con `noShow: true`, capturar UPDATE receptor y INSERT event — delta = `-10 * n`.

### Task 2 — Patrón ranking (Tier / FR17)

**Opción A (preferida):** mock `pool.query` devolviendo filas pre-ordenadas; el test verifica que el **SQL enviado** incluye `RANKED_ELIGIBLE_REQUESTER_SQL` y `HOARDER_TIER1_PENALTY_CASE_SQL`.

**Opción B:** test de integración manual documentado en comentario — **no** requerido para AC.

**QA-08 sin `effectiveScore` en API:** comparar orden de `userId` cuando mock devuelve dos candidatos con mismo `reputation_score` y `distance_meters` pero distinto `cycles_at_limit` (0 vs 1) — el de cycles=0 debe ir primero si el mock simula effective_score.

**QA-14:** construir escenario:

```
Item X pending requests from: [userA normal, userB tier2, userC passive]
findRankedCandidates → [userA]
findMyItems pending_count → 1
```

### Task 4 — QA-13 anti-flaky

```typescript
it('QA-13 — SQL incluye perturbación ±2 (orden no determinista)', () => {
  const sql = getFindRankedCandidatesSql(); // leer string del repo o snapshot controlado
  expect(sql).toMatch(/FLOOR\(RANDOM\(\) \* 5 - 2\)/);
});
```

No usar loops de 100 iteraciones esperando orden distinto.

### Task 5 — HTTP tests y AE-030

Tras 11.2, `reputation.service.ts` emite deltas reales. Los tests HTTP deben reflejarlo:

```typescript
// QA-02 — primera donación (mock repo devuelve donorDelta: 15, receiverDelta: 1)
expect(emitEvent).toHaveBeenCalledWith('reputation.changed', DONOR_UUID,
  expect.objectContaining({ delta: 15, type: 'delivery_completed' }));
expect(emitEvent).toHaveBeenCalledWith('reputation.changed', RECEIVER_UUID,
  expect.objectContaining({ delta: 1, type: 'delivery_completed' }));
```

Mock `analytics.service` ya existe en confirm/cancel tests — reutilizar patrón `vi.hoisted`.

### Arquitectura y convenciones

- **Vitest 2.x** + **supertest** — ver `vitest.config.ts`
- **Naming:** `it('QA-XX — descripción corta', ...)`
- **Sin ORM:** asserts sobre SQL strings estáticos importados de `ranked-candidate-filters.ts`
- **Clean Architecture:** tests viven en `tests/`; no testear implementación privada no exportada — extraer lectura SQL solo si necesario (preferir assert en `pool.query` calls)
- **NFR:** tests no deben loguear PII; mocks usan UUIDs ficticios

### Project Structure Notes

```
tests/
├── ranking-qa-reputation.test.ts    # QA-01–06, QA-10 (confirm path)
├── ranking-qa-tier.test.ts          # QA-07–09, QA-11–14, QA-13
├── ranked-candidate-filters.test.ts # extender o importar constantes
├── delivery-sessions-confirm.test.ts # actualizar AE-030 (Task 5)
├── delivery-sessions-cancel.test.ts  # actualizar delta no-show (Task 5)
├── items-candidates.test.ts          # sin cambios funcionales
└── users-items.test.ts               # QA-14 HTTP opcional

src/ (solo lectura — cambios en 11.1–11.3)
├── infrastructure/database/supabase/delivery-session.repository.ts
├── infrastructure/database/supabase/request.repository.ts
├── infrastructure/database/supabase/user.repository.ts
└── infrastructure/database/sql/ranked-candidate-filters.ts
```

### Riesgos y anti-patrones

| Anti-patrón | Correcto en 11.4 |
|-------------|------------------|
| Reimplementar lógica RFC en tests duplicada | Testear código real en repos con mocks |
| Test BD real en CI sin contenedor | Mock Pool/Client |
| Un solo test genérico "ranking works" | 14 tests mínimo (uno por QA-ID) |
| Assert `effectiveScore` en body HTTP | Solo SQL/orden interno |
| Olvidar actualizar tests MVP (-20, +10/+10) | Task 5 obligatorio |
| QA-13 flaky con random real | Assert presencia de `RANDOM()` en SQL |
| Empezar 11.4 antes de 11.2/11.3 | Task 0 bloqueante |

### Dependencias y handoff

- **Requiere:** 11.1, 11.2, 11.3 implementadas
- **Desbloquea:** 11.5 (docs) con confianza de no regresión; merge épica 11
- **Frontend:** sin cambios; tests backend only

Comandos:

```bash
npm test
npm run build
# Opcional verificar un archivo:
npx vitest run tests/ranking-qa-reputation.test.ts
npx vitest run tests/ranking-qa-tier.test.ts
```

---

## Dev Agent Record

### Agent Model Used

Composer (Cursor)

### Debug Log References

- Prerrequisitos 11.1–11.3 verificados en código producción (`delivery-session.repository.ts`, `ranked-candidate-filters.ts`, `request.repository.ts`).
- Tests HTTP confirm/cancel ya alineados con deltas v1.0 (Task 5 preexistente en rama).

### Completion Notes List

- Creado `tests/ranking-qa-reputation.test.ts` con QA-01…QA-06 y QA-10 (mock transaccional `Pool.connect`).
- Creado `tests/ranking-qa-tier.test.ts` con QA-07…QA-14 y QA-13 (assert SQL `FLOOR(RANDOM() * 5 - 2)`, sin tests flaky).
- QA-14 verificado en repositorio: `findRankedCandidates` y `findMyItems.pending_count` comparten `RANKED_ELIGIBLE_REQUESTER_SQL`.
- Comentario cross-ref añadido en `tests/items-candidates.test.ts`.
- Suite: 457 passed | 8 skipped; `npm run build` OK.

### File List

- tests/ranking-qa-reputation.test.ts (nuevo)
- tests/ranking-qa-tier.test.ts (nuevo)
- tests/items-candidates.test.ts (comentario cross-ref QA-07+)

### Change Log

- 2026-05-29: Implementada matriz QA-01–QA-14 con trazabilidad por ID; suite verde sin BD real.

Ultimate context engine analysis completed - comprehensive developer guide created
