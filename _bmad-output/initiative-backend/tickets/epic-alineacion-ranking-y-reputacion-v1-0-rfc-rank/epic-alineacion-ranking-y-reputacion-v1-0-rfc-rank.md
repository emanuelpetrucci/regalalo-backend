---
type: epic
title: "Alineación ranking y reputación v1.0 (RFC-RANK)"
parent: initiative-backend
status: done
covers: [R18, R21, R22, R44]
---

# Alineación ranking y reputación v1.0 (RFC-RANK)

## Description

Alinear código y documentación con `docs/ranking-spec-v1.0.md` (aprobado 2026-05-29). Las historias 3.2, 3.3, 4.3 y 4.4 permanecen como registro del MVP; esta épica supersede sus criterios de ranking/reputación.

## Outcome

Alinear código y documentación con `docs/ranking-spec-v1.

## Requirements

1. R18 (parent R18): El ranking debe aplicar control de acaparador en dos niveles sobre usuarios que nunca han donado (total_donated = 0): Tier 1 — si cycles_at_limit >= 1, penalización de -15 sobre score efectivo (candidato visible); Tier 2 — si cycles_at_limit >= 2, exclusión del listado de candidatos y de requestCount; rehabilitación inmediata al completar al menos una donación (total_donated >= 1). Referencia: `docs/ranking-spec-v1.0.md` (Correct Course 2026-05-29).
2. R21 (parent R21): El donante debe poder confirmar la entrega completada. Al confirmar (transacción atómica): status = 'completed'; donante +15 si primera donación histórica (total_donated prev = 0), si no +10; receptor +1; total_donated++ donante, total_received++ receptor, consecutive_no_shows = 0 ambos; dos eventos en reputation_events (delivery_completed) con role y delta distintos. Referencia: `docs/ranking-spec-v1.0.md`.
3. R22 (parent R22): El donante debe poder cancelar la sesión de entrega con opción de declarar no-show. Si no-show: consecutive_no_shows++ receptor, delta = -10 × consecutive_no_shows, registro en reputation_events con role = 'receiver'. El objeto vuelve a `active`.
4. R44 (parent R44): Alineación ranking y reputación v1.0 según `docs/ranking-spec-v1.0.md` (RFC-001 a RFC-004, MIGR-001) en código, tests y documentación.

## Constraints

Las que cita la épica en el archivo archivado.

## Done when

- Las historias de esta épica están entregadas.

## References

- parent — _bmad-output/initiative-backend/initiative-backend.md
- epics — _bmad-output/initiative-backend/archive-v6/epics.md

## Notes
