---
type: epic
title: "Canal de contacto del candidato (Correct Course 2026-05-31)"
parent: initiative-backend
status: done
covers: [R45, R46, R47, R48]
---

# Canal de contacto del candidato (Correct Course 2026-05-31)

## Description

El receptor proporciona su canal de contacto al postularse. Tras la selección, el donante puede iniciar la coordinación de forma proactiva sin depender del email al receptor. Referencia técnica: `docs/delta-candidato-contacto.md`.

## Outcome

El receptor proporciona su canal de contacto al postularse.

## Requirements

1. R45 (parent R45): El candidato debe proporcionar `contactChannel` al postularse (`POST /items/:id/requests`). El canal no se expone en `GET /items/:id/requests` (lista de candidatos).
2. R46 (parent R46): Tras selección, el donante recibe `receiverContactChannel` en `GET /delivery-sessions/:id` solo si es donante, la sesión está `active` y `receiver_contact_purged = FALSE` (SEC-002c).
3. R47 (parent R47): Al seleccionar receptor, copiar el canal del candidato a `delivery_sessions.receiver_contact_channel` y purgar `item_requests.contact_channel` (solicitud seleccionada y rechazadas) en la misma transacción atómica.
4. R48 (parent R48): El job `purge-contact-channel` debe purgar `contact_channel` y `receiver_contact_channel` (y ambos flags) a los 7 días de cierre de sesión.

## Constraints

Las que cita la épica en el archivo archivado.

## Done when

- Las historias de esta épica están entregadas.

## References

- parent — _bmad-output/initiative-backend/initiative-backend.md
- epics — _bmad-output/initiative-backend/archive-v6/epics.md

## Notes
