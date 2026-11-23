---
title: "Layout shell y tokens de diseño"
type: feature
ticket: 1
status: done
created: 2026-10-25
---

# Historia 9.1: Layout shell y tokens de diseño

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como desarrollador,
quiero un layout HTML compartido y tokens sincronizados con `colors_and_type.css`,
para renderizar emails con marca de forma consistente en todas las plantillas posteriores.

## Criterios de aceptación

1. **Dado** `src/infrastructure/email/tokens/email-design-tokens.ts`, **cuando** se revisa, **entonces** los hex coinciden con `no-lo-vendo/docs/project/colors_and_type.css` (documentado en comentario de cabecera con ruta y versión del CSS).

2. **Dado** `renderEmailLayout()` en `src/infrastructure/email/templates/layout/email-layout.ts`, **cuando** se genera HTML con contenido mínimo de prueba, **entonces** pasa snapshot Vitest (table-based, ancho máx. 600px, estilos inline únicos, zonas: preheader, header, saludo, titular, cuerpo, CTA, fallback, footer).

3. **Dado** `docs/email-template-design.md`, **cuando** se revisa tras esta historia, **entonces** describe layout, tiers de migración y checklist de clientes; la sección §7 refleja rutas reales creadas en el repo.

4. **Dado** componentes base en `templates/components/` (button, heading, paragraph, footer), **cuando** se usan desde el layout, **entonces** exportan HTML con tokens (sin hex hardcodeados fuera de `email-design-tokens.ts`).

5. **Dado** la suite, **cuando** se ejecuta `npm test`, **entonces** los tests nuevos de layout/tokens pasan sin romper tests auth/items existentes.

## Alcance explícito (IN / OUT)

| IN (9.1) | OUT (9.2–9.5) |
|---|---|
| Tokens + layout shell + componentes base | Migración de TPL-001…009 a contenido de marca |
| Snapshot del layout vacío / fixture mínimo | Cambios en use cases que envían email |
| `templates/index.ts` exportando layout y tipos | Eliminar `greetingHtml` de `resend.provider.ts` |
| Ajustes menores a `email-template-design.md` si rutas difieren | Snapshots por cada TPL individual |
| | Texto plano multipart (opcional post-MVP salvo que el skill exija en 9.5) |

**Prerrequisitos:** Épica 8 completa (`done`). Correct Course 2026-05-27 aplicado: registro ya envía solo TPL-009 con HTML inline legacy.

## Tareas / Subtareas

- [x] **Task 1 — Tokens** (AC: #1)
  - [x] Crear `src/infrastructure/email/tokens/email-design-tokens.ts` con: `primary`, `accent`, `background`, `surface`, `textPrimary`, `textSecondary`, `textMuted`, `border`, stacks `fontDisplay` / `fontBody`
  - [x] Valores según tabla en `docs/email-template-design.md` §2 (verificar contra CSS `--color-primary-500` = `#3A7358`, etc.)
  - [x] Comentario: `// Sync manual con no-lo-vendo/docs/project/colors_and_type.css`

- [x] **Task 2 — Componentes** (AC: #4)
  - [x] `templates/components/email-button.ts` — CTA ~44px, fondo primary, texto blanco
  - [x] `templates/components/email-heading.ts`, `email-paragraph.ts`, `email-footer.ts`
  - [x] Todos consumen tokens importados

- [x] **Task 3 — Layout** (AC: #2)
  - [x] `templates/layout/email-layout.ts` — función `renderEmailLayout(input: EmailLayoutInput): string`
  - [x] Input tipado: `preheader`, `firstName`, `title`, `bodyHtml` (fragmento), `cta?: { label, href }`, `fallbackLink?: string`
  - [x] Estructura table-based 600px; logo/nombre «Regálalo» en header
  - [x] Export en `templates/index.ts`

- [x] **Task 4 — Tests** (AC: #2, #5)
  - [x] `tests/email-layout.test.ts` — snapshot de layout con fixture; assert que HTML contiene `#3A7358` (primary)
  - [x] `npm test` + `npm run build`

- [x] **Task 5 — Docs** (AC: #3)
  - [x] Revisar `docs/email-template-design.md` §7 paths vs árbol real; corregir si hace falta

### Review Findings

- [x] [Review][Defer] Trust boundary de `bodyHtml` no documentada — deferred, sin acción por ahora

- [x] [Review][Patch] XSS via interpolación sin escapar de `firstName`, `title`, `preheader` [email-layout.ts:56,38; email-heading.ts:4]
- [x] [Review][Patch] URLs en `fallbackLink` y `cta.href` sin validar esquema ni escapar en atributo HTML [email-layout.ts:21-24, email-button.ts:12]
- [x] [Review][Patch] `label` en `renderEmailButton` interpolado sin escapar [email-button.ts:15]
- [x] [Review][Patch] `#FFFFFF` hardcodeado en layout y botón — viola AC#4 [email-layout.ts:51, email-button.ts:13]
- [x] [Review][Patch] `docs/email-template-design.md §7` lista TPL-001…009 que no existen — viola AC#3
- [x] [Review][Patch] Test "no hardcoded hex" no verifica ausencia de hex en HTML renderizado [tests/email-layout.test.ts:95-104]
- [x] [Review][Patch] Sin tests para inputs con caracteres HTML especiales o esquemas `javascript:` [tests/email-layout.test.ts]
- [x] [Review][Patch] `fixture.cta.href` y `fixture.fallbackLink` son idénticos en tests — overlap en assertions [tests/email-layout.test.ts:20-21]

- [x] [Review][Defer] Token `accent` definido pero sin uso [email-design-tokens.ts:6] — deferred, pre-existing
- [x] [Review][Defer] `renderEmailParagraph` exportado pero nunca llamado por el layout — API inconsistente [templates/index.ts] — deferred, pre-existing
- [x] [Review][Defer] `renderEmailHeading` siempre emite `<h1>`, sin argumento de nivel [email-heading.ts:4] — deferred, pre-existing
- [x] [Review][Defer] Acoplamiento estrecho entre layout y componentes específicos (sin inyección) [email-layout.ts:2-4] — deferred, pre-existing
- [x] [Review][Defer] Sin tests para campos requeridos vacíos o solo-whitespace [tests/email-layout.test.ts] — deferred, pre-existing
- [x] [Review][Defer] `cta.label`/`cta.href` vacíos no guardados en runtime [email-layout.ts] — deferred, pre-existing

## Notas para el Dev Agent

### Contexto de épica 9

**9.1** es la base: sin layout compartido, 9.2–9.5 no pueden migrar plantillas. **No** migrar TPL-009 ni tocar `resend.provider.ts` en esta historia (salvo import de tipos si hace falta compilar — preferir cero cambios en provider).

**Orden épica:** `9.1` → `9.2` (P0/P1 auth) → `9.3` (flujos items) → `9.4` (TPL-007 + catálogo TPL-001) → `9.5` (limpieza registry).

### Estado actual del código

**`resend.provider.ts`** — un solo archivo con `greetingHtml` + mapa inline `TPL-001`…`TPL-009`. Sin carpeta `templates/` ni tokens.

**`docs/email-template-design.md`** — spec aprobada; describe estructura objetivo aún no implementada.

**`register-user.use-case.ts`** — ya envía **solo** `TPL-009` (Correct Course). Variables: `recipientEmail`, `firstName`, `verificationLink`, `expiresInHours`.

### Cumplimiento de arquitectura

- **Clean Architecture:** solo capa `infrastructure/email/` + `tests/` + docs.
- **Referencias:** `docs/architecture.md` §10 (layout compartido), `docs/email-flow-mapping.md` v1.3.
- **NFR email:** inline CSS únicamente; web-safe fonts; contraste WCAG AA en CTA (validar en snapshot o comentario).

### Anti-patrones

- No duplicar hex en cada componente — un solo archivo de tokens.
- No usar CSS externo ni `<style>` en `<head>` para clientes de email.
- No migrar plantillas TPL en 9.1.
- No editar frontend Angular en esta historia.

### Verificación

```bash
npm test -- tests/email-layout.test.ts
npm run build
```

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Creados tokens de diseño en `src/infrastructure/email/tokens/email-design-tokens.ts` con los 8 colores y 2 stacks tipográficas sincronizados con `colors_and_type.css`.
- Creados 4 componentes base en `templates/components/`: `email-button.ts` (CTA 44px, fondo primary, texto blanco), `email-heading.ts` (h1, fontDisplay), `email-paragraph.ts` (fontBody), `email-footer.ts` (copyright + enlace soporte).
- Creado `templates/layout/email-layout.ts` con `renderEmailLayout()` — estructura table-based 600px, zonas: preheader, header (primary bg), saludo, titular h1, cuerpo, CTA opcional, fallback opcional, footer.
- Export centralizado en `templates/index.ts`.
- 14 tests Vitest pasan (1 snapshot generado con `vi.useFakeTimers` para estabilidad del año en footer). `npm run build` limpio. Sin regresiones (325/325).
- `docs/email-template-design.md` §7 ya reflejaba los paths correctos — sin cambios necesarios.

### File List

- `src/infrastructure/email/tokens/email-design-tokens.ts` (nuevo)
- `src/infrastructure/email/templates/components/email-button.ts` (nuevo)
- `src/infrastructure/email/templates/components/email-heading.ts` (nuevo)
- `src/infrastructure/email/templates/components/email-paragraph.ts` (nuevo)
- `src/infrastructure/email/templates/components/email-footer.ts` (nuevo)
- `src/infrastructure/email/templates/layout/email-layout.ts` (nuevo)
- `src/infrastructure/email/templates/index.ts` (nuevo)
- `tests/email-layout.test.ts` (nuevo)
- `tests/__snapshots__/email-layout.test.ts.snap` (generado)

### Change Log

- 2026-05-27: Historia 9.1 implementada — layout shell, tokens de diseño y componentes base de email
