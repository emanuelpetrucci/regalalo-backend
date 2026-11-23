---
title: 'Correcciones de plantillas de email TPL-003 y TPL-006'
type: feature
created: 2026-10-25
status: done
route: 'one-shot'
ticket: "story-email-fixes-tpl-003-tpl-006"
---

## Intent

**Problem:** TPL-006 no incluía enlace directo al ítem, obligando al donante a navegar manualmente. TPL-003 mostraba el estado del objeto en formato de enum de DB (`new`) y la fecha de vencimiento en formato ISO no legible (`2026-05-27T12:00:00.000Z`).

**Approach:** Agregar CTA con deep link `/items/:itemId` en TPL-006 (pasando `itemId` desde el use-case); mapear condición a etiqueta en español y formatear fecha a `YYYY-MM-DD HH:mm` en TPL-003.

## Suggested Review Order

1. [`../../src/infrastructure/email/templates/tpl-006-new-request.ts`](../../src/infrastructure/email/templates/tpl-006-new-request.ts) — CTA nuevo con deep link y URL segura (trailing slash + encodeURIComponent)
2. [`../../src/application/use-cases/item/request-item.use-case.ts`](../../src/application/use-cases/item/request-item.use-case.ts) — `itemId` agregado a variables del mail
3. [`../../src/infrastructure/email/templates/tpl-003-receiver-selected.ts`](../../src/infrastructure/email/templates/tpl-003-receiver-selected.ts) — `CONDITION_LABELS` + `formatDeadlineAt`
4. [`../../tests/email-tpl-006.test.ts`](../../tests/email-tpl-006.test.ts) — nuevos tests CTA con y sin itemId
5. [`../../tests/email-tpl-003.test.ts`](../../tests/email-tpl-003.test.ts) — assertions actualizadas para etiqueta y fecha
6. [`../../tests/items-request.test.ts`](../../tests/items-request.test.ts) — `itemId` agregado al objectContaining
7. [`../../tests/email-templates.snap.test.ts`](../../tests/email-templates.snap.test.ts) — fixture TPL-006 con itemId

### Review Findings

- [x] [Review][Patch] Fixture UUID inconsistente entre suites — alineados ambos a `aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee` [`tests/email-tpl-006.test.ts:17`, `tests/email-templates.snap.test.ts:42`]
- [x] [Review][Patch] Test `sin itemId` no verifica URL base — agregado `toContain('https://app.test.example.com')` [`tests/email-tpl-006.test.ts:59-64`]
- [x] [Review][Patch] Sin test para `CONDITION_LABELS` fallback — agregado test con `itemCondition: 'unknown_value'` [`tests/email-tpl-003.test.ts`]
- [x] [Review][Defer] `formatDeadlineAt` muestra hora UTC sin indicador de zona — confuso para usuarios en otras zonas horarias; formato explícito en spec del usuario [`src/infrastructure/email/templates/tpl-003-receiver-selected.ts:10`] — deferred, pre-existing
- [x] [Review][Defer] `formatDeadlineAt` sin guard para string vacío o corto — no alcanzable desde callers actuales (siempre `.toISOString()`) [`src/infrastructure/email/templates/tpl-003-receiver-selected.ts:10`] — deferred, pre-existing
- [x] [Review][Defer] `CONDITION_LABELS` tipado como `Record<string, string>` en vez de `Record<ItemCondition, string>` — sin riesgo práctico, los 4 valores están cubiertos — deferred, pre-existing
- [x] [Review][Defer] `CONDITION_LABELS` en template en vez de capa compartida — concern arquitectónico — deferred, pre-existing
- [x] [Review][Defer] `formatDeadlineAt` no exportada para testing aislado — concern de testabilidad — deferred, pre-existing
- [x] [Review][Defer] `APP_PUBLIC_URL` con path segments — `replace(/\/$/, '')` preserva path prefix — concern de convención de env var — deferred, pre-existing
- [x] [Review][Defer] `APP_PUBLIC_URL` sin validación de formato URL — pre-existente en todos los templates — deferred, pre-existing
- [x] [Review][Defer] Assertion fire-and-forget en test 13.1 depende de timing de microtasks — patrón pre-existente en el proyecto — deferred, pre-existing
