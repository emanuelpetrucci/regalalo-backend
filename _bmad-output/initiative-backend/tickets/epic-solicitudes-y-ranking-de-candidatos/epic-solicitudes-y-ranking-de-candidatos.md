---
type: epic
title: "Solicitudes y Ranking de Candidatos"
parent: initiative-backend
status: done
covers: [R12, R15, R16, R17, R18, R27]
---

# Solicitudes y Ranking de Candidatos

## Description

Los receptores pueden solicitar objetos respetando el límite de 3 cada 30 días. Los donantes ven la lista de candidatos rankeada por reputación efectiva, distancia y antigüedad. El sistema excluye usuarios pasivos, penaliza acaparadores e incrementa `cycles_at_limit` automáticamente.

## Outcome

Los receptores pueden solicitar objetos respetando el límite de 3 cada 30 días.

## Requirements

1. R12 (parent R12): El sistema debe permitir a los receptores solicitar un objeto, verificando: no ser el propio donante, no tener solicitud duplicada, no haber superado el límite de 3 solicitudes en ventana deslizante de 720 horas. La verificación de límite y la inserción se ejecutan en transacción SERIALIZABLE. Al solicitar, notificar al donante por email (EVT-006).
2. R15 (parent R15): El sistema debe presentar al donante la lista de candidatos rankeados para su objeto (solo accesible por el donante).
3. R16 (parent R16): El ranking debe ordenar candidatos por: (1) score efectivo descendente, (2) distancia ascendente, (3) antigüedad de solicitud ascendente. El score efectivo incluye perturbación aleatoria ±2 puntos.
4. R17 (parent R17): El ranking debe excluir usuarios pasivos (total_donated = 0 AND total_received > 0 AND last_active_at < NOW() - 60 días).
5. R18 (parent R18): El ranking debe aplicar control de acaparador en dos niveles sobre usuarios que nunca han donado (total_donated = 0): Tier 1 — si cycles_at_limit >= 1, penalización de -15 sobre score efectivo (candidato visible); Tier 2 — si cycles_at_limit >= 2, exclusión del listado de candidatos y de requestCount; rehabilitación inmediata al completar al menos una donación (total_donated >= 1). Referencia: `docs/ranking-spec-v1.0.md` (Correct Course 2026-05-29).
6. R27 (parent R27): El contador `cycles_at_limit` debe incrementarse una vez por ciclo de 30 días si el usuario agotó su límite (job pg_cron, con protección de doble incremento via `last_cycle_incremented_at`).

## Constraints

Las que cita la épica en el archivo archivado.

## Done when

- Las historias de esta épica están entregadas.

## References

- parent — _bmad-output/initiative-backend/initiative-backend.md
- epics — _bmad-output/initiative-backend/archive-v6/epics.md

## Notes

- Retrospective: epic-solicitudes-y-ranking-de-candidatos-retrospective.md
