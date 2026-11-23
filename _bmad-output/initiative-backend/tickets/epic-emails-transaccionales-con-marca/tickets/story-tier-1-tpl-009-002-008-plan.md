---
title: "Tier 1 — TPL-009, TPL-002, TPL-008"
type: feature
ticket: 2
status: done
created: 2026-10-25
---

# Historia 9.2: Tier 1 — TPL-009, TPL-002, TPL-008

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como usuario,
quiero que los emails de verificación y contraseña se vean como la app,
para confiar en los enlaces que recibo.

## Criterios de aceptación

1. **Dado** registro o reenvío de verificación, **cuando** se envía TPL-009, **entonces** usa `renderEmailLayout()` con preheader, CTA «Confirmar mi email», fallback de `verificationLink` y copy según `docs/email-template-design.md` §5.

2. **Dado** `ForgotPasswordUseCase`, **cuando** se envía TPL-002, **entonces** usa el mismo layout con CTA «Restablecer contraseña» y variables `resetLink`, `firstName` preservadas.

3. **Dado** reset de contraseña completado, **cuando** se envía TPL-008, **entonces** usa layout con marca (sin CTA o CTA opcional a login según spec).

4. **Dado** `RegisterUserUseCase`, **cuando** el registro es exitoso, **entonces** se envía exactamente **un** email (`TPL-009`), no TPL-001.

5. **Dado** snapshots Vitest de TPL-009, TPL-002, TPL-008, **cuando** se ejecuta `npm test`, **entonces** pasan e incluyen token primary `#3A7358` en HTML.

6. **Dado** tests auth existentes, **cuando** se ejecuta `npm test`, **entonces** siguen pasando (assert de `templateId` y variables, no HTML legacy).

## Alcance explícito (IN / OUT)

| IN (9.2) | OUT |
|---|---|
| Archivos `tpl-009-email-verification.ts`, `tpl-002-reset-password.ts`, `tpl-008-password-reset-done.ts` | TPL-003…007 (9.3–9.4) |
| Wire en registry/provider para tier 1 | Eliminar mapa inline completo (9.5) |
| Snapshots tier 1 | Texto plano multipart obligatorio |
| Ajustar subjects/copy según §5 design doc | OpenAPI |

**Prerrequisito bloqueante:** **9.1** `ready-for-dev` implementado (layout + tokens existen).

## Tareas / Subtareas

- [x] **Task 1 — TPL-009** (AC: #1, #4, #5)
  - [x] `templates/tpl-009-email-verification.ts` — `renderTpl009(variables)`
  - [x] Asunto alineado a design doc (p. ej. «Confirmá tu email…»); soportar variante reenvío si `ResendVerificationUseCase` pasa flag o subject distinto
  - [x] Variables sin cambiar contrato: `recipientEmail`, `firstName`, `verificationLink`, `expiresInHours`
  - [x] Snapshot `tests/email-tpl-009.test.ts`

- [x] **Task 2 — TPL-002** (AC: #2, #5)
  - [x] `templates/tpl-002-reset-password.ts` — leer `forgot-password.use-case.ts` para variables (`resetLink`, `firstName`)
  - [x] Snapshot test

- [x] **Task 3 — TPL-008** (AC: #3, #5)
  - [x] `templates/tpl-008-password-reset-done.ts` — disparador en `reset-password.use-case.ts`
  - [x] Snapshot test

- [x] **Task 4 — Integración provider** (AC: #1–#3)
  - [x] En `resend.provider.ts` (o registry intermedio si 9.1 lo creó), delegar HTML de TPL-009/002/008 a funciones de plantilla
  - [x] Mantener subjects en español; puede coexistir mapa legacy para TPL no migrados hasta 9.5

- [x] **Task 5 — Regresión auth** (AC: #4, #6)
  - [x] `tests/auth-register.test.ts` — un solo `mailService.send`, `TPL-009`
  - [x] `tests/auth-email-verification-flow.test.ts` si aplica
  - [x] Tests forgot/reset password si existen

## Notas para el Dev Agent

### Inteligencia historia anterior (9.1)

- Usar **solo** `renderEmailLayout()` y componentes de `templates/` creados en 9.1.
- No redefinir tokens ni layout inline en cada TPL.

### Estado actual

**`resend.provider.ts`** — TPL-009/002/008 con `greetingHtml` + párrafos `<p>` sueltos.

**`register-user.use-case.ts`** — líneas 73–84: solo `TPL-009`.

**`forgot-password.use-case.ts`** — `templateId: 'TPL-002'`, `resetLink` desde `CORS_ORIGIN`.

### Copy TPL-009 (referencia)

| Campo | Valor sugerido (`email-template-design.md` §5) |
|---|---|
| Preheader | Un click y ya podés publicar… |
| CTA | Confirmar mi email |
| Expiración | Este enlace vence en {expiresInHours} horas |

### Anti-patrones

- No reintroducir envío TPL-001 en registro.
- No cambiar URLs de verificación (`APP_PUBLIC_URL` + `/verificar-email?token=`).
- No romper contrato de variables que ya assertan los tests.

### Verificación

```bash
npm test -- tests/email-tpl-009.test.ts tests/auth-register.test.ts
npm run build
```

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Implementation Plan

- Creadas 3 funciones de plantilla en `src/infrastructure/email/templates/`: `renderTpl009`, `renderTpl002`, `renderTpl008`.
- Cada función usa `renderEmailLayout()` + `renderEmailParagraph()` de 9.1; sin tokens ni hex hardcodeados.
- `resend.provider.ts`: se agrega mapa `tieredTemplates` (TPL-009/002/008) que se resuelve primero; el mapa legacy legacy queda intacto para TPL-001/003–007 hasta 9.5.
- Contratos de variables de use-cases no modificados.

### Completion Notes

- 21 tests nuevos (snapshots + asserts) en 3 archivos.
- 349 tests pasan en suite completa; build tsc + OpenAPI limpio.
- AC #1–#6 satisfechos: TPL-009/002/008 usan `renderEmailLayout()`, contienen `#3A7358`, registro envía solo TPL-009, tests auth siguen pasando.

### File List

- `src/infrastructure/email/templates/tpl-009-email-verification.ts` (nuevo)
- `src/infrastructure/email/templates/tpl-002-reset-password.ts` (nuevo)
- `src/infrastructure/email/templates/tpl-008-password-reset-done.ts` (nuevo)
- `src/infrastructure/email/resend.provider.ts` (modificado)
- `tests/email-tpl-009.test.ts` (nuevo)
- `tests/email-tpl-002.test.ts` (nuevo)
- `tests/email-tpl-008.test.ts` (nuevo)
- `tests/__snapshots__/email-tpl-009.test.ts.snap` (generado)
- `tests/__snapshots__/email-tpl-002.test.ts.snap` (generado)
- `tests/__snapshots__/email-tpl-008.test.ts.snap` (generado)

### Change Log

- 2026-05-27: Historia 9.2 implementada — TPL-009, TPL-002, TPL-008 migrados a `renderEmailLayout()`

### Review Findings

- [x] [Review][Patch] https guard incompatible con URLs http de dev — relajar en `APP_ENV !== 'prod'` en `renderEmailButton` y `renderEmailLayout` [src/infrastructure/email/templates/components/email-button.ts:10, src/infrastructure/email/templates/layout/email-layout.ts:23]
- [x] [Review][Patch] TPL-002 subject en tuteo — corregir a voseo: "Recuperá tu contraseña" [src/infrastructure/email/templates/tpl-002-reset-password.ts:23, tests/email-tpl-002.test.ts:51]
- [x] [Review][Patch] NaN en cuerpo de email cuando expiresInHours/expiresInMinutes está ausente [tpl-009-email-verification.ts:10, tpl-002-reset-password.ts:9]
- [x] [Review][Patch] "undefined" literal en saludo cuando firstName está ausente [tpl-009-email-verification.ts:7, tpl-002-reset-password.ts:7, tpl-008-password-reset-done.ts:7]
- [x] [Review][Patch] Falta assertion de preheader en email-tpl-002.test.ts [tests/email-tpl-002.test.ts]
- [x] [Review][Defer] Entradas legacy de TPL-002/008/009 permanecen en mapa templates [resend.provider.ts] — deferred, intencional hasta historia 9.5 (cleanup sprint)
- [x] [Review][Defer] forgot-password.use-case usa CORS_ORIGIN en lugar de APP_PUBLIC_URL para resetLink [src/application/use-cases/auth/forgot-password.use-case.ts] — deferred, pre-existing
- [x] [Review][Defer] Sin manejo de errores en resend.emails.send() [resend.provider.ts] — deferred, pre-existing
- [x] [Review][Defer] templateId desconocido envía HTML de debug al usuario [resend.provider.ts] — deferred, pre-existing
- [x] [Review][Defer] Singleton resend instanciado en module load con API key [resend.provider.ts] — deferred, pre-existing
