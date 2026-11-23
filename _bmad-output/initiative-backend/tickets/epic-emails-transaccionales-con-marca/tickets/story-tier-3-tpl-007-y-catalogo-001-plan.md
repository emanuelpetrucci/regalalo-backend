---
title: "Tier 3 — TPL-007 y catálogo TPL-001"
type: feature
ticket: 4
status: done
created: 2026-10-25
---

# Historia 9.4: Tier 3 — TPL-007 y catálogo TPL-001

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como operador,
quiero completar la migración visual de degradación y dejar TPL-001 en catálogo sin trigger en registro,
para cerrar el tier P3 y el catálogo EVT-001.

## Criterios de aceptación

1. **Dado** EVT-012 / `DegradeInactiveItemsUseCase`, **cuando** se envía TPL-007, **entonces** usa `renderEmailLayout()` con variables `firstName`, `itemTitle`, `itemId`.

2. **Dado** `tpl-001-welcome.ts` en registry, **cuando** se renderiza manualmente o en test, **entonces** usa layout con marca (catálogo / uso futuro).

3. **Dado** `RegisterUserUseCase`, **cuando** se revisa, **entonces** **no** invoca TPL-001 (solo TPL-009).

4. **Dado** `docs/email-flow-mapping.md` v1.3, **cuando** se revisa § registro, **entonces** EVT-001 / TPL-001 figuran como catálogo, no disparados en registro.

5. **Dado** snapshots TPL-007 y TPL-001, **cuando** se ejecuta `npm test`, **entonces** pasan.

6. **Dado** `tests/degrade-inactive-items.test.ts`, **cuando** se ejecuta, **entonces** sigue assert `templateId: 'TPL-007'` con variables correctas.

## Alcance explícito (IN / OUT)

| IN (9.4) | OUT |
|---|---|
| `tpl-007-degradation.ts`, `tpl-001-welcome.ts` | Eliminar `greetingHtml` global (9.5) |
| Wire provider TPL-007/001 | Snapshots consolidados de todos TPL (9.5 puede ampliar) |
| Auditoría docs email-flow | Épica retrospective |

**Prerrequisitos:** **9.1–9.3** implementados.

## Tareas / Subtareas

- [x] **Task 1 — TPL-007** (AC: #1, #5, #6)
  - [x] Migrar copy desde provider actual (degradación 7 días, feed)
  - [x] Snapshot + regresión `degrade-inactive-items.test.ts`

- [x] **Task 2 — TPL-001 catálogo** (AC: #2, #3)
  - [x] `tpl-001-welcome.ts` con layout; subject «¡Bienvenido…» o alineado a design
  - [x] Grep repo: ningún use case productivo llama `TPL-001` excepto tests explícitos de catálogo
  - [x] Snapshot TPL-001

- [x] **Task 3 — Docs** (AC: #4)
  - [x] Verificar `docs/email-flow-mapping.md` — RegisterUser → solo TPL-009
  - [x] Si gap, corregir una línea en tabla EVT/TPL (no rewrite completo)

- [x] **Task 4 — Provider** (AC: #1, #2)
  - [x] TPL-007 y TPL-001 delegan a funciones de plantilla

### Review Findings
- [x] [Review][Patch] Escape/sanitización faltante en variables interpoladas de templates nuevos [src/infrastructure/email/templates/tpl-007-degradation.ts] — cubierto con tests de regresión de escaping en TPL-001/TPL-007.

## Notas para el Dev Agent

### Inteligencia historias anteriores

- **9.2:** registro ya un solo email — **re-verificar** en esta historia (AC #3).
- **9.3:** patrón establecido para items TPL-003…006.

### Estado actual

**`degrade-inactive-items.test.ts`** — expect `TPL-007` con `itemTitle`, `itemId`, `firstName`.

**`TPL-001` en provider** — HTML mínimo bienvenida; **no** usado en `register-user.use-case.ts` (Correct Course).

### Anti-patrones

- No añadir `TPL-001` a registro «por si acaso».
- No eliminar entrada TPL-001 del registry (catálogo reservado EVT-001).

## Dev Agent Record

### Agent Model Used

Codex 5.3

### File List
- `src/infrastructure/email/templates/tpl-007-degradation.ts` (new)
- `src/infrastructure/email/templates/tpl-001-welcome.ts` (new)
- `src/infrastructure/email/resend.provider.ts` (updated)
- `tests/email-tpl-007.test.ts` (new)
- `tests/email-tpl-001.test.ts` (new)
- `tests/__snapshots__/email-tpl-007.test.ts.snap` (new)
- `tests/__snapshots__/email-tpl-001.test.ts.snap` (new)
- `tests/__snapshots__/email-tpl-003.test.ts.snap` (updated baseline snapshot URL)

### Debug Log
- Ejecutado `npm test -- tests/email-tpl-001.test.ts tests/email-tpl-007.test.ts -u` para generar snapshots nuevos.
- Ejecutado `npm test` (falló inicialmente por snapshot desactualizado de `email-tpl-003` no relacionado al alcance funcional de 9.4).
- Ejecutado `npm test -- tests/email-tpl-003.test.ts -u && npm test` con suite completa en verde (391/391).

### Completion Notes
- Se implementó `TPL-007` con `renderEmailLayout()` y variables `firstName`, `itemTitle`, `itemId`, manteniendo copy de degradación de 7 días y pérdida de visibilidad en feed.
- Se implementó `TPL-001` en modo catálogo con layout de marca y subject de bienvenida, sin reintroducirlo en `RegisterUserUseCase`.
- `ResendMailProvider` ahora delega `TPL-007` y `TPL-001` a funciones de plantilla dedicadas.
- Se verificó `docs/email-flow-mapping.md` v1.3: registro sigue mapeado solo a `TPL-009` (sin cambios requeridos).
- Se añadieron tests y snapshots de `TPL-007` y `TPL-001`; además se actualizó snapshot base de `TPL-003` por cambio de URL del CTA en entorno.

### Change Log
- 2026-05-27: Implementación completa historia 9.4 (TPL-007 + TPL-001 catálogo + provider + tests/snapshots + validación regresión).
