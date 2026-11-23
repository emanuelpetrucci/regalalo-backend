---
title: 'Email language localization'
type: feature
created: 2026-10-25
status: done
baseline_commit: 'cd8e76475aba43ebd0a1cb21120542e6c7486a89'
context: []
ticket: "story-email-language-localization"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Todos los emails transaccionales se envían en español, ignorando el idioma preferido del usuario (`user.preferredLanguage` ya existe en la BD pero no se usa en emails).

**Approach:** Añadir `language?: AppPreferredLanguage` a `MailPayload` y a los renderizadores de plantilla; crear traducciones inline es/ca/en en cada plantilla; propagar `user.preferredLanguage` en los use-cases que envían email; añadir `language` opcional al endpoint de registro para que el frontend lo pase en el momento del alta.

## Boundaries & Constraints

**Always:**
- Fallback a `'es'` si `language` es `undefined` o no reconocido.
- Traducir: subject, title, preheader, cuerpo, labels CTA, saludo del layout ("Hola,"), fallback-link label y el footer. Attribute `lang` del HTML debe ser dinámico.
- `condition-labels.ts` debe devolver la etiqueta en el idioma correcto.
- `language` en el registro es opcional; sin él, la cuenta se crea con `'es'` (default de BD).
- No requiere migración de BD — `preferred_language` ya existe con `DEFAULT 'es'`.

**Ask First:**
- Si alguna traducción al catalán tiene ambigüedad semántica en el contexto de Regálalo.

**Never:**
- Librerías i18n externas — traducciones inline con objetos `const TRANSLATIONS = { es, ca, en }`.
- Migraciones SQL o cambios en esquema de tablas.
- Cambios en el mecanismo Resend (no usar nuevas capacidades del SDK).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Usuario con `preferredLanguage='en'` | `send({ language: 'en', ... })` | Email completo en inglés | — |
| Usuario con `preferredLanguage='ca'` | `send({ language: 'ca', ... })` | Email completo en catalán | — |
| `language` omitido en `MailPayload` | `send({ templateId: 'TPL-001', ... })` | Fallback a español | — |
| `language='xx'` desconocido | cualquier plantilla | Fallback a español | — |
| Registro con `language: 'en'` | `POST /api/auth/register { ..., language: 'en' }` | `user.preferredLanguage='en'`; TPL-009 en inglés | — |
| Registro sin `language` | `POST /api/auth/register` (sin campo) | `user.preferredLanguage='es'`; TPL-009 en español | — |

</frozen-after-approval>

## Code Map

- `src/interfaces/validators/preferred-language.schema.ts` — `AppPreferredLanguage` tipo a reusar
- `src/domain/services/mail.service.ts` — `MailPayload`: añadir `language?: AppPreferredLanguage`
- `src/infrastructure/email/templates/registry.ts` — `EmailTemplateRenderer`: segundo parámetro `language?: AppPreferredLanguage`
- `src/infrastructure/email/resend.provider.ts` — propagar `payload.language` al renderer
- `src/infrastructure/email/templates/layout/email-layout.ts` — `EmailLayoutInput.language?`; localizar saludo y fallback-label; `<html lang="...">`
- `src/infrastructure/email/templates/components/email-footer.ts` — añadir `language?`; localizar strings estáticos
- `src/infrastructure/email/templates/condition-labels.ts` — convertir a `Record<lang, Record<condition, label>>`; actualizar `getConditionLabel(condition, language?)` y `formatConditionLabelDisplay`
- `src/infrastructure/email/templates/tpl-001..010.ts` — traducciones inline es/ca/en; aceptar `language?`; propagar a layout/components
- `src/interfaces/validators/register.validator.ts` — añadir `language: preferredLanguageSchema.optional()`
- `src/application/dtos/auth.dto.ts` — añadir `language?: AppPreferredLanguage` a `RegisterRequestDto`
- `src/domain/repositories/user.repository.ts` — añadir `preferredLanguage?: string` a `CreateUserInput`
- `src/infrastructure/database/supabase/user.repository.ts` — parametrizar `preferred_language` en INSERT (actualmente hardcoded `'es'`)
- `src/application/use-cases/user/register-user.use-case.ts` — pasar `preferredLanguage: dto.language` a `create()`; añadir `language: user.preferredLanguage` al `send()`
- `src/application/use-cases/user/resend-verification.use-case.ts` — añadir `language: user.preferredLanguage` al `send()`
- `src/application/use-cases/user/forgot-password.use-case.ts` — añadir `language: user.preferredLanguage` al `send()`
- `src/application/use-cases/user/reset-password.use-case.ts` — añadir `language: user.preferredLanguage` al `send()`
- `src/application/use-cases/item/request-item.use-case.ts` — añadir `language: donor.preferredLanguage` al `send()`
- `src/application/use-cases/item/select-receiver.use-case.ts` — añadir `language: receiver.preferredLanguage` al `send()`
- `src/application/use-cases/item/cancel-item.use-case.ts` — añadir `language: receiver.preferredLanguage` al `send()`
- `src/domain/repositories/item.repository.ts` — añadir `donorPreferredLanguage: string` a `NewlyDegradedItem`; `preferredLanguage: string` a `DigestEligibleUser`
- `src/domain/repositories/delivery-session.repository.ts` — añadir `donorPreferredLanguage: string` a `ExpiredSessionForEmail`
- `src/infrastructure/database/supabase/item.repository.ts` — incluir `users.preferred_language` en SELECTs de `findNewlyDegradedItems()` y `findEligibleDigestUsersForItem()`
- `src/infrastructure/database/supabase/delivery-session.repository.ts` — incluir `users.preferred_language` en SELECT de `findExpiredSessions()`
- `src/application/use-cases/item/degrade-inactive-items.use-case.ts` — añadir `language: item.donorPreferredLanguage` al `send()`
- `src/application/use-cases/delivery/expire-delivery-sessions.use-case.ts` — añadir `language: session.donorPreferredLanguage` al `send()`
- `src/application/use-cases/jobs/send-nearby-items-digest.use-case.ts` — añadir `preferredLanguage` a `NearbyDigestRecipient`; propagar a `send({ language: recipient.preferredLanguage })`
- `tests/email-tpl-*.test.ts`, `tests/email-layout.test.ts`, `tests/email-templates.snap.test.ts` — actualizar snapshots; añadir casos en/ca mínimos
- `openapi/openapi.json` — regenerar con `npm run openapi:generate`
- `CHANGELOG.md` / `package.json` — entrada `Added` en [Unreleased]; bump minor

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/services/mail.service.ts` -- añadir `language?: AppPreferredLanguage`; importar tipo -- base de la propagación
- [x] `src/infrastructure/email/templates/registry.ts` -- ampliar `EmailTemplateRenderer` con segundo parámetro `language?: AppPreferredLanguage` -- todos los renderers lo aceptan
- [x] `src/infrastructure/email/resend.provider.ts` -- `entry(payload.variables, payload.language)` -- ejecuta renderer con idioma
- [x] `src/infrastructure/email/templates/layout/email-layout.ts` -- `EmailLayoutInput.language?`; `LAYOUT_I18N = { es: { greeting, fallbackLabel }, ca, en }`; `html lang` dinámico -- elimina strings es hardcoded
- [x] `src/infrastructure/email/templates/components/email-footer.ts` -- `language?`; `FOOTER_I18N = { es, ca, en }` para "¿No creaste esta cuenta?", "Contactá con soporte", "Todos los derechos reservados." -- footer localizado
- [x] `src/infrastructure/email/templates/condition-labels.ts` -- `CONDITION_LABELS: Record<lang, Record<condition, label>>`; actualizar `getConditionLabel(condition, language?)` + `formatConditionLabelDisplay(condition, language?)` -- condiciones en 3 idiomas
- [x] `src/infrastructure/email/templates/tpl-001-welcome.ts` -- `const TRANSLATIONS = { es, ca, en }` + `const t = (lang?: string) => TRANSLATIONS[...] ?? TRANSLATIONS.es`; aceptar `language?`; propagar a layout -- TPL-001 en 3 idiomas
- [x] `src/infrastructure/email/templates/tpl-002-reset-password.ts` -- ídem patrón TPL-001 -- TPL-002 en 3 idiomas
- [x] `src/infrastructure/email/templates/tpl-003-receiver-selected.ts` -- ídem + `getConditionLabel(itemCondition, language)` -- TPL-003 en 3 idiomas
- [x] `src/infrastructure/email/templates/tpl-004-session-expired.ts` -- ídem -- TPL-004 en 3 idiomas
- [x] `src/infrastructure/email/templates/tpl-005-cancellation.ts` -- ídem -- TPL-005 en 3 idiomas
- [x] `src/infrastructure/email/templates/tpl-006-new-request.ts` -- ídem -- TPL-006 en 3 idiomas
- [x] `src/infrastructure/email/templates/tpl-007-degradation.ts` -- ídem -- TPL-007 en 3 idiomas
- [x] `src/infrastructure/email/templates/tpl-008-password-reset-done.ts` -- ídem -- TPL-008 en 3 idiomas
- [x] `src/infrastructure/email/templates/tpl-009-email-verification.ts` -- ídem -- TPL-009 en 3 idiomas
- [x] `src/infrastructure/email/templates/tpl-010-nearby-items-digest.ts` -- ídem + localizar strings de conteo/distancia (`countSingular`, `countPlural`, `distanceLabel` en traducción) + `formatConditionLabelDisplay(condition, language)` -- TPL-010 en 3 idiomas
- [x] `src/interfaces/validators/register.validator.ts` -- `language: preferredLanguageSchema.optional()` en `registerBodySchema` -- acepta idioma opcional
- [x] `src/application/dtos/auth.dto.ts` -- `language?: AppPreferredLanguage` en `RegisterRequestDto` -- tipado DTO
- [x] `src/domain/repositories/user.repository.ts` -- `preferredLanguage?: string` en `CreateUserInput` -- contrato de creación
- [x] `src/infrastructure/database/supabase/user.repository.ts` -- `preferred_language = $12` (param) en INSERT de `create()`; añadir `input.preferredLanguage ?? 'es'` al array de params -- persiste idioma en registro
- [x] `src/application/use-cases/user/register-user.use-case.ts` -- `preferredLanguage: dto.language` en `create()`; `language: user.preferredLanguage` en `send()` -- aplica idioma desde registro
- [x] `src/application/use-cases/user/resend-verification.use-case.ts` -- `language: user.preferredLanguage` en `send()` -- reenvío en idioma del usuario
- [x] `src/application/use-cases/user/forgot-password.use-case.ts` -- `language: user.preferredLanguage` en `send()` -- reset en idioma
- [x] `src/application/use-cases/user/reset-password.use-case.ts` -- `language: user.preferredLanguage` en `send()` -- confirmación en idioma
- [x] `src/application/use-cases/item/request-item.use-case.ts` -- `language: donor.preferredLanguage` en `send()` -- notificación al donante en su idioma
- [x] `src/application/use-cases/item/select-receiver.use-case.ts` -- `language: receiver.preferredLanguage` en `send()` -- notificación al receptor en su idioma
- [x] `src/application/use-cases/item/cancel-item.use-case.ts` -- `language: receiver.preferredLanguage` en `send()` -- cancelación en idioma del receptor
- [x] `src/domain/repositories/item.repository.ts` -- añadir `donorPreferredLanguage: string` a `NewlyDegradedItem`; `preferredLanguage: string` a `DigestEligibleUser` -- interfaces para bulk
- [x] `src/domain/repositories/delivery-session.repository.ts` -- añadir `donorPreferredLanguage: string` a `ExpiredSessionForEmail` -- interfaz sesiones expiradas
- [x] `src/infrastructure/database/supabase/item.repository.ts` -- añadir `u.preferred_language AS donor_preferred_language` al SELECT de `findNewlyDegradedItems()`; `u.preferred_language` en `findEligibleDigestUsersForItem()` -- fetch idioma sin N+1
- [x] `src/infrastructure/database/supabase/delivery-session.repository.ts` -- añadir `u.preferred_language AS donor_preferred_language` al SELECT de `findExpiredSessions()` -- fetch idioma sesiones
- [x] `src/application/use-cases/item/degrade-inactive-items.use-case.ts` -- `language: item.donorPreferredLanguage` en `send()` -- degradación en idioma del donante
- [x] `src/application/use-cases/delivery/expire-delivery-sessions.use-case.ts` -- `language: session.donorPreferredLanguage` en `send()` -- expiración en idioma
- [x] `src/application/use-cases/jobs/send-nearby-items-digest.use-case.ts` -- añadir `preferredLanguage` a `NearbyDigestRecipient` (propagado desde `DigestEligibleUser`); `language: recipient.preferredLanguage` en `send()` -- digest por idioma
- [x] `tests/email-tpl-*.test.ts` y `tests/email-layout.test.ts` y `tests/email-templates.snap.test.ts` -- actualizar snapshots (`vitest --update-snapshots`); añadir ≥1 assertion en/ca por template -- cobertura multiidioma
- [x] `openapi/openapi.json` -- `npm run openapi:generate` -- contrato actualizado
- [x] `CHANGELOG.md` + `package.json` -- entrada `Added` + bump minor -- versionado

**Acceptance Criteria:**
- Given usuario con `preferredLanguage='en'`, when se envía cualquier email transaccional, then subject, cuerpo y botones están en inglés
- Given usuario con `preferredLanguage='ca'`, when se envía cualquier email, then el contenido está en catalán
- Given `language` omitido o desconocido en `MailPayload`, when el renderer procesa, then se usa español por defecto sin error
- Given `POST /api/auth/register { ..., language: 'en' }`, when se crea el usuario, then `preferredLanguage='en'` y TPL-009 se envía en inglés
- Given `POST /api/auth/register` sin `language`, when se crea el usuario, then `preferredLanguage='es'` y TPL-009 en español
- Given `npm run build`, when compila, then 0 errores TypeScript y OpenAPI regenerado

## Design Notes

**Patrón de traducciones por plantilla:**
```typescript
const TRANSLATIONS = {
  es: { subject: '...', preheader: '...', title: '...', body: ['...'], cta: '...' },
  ca: { ... },
  en: { ... },
} as const;
type Locale = keyof typeof TRANSLATIONS;
const t = (lang?: string) => TRANSLATIONS[(lang as Locale) ?? 'es'] ?? TRANSLATIONS.es;
```

**TPL-010 digest — plurales:** incluir `countSingular`, `countPlural` y `distanceLabel` en cada entrada de `TRANSLATIONS` para cubrir las variaciones gramaticales por idioma (p.ej. en inglés "1 new item" vs "3 new items", "~3 km from you").

**Bulk jobs:** `findNewlyDegradedItems`, `findExpiredSessions` y `findEligibleDigestUsersForItem` añaden `preferred_language` al SELECT desde el JOIN con `users` ya existente — no N+1 queries.

## Verification

**Commands:**
- `npm run build` -- expected: 0 errores TypeScript + OpenAPI generado sin diff inesperado
- `npx vitest run --reporter=verbose` -- expected: todos los tests pasan (snapshots actualizados)

### Review Findings

- [x] [Review][Patch] Tipos incorrectos — `MailPayload.language` y `RegisterRequestDto.language` deberían ser `AppPreferredLanguage`, no `string` [`src/domain/services/mail.service.ts:5`, `src/application/dtos/auth.dto.ts:9`]
- [x] [Review][Patch] `language ?? 'es'` no maneja string vacío — un `preferred_language = ''` en BD produce `<html lang="">` inválido; usar `language || 'es'` [`src/infrastructure/email/templates/layout/email-layout.ts:44`]
- [x] [Review][Patch] Tests i18n faltantes para TPL-002..010 — el spec exige ≥1 aserción en/ca por template; solo TPL-001 y email-layout tienen tests nuevos [`tests/email-tpl-002.test.ts`..`tests/email-tpl-010.test.ts`]
- [x] [Review][Patch] `auth-register.test.ts` no aserta propagación de `language` en el flujo de registro — los ACs de registro con idioma quedan sin cobertura de test [`tests/auth-register.test.ts`]
- [x] [Review][Patch] `openapi/openapi.json` no regenerado — el campo `language` en `POST /api/auth/register` no está en el contrato publicado [AC: "OpenAPI regenerado"]
- [x] [Review][Defer] Sin logging cuando locale es desconocido y hace fallback a 'es' — mejora de observabilidad futura — deferred, pre-existing
- [x] [Review][Defer] `preferred_language` podría ser NULL en BD para usuarios muy antiguos — interfaces TS dicen `string`; runtime es correcto por `??` pero tipos son imprecisos — deferred, pre-existing
- [x] [Review][Defer] `formatDeadlineAt` en TPL-003 no localiza formato de fecha — fechas siempre en formato ISO independiente del locale — deferred, pre-existing
- [x] [Review][Defer] `TRANSLATIONS` no tipadas contra `AppPreferredLanguage` — un locale futuro podría omitirse en algún template sin error TypeScript — deferred, pre-existing
- [x] [Review][Defer] TPL-010 puede enviar digest con 0 ítems al recipient — comportamiento pre-existente al i18n — deferred, pre-existing
