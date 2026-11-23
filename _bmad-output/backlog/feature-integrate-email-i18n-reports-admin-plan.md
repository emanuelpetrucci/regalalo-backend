---
title: 'Integrar localización de emails en módulo de reportes y admin'
type: feature
created: 2026-10-25
status: done
baseline_commit: '8a1caef5b64c6428f5d258f83161c1466c213a55'
context: []
ticket: "story-integrate-email-i18n-reports-admin"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `develop` incorporó soporte multi-idioma (es/ca/en) en TPL-001…010 cambiando la firma de `EmailTemplateRenderer` a `(variables, language?)`. Los templates del módulo de reportes (TPL-011, 012, 013) y admin (ADM-001, ADM-002) en `feature/admin` no siguen esa firma, rompen el tipado y carecen de traducciones. Adicionalmente, `create-report.use-case.ts` no pasa las variables `reportedEntityType` ni `reason` a TPL-011 (bug latente).

**Approach:** Hacer merge de `origin/develop` en `feature/admin`, resolver conflictos, actualizar TPL-011/012/013 con TRANSLATIONS (es/ca/en) y firma compatible, añadir param `language?` sin uso en ADM-001/002, y propagar `preferredLanguage` del usuario por la cadena controller → use-case → `mailService.send`.

## Boundaries & Constraints

**Always:**
- `EmailTemplateRenderer` acepta `(variables, language?)` — todos los templates deben respetar esa firma.
- ADM-001 y ADM-002 son emails internos del equipo; siempre en español. Solo añaden el parámetro `language?` ignorado.
- TPL-011/012/013 usan `TRANSLATIONS = { es, ca, en }` con fallback a `'es'`, igual que TPL-001.
- `condition-labels.ts` tras el merge conserva las funciones de reportes (`getReportedEntityLabel`, `getReportReasonLabel`) con soporte multi-idioma y adopta el nuevo mapa multi-idioma de `CONDITION_LABELS`.
- No tocar `openapi/openapi.json` a mano: regenerar con `npm run openapi:generate`.
- Respetar `preferredLanguage: AppPreferredLanguage` en `user.entity.ts` (cambio de develop).

**Ask First:**
- Si el merge produce conflictos que no sean deterministas (reglas de negocio superpuestas, no solo formato).

**Never:**
- Localizar ADM-001/ADM-002.
- Alterar el schema de BD ni añadir migraciones.
- Modificar snapshot tests sin actualizarlos con `vitest --update-snapshots`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| TPL-011 idioma del reporter | `language='ca'` | Asunto y cuerpo en catalán | fallback a `'es'` si idioma desconocido |
| TPL-012 idioma del reporter | `language='en'`, reporte resuelto | Email de resolución en inglés | fallback a `'es'` |
| TPL-013 idioma del usuario advertido | `language='en'` | Aviso en inglés | fallback a `'es'` |
| TPL-011 variables correctas | reporter sin `reportedEntityType` en variables | No debe enviarse cadena vacía — pasar tipo raw ('item'/'user') desde use-case | silent fallback a `'un contenido'` no es aceptable |
| ADM-001/002 firma | `language='ca'` recibido | Email siempre en español, param ignorado | — |

</frozen-after-approval>

## Code Map

- `src/infrastructure/email/templates/registry.ts` — conflicto merge: unir ambos conjuntos de templates + nueva firma `EmailTemplateRenderer`
- `src/infrastructure/email/templates/condition-labels.ts` — conflicto merge: adoptar multi-lang de develop + añadir multi-lang a `getReportedEntityLabel` y `getReportReasonLabel`
- `src/infrastructure/email/templates/tpl-011-report-confirmation.ts` — añadir TRANSLATIONS (es/ca/en) + firma `(variables, language?)`; fix: añadir `reportedEntityType`/`reason` a variables del use-case
- `src/infrastructure/email/templates/tpl-012-report-resolved.ts` — añadir TRANSLATIONS + firma compatible
- `src/infrastructure/email/templates/tpl-013-warn-user.ts` — añadir TRANSLATIONS + firma compatible
- `src/infrastructure/email/templates/tpl-adm-001.ts` — añadir `language?` param (ignorado)
- `src/infrastructure/email/templates/tpl-adm-002-new-report-admin.ts` — añadir `language?` param (ignorado)
- `src/domain/repositories/report.repository.ts` — añadir `preferredLanguage?: string | null` a `AdminReportDetailRecord.reporter`
- `src/infrastructure/database/supabase/report.repository.ts` — añadir `u.preferred_language AS reporter_preferred_language` al SELECT de `findByIdAdmin` + mapear el campo
- `src/application/use-cases/reports/create-report.use-case.ts` — añadir `reporterLanguage?: string` param; incluir `reportedEntityType: dto.reportedEntityType, reason: dto.reason` en variables de TPL-011; pasar `language: reporterLanguage`
- `src/interfaces/http/controllers/report.controller.ts` — pasar `req.currentUser!.preferredLanguage` como `reporterLanguage`
- `src/application/use-cases/admin/reports/admin-resolve-report.use-case.ts` — pasar `language: report.reporter?.preferredLanguage` a TPL-012 y `language: reportedUser.preferredLanguage` a TPL-013; usar tipo raw 'item'/'user' en `reportedEntityType` (no pre-traducido)
- `tests/email-tpl-011.test.ts`, `tests/email-tpl-012.test.ts`, `tests/email-tpl-013.test.ts` — añadir assertions de idioma (en/ca)

## Tasks & Acceptance

**Execution:**
- [x] merge develop — `git merge origin/develop` y resolver conflictos deterministas (registry, condition-labels, package.json, CHANGELOG.md, user.entity.ts)
- [x] `src/infrastructure/email/templates/condition-labels.ts` — adoptar multi-lang CONDITION_LABELS de develop; convertir `getReportedEntityLabel(type, language?)` y `getReportReasonLabel(reason, language?)` a mapas `{ es, ca, en }`; mantener firmas existentes (backward-compatible con fallback 'es')
- [x] `src/infrastructure/email/templates/registry.ts` — resolver conflicto: conservar TPL-011…ADM-002; adoptar nueva `EmailTemplateRenderer` con `language?` como segundo parámetro
- [x] `src/infrastructure/email/templates/tpl-011-report-confirmation.ts` — añadir `TRANSLATIONS` con `es`/`ca`/`en`; cambiar firma a `(variables, language?)`; usar `getReportedEntityLabel(type, language)` y `getReportReasonLabel(reason, language)` con tipo raw
- [x] `src/infrastructure/email/templates/tpl-012-report-resolved.ts` — añadir `TRANSLATIONS` + firma compatible; usar tipo raw con `getReportedEntityLabel`
- [x] `src/infrastructure/email/templates/tpl-013-warn-user.ts` — añadir `TRANSLATIONS` + firma compatible
- [x] `src/infrastructure/email/templates/tpl-adm-001.ts` — añadir `_language?: string` param ignorado
- [x] `src/infrastructure/email/templates/tpl-adm-002-new-report-admin.ts` — añadir `_language?: string` param ignorado
- [x] `src/domain/repositories/report.repository.ts` — extender `AdminReportDetailRecord.reporter` con `preferredLanguage?: string | null`
- [x] `src/infrastructure/database/supabase/report.repository.ts` — añadir `u.preferred_language AS reporter_preferred_language` a la query de `findByIdAdmin`; mapear en el objeto `reporter`
- [x] `src/application/use-cases/reports/create-report.use-case.ts` — añadir `reporterLanguage?: string` como tercer parámetro de `execute()`; pasar a TPL-011 como `language` y añadir `reportedEntityType: dto.reportedEntityType, reason: dto.reason` a variables
- [x] `src/interfaces/http/controllers/report.controller.ts` — pasar `req.currentUser!.preferredLanguage` como tercer argumento al use-case
- [x] `src/application/use-cases/admin/reports/admin-resolve-report.use-case.ts` — pasar `language: report.reporter?.preferredLanguage ?? undefined` a TPL-012; pasar `language: reportedUser.preferredLanguage` a TPL-013; cambiar `entityTypeLabel` a tipo raw ('item'/'user')
- [x] `tests/email-tpl-011.test.ts`, `tests/email-tpl-012.test.ts`, `tests/email-tpl-013.test.ts` — añadir tests en/ca; actualizar snapshots si existen

**Acceptance Criteria:**
- Dado un usuario con `preferredLanguage='en'` que envía un reporte, cuando se envía TPL-011, entonces el subject y body son en inglés.
- Dado un reporte resuelto cuyo reporter tiene `preferredLanguage='ca'`, cuando `admin-resolve-report` se ejecuta, entonces TPL-012 se envía con `language='ca'`.
- Dado un usuario advertido con `preferredLanguage='en'`, cuando se ejecuta la acción `warn_user`, entonces TPL-013 lleva `language='en'`.
- Dado `npm run build` tras el merge y los cambios, entonces compila sin errores de TypeScript.
- Dado `npm test`, entonces todos los tests pasan (incluyendo los nuevos de idioma).

## Spec Change Log

## Design Notes

La firma `(variables, language?)` es consistente con todos los templates de develop. Para ADM-001/ADM-002, el parámetro se nombra `_language?: string` con underscore para indicar explícitamente que es ignorado.

Para `getReportedEntityLabel` con multi-idioma, los tipos raw ('item'/'user') se mapean directamente en cada locale:
```
es: { item: 'un objeto', user: 'otro usuario' }
ca: { item: 'un objecte', user: 'un altre usuari' }
en: { item: 'an item', user: 'another user' }
```

## Verification

**Commands:**
- `git merge origin/develop` — expected: sin conflictos no-deterministas, árbol limpio tras resolución
- `npm run build` — expected: compilación exitosa, openapi.json actualizado
- `npx vitest run` — expected: todos los tests pasan

## Suggested Review Order

**Propagación del idioma (cadena de entrada)**

- Punto de entrada: extrae `preferredLanguage` de `req.currentUser!` y lo pasa al use-case.
  [`report.controller.ts:11`](../../src/interfaces/http/controllers/report.controller.ts#L11)

- Nuevo param `reporterLanguage?`; fix crítico: `reportedEntityType`/`reason` ahora pasan a TPL-011.
  [`create-report.use-case.ts:26`](../../src/application/use-cases/reports/create-report.use-case.ts#L26)

- Propaga `reporter.preferredLanguage` a TPL-012 y `reportedUser.preferredLanguage` a TPL-013.
  [`admin-resolve-report.use-case.ts:94`](../../src/application/use-cases/admin/reports/admin-resolve-report.use-case.ts#L94)

**Infraestructura de labels multi-idioma**

- `getReportReasonLabel(reason, language?)` — mapas es/ca/en para claves enum raw.
  [`condition-labels.ts:55`](../../src/infrastructure/email/templates/condition-labels.ts#L55)

- `getReportedEntityLabel(type, language?)` — convierte raw 'item'/'user' a etiqueta localizada.
  [`condition-labels.ts:68`](../../src/infrastructure/email/templates/condition-labels.ts#L68)

**Localización de templates TPL-011/012/013**

- TRANSLATIONS es/ca/en + firma `(variables, language?)`; usa labels raw via helpers.
  [`tpl-011-report-confirmation.ts:6`](../../src/infrastructure/email/templates/tpl-011-report-confirmation.ts#L6)

- Mismo patrón TRANSLATIONS; `getReportedEntityLabel` para label en cuerpo del email.
  [`tpl-012-report-resolved.ts:6`](../../src/infrastructure/email/templates/tpl-012-report-resolved.ts#L6)

- TRANSLATIONS mínimo (sin labels de entidad, aviso general de actividad).
  [`tpl-013-warn-user.ts:4`](../../src/infrastructure/email/templates/tpl-013-warn-user.ts#L4)

**Templates de admin (firma compatible, sin localizar)**

- ADM-001 y ADM-002: solo añaden `_language?` ignorado; contenido siempre en español.
  [`tpl-adm-001.ts:7`](../../src/infrastructure/email/templates/tpl-adm-001.ts#L7)

  [`tpl-adm-002-new-report-admin.ts:18`](../../src/infrastructure/email/templates/tpl-adm-002-new-report-admin.ts#L18)

**Extensión de tipo de dominio**

- `preferredLanguage: string | null` añadido al tipo `reporter` del aggregate de reporte.
  [`report.repository.ts:64`](../../src/domain/repositories/report.repository.ts#L64)

- SQL: `u.preferred_language AS reporter_preferred_language` + mapeo en el objeto reporter.
  [`supabase/report.repository.ts:200`](../../src/infrastructure/database/supabase/report.repository.ts#L200)

**Tests**

- Tests en/ca/fallback para TPL-011 con tipos raw y razones enum.
  [`email-tpl-011.test.ts:1`](../../tests/email-tpl-011.test.ts#L1)

- Tests en/ca/fallback para TPL-012 con tipo 'user' y 'item'.
  [`email-tpl-012.test.ts:1`](../../tests/email-tpl-012.test.ts#L1)

- Tests en/ca/fallback para TPL-013.
  [`email-tpl-013.test.ts:1`](../../tests/email-tpl-013.test.ts#L1)

- Fixtures de snapshot actualizados: `reportedEntityType: 'item'` y `reason: 'contenido_inadecuado'`.
  [`email-templates.snap.test.ts:79`](../../tests/email-templates.snap.test.ts#L79)
