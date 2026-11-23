---
type: epic
title: "Autenticación y Cuenta de Usuario"
parent: initiative-backend
status: done
covers: [R1, R2, R3, R4, R5, R6, R7, R35]
---

# Autenticación y Cuenta de Usuario

## Description

Los usuarios pueden registrarse, iniciar sesión, recuperar su contraseña y acceder a rutas protegidas con JWT. Esta épica incluye la inicialización del proyecto greenfield con estructura Clean Architecture, el schema completo de la base de datos y todos los middlewares globales.

## Outcome

Los usuarios pueden registrarse, iniciar sesión, recuperar su contraseña y acceder a rutas protegidas con JWT.

## Requirements

1. R1 (parent R1): El sistema debe permitir el registro de usuarios con email, contraseña y código postal. El registro requiere validación reCAPTCHA V3 (score ≥ 0.5).
2. R2 (parent R2): El sistema debe geocodificar el código postal del usuario al registrarse para obtener sus coordenadas geográficas (Nominatim + LRU Cache).
3. R3 (parent R3): El sistema debe emitir un JWT de 7 días al completar el registro y el login.
4. R4 (parent R4): El sistema debe permitir el inicio de sesión con email, contraseña y reCAPTCHA V3.
5. R5 (parent R5): El sistema debe permitir la recuperación de contraseña mediante email con enlace de expiración de 1 hora, respondiendo siempre HTTP 200 para evitar enumeración de usuarios.
6. R6 (parent R6): El sistema debe permitir el cambio de contraseña mediante token de recuperación, invalidando todos los JWT previos del usuario (jwt_version).
7. R7 (parent R7): El middleware de autenticación debe verificar que el claim `jwtVersion` del token coincide con el campo `jwt_version` del usuario en base de datos.
8. R35 (parent R35): El sistema debe enviar email de confirmación al completar el reset de contraseña (EVT-013 / TPL-008). El registro no dispara EVT-001 como email separado; la bienvenida forma parte del email de verificación (EVT-014 / TPL-009).

## Constraints

Las que cita la épica en el archivo archivado.

## Done when

- Las historias de esta épica están entregadas.

## References

- parent — _bmad-output/initiative-backend/initiative-backend.md
- epics — _bmad-output/initiative-backend/archive-v6/epics.md

## Notes

- Retrospective: epic-autenticacion-y-cuenta-de-usuario-retrospective.md
