---
type: epic
title: "Ampliación del Modelo de Usuario (DLT-003)"
parent: initiative-backend
status: done
covers: [R36, R37, R38, R39, R40]
---

# Ampliación del Modelo de Usuario (DLT-003)

## Description

Delta de diseño DLT-003 incorporado en `docs/architecture.md` v1.3. Esta épica alinea código y OpenAPI con el contrato ampliado sin reabrir épicas 1 y 5 ya completadas en v1.2.

## Outcome

Delta de diseño DLT-003 incorporado en `docs/architecture.

## Requirements

1. R36 (parent R36): El registro debe requerir `firstName` y `lastName` (2–50 caracteres, letras Unicode). `phone` es opcional.
2. R37 (parent R37): `GET /users/me` debe exponer identidad, avatar, teléfono, `emailVerified` y `preferredLanguage`. `phone` no aparece en perfiles públicos.
3. R38 (parent R38): `GET /users/:id` debe exponer `firstName`, `lastName` y `avatarUrl` además de reputación y estadísticas.
4. R39 (parent R39): `PATCH /users/me` permite actualización parcial; cambio de `postalCode` re-geocodifica, incrementa `jwt_version` y rechaza CP inválido con 400 atómico.
5. R40 (parent R40): El middleware de autenticación debe rechazar usuarios con `is_active = FALSE` (HTTP 401). El campo nunca se expone en DTOs.

## Constraints

Las que cita la épica en el archivo archivado.

## Done when

- Las historias de esta épica están entregadas.

## References

- parent — _bmad-output/initiative-backend/initiative-backend.md
- epics — _bmad-output/initiative-backend/archive-v6/epics.md

## Notes

- Retrospective: epic-ampliacion-del-modelo-de-usuario-dlt-003-retrospective.md
