---
title: "Tier 2 — TPL-003, TPL-004, TPL-005, TPL-006"
type: feature
ticket: 3
status: done
created: 2026-10-25
---

# Historia 9.3: Tier 2 — TPL-003, TPL-004, TPL-005, TPL-006

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como donante o receptor,
quiero notificaciones de flujo (solicitud, selección, expiración, cancelación) con la misma identidad visual que los emails de auth.

## Criterios de aceptación

1. **Dado** EVT-003 / `SelectRecipientUseCase` (o equivalente), **cuando** se envía TPL-003, **entonces** el HTML usa `renderEmailLayout()` y conserva variables: `firstName`, `itemTitle`, `itemCondition`, `donorReputationScore`, `sessionDeadlineAt`.

2. **Dado** EVT-004 / expiración de sesión, **cuando** se envía TPL-004, **entonces** layout con marca y variables `itemTitle`, `itemId`, `firstName`.

3. **Dado** EVT-005 / cancelación con sesión activa, **cuando** se envía TPL-005, **entonces** layout con marca; tests `items-cancel-with-session.test.ts` siguen pasando.

4. **Dado** EVT-006 / nueva solicitud, **cuando** se envía TPL-006, **entonces** layout con marca; tests `items-request.test.ts` siguen pasando.

5. **Dado** snapshots por plantilla, **cuando** se ejecuta `npm test`, **entonces** TPL-003…006 pasan snapshot + assert primary hex.

6. **Dado** la suite completa, **cuando** se ejecuta `npm test`, **entonces** sin regresiones en integración items.

## Alcance explícito (IN / OUT)

| IN (9.3) | OUT |
|---|---|
| `tpl-003` … `tpl-006` + wire provider | TPL-007, TPL-001 (9.4) |
| Snapshots tier 2 | Refactor total `resend.provider` (9.5) |
| CTAs a app donde aplique (EVT-003) | Cambios de lógica de negocio en use cases |

**Prerrequisitos:** **9.1** y **9.2** implementados.

## Tareas / Subtareas

- [x] **Task 1 — Mapear disparadores** (AC: #1–#4)
  - [x] Localizar use cases: select recipient, expire session, cancel item, new request
  - [x] Documentar en dev notes archivo:línea de cada `mailService.send`

- [x] **Task 2 — Plantillas** (AC: #1–#4, #5)
  - [x] `tpl-003-receiver-selected.ts` — CTA «Ver en la app» o similar
  - [x] `tpl-004-session-expired.ts`, `tpl-005-cancellation.ts`, `tpl-006-new-request.ts`
  - [x] Preservar textos de negocio actuales en `resend.provider.ts` como base de copy
  - [x] Snapshots: `tests/email-tpl-003.test.ts` … `006` (o un archivo agrupado)

- [x] **Task 3 — Provider** (AC: #1–#4)
  - [x] Delegar HTML TPL-003…006 a nuevas funciones
  - [x] Subjects sin cambio funcional salvo mejora de copy acordada en design doc

- [x] **Task 4 — Regresión** (AC: #6)
  - [x] `tests/items-request.test.ts`, `items-cancel-with-session.test.ts`, tests de expire/degrade si tocan TPL-004
  - [x] `npm test` + `npm run build`

### Review Findings

- [x] [Review][Decision] `env.APP_PUBLIC_URL` sin validación `required()` — resuelto: variable declarada `required()` en `env.ts`; agregada a `vitest.config.ts` y archivos `.env.*.example`.

- [x] [Review][Patch] Null guards faltantes para `itemTitle`, `itemCondition`, `sessionDeadlineAt`, `itemId` — resuelto: patrón `!= null` aplicado a TPL-003/004/005. [`tpl-003-receiver-selected.ts:7-10`, `tpl-004-session-expired.ts:6-7`, `tpl-005-cancellation.ts:6`]

- [x] [Review][Patch] `Number(variables.donorReputationScore) || 0` trata el valor legítimo `0` como dato faltante — resuelto: cambiado a `!= null ? Number(...) : 0`. [`tpl-003-receiver-selected.ts:9`]

- [x] [Review][Defer] `bodyHtml` inyectado sin escapar en `renderEmailLayout` — seguro hoy porque todos los callers usan `renderEmailParagraph` (que sí escapa), pero es trampa latente para callers futuros — deferred, pre-existing [src/infrastructure/email/templates/layout/email-layout.ts]
- [x] [Review][Defer] Entradas legacy TPL-003-006 duplicadas en mapa `templates` con subjects divergentes — intencional por dev notes; limpieza programada historia 9.5 — deferred, pre-existing [src/infrastructure/email/resend.provider.ts]
- [x] [Review][Defer] UUID `itemId` expuesto en cuerpo de TPL-004 — comportamiento heredado del legacy template — deferred, pre-existing [src/infrastructure/email/templates/tpl-004-session-expired.ts:10]
- [x] [Review][Defer] `firstName` vacío renderiza "Hola, " con coma sin nombre — patrón pre-existente en todos los templates del proyecto — deferred, pre-existing
- [x] [Review][Defer] `donorReputationScore = 0` cuando lookup de donante falla en use-case — lógica en SelectReceiverUseCase, fuera de scope — deferred, pre-existing [src/application/use-cases/item/select-receiver.use-case.ts]
- [x] [Review][Defer] `deadlineAt.toISOString()` lanza TypeError si DB retorna null — caller pre-existente, fuera de scope de esta historia — deferred, pre-existing [src/application/use-cases/delivery-session/expire-delivery-sessions.use-case.ts]
- [x] [Review][Defer] Footer auth "¿No creaste esta cuenta?" semánticamente incorrecto en emails transaccionales — diseño heredado del layout compartido; UX concern — deferred, pre-existing [src/infrastructure/email/templates/layout/email-layout.ts]
- [x] [Review][Defer] Legacy XSS en `templates` para TPL-001/TPL-007 (sin tiered path) — pre-existente, será removido en historia 9.4 — deferred, pre-existing [src/infrastructure/email/resend.provider.ts]

## Notas para el Dev Agent

### Inteligencia historias anteriores

- **9.1:** layout y tokens.
- **9.2:** patrón `renderTpl00X` + snapshot + wire parcial en provider.

### Variables por template (desde `resend.provider.ts` actual)

| TPL | Variables clave |
|---|---|
| TPL-003 | `firstName`, `itemTitle`, `itemCondition`, `donorReputationScore`, `sessionDeadlineAt` |
| TPL-004 | `firstName`, `itemTitle`, `itemId` |
| TPL-005 | `firstName`, `itemTitle` |
| TPL-006 | `firstName`, `itemTitle` (opcional en string) |

### Disparadores identificados (Task 1)

| TPL | Use Case | Archivo | Línea aprox. |
|---|---|---|---|
| TPL-003 | `SelectReceiverUseCase` | `src/application/use-cases/item/select-receiver.use-case.ts` | 61 |
| TPL-004 | `ExpireDeliverySessionsUseCase` | `src/application/use-cases/delivery-session/expire-delivery-sessions.use-case.ts` | ~30 |
| TPL-005 | `CancelItemUseCase` | `src/application/use-cases/item/cancel-item.use-case.ts` | ~45 |
| TPL-006 | `RequestItemUseCase` | `src/application/use-cases/item/request-item.use-case.ts` | ~44 |

### Tests existentes a no romper

- `tests/items-request.test.ts` — assert `templateId: 'TPL-006'`
- `tests/items-cancel-with-session.test.ts` — `TPL-005`
- Buscar `TPL-003`, `TPL-004` con grep en `tests/`

### Anti-patrones

- No cambiar `templateId` ni payloads de `mailService.send` en use cases.
- No alterar flujos de sesión/entrega más allá del HTML.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### File List

- `src/infrastructure/email/templates/tpl-003-receiver-selected.ts` (nuevo)
- `src/infrastructure/email/templates/tpl-004-session-expired.ts` (nuevo)
- `src/infrastructure/email/templates/tpl-005-cancellation.ts` (nuevo)
- `src/infrastructure/email/templates/tpl-006-new-request.ts` (nuevo)
- `src/infrastructure/email/resend.provider.ts` (modificado — wiring tieredTemplates)
- `tests/email-tpl-003.test.ts` (nuevo)
- `tests/email-tpl-004.test.ts` (nuevo)
- `tests/email-tpl-005.test.ts` (nuevo)
- `tests/email-tpl-006.test.ts` (nuevo)
- `tests/__snapshots__/email-tpl-003.test.ts.snap` (generado)
- `tests/__snapshots__/email-tpl-004.test.ts.snap` (generado)
- `tests/__snapshots__/email-tpl-005.test.ts.snap` (generado)
- `tests/__snapshots__/email-tpl-006.test.ts.snap` (generado)
- `_bmad-output/initiative-backend/archive-v6/sprint-status.yaml` (modificado)

### Completion Notes

Implementadas las 4 plantillas de email Tier 2 siguiendo el patrón `renderTpl00X` de la historia 9.2:

- **TPL-003** (`tpl-003-receiver-selected.ts`): usa `renderEmailLayout()` con todas las variables requeridas por AC#1 (`firstName`, `itemTitle`, `itemCondition`, `donorReputationScore`, `sessionDeadlineAt`). CTA «Ver en la app» apuntando a `env.APP_PUBLIC_URL`.
- **TPL-004** (`tpl-004-session-expired.ts`): layout con marca, variables `firstName`, `itemTitle`, `itemId`. Sin CTA (informacional).
- **TPL-005** (`tpl-005-cancellation.ts`): layout con marca, variables `firstName`, `itemTitle`. Sin CTA (informacional).
- **TPL-006** (`tpl-006-new-request.ts`): layout con marca, variable `firstName` y `itemTitle` opcional (mantiene lógica condicional del inline original). Sin CTA.

`resend.provider.ts` actualizado: TPL-003 a TPL-006 movidos a `tieredTemplates`; los inline legacy permanecen en `templates` como fallback (no se eliminan hasta la historia 9.5).

Tests: 4 archivos snapshot nuevos (10+7+6+7 = 30 assertions). Suite completa: 50 archivos, 380 tests, 0 fallos. Build TypeScript sin errores.

### Change Log

- 2026-05-27: Implementación TPL-003, TPL-004, TPL-005, TPL-006 con layout de marca y snapshot tests (Historia 9.3)
