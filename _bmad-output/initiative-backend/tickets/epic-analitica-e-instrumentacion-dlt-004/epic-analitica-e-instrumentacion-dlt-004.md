---
type: epic
title: "Analítica e Instrumentación (DLT-004)"
parent: initiative-backend
status: done
covers: [R41, R42]
---

# Analítica e Instrumentación (DLT-004)

## Description

Delta de diseño DLT-004 incorporado en `docs/architecture.md` v1.4 y `docs/prd-analytics.md`. Esta épica alinea schema de `items`, API de publicación, loggers y catálogo AE sin reabrir épicas 1–5 ya completadas.

## Outcome

Delta de diseño DLT-004 incorporado en `docs/architecture.

## Requirements

1. R41 (parent R41): El sistema debe persistir `category` y `weight_range` en cada ítem con CHECK en BD y validación Zod en la API de publicación (valores según `docs/prd-analytics.md` §4).
2. R42 (parent R42): El sistema debe emitir eventos de analítica (catálogo AE-001…AE-031) tras commit exitoso, con loggers `app`/`analytics` separados, `userId` hasheado y sin PII en `properties` (ver `docs/prd-analytics.md`).

## Constraints

Las que cita la épica en el archivo archivado.

## Done when

- Las historias de esta épica están entregadas.

## References

- parent — _bmad-output/initiative-backend/initiative-backend.md
- epics — _bmad-output/initiative-backend/archive-v6/epics.md

## Notes

- Retrospective: epic-analitica-e-instrumentacion-dlt-004-retrospective.md
