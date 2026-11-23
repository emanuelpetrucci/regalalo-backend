---
title: 'Fix: alinear etiquetas de condición de ítem en emails con el frontend'
type: bugfix
created: 2026-10-25
status: done
route: 'one-shot'
ticket: "story-fix-email-condition-labels"
---

## Intent

**Problem:** Los labels de condición de ítem en los emails (`nuevo`, `estado regular`) diferían de los del frontend (`a estrenar`, `aceptable`), generando inconsistencia en la terminología que percibe el usuario.

**Approach:** Actualizar `CONDITION_LABELS` en `condition-labels.ts` para usar la misma terminología que el frontend (fuente de verdad), manteniendo los valores en minúscula para respetar el uso inline en TPL-003 y delegar la capitalización a `formatConditionLabelDisplay` en TPL-010.

## Suggested Review Order

1. [`src/infrastructure/email/templates/condition-labels.ts`](../../src/infrastructure/email/templates/condition-labels.ts) — mapa de labels actualizado (`new` → "a estrenar", `fair` → "aceptable")
2. [`src/infrastructure/email/templates/tpl-003-receiver-selected.ts`](../../src/infrastructure/email/templates/tpl-003-receiver-selected.ts) — usa el label inline: `«título» (condición)` — verificar coherencia gramatical
3. [`src/infrastructure/email/templates/tpl-010-nearby-items-digest.ts`](../../src/infrastructure/email/templates/tpl-010-nearby-items-digest.ts) — usa `formatConditionLabelDisplay` que capitaliza — verificar output correcto

## Code Map

- `src/infrastructure/email/templates/condition-labels.ts` -- mapa `CONDITION_LABELS` + `formatConditionLabelDisplay`
- `src/infrastructure/email/templates/tpl-003-receiver-selected.ts` -- usa label inline en oración
- `src/infrastructure/email/templates/tpl-010-nearby-items-digest.ts` -- usa `formatConditionLabelDisplay` (capitaliza primer carácter)

## Tasks & Acceptance

**Execution:**
- [x] `src/infrastructure/email/templates/condition-labels.ts` -- actualizar `new: 'nuevo'` → `'a estrenar'` y `fair: 'estado regular'` → `'aceptable'`

**Acceptance Criteria:**
- Dado un ítem con `condition: 'new'`, cuando se renderiza TPL-003, entonces el email muestra "(a estrenar)"
- Dado un ítem con `condition: 'fair'`, cuando se renderiza TPL-003, entonces el email muestra "(aceptable)"
- Dado un ítem con `condition: 'new'`, cuando se renderiza TPL-010, entonces el label muestra "A estrenar" (capitalizado por `formatConditionLabelDisplay`)
- Dado un ítem con `condition: 'fair'`, cuando se renderiza TPL-010, entonces el label muestra "Aceptable"

## Spec Change Log

## Design Notes

La decisión de mantener los valores en minúscula en el mapa es intencional: TPL-003 los embebe inline en oraciones españolas donde la capitalización mid-sentence es gramaticalmente incorrecta, mientras que TPL-010 delega la capitalización a `formatConditionLabelDisplay`. El frontend usa los mismos términos capitalizados para chips standalone — ambas representaciones son consistentes en semántica, difieren solo en presentación contextual.
