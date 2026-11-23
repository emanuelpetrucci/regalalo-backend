---
type: epic
title: "Digest de proximidad y jobs HTTP"
parent: initiative-backend
status: done
covers: [R43]
---

# Digest de proximidad y jobs HTTP

## Description

Usuarios activos con email verificado reciben un resumen horario de objetos nuevos publicados a ≤50 km. Cron externo invoca el backend; sin opt-out en MVP.

**Referencia:** `docs/architecture.md` v1.6 §7.6, `docs/email-flow-mapping.md` v1.4 EVT-015.

## Outcome

Usuarios activos con email verificado reciben un resumen horario de objetos nuevos publicados a ≤50 km.

## Requirements

1. R43 (parent R43): El sistema debe enviar un digest horario por email (EVT-015 / TPL-010) a usuarios activos con email verificado dentro de 50 km de objetos `active` publicados en la última hora, excluyendo al donante; un email por usuario; cron externo sobre `POST /api/jobs/nearby-items-digest` protegido por `CRON_SECRET`.

## Constraints

Las que cita la épica en el archivo archivado.

## Done when

- Las historias de esta épica están entregadas.

## References

- parent — _bmad-output/initiative-backend/initiative-backend.md
- epics — _bmad-output/initiative-backend/archive-v6/epics.md

## Notes
