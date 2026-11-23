---
title: 'Cobertura automatizada CASO-01…24 ranking v1.0'
type: feature
created: 2026-10-25
status: done
baseline_commit: '758a228'
context:
  - '{project-root}/docs/test-cases-ranking-v1.0.md'
  - '{project-root}/docs/ranking-spec-v1.0.md'
  - '{project-root}/_bmad-output/project-context.md'
ticket: "story-ranking-caso-qa-24"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `docs/test-cases-ranking-v1.0.md` define 24 casos de comportamiento para stakeholders (CASO-01…24), pero la suite actual solo traza explícitamente QA-01…14 de `ranking-spec-v1.0.md`. Varios CASO tienen cobertura parcial o inexistente (p. ej. cancelación sin no-show, expiración sin penalización, exactamente 2 eventos por entrega, receptor +1 independiente del tier del donante).

**Approach:** Extender la suite de tests existente (mock Pool/Client, sin Supabase real) añadiendo tests nombrados `CASO-XX` donde falten, cross-ref en tests ya equivalentes, y una tabla de trazabilidad CASO→archivo en el comentario de cabecera. No modificar lógica de negocio ni OpenAPI.

## Boundaries & Constraints

**Always:** Patrón Vitest + mock transaccional ya usado en `ranking-qa-*.test.ts`; cada `it` incluye ID `CASO-XX` en el nombre; `npm test && npm run build` verde; hablar de trazabilidad en español en comentarios block.

**Ask First:** Añadir tests de integración con BD real; cambiar contratos HTTP; renombrar masivamente QA→CASO si rompe referencias en historias 11.4 ya en review.

**Never:** Reimplementar ranking/reputación (11.1–11.3); editar `openapi/openapi.json` a mano; tests flaky basados en orden aleatorio no determinista; modificar `docs/test-cases-ranking-v1.0.md` salvo cross-ref opcional al final.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CASO-10 cancel sin no-show | `cancelDelivery({ noShow: false })` sesión activa | Reputación receptor sin cambio; racha no-show intacta; ítem vuelve activo | N/A |
| CASO-11 expiración automática | Job/use-case expira sesión 7d sin acción | Sin delta reputación donante/receptor; racha intacta | N/A |
| CASO-22 dos eventos por entrega | `confirmDelivery` exitoso | Exactamente 2 INSERT en `reputation_events` (donor + receiver) | N/A |
| CASO-23 perturbación + Tier 2 | Usuario Tier 2 solicita; múltiples consultas ranking | SQL excluye Tier 2 antes de `RANDOM()`; nunca en resultado | N/A |

</frozen-after-approval>

## Code Map

- `tests/ranking-qa-reputation.test.ts` -- CASO-01…09, 20, 21, 22, 24 (confirm/cancel, deltas, roles, racha)
- `tests/ranking-qa-tier.test.ts` -- CASO-12…19, 23 (Tier 1/2, pasivo, requestCount, perturbación)
- `tests/delivery-sessions-cancel.test.ts` -- CASO-10 HTTP (18.1 existente; añadir alias/comentario CASO-10)
- `tests/expire-delivery-sessions.test.ts` -- CASO-11 (assert sin modificación reputación en repo mock)
- `src/infrastructure/database/supabase/delivery-session.repository.ts` -- fuente confirm/cancel
- `src/infrastructure/database/sql/ranked-candidate-filters.ts` -- constantes Tier/FR17
- `docs/test-cases-ranking-v1.0.md` -- catálogo fuente (solo lectura)

## Tasks & Acceptance

**Execution:**
- [x] `tests/ranking-qa-reputation.test.ts` -- Añadir cabecera tabla CASO→QA; renombrar o duplicar `it` con prefijo `CASO-XX` para 01–09; nuevos tests CASO-03 (receptor +1 en dos escenarios), CASO-05 (segunda donación +10 explícito), CASO-21 (tres confirms distintos tier donante, receptor +1), CASO-22 (assert 2 INSERT reputation_events), CASO-24 (racha 3 + confirm como donante resetea racha) -- cierra gaps Grupo 1 y 4
- [x] `tests/ranking-qa-tier.test.ts` -- Añadir CASO-XX en nombres de tests existentes QA-07…14; test CASO-18 (Tier 1 con total_donated=1 no aplica penalización CASE); CASO-23 (SQL: exclusión Tier 2 precede perturbación) -- cierra gaps Grupo 3 y 4
- [x] `tests/delivery-sessions-cancel.test.ts` -- Comentario cross-ref CASO-10 en test 18.1; opcional assert `receiverDelta` undefined/ausente en mock -- CASO-10 explícito
- [x] `tests/expire-delivery-sessions.test.ts` -- Mock `expireSessions`/`cancelExpired` del repo verificando que no invoca INSERT reputation_events -- CASO-11
- [x] `tests/ranking-qa-reputation.test.ts` + `ranking-qa-tier.test.ts` -- Bloque final `# Trazabilidad CASO-01…24` con tabla archivo+línea -- auditoría para QA/producto

**Acceptance Criteria:**
- Given `npm test`, when se ejecuta la suite, then existe al menos un test cuyo nombre contiene cada ID `CASO-01` … `CASO-24`.
- Given CASO-10 (cancel sin no-show), when `cancelDelivery({ noShow: false })`, then no hay INSERT en `reputation_events` ni cambio de `consecutive_no_shows`.
- Given CASO-11 (expiración), when el use-case de expiración procesa una sesión vencida, then no se modifica reputación de donante ni receptor.
- Given CASO-22, when `confirmDelivery` completa una entrega, then exactamente dos filas `reputation_events` con roles `donor` y `receiver`.
- Given CASO-23, when el SQL de `findRankedCandidates` se inspecciona, then la cláusula de exclusión Tier 2 está en WHERE antes de la expresión `RANDOM()`.
- Given la suite completa, when `npm test && npm run build`, then pasa sin Supabase real.

## Spec Change Log

## Design Notes

Mapeo CASO↔QA existente (baseline):

| CASO | QA / test actual | Acción |
|------|------------------|--------|
| 01–02 | QA-01, QA-02 | Renombrar `it` |
| 03, 05, 21 | — | Nuevo test |
| 04, 06–09 | QA-03…06 | Renombrar |
| 10 | 18.1 cancel HTTP | Cross-ref + assert repo |
| 11 | expire use-case | Nuevo assert reputación |
| 12–17, 19 | QA-07…12, QA-10 | Renombrar |
| 18 | QA-11 parcial | Nuevo assert Tier 1 post-donación |
| 20, 24 | QA-10 parcial | Extender escenario encadenado |
| 22, 23 | — | Nuevo test |

Preferir renombrar `it('QA-XX — …')` a `it('CASO-XX — … (QA-YY)')` para no duplicar asserts.

## Verification

**Commands:**
- `npm test -- ranking-qa` -- expected: todos los CASO-XX pasan
- `npm test && npm run build` -- expected: suite completa verde

**Manual checks (if no CLI):**
- Revisar tabla trazabilidad al final de `ranking-qa-*.test.ts`: 24 filas, una por CASO.

## Suggested Review Order

**Trazabilidad CASO stakeholder → tests automatizados**

- Cabecera con tabla CASO-01…24 y cross-ref QA
  [`ranking-qa-reputation.test.ts:1`](../../tests/ranking-qa-reputation.test.ts#L1)

- Renombrado QA→CASO y nuevos casos reputación (03, 05, 10, 21–22, 24)
  [`ranking-qa-reputation.test.ts:135`](../../tests/ranking-qa-reputation.test.ts#L135)

- Rehabilitación Tier 2 / primera donación (CASO-17, CASO-20)
  [`ranking-qa-reputation.test.ts:340`](../../tests/ranking-qa-reputation.test.ts#L340)

- Tier 1/2, pasivo, requestCount y perturbación (CASO-12…19, 23)
  [`ranking-qa-tier.test.ts:44`](../../tests/ranking-qa-tier.test.ts#L44)

- Cancel HTTP sin penalización reputación (CASO-10)
  [`delivery-sessions-cancel.test.ts:134`](../../tests/delivery-sessions-cancel.test.ts#L134)

- Expiración automática sin tocar reputación (CASO-11)
  [`expire-delivery-sessions.test.ts:155`](../../tests/expire-delivery-sessions.test.ts#L155)
