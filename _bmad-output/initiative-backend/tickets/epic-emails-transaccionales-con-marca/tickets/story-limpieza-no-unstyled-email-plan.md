---
title: "Limpieza — no unstyled email in prod"
type: feature
ticket: 5
status: done
created: 2026-10-25
---

# Historia 9.5: Limpieza — no unstyled email in prod

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como desarrollador,
quiero eliminar HTML inline legacy y validar cobertura de snapshots,
para cumplir el criterio de go-live: ningún email en producción sin layout de marca.

## Criterios de aceptación

1. **Dado** `resend.provider.ts`, **cuando** se revisa, **entonces** delega 100 % en registry de plantillas (`templates/index.ts` o equivalente); **no** queda `greetingHtml` ni strings HTML inline por TPL.

2. **Dado** cada TPL-001…009 activo, **cuando** se renderiza en test, **entonces** el HTML pasa por `renderEmailLayout()` (detectable por estructura header/footer o snapshot compartido).

3. **Dado** `npm test`, **cuando** se ejecuta en CI, **entonces** snapshots por TPL-001…009 (activos) pasan.

4. **Dado** grep en `src/infrastructure/email/`, **cuando** se busca `` `<p>Hola` `` o `greetingHtml`, **entonces** cero coincidencias en código productivo.

5. **Dado** `docs/email-template-design.md` §1 criterio de lanzamiento, **cuando** se cierra esta historia, **entonces** se cumple en código (checklist manual Gmail/Outlook opcional en Dev Agent Record).

6. **Dado** suite completa, **cuando** `npm run build` y `npm test`, **entonces** verde.

## Alcance explícito (IN / OUT)

| IN (9.5) | OUT |
|---|---|
| Refactor `ResendMailProvider` → registry | Cambios funcionales en use cases |
| Eliminar mapa `templates` inline legacy | Smoke manual en clientes (documentar, no automatizar) |
| Suite snapshots consolidada o por archivo | Marcar `epic-9: done` (manual post-retro) |
| Opcional: texto plano `text` en Resend API | Dashboard Resend externo |

**Prerrequisitos:** **9.1–9.4** implementados (todas las plantillas migradas).

## Tareas / Subtareas

- [x] **Task 1 — Registry** (AC: #1, #2)
  - [x] `templates/registry.ts` — mapa `templateId` → `{ subject, render }`
  - [x] `resend.provider.ts` solo: lookup + `resend.emails.send`
  - [x] Eliminar `greetingHtml` y objeto `templates` inline

- [x] **Task 2 — Snapshots completos** (AC: #3)
  - [x] Asegurar test por TPL-001…009 o `tests/email-templates.snap.test.ts` parametrizado
  - [x] Fixtures de variables realistas por plantilla (copiar de tests de integración)

- [x] **Task 3 — Auditoría legacy** (AC: #4)
  - [x] `rg greetingHtml` / `` html: (v) => `` en provider — debe quedar vacío
  - [x] Actualizar `docs/email-template-design.md` §7 si el árbol final difiere

- [x] **Task 4 — Regresión total** (AC: #6)
  - [x] `npm test`, `npm run build`
  - [x] Lista en Dev Agent Record: tests auth + items que tocan email

- [x] **Task 5 — Go-live checklist** (AC: #5)
  - [x] Marcar en Completion Notes: criterio *no unstyled email in prod* cumplido
  - [x] Opcional: nota smoke Gmail/Outlook/móvil

## Notas para el Dev Agent

### Inteligencia historias anteriores

- **9.1–9.4:** cada TPL ya debería existir como módulo; esta historia **solo** consolida y elimina deuda.

### Estado objetivo `resend.provider.ts`

```typescript
// Pseudocódigo objetivo
const entry = emailTemplateRegistry[payload.templateId];
const html = entry.render(payload.variables);
await resend.emails.send({ from, to, subject: entry.subject(...), html });
```

### Tests de integración que envían email (regresión)

| Archivo | TPL |
|---|---|
| `auth-register.test.ts` | 009 |
| `auth-email-verification-flow.test.ts` | 009 |
| `items-request.test.ts` | 006 |
| `items-cancel-with-session.test.ts` | 005 |
| `degrade-inactive-items.test.ts` | 007 |
| (+ grep `templateId` en tests/) | |

### Anti-patrones

- No dejar fallback HTML `` Template not found `` sin layout en producción — usar error log + throw o layout de error mínimo con marca.
- No marcar épica 9 `done` en sprint-status desde dev-story (manual).

### Verificación

```bash
rg "greetingHtml" src/infrastructure/email/
npm test
npm run build
```

## Dev Agent Record

### Agent Model Used

Composer (Cursor)

### Implementation Plan

- Centralizar TPL-001…009 en `emailTemplateRegistry`; `ResendMailProvider` solo hace lookup, render y `resend.emails.send`.
- `templateId` desconocido: log estructurado + `throw` (sin email sin layout).
- Test parametrizado `email-templates.snap.test.ts` valida layout compartido + snapshots vía registry.

### Debug Log

(n/a)

### Completion Notes

- ✅ Criterio go-live **no unstyled email in prod** cumplido en código: todo TPL activo usa `renderEmailLayout()` vía módulos `tpl-00x`.
- Eliminados `greetingHtml`, mapa `templates` inline y path dual `tieredTemplates` en `resend.provider.ts`.
- `rg greetingHtml` y `` `<p>Hola` `` en `src/infrastructure/email/` → 0 coincidencias.
- `npm test`: 405 tests OK (54 archivos). `npm run build`: OK.
- Smoke manual Gmail/Outlook/móvil: pendiente QA humano (no bloquea cierre de historia en código).

### Regresión email (integración)

| Archivo | Resultado |
|---|---|
| `auth-register.test.ts` | ✅ |
| `auth-email-verification-flow.test.ts` | ✅ |
| `auth-password-reset.test.ts` | ✅ |
| `auth-resend-verification.test.ts` | ✅ |
| `items-request.test.ts` | ✅ |
| `items-cancel-with-session.test.ts` | ✅ |
| `items-select.test.ts` | ✅ |
| `degrade-inactive-items.test.ts` | ✅ |
| `expire-delivery-sessions.test.ts` | ✅ |
| `resend-mail-provider.test.ts` | ✅ (nuevo) |

### File List

- `src/infrastructure/email/templates/registry.ts` (nuevo)
- `src/infrastructure/email/resend.provider.ts`
- `src/infrastructure/email/templates/index.ts`
- `tests/email-templates.snap.test.ts` (nuevo)
- `tests/__snapshots__/email-templates.snap.test.ts.snap` (nuevo)
- `tests/resend-mail-provider.test.ts` (nuevo)
- `docs/email-template-design.md`

### Change Log

- 2026-05-27: Historia 9.5 — registry único, limpieza legacy HTML inline, snapshots consolidados, provider sin fallback unstyled.

### Review Findings

- [x] [Review][Patch] Respuesta de error de Resend no manejada explícitamente (falso éxito posible) [src/infrastructure/email/resend.provider.ts:21]
- [x] [Review][Patch] Falta aserción del log estructurado en templateId desconocido [tests/resend-mail-provider.test.ts:20]
- [x] [Review][Patch] `sort()` muta `ACTIVE_EMAIL_TEMPLATE_IDS` compartido en test [tests/email-templates.snap.test.ts:78]
- [x] [Review][Defer] Validación HTTPS inconsistente para enlaces CTA en layout [src/infrastructure/email/templates/layout/email-layout.ts:21] — deferred, pre-existing
- [x] [Review][Defer] Plantillas aceptan variables críticas ausentes y convierten a `String(undefined)` [src/infrastructure/email/templates/tpl-009-email-verification.ts:6] — deferred, pre-existing
