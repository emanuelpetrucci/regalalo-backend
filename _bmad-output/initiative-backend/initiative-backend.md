---
type: initiative
title: "backend"
status: in-progress
sources: [_bmad-output/initiative-backend/archive-v6/epics.md]
companions: [_bmad-output/initiative-backend/ux-design-specification/ux-design-specification.md]
---

# backend

## Description

Este documento contiene el desglose completo de épicas e historias para el backend de "Regálalo", descomponiendo los requisitos del PRD, la Arquitectura Técnica y el Mapeo de Emails en historias implementables.

## Outcome

Este documento contiene el desglose completo de épicas e historias para el backend de "Regálalo", descomponiendo los requisitos del PRD, la Arquitectura Técnica y el Mapeo de Emails en historias implementables.

## Requirements

1. R1 (FR1): El sistema debe permitir el registro de usuarios con email, contraseña y código postal. El registro requiere validación reCAPTCHA V3 (score ≥ 0.5).
2. R2 (FR2): El sistema debe geocodificar el código postal del usuario al registrarse para obtener sus coordenadas geográficas (Nominatim + LRU Cache).
3. R3 (FR3): El sistema debe emitir un JWT de 7 días al completar el registro y el login.
4. R4 (FR4): El sistema debe permitir el inicio de sesión con email, contraseña y reCAPTCHA V3.
5. R5 (FR5): El sistema debe permitir la recuperación de contraseña mediante email con enlace de expiración de 1 hora, respondiendo siempre HTTP 200 para evitar enumeración de usuarios.
6. R6 (FR6): El sistema debe permitir el cambio de contraseña mediante token de recuperación, invalidando todos los JWT previos del usuario (jwt_version).
7. R7 (FR7): El middleware de autenticación debe verificar que el claim `jwtVersion` del token coincide con el campo `jwt_version` del usuario en base de datos.
8. R8 (FR8): El sistema debe permitir a los usuarios autenticados publicar objetos con título, descripción, condición, categoría (`category`), rango de peso (`weightRange`), ubicación propia (código postal geocodificado) y hasta 5 imágenes.
9. R9 (FR9): El sistema debe listar objetos activos dentro de un radio de 50 km del usuario autenticado, con paginación (page/limit), ordenando objetos degradados al final.
10. R10 (FR10): El sistema debe exponer el detalle de un objeto específico (título, descripción, condición, estado, distancia, imágenes, reputación del donante).
11. R11 (FR11): El sistema debe permitir al donante cancelar su propio objeto. Si existe sesión activa, cancelarla y notificar al receptor por email (EVT-005).
12. R12 (FR12): El sistema debe permitir a los receptores solicitar un objeto, verificando: no ser el propio donante, no tener solicitud duplicada, no haber superado el límite de 3 solicitudes en ventana deslizante de 720 horas. La verificación de límite y la inserción se ejecutan en transacción SERIALIZABLE. Al solicitar, notificar al donante por email (EVT-006).
13. R13 (FR13): El sistema debe impedir solicitudes en objetos con `requests_paused = TRUE`, retornando 409.
14. R14 (FR14): El donante debe poder activar/desactivar el flag `requests_paused` en su objeto mediante `PATCH /items/:id/pause`.
15. R15 (FR15): El sistema debe presentar al donante la lista de candidatos rankeados para su objeto (solo accesible por el donante).
16. R16 (FR16): El ranking debe ordenar candidatos por: (1) score efectivo descendente, (2) distancia ascendente, (3) antigüedad de solicitud ascendente. El score efectivo incluye perturbación aleatoria ±2 puntos.
17. R17 (FR17): El ranking debe excluir usuarios pasivos (total_donated = 0 AND total_received > 0 AND last_active_at < NOW() - 60 días).
18. R18 (FR18): El ranking debe aplicar control de acaparador en dos niveles sobre usuarios que nunca han donado (total_donated = 0): Tier 1 — si cycles_at_limit >= 1, penalización de -15 sobre score efectivo (candidato visible); Tier 2 — si cycles_at_limit >= 2, exclusión del listado de candidatos y de requestCount; rehabilitación inmediata al completar al menos una donación (total_donated >= 1). Referencia: `docs/ranking-spec-v1.0.md` (Correct Course 2026-05-29).
19. R19 (FR19): El donante debe poder seleccionar un receptor proporcionando su canal de contacto externo. Al seleccionar: crear sesión activa con deadline 7 días, marcar solicitud ganadora como `selected`, rechazar las demás, poner objeto en `reserved`. Notificar al receptor (EVT-003).
20. R20 (FR20): El canal de contacto debe incluirse en la respuesta de `GET /delivery-sessions/:id` únicamente si el solicitante es el receptor, la sesión está activa y `contact_purged = FALSE`. El donante nunca recibe el campo.
21. R21 (FR21): El donante debe poder confirmar la entrega completada. Al confirmar (transacción atómica): status = 'completed'; donante +15 si primera donación histórica (total_donated prev = 0), si no +10; receptor +1; total_donated++ donante, total_received++ receptor, consecutive_no_shows = 0 ambos; dos eventos en reputation_events (delivery_completed) con role y delta distintos. Referencia: `docs/ranking-spec-v1.0.md`.
22. R22 (FR22): El donante debe poder cancelar la sesión de entrega con opción de declarar no-show. Si no-show: consecutive_no_shows++ receptor, delta = -10 × consecutive_no_shows, registro en reputation_events con role = 'receiver'. El objeto vuelve a `active`.
23. R23 (FR23): Las sesiones de entrega deben cerrarse automáticamente (expired) al vencer el deadline de 7 días (job pg_cron). El objeto vuelve a `active`. Sin penalización. Notificar al donante (EVT-004).
24. R24 (FR24): Los objetos sin selección de receptor tras 7 días deben degradarse (campo degraded_at establecido por job pg_cron). Al degradarse, notificar al donante (EVT-012).
25. R25 (FR25): Las imágenes de objetos en `completed` o `cancelled` deben purgarse a los 30 días del cambio de estado (job pg_cron). El borrado físico en Supabase Storage se gestiona mediante trigger + tabla `storage_deletion_queue` + polling del adaptador.
26. R26 (FR26): El canal de contacto debe purgarse (NULL) a los 7 días de que la sesión alcance estado `completed`, `cancelled` o `expired` (job pg_cron).
27. R27 (FR27): El contador `cycles_at_limit` debe incrementarse una vez por ciclo de 30 días si el usuario agotó su límite (job pg_cron, con protección de doble incremento via `last_cycle_incremented_at`).
28. R28 (FR28): El sistema debe exponer el perfil privado del usuario autenticado: `GET /users/me`.
29. R29 (FR29): El sistema debe exponer el historial de eventos de reputación del usuario autenticado: `GET /users/me/reputation-history`.
30. R30 (FR30): El sistema debe exponer las sesiones de entrega del usuario autenticado con filtros por rol y estado: `GET /users/me/delivery-sessions`.
31. R31 (FR31): El sistema debe exponer los objetos publicados por el usuario autenticado con filtros por estado: `GET /users/me/items`.
32. R32 (FR32): El sistema debe exponer las solicitudes realizadas por el usuario autenticado con filtros por estado: `GET /users/me/requests`.
33. R33 (FR33): El sistema debe exponer el perfil público de un usuario (sin email, sin consecutive_no_shows): `GET /users/:id`.
34. R34 (FR34): Los repositorios que devuelvan imágenes deben verificar si el objeto cumple `status IN ('completed','cancelled') AND completed_at < NOW() - 30 días`; en ese caso retornar `images: []` aunque el job no haya ejecutado aún.
35. R35 (FR35): El sistema debe enviar email de confirmación al completar el reset de contraseña (EVT-013 / TPL-008). El registro no dispara EVT-001 como email separado; la bienvenida forma parte del email de verificación (EVT-014 / TPL-009).
36. R36 (FR36): El registro debe requerir `firstName` y `lastName` (2–50 caracteres, letras Unicode). `phone` es opcional.
37. R37 (FR37): `GET /users/me` debe exponer identidad, avatar, teléfono, `emailVerified` y `preferredLanguage`. `phone` no aparece en perfiles públicos.
38. R38 (FR38): `GET /users/:id` debe exponer `firstName`, `lastName` y `avatarUrl` además de reputación y estadísticas.
39. R39 (FR39): `PATCH /users/me` permite actualización parcial; cambio de `postalCode` re-geocodifica, incrementa `jwt_version` y rechaza CP inválido con 400 atómico.
40. R40 (FR40): El middleware de autenticación debe rechazar usuarios con `is_active = FALSE` (HTTP 401). El campo nunca se expone en DTOs.
41. R41 (FR41): El sistema debe persistir `category` y `weight_range` en cada ítem con CHECK en BD y validación Zod en la API de publicación (valores según `docs/prd-analytics.md` §4).
42. R42 (FR42): El sistema debe emitir eventos de analítica (catálogo AE-001…AE-031) tras commit exitoso, con loggers `app`/`analytics` separados, `userId` hasheado y sin PII en `properties` (ver `docs/prd-analytics.md`).
43. R43 (FR47): El sistema debe enviar un digest horario por email (EVT-015 / TPL-010) a usuarios activos con email verificado dentro de 50 km de objetos `active` publicados en la última hora, excluyendo al donante; un email por usuario; cron externo sobre `POST /api/jobs/nearby-items-digest` protegido por `CRON_SECRET`.
44. R44 (FR48): Alineación ranking y reputación v1.0 según `docs/ranking-spec-v1.0.md` (RFC-001 a RFC-004, MIGR-001) en código, tests y documentación.
45. R45 (FR49): El candidato debe proporcionar `contactChannel` al postularse (`POST /items/:id/requests`). El canal no se expone en `GET /items/:id/requests` (lista de candidatos).
46. R46 (FR50): Tras selección, el donante recibe `receiverContactChannel` en `GET /delivery-sessions/:id` solo si es donante, la sesión está `active` y `receiver_contact_purged = FALSE` (SEC-002c).
47. R47 (FR51): Al seleccionar receptor, copiar el canal del candidato a `delivery_sessions.receiver_contact_channel` y purgar `item_requests.contact_channel` (solicitud seleccionada y rechazadas) en la misma transacción atómica.
48. R48 (FR52): El job `purge-contact-channel` debe purgar `contact_channel` y `receiver_contact_channel` (y ambos flags) a los 7 días de cierre de sesión.
49. R49 (FR53): El sistema debe autenticar administradores con tabla `admin_users` independiente, password Argon2 + OTP de 6 dígitos por email (Resend), y emitir JWT de 8 horas firmado con `ADMIN_JWT_SECRET` separado del JWT de usuarios. No existe endpoint de registro; la cuenta se crea manualmente.
50. R50 (FR54): El sistema debe permitir al administrador autenticado gestionar usuarios: buscar con filtros, ver perfil completo, suspender (cascada: jwt_version++, objetos activos pausados con paused_by_admin), reactivar (solo revierte pausas de origen admin), forzar verificación de email, corregir reputación con delta y razón, y resetear contador de no-shows.
51. R51 (FR55): El sistema debe permitir al administrador gestionar objetos: buscar con filtros, ver detalle con solicitudes y sesión activa, cancelar objetos activos/reservados (reutilizando lógica de CancelItem), y reactivar objetos cancelados.
52. R52 (FR56): El sistema debe permitir al administrador gestionar sesiones de entrega: listar con filtros, ver detalle con registro de acceso a contactChannel en audit log, y forzar expiración de sesiones activas.
53. R53 (FR57): El sistema debe exponer una cola de reportes al administrador: listar paginado con filtros, ver detalle completo con contexto de moderación, y resolver con acción (`archive`, `warn_user`, `cancel_item`, `suspend_user`) y nota obligatoria. Implementado en Épica 14 (PRD-REP-BE-01).
54. R54 (FR58): El sistema debe exponer métricas operativas al administrador: totales de usuarios (activos, suspendidos, no verificados >24h, pasivos, acaparadores), objetos por estado, sesiones (últimos 30 días), tasa de no-shows y contadores de reportes (pending, resolvedLast30Days, archivedLast30Days).
55. R55 (FR59): El sistema debe exponer el estado del sistema al administrador: últimas ejecuciones de jobs pg_cron, cola de borrado de Storage pendiente y usuarios sin verificar >24h.
56. R56 (FR60): Toda acción del administrador debe registrarse en `admin_audit_log` con admin_user_id, action, entity_type, entity_id, payload_snapshot e ip_address. Retención indefinida en MVP.
57. R57 (FR61): El sistema debe permitir a usuarios autenticados con email verificado reportar objetos o perfiles de usuario via `POST /api/reports`, con reCAPTCHA V3 (score ≥ 0.5), validación de auto-reporte y entidad reportable.
58. R58 (FR62): El sistema debe capturar snapshot del contenido reportado (título/estado para items; nombre/reputación para usuarios) en el momento del INSERT, independiente del estado futuro de la entidad.
59. R59 (FR63): El sistema debe aplicar prevención de duplicados activos (409 si ya existe reporte pendiente del mismo usuario sobre la misma entidad) y límites anti-spam: 3 reportes sobre la misma entidad en 24h (429) y 10 reportes totales en 7 días (429).
60. R60 (FR64): El sistema debe enviar tres flujos de email al módulo de reportes: confirmación al denunciante (TPL-011), resolución genérica al denunciante (TPL-012) y advertencia al denunciado solo en acción `warn_user` (TPL-013). Notificación al operador en cada nuevo reporte (TPL-ADM-002).
61. R61 (FR65): El sistema debe anonimizar `reporter_id` mensualmente en reportes cerrados con más de 2 años de antigüedad via job pg_cron (RGPD — D-REP-07).
62. R62 (FR66): El sistema debe emitir dos eventos analíticos del módulo de reportes: `report.submitted` (AE-032) tras creación exitosa y `report.resolved` (AE-033) tras resolución, ambos fire-and-forget post-commit.

## Constraints

Las restricciones de diseño siguen en el desglose archivado y en `docs/`.

## Done when

- Las épicas listadas están entregadas.
- El árbol de tickets refleja el sprint v6.

## References

- epics — _bmad-output/initiative-backend/archive-v6/epics.md
- companion — _bmad-output/initiative-backend/ux-design-specification/ux-design-specification.md

## Notes

- Decision: 2026-10-25 — el almacén se queda en este repositorio.
- Decision: 2026-10-25 — las specs sin número van a backlog.
