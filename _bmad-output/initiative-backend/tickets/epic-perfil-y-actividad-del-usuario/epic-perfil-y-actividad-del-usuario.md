---
type: epic
title: "Perfil y Actividad del Usuario"
parent: initiative-backend
status: done
covers: [R28, R29, R30, R31, R32, R33]
---

# Perfil y Actividad del Usuario

## Description

Los usuarios pueden consultar su perfil privado, historial de reputación, sesiones de entrega, objetos publicados, solicitudes realizadas y el perfil público de otros usuarios.

## Outcome

Los usuarios pueden consultar su perfil privado, historial de reputación, sesiones de entrega, objetos publicados, solicitudes realizadas y el perfil público de otros usuarios.

## Requirements

1. R28 (parent R28): El sistema debe exponer el perfil privado del usuario autenticado: `GET /users/me`.
2. R29 (parent R29): El sistema debe exponer el historial de eventos de reputación del usuario autenticado: `GET /users/me/reputation-history`.
3. R30 (parent R30): El sistema debe exponer las sesiones de entrega del usuario autenticado con filtros por rol y estado: `GET /users/me/delivery-sessions`.
4. R31 (parent R31): El sistema debe exponer los objetos publicados por el usuario autenticado con filtros por estado: `GET /users/me/items`.
5. R32 (parent R32): El sistema debe exponer las solicitudes realizadas por el usuario autenticado con filtros por estado: `GET /users/me/requests`.
6. R33 (parent R33): El sistema debe exponer el perfil público de un usuario (sin email, sin consecutive_no_shows): `GET /users/:id`.

## Constraints

Las que cita la épica en el archivo archivado.

## Done when

- Las historias de esta épica están entregadas.

## References

- parent — _bmad-output/initiative-backend/initiative-backend.md
- epics — _bmad-output/initiative-backend/archive-v6/epics.md

## Notes

- Retrospective: epic-perfil-y-actividad-del-usuario-retrospective.md
