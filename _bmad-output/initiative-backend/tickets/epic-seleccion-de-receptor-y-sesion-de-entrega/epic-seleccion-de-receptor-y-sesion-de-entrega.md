---
type: epic
title: "Selección de Receptor y Sesión de Entrega"
parent: initiative-backend
status: done
covers: [R19, R20, R21, R22, R23, R26]
---

# Selección de Receptor y Sesión de Entrega

## Description

El donante selecciona al receptor proporcionando su canal de contacto, gestiona la sesión de entrega (confirmar, cancelar, declarar no-show) y las sesiones expiran automáticamente. Se completa también la lógica de cancelación de objeto con sesión activa.

## Outcome

El donante selecciona al receptor proporcionando su canal de contacto, gestiona la sesión de entrega (confirmar, cancelar, declarar no-show) y las sesiones expiran automáticamente.

## Requirements

1. R19 (parent R19): El donante debe poder seleccionar un receptor proporcionando su canal de contacto externo. Al seleccionar: crear sesión activa con deadline 7 días, marcar solicitud ganadora como `selected`, rechazar las demás, poner objeto en `reserved`. Notificar al receptor (EVT-003).
2. R20 (parent R20): El canal de contacto debe incluirse en la respuesta de `GET /delivery-sessions/:id` únicamente si el solicitante es el receptor, la sesión está activa y `contact_purged = FALSE`. El donante nunca recibe el campo.
3. R21 (parent R21): El donante debe poder confirmar la entrega completada. Al confirmar (transacción atómica): status = 'completed'; donante +15 si primera donación histórica (total_donated prev = 0), si no +10; receptor +1; total_donated++ donante, total_received++ receptor, consecutive_no_shows = 0 ambos; dos eventos en reputation_events (delivery_completed) con role y delta distintos. Referencia: `docs/ranking-spec-v1.0.md`.
4. R22 (parent R22): El donante debe poder cancelar la sesión de entrega con opción de declarar no-show. Si no-show: consecutive_no_shows++ receptor, delta = -10 × consecutive_no_shows, registro en reputation_events con role = 'receiver'. El objeto vuelve a `active`.
5. R23 (parent R23): Las sesiones de entrega deben cerrarse automáticamente (expired) al vencer el deadline de 7 días (job pg_cron). El objeto vuelve a `active`. Sin penalización. Notificar al donante (EVT-004).
6. R26 (parent R26): El canal de contacto debe purgarse (NULL) a los 7 días de que la sesión alcance estado `completed`, `cancelled` o `expired` (job pg_cron).

## Constraints

Las que cita la épica en el archivo archivado.

## Done when

- Las historias de esta épica están entregadas.

## References

- parent — _bmad-output/initiative-backend/initiative-backend.md
- epics — _bmad-output/initiative-backend/archive-v6/epics.md

## Notes

- Retrospective: epic-seleccion-de-receptor-y-sesion-de-entrega-retrospective.md
