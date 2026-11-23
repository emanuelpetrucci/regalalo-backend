---
stepsCompleted: ["step-01", "step-02", "step-03", "step-04"]
inputDocuments:
  - docs/prd.md
  - docs/architecture.md
  - docs/email-flow-mapping.md
  - docs/technical-design-frontend.md
  - docs/delta-backend.md
  - docs/delta-backend-DLT-003.md
  - docs/delta-backend-DLT-004.md
  - docs/delta-backend-email-verification.md
  - docs/delta-email-flow-verification.md
  - docs/prd-analytics.md
  - docs/delta-candidato-contacto.md
---

# Regálalo — Desglose de Épicas e Historias

## Visión general

Este documento contiene el desglose completo de épicas e historias para el backend de "Regálalo", descomponiendo los requisitos del PRD, la Arquitectura Técnica y el Mapeo de Emails en historias implementables.

## Inventario de Requisitos

### Requisitos Funcionales

FR1: El sistema debe permitir el registro de usuarios con email, contraseña y código postal. El registro requiere validación reCAPTCHA V3 (score ≥ 0.5).
FR2: El sistema debe geocodificar el código postal del usuario al registrarse para obtener sus coordenadas geográficas (Nominatim + LRU Cache).
FR3: El sistema debe emitir un JWT de 7 días al completar el registro y el login.
FR4: El sistema debe permitir el inicio de sesión con email, contraseña y reCAPTCHA V3.
FR5: El sistema debe permitir la recuperación de contraseña mediante email con enlace de expiración de 1 hora, respondiendo siempre HTTP 200 para evitar enumeración de usuarios.
FR6: El sistema debe permitir el cambio de contraseña mediante token de recuperación, invalidando todos los JWT previos del usuario (jwt_version).
FR7: El middleware de autenticación debe verificar que el claim `jwtVersion` del token coincide con el campo `jwt_version` del usuario en base de datos.
FR8: El sistema debe permitir a los usuarios autenticados publicar objetos con título, descripción, condición, categoría (`category`), rango de peso (`weightRange`), ubicación propia (código postal geocodificado) y hasta 5 imágenes.
FR9: El sistema debe listar objetos activos dentro de un radio de 50 km del usuario autenticado, con paginación (page/limit), ordenando objetos degradados al final.
FR10: El sistema debe exponer el detalle de un objeto específico (título, descripción, condición, estado, distancia, imágenes, reputación del donante).
FR11: El sistema debe permitir al donante cancelar su propio objeto. Si existe sesión activa, cancelarla y notificar al receptor por email (EVT-005).
FR12: El sistema debe permitir a los receptores solicitar un objeto, verificando: no ser el propio donante, no tener solicitud duplicada, no haber superado el límite de 3 solicitudes en ventana deslizante de 720 horas. La verificación de límite y la inserción se ejecutan en transacción SERIALIZABLE. Al solicitar, notificar al donante por email (EVT-006).
FR13: El sistema debe impedir solicitudes en objetos con `requests_paused = TRUE`, retornando 409.
FR14: El donante debe poder activar/desactivar el flag `requests_paused` en su objeto mediante `PATCH /items/:id/pause`.
FR15: El sistema debe presentar al donante la lista de candidatos rankeados para su objeto (solo accesible por el donante).
FR16: El ranking debe ordenar candidatos por: (1) score efectivo descendente, (2) distancia ascendente, (3) antigüedad de solicitud ascendente. El score efectivo incluye perturbación aleatoria ±2 puntos.
FR17: El ranking debe excluir usuarios pasivos (total_donated = 0 AND total_received > 0 AND last_active_at < NOW() - 60 días).
FR18: El ranking debe aplicar control de acaparador en dos niveles sobre usuarios que nunca han donado (total_donated = 0): Tier 1 — si cycles_at_limit >= 1, penalización de -15 sobre score efectivo (candidato visible); Tier 2 — si cycles_at_limit >= 2, exclusión del listado de candidatos y de requestCount; rehabilitación inmediata al completar al menos una donación (total_donated >= 1). Referencia: `docs/ranking-spec-v1.0.md` (Correct Course 2026-05-29).
FR19: El donante debe poder seleccionar un receptor proporcionando su canal de contacto externo. Al seleccionar: crear sesión activa con deadline 7 días, marcar solicitud ganadora como `selected`, rechazar las demás, poner objeto en `reserved`. Notificar al receptor (EVT-003).
FR20: El canal de contacto debe incluirse en la respuesta de `GET /delivery-sessions/:id` únicamente si el solicitante es el receptor, la sesión está activa y `contact_purged = FALSE`. El donante nunca recibe el campo.
FR21: El donante debe poder confirmar la entrega completada. Al confirmar (transacción atómica): status = 'completed'; donante +15 si primera donación histórica (total_donated prev = 0), si no +10; receptor +1; total_donated++ donante, total_received++ receptor, consecutive_no_shows = 0 ambos; dos eventos en reputation_events (delivery_completed) con role y delta distintos. Referencia: `docs/ranking-spec-v1.0.md`.
FR22: El donante debe poder cancelar la sesión de entrega con opción de declarar no-show. Si no-show: consecutive_no_shows++ receptor, delta = -10 × consecutive_no_shows, registro en reputation_events con role = 'receiver'. El objeto vuelve a `active`.
FR23: Las sesiones de entrega deben cerrarse automáticamente (expired) al vencer el deadline de 7 días (job pg_cron). El objeto vuelve a `active`. Sin penalización. Notificar al donante (EVT-004).
FR24: Los objetos sin selección de receptor tras 7 días deben degradarse (campo degraded_at establecido por job pg_cron). Al degradarse, notificar al donante (EVT-012).
FR25: Las imágenes de objetos en `completed` o `cancelled` deben purgarse a los 30 días del cambio de estado (job pg_cron). El borrado físico en Supabase Storage se gestiona mediante trigger + tabla `storage_deletion_queue` + polling del adaptador.
FR26: El canal de contacto debe purgarse (NULL) a los 7 días de que la sesión alcance estado `completed`, `cancelled` o `expired` (job pg_cron).
FR27: El contador `cycles_at_limit` debe incrementarse una vez por ciclo de 30 días si el usuario agotó su límite (job pg_cron, con protección de doble incremento via `last_cycle_incremented_at`).
FR28: El sistema debe exponer el perfil privado del usuario autenticado: `GET /users/me`.
FR29: El sistema debe exponer el historial de eventos de reputación del usuario autenticado: `GET /users/me/reputation-history`.
FR30: El sistema debe exponer las sesiones de entrega del usuario autenticado con filtros por rol y estado: `GET /users/me/delivery-sessions`.
FR31: El sistema debe exponer los objetos publicados por el usuario autenticado con filtros por estado: `GET /users/me/items`.
FR32: El sistema debe exponer las solicitudes realizadas por el usuario autenticado con filtros por estado: `GET /users/me/requests`.
FR33: El sistema debe exponer el perfil público de un usuario (sin email, sin consecutive_no_shows): `GET /users/:id`.
FR34: Los repositorios que devuelvan imágenes deben verificar si el objeto cumple `status IN ('completed','cancelled') AND completed_at < NOW() - 30 días`; en ese caso retornar `images: []` aunque el job no haya ejecutado aún.
FR35: El sistema debe enviar email de confirmación al completar el reset de contraseña (EVT-013 / TPL-008). El registro no dispara EVT-001 como email separado; la bienvenida forma parte del email de verificación (EVT-014 / TPL-009).
FR36: El registro debe requerir `firstName` y `lastName` (2–50 caracteres, letras Unicode). `phone` es opcional.
FR37: `GET /users/me` debe exponer identidad, avatar, teléfono, `emailVerified` y `preferredLanguage`. `phone` no aparece en perfiles públicos.
FR38: `GET /users/:id` debe exponer `firstName`, `lastName` y `avatarUrl` además de reputación y estadísticas.
FR39: `PATCH /users/me` permite actualización parcial; cambio de `postalCode` re-geocodifica, incrementa `jwt_version` y rechaza CP inválido con 400 atómico.
FR40: El middleware de autenticación debe rechazar usuarios con `is_active = FALSE` (HTTP 401). El campo nunca se expone en DTOs.
FR41: El sistema debe persistir `category` y `weight_range` en cada ítem con CHECK en BD y validación Zod en la API de publicación (valores según `docs/prd-analytics.md` §4).
FR42: El sistema debe emitir eventos de analítica (catálogo AE-001…AE-031) tras commit exitoso, con loggers `app`/`analytics` separados, `userId` hasheado y sin PII en `properties` (ver `docs/prd-analytics.md`).
FR43: Tras registro exitoso, el sistema debe enviar un único email de verificación con enlace tokenizado válido 24 h (EVT-014 / TPL-009), con saludo de bienvenida breve y CTA de confirmación. No se envía EVT-001 en el flujo de registro.
FR44: El sistema debe exponer `GET /auth/verify-email?token=` (público) para marcar `email_verified = TRUE` y limpiar tokens pendientes.
FR45: El sistema debe exponer `POST /auth/resend-verification` (JWT requerido) con cooldown de 30 s, invalidando el token anterior al emitir uno nuevo.
FR46: El middleware de autenticación debe rechazar usuarios con `email_verified = FALSE` en rutas protegidas (HTTP 403, código `EMAIL_NOT_VERIFIED`), excepto en los endpoints del flujo de auth listados en architecture §8.6.
FR47: El sistema debe enviar un digest horario por email (EVT-015 / TPL-010) a usuarios activos con email verificado dentro de 50 km de objetos `active` publicados en la última hora, excluyendo al donante; un email por usuario; cron externo sobre `POST /api/jobs/nearby-items-digest` protegido por `CRON_SECRET`.
FR48: Alineación ranking y reputación v1.0 según `docs/ranking-spec-v1.0.md` (RFC-001 a RFC-004, MIGR-001) en código, tests y documentación.
FR49: El candidato debe proporcionar `contactChannel` al postularse (`POST /items/:id/requests`). El canal no se expone en `GET /items/:id/requests` (lista de candidatos).
FR50: Tras selección, el donante recibe `receiverContactChannel` en `GET /delivery-sessions/:id` solo si es donante, la sesión está `active` y `receiver_contact_purged = FALSE` (SEC-002c).
FR51: Al seleccionar receptor, copiar el canal del candidato a `delivery_sessions.receiver_contact_channel` y purgar `item_requests.contact_channel` (solicitud seleccionada y rechazadas) en la misma transacción atómica.
FR52: El job `purge-contact-channel` debe purgar `contact_channel` y `receiver_contact_channel` (y ambos flags) a los 7 días de cierre de sesión.
FR53: El sistema debe autenticar administradores con tabla `admin_users` independiente, password Argon2 + OTP de 6 dígitos por email (Resend), y emitir JWT de 8 horas firmado con `ADMIN_JWT_SECRET` separado del JWT de usuarios. No existe endpoint de registro; la cuenta se crea manualmente.
FR54: El sistema debe permitir al administrador autenticado gestionar usuarios: buscar con filtros, ver perfil completo, suspender (cascada: jwt_version++, objetos activos pausados con paused_by_admin), reactivar (solo revierte pausas de origen admin), forzar verificación de email, corregir reputación con delta y razón, y resetear contador de no-shows.
FR55: El sistema debe permitir al administrador gestionar objetos: buscar con filtros, ver detalle con solicitudes y sesión activa, cancelar objetos activos/reservados (reutilizando lógica de CancelItem), y reactivar objetos cancelados.
FR56: El sistema debe permitir al administrador gestionar sesiones de entrega: listar con filtros, ver detalle con registro de acceso a contactChannel en audit log, y forzar expiración de sesiones activas.
FR57: El sistema debe exponer una cola de reportes al administrador: listar paginado con filtros, ver detalle completo con contexto de moderación, y resolver con acción (`archive`, `warn_user`, `cancel_item`, `suspend_user`) y nota obligatoria. Implementado en Épica 14 (PRD-REP-BE-01).
FR58: El sistema debe exponer métricas operativas al administrador: totales de usuarios (activos, suspendidos, no verificados >24h, pasivos, acaparadores), objetos por estado, sesiones (últimos 30 días), tasa de no-shows y contadores de reportes (pending, resolvedLast30Days, archivedLast30Days).
FR59: El sistema debe exponer el estado del sistema al administrador: últimas ejecuciones de jobs pg_cron, cola de borrado de Storage pendiente y usuarios sin verificar >24h.
FR60: Toda acción del administrador debe registrarse en `admin_audit_log` con admin_user_id, action, entity_type, entity_id, payload_snapshot e ip_address. Retención indefinida en MVP.
FR61: El sistema debe permitir a usuarios autenticados con email verificado reportar objetos o perfiles de usuario via `POST /api/reports`, con reCAPTCHA V3 (score ≥ 0.5), validación de auto-reporte y entidad reportable.
FR62: El sistema debe capturar snapshot del contenido reportado (título/estado para items; nombre/reputación para usuarios) en el momento del INSERT, independiente del estado futuro de la entidad.
FR63: El sistema debe aplicar prevención de duplicados activos (409 si ya existe reporte pendiente del mismo usuario sobre la misma entidad) y límites anti-spam: 3 reportes sobre la misma entidad en 24h (429) y 10 reportes totales en 7 días (429).
FR64: El sistema debe enviar tres flujos de email al módulo de reportes: confirmación al denunciante (TPL-011), resolución genérica al denunciante (TPL-012) y advertencia al denunciado solo en acción `warn_user` (TPL-013). Notificación al operador en cada nuevo reporte (TPL-ADM-002).
FR65: El sistema debe anonimizar `reporter_id` mensualmente en reportes cerrados con más de 2 años de antigüedad via job pg_cron (RGPD — D-REP-07).
FR66: El sistema debe emitir dos eventos analíticos del módulo de reportes: `report.submitted` (AE-032) tras creación exitosa y `report.resolved` (AE-033) tras resolución, ambos fire-and-forget post-commit.

### Requisitos No Funcionales

NFR1: Arquitectura Clean Architecture estricta: domain → application → infrastructure → interfaces. Sin ORM — SQL directo via pg.
NFR2: El campo `location` (GEOGRAPHY POINT) nunca debe aparecer en ningún DTO de salida. Solo `distanceMeters` (calculado en SQL) puede exponerse como referencia geográfica.
NFR3: Todos los parámetros de ruta `:id` deben validarse como UUID v4 en la capa `validators/` antes de llegar al controlador. Retornar HTTP 400 ante formato inválido.
NFR4: Todos los use cases deben retornar DTOs explícitos definidos en `application/dtos/`. Prohibido serializar entidades de dominio directamente en respuestas HTTP o usar `SELECT *` como fuente de respuesta.
NFR5: Ante fallo de autorización sobre recurso existente, retornar siempre HTTP 403 con mensaje genérico (nunca HTTP 404 como sustituto de 403).
NFR6: Rate limiting: global 60 req/IP/60s; auth (`/auth/*`) 10 req/IP/15min; ranking (`GET /items/:id/requests`) 10 req/IP/1min.
NFR7: Cabeceras de seguridad HTTP mediante Helmet.js como middleware global: HSTS (1 año, includeSubDomains, preload), X-Content-Type-Options, X-Frame-Options, Referrer-Policy.
NFR8: reCAPTCHA V3 con umbral score ≥ 0.5 en registro y login.
NFR9: Contraseñas hasheadas con Argon2.
NFR10: JWT de 7 días. Invalidación mediante campo `jwt_version` en `users` y claim `jwtVersion` en el token.
NFR11: Tokens de reset de contraseña: expiración 1 hora, uso único.
NFR12: LRU Cache para geocodificación: capacidad 500 entradas, se vacía en reinicio (asumible para MVP).
NFR13: Performance del ranking: si p95 > 500ms, implementar vista materializada (optimización diferida para MVP).
NFR14: Todos los jobs periódicos definidos en SQL puro via pg_cron (no en código Node.js). **Excepción (Correct Course 2026-05-29):** EVT-015 digest de proximidad se dispara por cron HTTP externo → `SendNearbyItemsDigestUseCase` (no SQL puro).
NFR15: Resiliencia en borrado de Storage: trigger + `storage_deletion_queue` garantiza que borrados físicos pendientes se procesen en el siguiente arranque del servidor.
NFR16: El job de expiración de sesiones (Job 5) usa CTE atómico para garantizar que la expiración y la reactivación del objeto se ejecuten juntas o no se ejecuten.
NFR17: Logging con pino.
NFR18: HTTPS enforcement en Railway para producción.
NFR19: Las imágenes se comprimen en el cliente antes del upload (máx. 1200px, WebP, calidad 80%, tope 2MB/imagen).
NFR20: Sin notificaciones de no-show, recordatorios de sesión, confirmación de entrega ni notificación a candidatos rechazados (decisiones de producto MVP).

### Requisitos Adicionales (Arquitectura)

- Proyecto greenfield — sin template de inicio.
- Base de datos: Supabase (PostgreSQL + PostGIS). Extensión PostGIS requerida para ST_DWithin y ST_Distance.
- 8 tablas: `users`, `items`, `item_images`, `item_requests`, `delivery_sessions`, `reputation_events`, `password_reset_tokens`, `storage_deletion_queue`.
- 14 índices SQL definidos (geoespaciales, por estado, sliding window, purgas, historial, control de ciclos).
- 5 jobs pg_cron: `degrade-inactive-items` (horario), `purge-item-images` (03:00 UTC diario), `purge-contact-channel` (03:30 UTC diario), `increment-cycles-at-limit` (02:00 UTC diario), `expire-delivery-sessions` (cada hora :30).
- 10 templates de email via Resend: TPL-001 a TPL-010.
- IMailService como interfaz en domain/; ResendMailProvider como implementación en infrastructure/email/.
- Los jobs pg_cron invocan use cases (ExpireDeliverySessionsUseCase, DegradeInactiveItemsUseCase) a través de inyección de dependencias — no llaman a Resend directamente.
- Tabla `storage_deletion_queue` + trigger `trg_queue_storage_deletion` + StorageAdapter con polling cada 10 minutos.
- Nominatim (OpenStreetMap) como proveedor de geocodificación. LRU Cache en memoria con 500 entradas.
- Railway como hosting. Supabase Storage para imágenes.

### Requisitos de Diseño UX

N/A — Este es el backend. No aplica UX Design Specification.

### Mapa de Cobertura de Requisitos

FR1: Épica 1 — Registro con email, contraseña, código postal, reCAPTCHA
FR2: Épica 1 — Geocodificación de código postal (Nominatim + LRU)
FR3: Épica 1 — Emisión de JWT 7 días
FR4: Épica 1 — Login con reCAPTCHA
FR5: Épica 1 — Recuperación de contraseña por email (token 1h)
FR6: Épica 1 — Reset de contraseña con invalidación de JWT (jwt_version)
FR7: Épica 1 — Middleware de auth verifica jwt_version del token
FR8: Épica 2 — Publicar objeto con imágenes (hasta 5)
FR9: Épica 2 — Listar objetos activos en radio 50 km con paginación
FR10: Épica 2 — Detalle de objeto
FR11: Épica 2/4 — Cancelar objeto: base sin sesión (E2), extensión con sesión activa + email (E4)
FR12: Épica 3 — Solicitar objeto (límite 3/30d, SERIALIZABLE, email al donante EVT-006)
FR13: Épica 2 — Bloquear solicitudes si requests_paused = TRUE
FR14: Épica 2 — PATCH /items/:id/pause — activar/desactivar requests_paused
FR15: Épica 3 — GET /items/:id/requests — lista de candidatos rankeados (solo donante)
FR16: Épica 3 — Ranking con score efectivo y perturbación aleatoria ±2 puntos
FR17: Épica 3 — Excluir usuarios pasivos del ranking
FR18: Épica 3 (MVP) / Épica 11 (v1.0) — Control acaparador Tier 1/Tier 2 en ranking
FR19: Épica 4 — Seleccionar receptor con canal de contacto (transacción atómica, email EVT-003)
FR20: Épica 4 — contact_channel solo visible al receptor en sesión activa y no purgada
FR21: Épica 4 (MVP) / Épica 11 (v1.0) — Confirmar entrega (deltas asimétricos + primera donación +15)
FR22: Épica 4 (MVP) / Épica 11 (v1.0) — Cancelar sesión con no-show (base -10 × racha)
FR23: Épica 4 — Expirar sesiones automáticamente (job pg_cron CTE atómico, email EVT-004)
FR24: Épica 2 — Degradar objetos inactivos tras 7 días (job pg_cron, email EVT-012)
FR25: Épica 2 — Purgar imágenes a 30 días (job + trigger + storage_deletion_queue)
FR26: Épica 4 — Purgar contact_channel a 7 días de cierre de sesión (job pg_cron)
FR27: Épica 3 — Incrementar cycles_at_limit una vez por ciclo de 30 días (job pg_cron)
FR28: Épica 5 — GET /users/me — perfil privado completo
FR29: Épica 5 — GET /users/me/reputation-history — historial de eventos
FR30: Épica 5 — GET /users/me/delivery-sessions — con filtros por rol y estado
FR31: Épica 5 — GET /users/me/items — con filtros por estado
FR32: Épica 5 — GET /users/me/requests — con filtros por estado
FR33: Épica 5 — GET /users/:id — perfil público sin email ni consecutive_no_shows
FR34: Épica 2 — Repositorios retornan images:[] si objeto purgado no ejecutado aún
FR35: Épica 1 / 9 — Email EVT-013 (confirmación reset); bienvenida en registro vía TPL-009 (Épica 8/9)
FR36: Épica 6 — Registro con firstName y lastName obligatorios (validación Unicode, 2–50 caracteres)
FR37: Épica 6 — Perfil privado GET /users/me con avatar, phone, emailVerified, preferredLanguage
FR38: Épica 6 — Perfil público GET /users/:id con firstName, lastName, avatarUrl
FR39: Épica 6 — PATCH /users/me para actualización parcial (re-geocodificación CP, invalidación JWT al cambiar CP)
FR40: Épica 6 — Middleware rechaza usuarios con is_active = FALSE
FR41: Épica 7 — category y weight_range obligatorios en items
FR42: Épica 7 — Instrumentación analítica AE-001…AE-031
FR43–FR46: Épica 8 — Verificación de email en registro
FR47: Épica 10 — Digest horario de objetos cercanos
FR48: Épica 11 — Alineación ranking y reputación v1.0 (RFC-RANK-2026-01 a 04): implementación de `docs/ranking-spec-v1.0.md` en código, tests y documentación; supersede criterios obsoletos de épicas 3–4 sin reabrir su estado `done`.
FR49: Épica 12 — contactChannel obligatorio al postularse; no visible en lista candidatos
FR50: Épica 12 — receiverContactChannel visible al donante en sesión activa (SEC-002c)
FR51: Épica 12 — copia y purga en SelectReceiver
FR52: Épica 12 — job purge-contact-channel ampliado (ambos canales)
FR53: Épica 13 — Autenticación admin (admin_users, OTP, JWT independiente)
FR54: Épica 13 — Gestión de usuarios por admin
FR55: Épica 13 — Gestión de objetos por admin
FR56: Épica 13 — Gestión de sesiones por admin
FR57: Épica 13/14 — Cola de reportes admin (implementada en Épica 14 — PRD-REP-BE-01)
FR58: Épica 13/14 — Métricas operativas incluyendo bloque reports (bloque reports en 14-7)
FR59: Épica 13 — Estado del sistema (pg_cron, Storage queue)
FR60: Épica 13 — Auditoría transversal (admin_audit_log)
FR61: Épica 14 — Endpoint público POST /api/reports (reCAPTCHA, anti-reporte-propio, entidad reportable)
FR62: Épica 14 — Snapshot del contenido reportado en el INSERT
FR63: Épica 14 — Prevención de duplicados activos y límites anti-spam D-REP-04
FR64: Épica 14 — Flujos de email TPL-011, TPL-012, TPL-013, TPL-ADM-002
FR65: Épica 14 — Job mensual anonimización reporter_id (RGPD)
FR66: Épica 14 — Eventos analíticos AE-032 y AE-033

## Lista de Épicas

### Épica 1: Autenticación y Cuenta de Usuario
Los usuarios pueden registrarse, iniciar sesión, recuperar su contraseña y acceder a rutas protegidas con JWT. Esta épica incluye la inicialización del proyecto greenfield con estructura Clean Architecture, el schema completo de la base de datos, y todos los middlewares globales (rate limiting, Helmet, CORS, logging, validación UUID).
**FRs cubiertos:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR35

### Épica 2: Publicación y Gestión de Objetos
Los donantes pueden publicar objetos con imágenes, listar objetos disponibles en su zona geográfica, ver el detalle de un objeto, cancelar sus objetos (implementación base) y pausar/reanudar solicitudes. El sistema degrada automáticamente los objetos inactivos y purga imágenes de objetos completados/cancelados.
**FRs cubiertos:** FR8, FR9, FR10, FR11 (base), FR13, FR14, FR24, FR25, FR34

### Épica 3: Solicitudes y Ranking de Candidatos
Los receptores pueden solicitar objetos respetando el límite de 3 cada 30 días (ventana deslizante, transacción SERIALIZABLE). Los donantes ven la lista de candidatos rankeada por reputación efectiva, distancia y antigüedad. El sistema excluye usuarios pasivos, penaliza acaparadores e incrementa cycles_at_limit automáticamente.
**FRs cubiertos:** FR12, FR15, FR16, FR17, FR18, FR27

### Épica 4: Selección de Receptor y Sesión de Entrega
El donante selecciona al receptor proporcionando su canal de contacto, gestiona la sesión de entrega (confirmar, cancelar, declarar no-show) y las sesiones expiran automáticamente. Se completa la lógica de cancelación de objeto con sesión activa.
**FRs cubiertos:** FR19, FR20, FR21, FR22, FR23, FR26, FR11 (extensión)

### Épica 5: Perfil y Actividad del Usuario
Los usuarios pueden consultar su perfil privado, historial de reputación, sesiones de entrega, objetos publicados, solicitudes realizadas, y el perfil público de otros usuarios.
**FRs cubiertos:** FR28, FR29, FR30, FR31, FR32, FR33

### Épica 6: Ampliación del Modelo de Usuario (DLT-003)
Extiende el modelo de usuario con identidad, avatar, contacto, control operativo e internacionalización. Actualiza contratos de registro, login, perfiles y emails. Añade `PATCH /users/me`. Las historias 1.2–1.4 y 5.1/5.6 implementadas en v1.2 quedan superseded en contrato por esta épica.
**FRs cubiertos:** FR36, FR37, FR38, FR39, FR40

### Épica 7: Analítica e Instrumentación (DLT-004)
Capa transversal de observabilidad: columnas analíticas en `items`, loggers separados, `analytics.service` y catálogo de 15 eventos en use cases y jobs. El contrato de publicación (FR8) queda superseded en campos `category`/`weightRange` por esta épica; las historias 2.1 y flujos de ítem/sesión `done` reciben instrumentación sin reabrir el tracker.
**FRs cubiertos:** FR41, FR42 (y extensión de FR8 en publicación)

### Épica 8: Verificación de email
Implementa el flujo completo de verificación de email: columnas de token en `users`, envío EVT-014 en registro y reenvío, endpoints públicos/privados de verificación, bloqueo en middleware y plantilla TPL-009. Las historias 1.2 y 1.4 quedan superseded en especificación por 8.2 y 8.3; la historia 6.2 asumía `email_verified` sin flujo interno — esta épica cierra la brecha. **Pre-producción:** no se requiere script de backfill para usuarios existentes. **Correct Course 2026-05-26:** registro envía solo TPL-009; layout de marca en Épica 9.

**FRs cubiertos:** FR43, FR44, FR45, FR46 (y extensión de FR1, FR3, FR7, FR35)

### Épica 9: Emails transaccionales con marca
Layout HTML compartido, tokens del design system frontend y migración incremental TPL-001…009. Criterio go-live: ningún email sin `renderEmailLayout()`. Referencia: `docs/email-template-design.md`.

**FRs cubiertos:** extensión transversal de notificaciones por email (FR35, FR43 y demás EVT con TPL)

### Épica 10: Digest de proximidad y jobs HTTP
Digest horario por email de objetos nuevos en radio 50 km (EVT-015 / TPL-010). Endpoint `POST /api/jobs/nearby-items-digest` con `CRON_SECRET`, columna `digest_notified_at`, idempotencia pre-envío. Referencia: `docs/delta-backend-EVT015.md`, `docs/delta-email-flow-EVT015.md`, spec `spec-nearby-items-hourly-digest-email.md`. Correct Course 2026-05-29 (renumeración desde borrador EVT-014 erróneo).

**FRs cubiertos:** FR47

### Épica 11: Alineación ranking y reputación v1.0 (RFC-RANK)
Implementar `docs/ranking-spec-v1.0.md` (RFC-001 a RFC-004, MIGR-001) en código, tests y documentación. Supersede FR18/FR21/FR22 tal como quedaron en épicas 3–4 `done`; no reabrir esas épicas en el tracker.

**FRs cubiertos:** FR18, FR21, FR22 (definición v1.0), FR48

**Referencia:** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-05-29-ranking-rfc-v1.md`

### Épica 12: Canal de contacto del candidato (Correct Course 2026-05-31)

El receptor aporta canal al solicitar; el donante lo consulta en sesión activa para contacto proactivo. Simetría con el canal del donante (FR19/FR20). Tres historias backend: schema/jobs, API, documentación. Frontend y TPL-006 §7 delta **fuera de alcance**.

**FRs cubiertos:** FR49, FR50, FR51, FR52 (extiende FR12, FR19, FR20, FR26)

**Referencia:** `docs/delta-candidato-contacto.md`, `_bmad-output/planning-artifacts/sprint-change-proposal-2026-05-31.md`

**Nota:** Las historias 3.1, 4.1, 4.2 y 4.6 del MVP quedan superseded en los criterios afectados por 12-2; la documentación se cierra en 12-3.

### Épica 13: Panel Administrativo Backend (PRD-ADM-BE-01)

Autenticación independiente para administradores (tabla `admin_users`, OTP por email, JWT 8h con secret dedicado) y módulos de gestión operativa: usuarios, objetos, sesiones de entrega, métricas operativas y estado del sistema. Todas las acciones generan entrada en `admin_audit_log`. CORS restrictivo a `admin.regalalo.org`. Plataforma: Render.

**FRs cubiertos:** FR53, FR54, FR55, FR56, FR58 (sin bloque reports), FR59, FR60

**Referencia:** `docs/prd-backend-admin.md` (PRD-ADM-BE-01 v1.0)

### Épica 14: Sistema de Reportes (PRD-REP-BE-01) — Correct Course 2026-06-09

Los usuarios autenticados con email verificado pueden reportar objetos o perfiles de usuario. El panel administrativo recibe una cola de moderación FIFO, herramientas de resolución con acciones de cascada (cancel item, suspend user, warn user, archive) y notificaciones automáticas. Incluye prevención de duplicados, snapshots del contenido, tres flujos de email, notificación al operador, job mensual de anonimización RGPD y dos eventos analíticos.

**FRs cubiertos:** FR57, FR58 (bloque reports), FR61, FR62, FR63, FR64, FR65, FR66

**Referencia:** `docs/PRD-REP-BE-01.md`

**Referencia Sprint Change Proposal:** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-09-reports.md`

---

## Épica 1: Autenticación y Cuenta de Usuario

Los usuarios pueden registrarse, iniciar sesión, recuperar su contraseña y acceder a rutas protegidas con JWT. Esta épica incluye la inicialización del proyecto greenfield con estructura Clean Architecture, el schema completo de la base de datos y todos los middlewares globales.

### Historia 1.1: Inicialización del proyecto e infraestructura base

Como desarrollador,
quiero que el proyecto tenga la estructura Clean Architecture correcta, el servidor Express configurado y todos los middlewares globales en su lugar,
para que todas las historias siguientes puedan implementarse dentro de una base técnica coherente.

**Criterios de Aceptación:**

**Dado** que el repositorio está vacío
**Cuando** se ejecuta el servidor
**Entonces** el servidor Express arranca en el puerto configurado por variable de entorno
**Y** responde `200 OK` en `GET /health`

**Dado** que el proyecto está inicializado
**Cuando** se examina la estructura de carpetas
**Entonces** existe la estructura: `src/domain/`, `src/application/use-cases/`, `src/application/services/`, `src/application/dtos/`, `src/infrastructure/`, `src/interfaces/http/controllers/`, `src/interfaces/http/middlewares/`, `src/interfaces/http/routes/`, `src/interfaces/validators/`, `src/config/`, `src/main.ts`

**Dado** que el servidor recibe cualquier petición
**Cuando** la petición llega
**Entonces** los logs se emiten en formato JSON via pino con nivel configurable por variable de entorno

**Dado** que el servidor recibe una petición
**Cuando** la respuesta se envía
**Entonces** las cabeceras incluyen `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` y `Referrer-Policy: no-referrer` (Helmet.js)

**Dado** que una IP realiza más de 60 peticiones en 60 segundos a cualquier ruta
**Cuando** llega la petición 61
**Entonces** el servidor responde `429 Too Many Requests`

**Dado** que una IP realiza más de 10 peticiones en 15 minutos a rutas `/auth/*`
**Cuando** llega la petición 11
**Entonces** el servidor responde `429 Too Many Requests`

**Dado** que una ruta de recurso recibe un parámetro `:id` con formato no UUID v4
**Cuando** llega la petición
**Entonces** el servidor responde `400 Bad Request` con mensaje genérico antes de que llegue al controlador

---

### Historia 1.2: Registro de usuario

Como visitante,
quiero poder registrarme con mi email, contraseña y código postal,
para poder usar la plataforma como donante o receptor.

**Criterios de Aceptación:**

**Dado** que envío `POST /auth/register` con email único, contraseña, código postal válido y token reCAPTCHA con score ≥ 0.5
**Cuando** el servidor procesa la petición
**Entonces** responde `201` con `{ token: JWT, user: { id, email, postalCode, reputationScore: 0, totalReceived: 0, totalDonated: 0 } }`
**Y** el usuario queda guardado en `users` con la contraseña hasheada con Argon2
**Y** el campo `location` contiene las coordenadas geocodificadas del código postal via Nominatim
**Y** `jwt_version = 1` en el registro

**Dado** que envío `POST /auth/register` con un email ya registrado
**Cuando** el servidor procesa la petición
**Entonces** responde `409 Conflict`

**Dado** que envío `POST /auth/register` con un código postal que Nominatim no puede geocodificar
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request`

**Dado** que envío `POST /auth/register` con token reCAPTCHA de score < 0.5
**Cuando** el servidor procesa la petición
**Entonces** responde `422 Unprocessable Entity`

**Dado** que el código postal es válido y ya fue geocodificado recientemente
**Cuando** otro usuario se registra con el mismo código postal
**Entonces** se usa la entrada del LRU Cache sin llamada adicional a Nominatim

**Dado** que el registro es exitoso
**Cuando** el servidor completa la operación
**Entonces** se envía un único email de verificación (EVT-014 / TPL-009) via Resend — *superseded: ya no EVT-001 en registro (Correct Course 2026-05-26)*
**Y** el JWT incluye el claim `jwtVersion: 1`

---

### Historia 1.3: Login de usuario

Como usuario registrado,
quiero poder iniciar sesión con mi email y contraseña,
para obtener un token JWT y acceder a las funciones autenticadas.

**Criterios de Aceptación:**

**Dado** que envío `POST /auth/login` con credenciales válidas y token reCAPTCHA con score ≥ 0.5
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ token: JWT, user: { id, email, reputationScore } }`
**Y** el JWT incluye el claim `jwtVersion` con el valor actual de `users.jwt_version`

**Dado** que envío `POST /auth/login` con contraseña incorrecta
**Cuando** el servidor procesa la petición
**Entonces** responde `401 Unauthorized`

**Dado** que envío `POST /auth/login` con email no registrado
**Cuando** el servidor procesa la petición
**Entonces** responde `401 Unauthorized` (igual que contraseña incorrecta, sin revelar si el email existe)

**Dado** que envío `POST /auth/login` con token reCAPTCHA de score < 0.5
**Cuando** el servidor procesa la petición
**Entonces** responde `422 Unprocessable Entity`

---

### Historia 1.4: Middleware de autenticación con validación de jwt_version

Como sistema,
quiero verificar el JWT en cada petición autenticada y validar que `jwtVersion` coincide con la base de datos,
para que los tokens invalidados por reset de contraseña no den acceso a recursos protegidos.

**Criterios de Aceptación:**

**Dado** que envío una petición a una ruta protegida con un JWT válido y `jwtVersion` coincidente con `users.jwt_version`
**Cuando** el middleware procesa el token
**Entonces** la petición pasa al controlador con el usuario inyectado como `current_user`

**Dado** que envío una petición a una ruta protegida sin header `Authorization`
**Cuando** el middleware procesa la petición
**Entonces** responde `401 Unauthorized`

**Dado** que envío una petición con un JWT con firma inválida o expirado
**Cuando** el middleware procesa el token
**Entonces** responde `401 Unauthorized`

**Dado** que envío una petición con un JWT válido cuyo `jwtVersion` difiere del valor en `users.jwt_version`
**Cuando** el middleware procesa el token
**Entonces** responde `401 Unauthorized`

---

### Historia 1.5: Recuperación y reset de contraseña

Como usuario,
quiero poder recuperar el acceso a mi cuenta si olvidé mi contraseña,
para no perder permanentemente el acceso.

**Criterios de Aceptación:**

**Dado** que envío `POST /auth/forgot-password` con un email registrado
**Cuando** el servidor procesa la petición
**Entonces** responde `200 OK` con mensaje genérico
**Y** se crea un registro en `password_reset_tokens` con `expires_at = NOW() + 1h` y `used = FALSE`
**Y** se envía email con enlace de recuperación (EVT-002 / TPL-002) al usuario

**Dado** que envío `POST /auth/forgot-password` con un email no registrado
**Cuando** el servidor procesa la petición
**Entonces** responde `200 OK` con el mismo mensaje genérico sin revelar si el email existe
**Y** no se envía ningún email ni se crea ningún token

**Dado** que envío `POST /auth/reset-password` con token válido, no expirado, no utilizado y nueva contraseña
**Cuando** el servidor procesa la petición
**Entonces** responde `200 OK`
**Y** en una transacción atómica: `password_hash` actualizado con Argon2, `jwt_version` incrementado en 1, token marcado como `used = TRUE`
**Y** se envía email de confirmación de reset exitoso (EVT-013 / TPL-008)

**Dado** que envío `POST /auth/reset-password` con token expirado o ya utilizado
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request`

**Dado** que existe un JWT activo para el usuario y se completa un reset de contraseña
**Cuando** se intenta usar el JWT antiguo en una ruta protegida
**Entonces** el middleware responde `401 Unauthorized` porque `jwtVersion` ya no coincide

---

## Épica 2: Publicación y Gestión de Objetos

Los donantes pueden publicar objetos con imágenes, listar objetos disponibles en su zona geográfica, ver el detalle de un objeto, cancelar sus objetos y pausar/reanudar solicitudes. El sistema degrada automáticamente los objetos inactivos y purga imágenes de objetos finalizados.

### Historia 2.1: Publicar objeto con imágenes

Como donante autenticado,
quiero poder publicar un objeto con título, descripción, condición, ubicación y hasta 5 imágenes,
para que los receptores de mi zona puedan solicitarlo.

**Criterios de Aceptación:**

**Dado** que envío `POST /items` (multipart/form-data) con título, descripción, condición, código postal válido y hasta 5 imágenes cada una ≤ 2MB
**Cuando** el servidor procesa la petición
**Entonces** responde `201` con `{ id, title, status: "active", createdAt }`
**Y** se crean registros en `items` e `item_images` con `storage_path` para cada imagen en Supabase Storage
**Y** la `location` del objeto se geocodifica desde el `postalCode` del payload, independiente de la ubicación del donante

**Dado** que envío `POST /items` con más de 5 imágenes
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request`

**Dado** que envío `POST /items` con una imagen que supera 2MB
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request`

**Dado** que envío `POST /items` con un código postal no geocodificable
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request`

**Dado** que envío `POST /items` sin token de autenticación
**Cuando** el servidor procesa la petición
**Entonces** responde `401 Unauthorized`

---

### Historia 2.2: Listar objetos disponibles en radio geográfico

Como usuario autenticado,
quiero ver una lista paginada de objetos activos en un radio de 50 km de mi ubicación,
para encontrar objetos disponibles cerca de mí.

**Criterios de Aceptación:**

**Dado** que envío `GET /items` con autenticación válida
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con la lista de objetos en radio ≤ 50 km del usuario con `distanceMeters` calculado en SQL
**Y** la respuesta incluye `pagination: { total, page, limit, totalPages }`
**Y** ningún objeto incluye el campo `location` (GEOGRAPHY POINT)

**Dado** que existen objetos con `degraded_at IS NOT NULL` y objetos con `degraded_at IS NULL`
**Cuando** se obtiene el listado
**Entonces** los objetos con `degraded_at IS NULL` aparecen primero ordenados por `createdAt` descendente
**Y** los objetos degradados aparecen al final

**Dado** que un objeto tiene `status` distinto de `active`
**Cuando** se obtiene el listado
**Entonces** ese objeto no aparece en los resultados

**Dado** que envío `GET /items?page=2&limit=10`
**Cuando** el servidor procesa la petición
**Entonces** responde la segunda página con hasta 10 resultados

**Dado** que envío `GET /items?limit=51`
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request` (límite fuera de rango 1–50)

**Dado** que un objeto tiene `status IN ('completed','cancelled')` y `completed_at < NOW() - 30 días`
**Cuando** aparece en cualquier respuesta que incluya imágenes
**Entonces** el campo `images` se retorna como `[]` aunque el job de purga aún no haya ejecutado

---

### Historia 2.3: Ver detalle de objeto

Como usuario,
quiero ver el detalle completo de un objeto específico,
para decidir si quiero solicitarlo o conocer su estado actual.

**Criterios de Aceptación:**

**Dado** que envío `GET /items/:id` con un UUID válido y el objeto existe
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ id, title, description, condition, status, degradedAt, distanceMeters, images: [url], donor: { id, reputationScore }, createdAt }`
**Y** el campo `location` no aparece en la respuesta

**Dado** que envío `GET /items/:id` con un UUID que no existe
**Cuando** el servidor procesa la petición
**Entonces** responde `404 Not Found`

**Dado** que envío `GET /items/:id` con un parámetro que no es UUID v4
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request`

---

### Historia 2.4: Cancelar objeto (sin sesión activa)

Como donante autenticado,
quiero poder cancelar un objeto que publiqué,
para retirarlo del sistema cuando ya no esté disponible.

**Criterios de Aceptación:**

**Dado** que envío `DELETE /items/:id` siendo el donante del objeto y el objeto no tiene sesión activa
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con mensaje de confirmación
**Y** el objeto queda en `status = 'cancelled'` y `completed_at = NOW()`

**Dado** que envío `DELETE /items/:id` siendo autenticado pero no el donante del objeto
**Cuando** el servidor procesa la petición
**Entonces** responde `403 Forbidden` con mensaje genérico (nunca 404)

**Dado** que envío `DELETE /items/:id` con un UUID que no existe
**Cuando** el servidor procesa la petición
**Entonces** responde `404 Not Found`

**Dado** que envío `DELETE /items/:id` sin autenticación
**Cuando** el servidor procesa la petición
**Entonces** responde `401 Unauthorized`

> Nota: el manejo de cancelación con sesión activa (cancelar sesión + notificar receptor) se completa en Historia 4.5.

---

### Historia 2.5: Pausar y reanudar solicitudes de un objeto

Como donante autenticado,
quiero poder pausar temporalmente las solicitudes de mi objeto,
para controlar cuándo acepto nuevas solicitudes.

**Criterios de Aceptación:**

**Dado** que envío `PATCH /items/:id/pause` con `{ "paused": true }` siendo el donante y el objeto en estado `active`
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ requestsPaused: true }`
**Y** el campo `requests_paused = TRUE` en la base de datos

**Dado** que envío `PATCH /items/:id/pause` con `{ "paused": false }` siendo el donante
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ requestsPaused: false }`
**Y** el campo `requests_paused = FALSE` en la base de datos

**Dado** que un receptor intenta `POST /items/:id/requests` sobre un objeto con `requests_paused = TRUE`
**Cuando** el servidor procesa la petición
**Entonces** responde `409 Conflict`

**Dado** que envío `PATCH /items/:id/pause` siendo autenticado pero no el donante
**Cuando** el servidor procesa la petición
**Entonces** responde `403 Forbidden`

**Dado** que envío `PATCH /items/:id/pause` sobre un objeto en estado distinto de `active`
**Cuando** el servidor procesa la petición
**Entonces** responde `409 Conflict`

---

### Historia 2.6: Degradación automática de objetos inactivos

Como sistema,
quiero degradar automáticamente los objetos que llevan 7 días sin selección de receptor,
para que aparezcan al final del feed y el donante sepa que su objeto tiene baja actividad.

**Criterios de Aceptación:**

**Dado** que existe un objeto con `status = 'active'`, `degraded_at IS NULL`, `created_at < NOW() - 7 días` y sin ninguna request en estado `selected`
**Cuando** se ejecuta el job `degrade-inactive-items` (pg_cron, cada hora)
**Entonces** el campo `degraded_at` se establece en ese objeto

**Dado** que el job detecta que `degraded_at` se establece por primera vez en un objeto
**Cuando** el job procesa ese objeto
**Entonces** se invoca `DegradeInactiveItemsUseCase` que envía notificación al donante (EVT-012 / TPL-007)

**Dado** que un objeto ya tiene `degraded_at IS NOT NULL`
**Cuando** se ejecuta el job
**Entonces** ese objeto no es procesado nuevamente

**Dado** que el objeto tiene al menos una request en estado `selected`
**Cuando** se ejecuta el job
**Entonces** ese objeto no se degrada

---

### Historia 2.7: Purga automática de imágenes y cola de borrado en Storage

Como sistema,
quiero purgar las imágenes de objetos finalizados y garantizar el borrado físico en Supabase Storage incluso ante caídas del servidor,
para no acumular archivos huérfanos.

**Criterios de Aceptación:**

**Dado** que existen objetos con `status IN ('completed','cancelled')` y `completed_at < NOW() - 30 días` con registros en `item_images`
**Cuando** se ejecuta el job `purge-item-images` (pg_cron, 03:00 UTC diario)
**Entonces** se eliminan los registros de `item_images` para esos objetos

**Dado** que se elimina un registro de `item_images`
**Cuando** el trigger `trg_queue_storage_deletion` se activa
**Entonces** se inserta el `storage_path` en `storage_deletion_queue` con `processed_at IS NULL`

**Dado** que existen registros en `storage_deletion_queue` con `processed_at IS NULL`
**Cuando** el `StorageAdapter` ejecuta su polling (al arranque y cada 10 minutos)
**Entonces** se eliminan los archivos en Supabase Storage y se marca `processed_at = NOW()`

**Dado** que el servidor estaba caído durante la ejecución del job de purga
**Cuando** el servidor reinicia
**Entonces** el polling del `StorageAdapter` procesa los registros pendientes en `storage_deletion_queue`

---

## Épica 3: Solicitudes y Ranking de Candidatos

Los receptores pueden solicitar objetos respetando el límite de 3 cada 30 días. Los donantes ven la lista de candidatos rankeada por reputación efectiva, distancia y antigüedad. El sistema excluye usuarios pasivos, penaliza acaparadores e incrementa `cycles_at_limit` automáticamente.

### Historia 3.1: Solicitar un objeto

Como receptor autenticado,
quiero poder solicitar un objeto que me interesa,
para ser considerado como candidato por el donante.

**Criterios de Aceptación:**

**Dado** que envío `POST /items/:id/requests` con autenticación válida y el objeto existe en estado `active` con `requests_paused = FALSE`
**Cuando** el servidor procesa la petición en transacción SERIALIZABLE
**Entonces** responde `201` con `{ requestId, status: "pending", createdAt }`
**Y** se crea un registro en `item_requests` con `status = 'pending'`
**Y** se envía notificación al donante (EVT-006 / TPL-006)

**Dado** que intento solicitar mi propio objeto
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request` con mensaje "No puedes solicitar tu propio objeto"
**Y** esta verificación ocurre antes de la comprobación del límite de solicitudes

**Dado** que ya realicé 3 solicitudes en los últimos 30 días (ventana deslizante de 720 horas)
**Cuando** intento una cuarta solicitud
**Entonces** responde `409 Conflict`

**Dado** que ya solicité este mismo objeto anteriormente
**Cuando** intento solicitarlo de nuevo
**Entonces** responde `409 Conflict`

**Dado** que dos peticiones concurrentes del mismo usuario intentan crear la solicitud número 3 y 4 simultáneamente
**Cuando** el servidor procesa ambas en transacción SERIALIZABLE
**Entonces** solo una de ellas tiene éxito y la otra recibe `409 Conflict`

**Dado** que el objeto tiene `requests_paused = TRUE`
**Cuando** intento solicitarlo
**Entonces** responde `409 Conflict`

**⚠️ Superseded (12-2):** `POST /items/:id/requests` ahora exige body `{ "contactChannel": "string" }` (mín. 1 carácter). Sin body o con `contactChannel` vacío → `400`. El campo se persiste en `item_requests.contact_channel` y se purga al seleccionar receptor. Ver historia 12.2 y `docs/delta-candidato-contacto.md` §3.1.

---

### Historia 3.2: Ver candidatos rankeados para un objeto

Como donante autenticado,
quiero ver la lista de candidatos que solicitaron mi objeto, ordenada por reputación, distancia y antigüedad,
para elegir al receptor más adecuado con información objetiva.

**Criterios de Aceptación:**

**Dado** que envío `GET /items/:id/requests` siendo el donante del objeto
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ candidates: [{ requestId, userId, reputationScore, distanceMeters, requestDate }] }`
**Y** los candidatos están ordenados por: score efectivo descendente → distanceMeters ascendente → requestDate ascendente

**Dado** que el score efectivo se calcula
**Cuando** el ranking se genera
**Entonces** incluye una perturbación aleatoria de ±2 puntos aplicada al `reputation_score` del candidato
**Y** el campo `location` no aparece en ningún elemento del DTO de respuesta

**Dado** que un candidato cumple `total_donated = 0 AND total_received > 0 AND last_active_at < NOW() - 60 días`
**Cuando** se genera el ranking
**Entonces** ese candidato es excluido del resultado

**Dado** que un candidato cumple `cycles_at_limit >= 3 AND total_received > 5 × total_donated`
**Cuando** se genera el ranking
**Entonces** su score efectivo tiene una penalización de -15 puntos sin afectar `reputation_score` oficial

**Dado** que envío `GET /items/:id/requests` siendo autenticado pero no siendo el donante
**Cuando** el servidor procesa la petición
**Entonces** responde `403 Forbidden` con mensaje genérico

**Dado** que una IP realiza más de 10 peticiones en 1 minuto a `GET /items/:id/requests`
**Cuando** llega la petición 11
**Entonces** el servidor responde `429 Too Many Requests`

---

### Historia 3.3: Incremento automático de cycles_at_limit

Como sistema,
quiero incrementar `cycles_at_limit` una vez por ciclo de 30 días para usuarios que agotaron su límite de solicitudes,
para que el ranking pueda identificar y penalizar a usuarios acaparadores.

**Criterios de Aceptación:**

**Dado** que un usuario realizó 3 o más solicitudes en los últimos 30 días y `last_cycle_incremented_at IS NULL` o `last_cycle_incremented_at < NOW() - 30 días`
**Cuando** se ejecuta el job `increment-cycles-at-limit` (pg_cron, 02:00 UTC diario)
**Entonces** `cycles_at_limit` se incrementa en 1 y `last_cycle_incremented_at = NOW()` para ese usuario

**Dado** que el job ya incrementó `cycles_at_limit` de un usuario en los últimos 30 días
**Cuando** se ejecuta el job nuevamente
**Entonces** ese usuario no se vuelve a incrementar

**Dado** que un usuario realizó menos de 3 solicitudes en los últimos 30 días
**Cuando** se ejecuta el job
**Entonces** `cycles_at_limit` de ese usuario no cambia

**Dado** que el job está definido en SQL puro via `pg_cron`
**Cuando** se examina la configuración
**Entonces** no existe código Node.js que ejecute esta lógica directamente

---

## Épica 4: Selección de Receptor y Sesión de Entrega

El donante selecciona al receptor proporcionando su canal de contacto, gestiona la sesión de entrega (confirmar, cancelar, declarar no-show) y las sesiones expiran automáticamente. Se completa también la lógica de cancelación de objeto con sesión activa.

### Historia 4.1: Seleccionar receptor para un objeto

Como donante autenticado,
quiero seleccionar un receptor de la lista de candidatos proporcionando mi canal de contacto,
para iniciar el proceso de entrega con esa persona.

**Criterios de Aceptación:**

**Dado** que envío `POST /items/:id/requests/:requestId/select` con `{ "contactChannel": "string" }` siendo el donante, el objeto en estado `active` y la request en estado `pending`
**Cuando** el servidor procesa la petición en transacción atómica
**Entonces** responde `200` con `{ sessionId, status: "active", deadlineAt }`
**Y** se crea una `delivery_session` con `status = 'active'`, `contact_channel = contactChannel` y `deadline_at = NOW() + 7 días`
**Y** la request ganadora queda en `status = 'selected'`
**Y** todas las demás requests del mismo objeto quedan en `status = 'rejected'`
**Y** el objeto queda en `status = 'reserved'` y `reserved_at = NOW()`
**Y** se envía notificación al receptor seleccionado (EVT-003 / TPL-003)

**Dado** que la request ya no está en estado `pending` o el objeto no está en estado `active`
**Cuando** el servidor procesa la petición
**Entonces** responde `409 Conflict`

**Dado** que envío la petición siendo autenticado pero no siendo el donante del objeto, o siendo donante pero la request no pertenece al objeto
**Cuando** el servidor procesa la petición
**Entonces** responde `403 Forbidden`

**Dado** que envío la petición sin el campo `contactChannel` o con valor vacío
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request`

**⚠️ Superseded (12-2):** La transacción atómica ahora incluye: (a) lectura de `item_requests.contact_channel` del candidato seleccionado pre-transacción; (b) INSERT en `delivery_sessions` con `receiver_contact_channel = contact_channel`; (c) `contact_channel = NULL` en la solicitud seleccionada y todas las rechazadas. Ver historia 12.2 y `docs/delta-candidato-contacto.md` §3.2.

---

### Historia 4.2: Ver detalle de sesión de entrega

Como donante o receptor autenticado,
quiero poder consultar el detalle de una sesión de entrega en la que participo,
para conocer su estado, el deadline y el canal de contacto si corresponde.

**Criterios de Aceptación:**

**Dado** que envío `GET /delivery-sessions/:id` siendo el donante o el receptor de la sesión
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ id, itemId, status, contactChannel, deadlineAt, donorConfirmed, noShowDeclared, createdAt, completedAt }`

**Dado** que el solicitante es el receptor, la sesión está en estado `active` y `contact_purged = FALSE`
**Cuando** el servidor procesa la petición
**Entonces** el campo `contactChannel` incluye el valor real del canal de contacto

**Dado** que el solicitante es el donante, o la sesión no está en estado `active`, o `contact_purged = TRUE`
**Cuando** el servidor procesa la petición
**Entonces** el campo `contactChannel` retorna `null`

**Dado** que envío la petición siendo autenticado pero no siendo ni donante ni receptor de la sesión
**Cuando** el servidor procesa la petición
**Entonces** responde `403 Forbidden` con mensaje genérico

**Dado** que envío `GET /delivery-sessions/:id` con un UUID que no existe
**Cuando** el servidor procesa la petición
**Entonces** responde `404 Not Found`

**⚠️ Superseded (12-2):** La respuesta de `GET /delivery-sessions/:id` incluye el campo `receiverContactChannel: string | null`. Regla SEC-002c: el donante recibe el valor si la sesión está `active` y `receiver_contact_purged = FALSE`; el receptor siempre recibe `null`. También incluye `sharedContactChannel` (SEC-002b) para el donante. Ver historia 12.2 y `docs/delta-candidato-contacto.md` §3.3.

---

### Historia 4.3: Confirmar entrega completada

Como donante autenticado,
quiero poder confirmar que la entrega se realizó exitosamente,
para cerrar la sesión, actualizar la reputación de ambas partes y registrar el evento.

**Criterios de Aceptación:**

**Dado** que envío `POST /delivery-sessions/:id/confirm` siendo el donante y la sesión en estado `active` con `donor_confirmed = FALSE`
**Cuando** el servidor procesa la petición en transacción atómica
**Entonces** responde `200` con `{ status: "completed", completedAt }`
**Y** `donor_confirmed = TRUE`, `status = 'completed'`, `completed_at = NOW()`
**Y** `reputation_score += 10` para donante y receptor
**Y** `total_donated += 1` para el donante y `total_received += 1` para el receptor
**Y** `consecutive_no_shows = 0` para ambos
**Y** se registran dos eventos en `reputation_events` (tipo `delivery_completed`, delta `+10`) para cada usuario

**Dado** que la sesión no está en estado `active`
**Cuando** el servidor procesa la petición
**Entonces** responde `409 Conflict`

**Dado** que `donor_confirmed` ya es `TRUE`
**Cuando** el servidor procesa la petición
**Entonces** responde `409 Conflict`

**Dado** que envío la petición siendo autenticado pero no siendo el donante de la sesión
**Cuando** el servidor procesa la petición
**Entonces** responde `403 Forbidden`

---

### Historia 4.4: Cancelar sesión de entrega y declarar no-show

Como donante autenticado,
quiero poder cancelar una sesión de entrega con la opción de declarar que el receptor no se presentó,
para cerrar la sesión correctamente y penalizar al receptor si corresponde.

**Criterios de Aceptación:**

**Dado** que envío `POST /delivery-sessions/:id/cancel` con `{ "noShow": false }` siendo el donante y la sesión en estado `active`
**Cuando** el servidor procesa la petición en transacción atómica
**Entonces** responde `200` con `{ status: "cancelled", noShowDeclared: false, completedAt }`
**Y** `status = 'cancelled'`, `completed_at = NOW()`, `no_show_declared = FALSE`
**Y** el objeto asociado vuelve a `status = 'active'` y `reserved_at = NULL`
**Y** no se modifica la reputación de ninguna parte

**Dado** que envío `POST /delivery-sessions/:id/cancel` con `{ "noShow": true }` siendo el donante y la sesión en estado `active`
**Cuando** el servidor procesa la petición en transacción atómica
**Entonces** responde `200` con `{ status: "cancelled", noShowDeclared: true, completedAt }`
**Y** `no_show_declared = TRUE`
**Y** `consecutive_no_shows` del receptor se incrementa en 1
**Y** `delta = -20 × consecutive_no_shows` se aplica al `reputation_score` del receptor
**Y** se registra un evento `no_show` en `reputation_events` para el receptor
**Y** el objeto vuelve a `status = 'active'` y `reserved_at = NULL`

**Dado** que la sesión no está en estado `active`
**Cuando** el servidor procesa la petición
**Entonces** responde `409 Conflict`

**Dado** que envío la petición siendo autenticado pero no siendo el donante de la sesión
**Cuando** el servidor procesa la petición
**Entonces** responde `403 Forbidden`

---

### Historia 4.5: Cancelar objeto con sesión activa

Como donante autenticado,
quiero que al cancelar mi objeto se cancele también la sesión de entrega activa y se notifique al receptor,
para que el receptor no quede esperando sin información.

**Criterios de Aceptación:**

**Dado** que envío `DELETE /items/:id` siendo el donante y el objeto tiene una sesión de entrega en estado `active`
**Cuando** el servidor procesa la petición en transacción atómica
**Entonces** responde `200` con mensaje de confirmación
**Y** la sesión activa queda en `status = 'cancelled'` y `completed_at = NOW()`
**Y** el objeto queda en `status = 'cancelled'` y `completed_at = NOW()`
**Y** se encola notificación por email al receptor de la sesión (EVT-005 / TPL-005) que se envía tras el commit

**Dado** que el objeto tiene sesión activa y la transacción falla en cualquier paso
**Cuando** el servidor procesa la petición
**Entonces** tanto la actualización de la sesión como la del objeto se revierten completos

**Dado** que el objeto no tiene ninguna sesión activa
**Cuando** el servidor procesa la petición
**Entonces** el comportamiento es el de Historia 2.4 (cancelación simple sin sesión)

---

### Historia 4.6: Expiración automática de sesiones y purga de canal de contacto

Como sistema,
quiero cerrar automáticamente las sesiones que superaron su deadline de 7 días y purgar el canal de contacto de las sesiones cerradas,
para liberar los objetos bloqueados y proteger la privacidad del canal de contacto del donante.

**Criterios de Aceptación:**

**Dado** que existe una sesión con `status = 'active'` y `deadline_at < NOW()`
**Cuando** se ejecuta el job `expire-delivery-sessions` (pg_cron, cada hora a :30)
**Entonces** la sesión queda en `status = 'expired'` y el objeto asociado vuelve a `status = 'active'` con `reserved_at = NULL`
**Y** ambas actualizaciones ocurren en una única operación CTE atómica
**Y** se invoca `ExpireDeliverySessionsUseCase` que envía notificación al donante (EVT-004 / TPL-004)
**Y** no se aplica ninguna penalización de reputación

**Dado** que la sesión expiró pero el servidor estaba caído en ese momento
**Cuando** el servidor reinicia y el job vuelve a ejecutarse
**Entonces** la sesión se marca como `expired` y el objeto vuelve a `active`

**Dado** que existen sesiones con `status IN ('completed','cancelled','expired')`, `contact_purged = FALSE` y `completed_at < NOW() - 7 días`
**Cuando** se ejecuta el job `purge-contact-channel` (pg_cron, 03:30 UTC diario)
**Entonces** `contact_channel = NULL` y `contact_purged = TRUE` para esas sesiones

**Dado** que una sesión ya tiene `contact_purged = TRUE`
**Cuando** se ejecuta el job
**Entonces** esa sesión no es procesada nuevamente

**⚠️ Superseded (12-2):** El job `purge-contact-channel` purga ahora **ambos canales** en la misma operación: `contact_channel = NULL`, `contact_purged = TRUE`, `receiver_contact_channel = NULL`, `receiver_contact_purged = TRUE`. La condición WHERE usa `(contact_purged = FALSE OR receiver_contact_purged = FALSE)`. El índice `idx_sessions_contact_purge` fue ampliado con la misma condición OR. Ver historia 12.1 (migración) y `docs/delta-candidato-contacto.md` §5.

---

## Épica 5: Perfil y Actividad del Usuario

Los usuarios pueden consultar su perfil privado, historial de reputación, sesiones de entrega, objetos publicados, solicitudes realizadas y el perfil público de otros usuarios.

### Historia 5.1: Ver perfil privado del usuario autenticado

Como usuario autenticado,
quiero poder consultar mi propio perfil completo,
para conocer mi reputación, estadísticas y datos de cuenta.

**Criterios de Aceptación:**

**Dado** que envío `GET /users/me` con autenticación válida
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ id, email, postalCode, reputationScore, totalReceived, totalDonated, consecutiveNoShows, createdAt }`
**Y** el campo `location` no aparece en la respuesta

**Dado** que el `reputationScore` es negativo
**Cuando** el servidor procesa la petición
**Entonces** el valor negativo se retorna sin truncar

**Dado** que envío `GET /users/me` sin autenticación
**Cuando** el servidor procesa la petición
**Entonces** responde `401 Unauthorized`

---

### Historia 5.2: Ver historial de reputación

Como usuario autenticado,
quiero ver el historial de eventos que afectaron mi reputación,
para entender cómo evolucionó mi score y qué acciones lo modificaron.

**Criterios de Aceptación:**

**Dado** que envío `GET /users/me/reputation-history` con autenticación válida
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ events: [{ id, type, delta, sessionId, createdAt }] }`
**Y** `type` puede ser `delivery_completed` o `no_show`
**Y** `delta` refleja el valor real aplicado positivo o negativo

**Dado** que el usuario no tiene ningún evento de reputación
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ events: [] }`

**Dado** que envío la petición sin autenticación
**Cuando** el servidor procesa la petición
**Entonces** responde `401 Unauthorized`

---

### Historia 5.3: Ver sesiones de entrega propias

Como usuario autenticado,
quiero poder ver mis sesiones de entrega como donante o receptor con filtros por rol y estado,
para hacer seguimiento de mis entregas activas e históricas.

**Criterios de Aceptación:**

**Dado** que envío `GET /users/me/delivery-sessions` con autenticación válida
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ sessions: [{ id, itemId, itemTitle, role, status, deadlineAt, createdAt, completedAt }], pagination }`
**Y** el campo `contactChannel` no aparece en este listado

**Dado** que envío `GET /users/me/delivery-sessions?role=donor`
**Cuando** el servidor procesa la petición
**Entonces** solo se retornan sesiones donde el usuario es donante

**Dado** que envío `GET /users/me/delivery-sessions?role=receiver`
**Cuando** el servidor procesa la petición
**Entonces** solo se retornan sesiones donde el usuario es receptor

**Dado** que envío `GET /users/me/delivery-sessions?status=active`
**Cuando** el servidor procesa la petición
**Entonces** solo se retornan sesiones en estado `active`

**Dado** que envío parámetros de paginación inválidos
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request`

---

### Historia 5.4: Ver objetos publicados propios

Como donante autenticado,
quiero ver todos los objetos que publiqué con filtro por estado,
para gestionar mi actividad como donante.

**Criterios de Aceptación:**

**Dado** que envío `GET /users/me/items` con autenticación válida
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ items: [{ id, title, condition, status, degradedAt, images, createdAt, completedAt }], pagination }`

**Dado** que envío `GET /users/me/items?status=active`
**Cuando** el servidor procesa la petición
**Entonces** solo se retornan objetos en estado `active`

**Dado** que un objeto tiene `status IN ('completed','cancelled')` y `completed_at < NOW() - 30 días`
**Cuando** aparece en la respuesta
**Entonces** el campo `images` se retorna como `[]`

**Dado** que envío parámetros de paginación inválidos
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request`

---

### Historia 5.5: Ver solicitudes realizadas propias

Como receptor autenticado,
quiero ver todas las solicitudes que realicé con filtro por estado,
para hacer seguimiento de los objetos que pedí.

**Criterios de Aceptación:**

**Dado** que envío `GET /users/me/requests` con autenticación válida
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ requests: [{ id, itemId, itemTitle, itemStatus, status, createdAt }], pagination }`

**Dado** que envío `GET /users/me/requests?status=pending`
**Cuando** el servidor procesa la petición
**Entonces** solo se retornan solicitudes en estado `pending`

**Dado** que envío `GET /users/me/requests?status=selected`
**Cuando** el servidor procesa la petición
**Entonces** solo se retornan solicitudes en estado `selected`

**Dado** que envío parámetros de paginación inválidos
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request`

---

### Historia 5.6: Ver perfil público de un usuario

Como usuario autenticado,
quiero poder ver el perfil público de otro usuario,
para conocer su reputación y actividad antes de decidir si solicitar un objeto suyo o aceptarlo como receptor.

**Criterios de Aceptación:**

**Dado** que envío `GET /users/:id` con un UUID válido y el usuario existe
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ id, reputationScore, totalReceived, totalDonated, createdAt }`
**Y** los campos `email` y `consecutiveNoShows` no aparecen en la respuesta

**Dado** que el `reputationScore` del usuario es negativo
**Cuando** el servidor procesa la petición
**Entonces** el valor negativo se retorna sin truncar

**Dado** que envío `GET /users/:id` con un UUID que no existe
**Cuando** el servidor procesa la petición
**Entonces** responde `404 Not Found`

**Dado** que envío `GET /users/:id` con un parámetro que no es UUID v4
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request`

---

## Épica 6: Ampliación del Modelo de Usuario (DLT-003)

Delta de diseño DLT-003 incorporado en `docs/architecture.md` v1.3. Esta épica alinea código y OpenAPI con el contrato ampliado sin reabrir épicas 1 y 5 ya completadas en v1.2.

### Historia 6.1: Migración SQL y entidad User (DLT-003)

Como desarrollador,
quiero la migración de las siete columnas nuevas en `users` y la entidad de dominio actualizada,
para que el resto de historias puedan persistir y leer los campos de identidad y control.

**Criterios de Aceptación:**

**Dado** que existe la tabla `users` de v1.2
**Cuando** se aplica la migración `012-users-dlt-003.sql`
**Entonces** existen las columnas `first_name`, `last_name`, `avatar_url`, `phone`, `email_verified`, `is_active`, `preferred_language` con defaults documentados en architecture v1.3
**Y** registros existentes reciben valores por defecto en booleanos e idioma; `first_name`/`last_name` se rellenan antes de `NOT NULL` si hay datos previos

**Dado** la entidad `User` en dominio
**Cuando** el repositorio persiste o lee un usuario
**Entonces** mapea todos los campos nuevos sin exponer `is_active` en DTOs de salida

---

### Historia 6.2: Registro, login y middleware is_active

Como visitante o usuario registrado,
quiero registrarme e iniciar sesión con nombre y apellido, y que cuentas desactivadas no autentiquen,
para cumplir el contrato DLT-003 de auth.

**Criterios de Aceptación:**

**Dado** `POST /auth/register` con `firstName`, `lastName`, email, password, postalCode y reCAPTCHA válidos
**Cuando** el registro es exitoso
**Entonces** responde `201` con `user` incluyendo `firstName`, `lastName`, `postalCode`, reputación y totales según §8.5 architecture v1.3
**Y** el usuario se inserta con `email_verified = FALSE`, `is_active = TRUE`, `preferred_language = 'es'`

**Dado** `firstName` o `lastName` inválidos (< 2, > 50, o caracteres no permitidos)
**Cuando** se envía el registro
**Entonces** responde `400 Bad Request`

**Dado** `POST /auth/login` exitoso
**Cuando** el servidor responde
**Entonces** el DTO `user` incluye `firstName` y `lastName`

**Dado** un usuario con `is_active = FALSE`
**Cuando** presenta un JWT válido en ruta protegida
**Entonces** el middleware responde `401 Unauthorized`

---

### Historia 6.3: DTOs de perfil privado y público

Como usuario autenticado,
quiero ver perfiles con nombre, avatar y campos de cuenta según visibilidad definida,
para alinear GET /users/me y GET /users/:id con DLT-003.

**Criterios de Aceptación:**

**Dado** `GET /users/me` autenticado
**Cuando** el servidor responde
**Entonces** incluye `firstName`, `lastName`, `avatarUrl`, `phone`, `preferredLanguage`, `emailVerified` además de los campos ya existentes
**Y** no incluye `is_active`, `location`, `cycles_at_limit` ni `last_cycle_incremented_at`

**Dado** `GET /users/:id` con usuario existente
**Cuando** el servidor responde
**Entonces** incluye `firstName`, `lastName`, `avatarUrl`
**Y** no incluye `email`, `phone`, `consecutiveNoShows`, `emailVerified` ni `preferredLanguage`

---

### Historia 6.4: PATCH /users/me — actualización de perfil

Como usuario autenticado,
quiero actualizar parcialmente mi perfil,
para cambiar nombre, avatar, teléfono, código postal o idioma preferido.

**Criterios de Aceptación:**

**Dado** `PATCH /users/me` con campos opcionales válidos
**Cuando** la operación es exitosa
**Entonces** responde `200` con el DTO de §8.5 (sin email ni emailVerified)

**Dado** el payload incluye `postalCode` no geocodificable
**Cuando** se procesa la petición
**Entonces** responde `400` y ningún campo se persiste

**Dado** `postalCode` se actualiza con éxito
**Cuando** termina la transacción
**Entonces** `location` y `jwt_version` se actualizan atómicamente y el token actual queda invalidado

**Dado** `avatarUrl: null`
**Cuando** se confirma el PATCH
**Entonces** se borra la referencia y se encola borrado físico en Storage (patrón existente)

---

### Historia 6.5: Emails con saludo personalizado firstName

Como usuario que recibe notificaciones,
quiero emails que me saluden por mi nombre,
para mejorar la experiencia de comunicación.

**Criterios de Aceptación:**

**Dado** cualquier envío TPL-001 a TPL-008
**Cuando** el Use Case invoca `IMailService.send`
**Entonces** incluye la variable `firstName` del destinatario en el contexto del template

**Dado** `docs/email-flow-mapping.md` y OpenAPI
**Cuando** se regenera documentación
**Entonces** reflejan `firstName` en variables requeridas por evento

---

## Épica 7: Analítica e Instrumentación (DLT-004)

Delta de diseño DLT-004 incorporado en `docs/architecture.md` v1.4 y `docs/prd-analytics.md`. Esta épica alinea schema de `items`, API de publicación, loggers y catálogo AE sin reabrir épicas 1–5 ya completadas.

### Historia 7.1: Migración SQL y dominio items (DLT-004)

Como desarrollador,
quiero las columnas `category` y `weight_range` en `items` con constraints y entidad actualizada,
para persistir dimensiones analíticas desde la publicación.

**Criterios de Aceptación:**

**Dado** que existe la tabla `items` sin columnas analíticas
**Cuando** se aplica la migración `013-items-dlt-004.sql`
**Entonces** existen `category` y `weight_range` NOT NULL con CHECK según architecture v1.4 §3.2
**Y** registros existentes reciben backfill `category = 'other'`, `weight_range = 'lt1'` antes de las constraints

**Dado** la entidad/repositorio de ítem
**Cuando** se persiste o lee un ítem
**Entonces** mapea `category` y `weightRange` correctamente

---

### Historia 7.2: Loggers y analytics.service

Como operador del sistema,
quiero streams de log separados para aplicación y analítica,
para filtrar eventos de negocio sin mezclarlos con errores de infraestructura.

**Criterios de Aceptación:**

**Dado** `src/config/loggers.ts`
**Cuando** se inspecciona la configuración
**Entonces** `appLogger` usa `base: { service: 'app' }` y `analyticsLogger` usa `base: { service: 'analytics' }`

**Dado** `emitEvent` en `analytics.service.ts`
**Cuando** se emite un evento
**Entonces** `userId` se registra como SHA-256 del UUID
**Y** la llamada es fire-and-forget tras commit (nunca dentro de transacción activa)

**Dado** `pinoHttp` y `main.ts`
**Cuando** arranca el servidor
**Entonces** usan `appLogger` (cierra deuda de doble instancia pino en deferred-work)

---

### Historia 7.3: API publicar ítem — category y weightRange

Como donante autenticado,
quiero indicar categoría y rango de peso al publicar,
para cumplir el contrato analítico del MVP.

**Criterios de Aceptación:**

**Dado** `POST` publicar ítem con `category` y `weightRange` válidos
**Cuando** la publicación es exitosa
**Entonces** el ítem persiste ambos campos y responde según DTO existente
**Y** se emite AE-010 `item.published` post-commit con `itemId`, `category`, `condition`, `weightRange`

**Dado** `category` o `weightRange` ausentes o fuera de enum
**Cuando** se envía la petición
**Entonces** responde `400 Bad Request`

**Dado** OpenAPI regenerado
**Cuando** el frontend ejecuta `npm run api:generate`
**Entonces** el contrato incluye los campos obligatorios en publicación

---

### Historia 7.4: Instrumentación autenticación (AE-001, AE-002)

Como responsable de producto,
quiero eventos de registro y login en el stream de analítica,
para medir adquisición y retención.

**Criterios de Aceptación:**

**Dado** registro exitoso
**Cuando** termina el commit
**Entonces** se emite `user.registered` con `postalCode` en properties (sin coordenadas)

**Dado** login exitoso
**Cuando** se emite el JWT
**Entonces** se emite `user.login` con properties vacío

**Dado** tests de integración o unitarios
**Cuando** se ejecutan flujos auth
**Entonces** verifican llamada a `analyticsLogger` (mock/spy) sin PII prohibida

---

### Historia 7.5: Instrumentación objetos y solicitudes

Como responsable de producto,
quiero eventos en el ciclo de vida del objeto y límites de solicitud,
para analizar conversión y fricción.

**Criterios de Aceptación:**

**Dado** solicitud de ítem exitosa
**Cuando** termina el commit
**Entonces** se emite `item.requested` con `itemId` y `category`

**Dado** límite 3/30 días alcanzado (`LimitExceededException`)
**Cuando** el use case captura la excepción
**Entonces** emite `limit.reached` antes de relanzar
**Y** la operación sigue respondiendo como antes

**Dado** selección de receptor, cancelación, pausa/reanuda y degradación por job
**Cuando** cada operación confirma en BD
**Entonces** se emiten AE-012, AE-014, AE-015 y AE-013 respectivamente según delta DLT-004 §D

---

### Historia 7.6: Instrumentación entrega y reputación

Como responsable de producto,
quiero eventos en sesiones de entrega y cambios de reputación,
para medir completitud y conducta.

**Criterios de Aceptación:**

**Dado** confirmación de entrega exitosa
**Cuando** termina el commit
**Entonces** se emite `session.completed` con `category`, `weightRange`, `durationMs` y `sessionId` como sessionId del evento

**Dado** cancelación de sesión con o sin no-show
**Cuando** termina el commit
**Entonces** se emite `session.cancelled_no_show` o `session.cancelled_donor` según payload

**Dado** expiración de sesiones en `ExpireDeliverySessionsUseCase`
**Cuando** cada sesión expira en el batch
**Entonces** se emite `session.expired` (AE-021)

**Dado** `ReputationService` tras delivery completada o no-show
**Cuando** actualiza el score
**Entonces** se emite `reputation.changed` con `delta`, `type`, `newScore`, `consecutiveNoShows`

**Dado** el catálogo AE-001…AE-031
**Cuando** se revisa cobertura en PR
**Entonces** los 15 eventos tienen al menos un punto de emisión verificado (SC-01 PRD analítica)

---

### Historia 7.7: Persistencia de eventos en Postgres (Correct Course 2026-05-26)

Como responsable de producto,
quiero que cada evento de analítica se almacene en Postgres además del log estructurado,
para consultar métricas del MVP con SQL sin depender solo de Railway.

**Criterios de Aceptación:**

**Dado** la migración `014-analytics-events.sql` aplicada
**Cuando** se inspecciona el esquema
**Entonces** existe `analytics_events` con índices en `event`, `occurred_at` y `user_id_hash`

**Dado** `emitEvent` tras commit con persistencia activa
**Cuando** ocurre un evento de negocio
**Entonces** se escribe en stdout (`analyticsLogger`) y se inserta fila equivalente en `analytics_events`

**Dado** fallo al insertar en BD
**Cuando** el use case ya completó
**Entonces** la respuesta HTTP / estado de negocio no cambia (SC-07)

**Dado** tests con `ANALYTICS_PERSISTENCE=stdout` o mock
**Cuando** se ejecuta `npm test`
**Entonces** la suite no requiere Supabase real para analítica

---

## Épica 8: Verificación de email

Implementa verificación obligatoria de email tras registro. Referencia: `docs/architecture.md` v1.5 §8.6, `docs/email-flow-mapping.md` v1.2 EVT-014.

### Historia 8.1: Migración SQL y entidad User

Como desarrollador,
quiero columnas e índice para tokens de verificación en `users`,
para soportar el flujo EVT-014 sin consultas full-table.

**Criterios de Aceptación:**

**Dado** la migración aplicada
**Cuando** se inspecciona el esquema
**Entonces** existen `verification_token_hash`, `verification_token_expires_at`, `verification_resend_at` en `users`
**Y** existe índice parcial `idx_users_verification_token` WHERE `email_verified = FALSE`

**Dado** la entidad `User` y repositorio
**Cuando** se implementan métodos de búsqueda por hash y actualización de token
**Entonces** los invariantes del delta se respetan (hash y expiración se establecen/limpian juntos)

---

### Historia 8.2: Registro con token y email EVT-014

Como visitante recién registrado,
quiero recibir un email con enlace de verificación,
para confirmar que soy dueño del correo antes de usar la plataforma.

**Criterios de Aceptación:**

**Dado** `POST /auth/register` exitoso
**Cuando** el usuario se inserta
**Entonces** se genera token `crypto.randomBytes(32)`, hash SHA-256, expiración 24 h y `verification_resend_at = NOW()`
**Y** se envía un único email EVT-014 (TPL-009) con saludo de bienvenida breve, CTA de verificación y layout de marca (`docs/email-template-design.md`)
**Y** no se invoca TPL-001 en RegisterUser
**Y** `verificationLink` usa `{APP_PUBLIC_URL}/verificar-email?token={token_raw}`

**Dado** registro exitoso
**Cuando** responde el servidor
**Entonces** sigue devolviendo JWT + DTO usuario (sin cambio de contrato HTTP)

---

### Historia 8.3: Middleware emailVerified

Como sistema,
quiero bloquear rutas protegidas si el email no está verificado,
para impedir uso de la plataforma con cuentas no confirmadas.

**Criterios de Aceptación:**

**Dado** JWT válido, `jwt_version` coincidente, `is_active = TRUE` y `email_verified = FALSE`
**Cuando** accedo a una ruta protegida no exenta
**Entonces** responde `403` con código `EMAIL_NOT_VERIFIED`

**Dado** el mismo usuario
**Cuando** accedo a `POST /auth/resend-verification`
**Entonces** la petición no es bloqueada por verificación de email

**Dado** rutas exentas (register, login, forgot/reset password, verify-email, resend-verification)
**Cuando** se accede sin email verificado
**Entonces** el middleware no aplica el bloqueo de email

---

### Historia 8.4: GET /auth/verify-email

Como usuario,
quiero verificar mi email haciendo clic en el enlace del correo,
para desbloquear el acceso a la plataforma.

**Criterios de Aceptación:**

**Dado** `GET /auth/verify-email?token=` con token válido y no expirado
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ message: "Email verificado correctamente" }`
**Y** en transacción: `email_verified = TRUE` y campos de token/resend en `NULL`

**Dado** token inválido o expirado
**Cuando** se procesa la petición
**Entonces** responde `400 Bad Request`

**Dado** la petición
**Cuando** llega al endpoint
**Entonces** no requiere JWT

---

### Historia 8.5: POST /auth/resend-verification

Como usuario con email pendiente de verificación,
quiero solicitar un nuevo enlace,
para verificar si el anterior expiró o no llegó.

**Criterios de Aceptación:**

**Dado** JWT válido y `email_verified = FALSE`
**Cuando** `verification_resend_at` superó cooldown de 30 s
**Entonces** responde `200` con `{ message: "Email de verificación reenviado" }`
**Y** se genera nuevo token, invalidando el anterior
**Y** se envía EVT-014 (TPL-009)

**Dado** cooldown activo
**Cuando** se solicita reenvío
**Entonces** responde `429` con header `Retry-After`

**Dado** `email_verified = TRUE`
**Cuando** se solicita reenvío
**Entonces** responde `409 Conflict`

---

### Historia 8.6: Plantilla TPL-009 y email-flow v1.2

Como operador del sistema,
quiero la plantilla Resend y documentación alineadas con EVT-014,
para envíos consistentes en registro y reenvío.

**Criterios de Aceptación:**

**Dado** `docs/email-flow-mapping.md` v1.2
**Cuando** se revisa el repo
**Entonces** EVT-014 y TPL-009 están documentados con variables `recipientEmail`, `firstName`, `verificationLink`, `expiresInHours`

**Dado** OpenAPI regenerado
**Cuando** se inspecciona
**Entonces** incluye `GET /auth/verify-email` y `POST /auth/resend-verification` con códigos de error documentados

**Dado** tests de integración auth
**Cuando** se ejecuta `npm test`
**Entonces** cubren registro con un solo email (TPL-009), verify, resend cooldown y middleware 403

---

## Épica 9: Emails transaccionales con marca

Unifica la presentación visual de todos los emails (TPL-001…009) con el design system del frontend. Referencia: `docs/email-template-design.md`, Correct Course 2026-05-26.

**FRs cubiertos:** extensión de FR35, FR43 y requisito transversal de marca en notificaciones.

### Historia 9.1: Layout shell y tokens de diseño

Como desarrollador,
quiero un layout HTML compartido y tokens sincronizados con `colors_and_type.css`,
para renderizar emails con marca de forma consistente.

**Criterios de Aceptación:**

**Dado** `src/infrastructure/email/tokens/email-design-tokens.ts`
**Cuando** se revisa
**Entonces** los hex coinciden con `no-lo-vendo/docs/project/colors_and_type.css` (documentado en comentario)

**Dado** `renderEmailLayout()` en `templates/layout/`
**Cuando** se genera HTML vacío
**Entonces** pasa snapshot Vitest (table-based, 600px, inline styles)

**Dado** `docs/email-template-design.md`
**Cuando** se revisa
**Entonces** describe layout, tiers y checklist de clientes

---

### Historia 9.2: Tier 1 — TPL-009, TPL-002, TPL-008

Como usuario,
quiero que los emails de verificación y contraseña se vean como la app,
para confiar en los enlaces que recibo.

**Criterios de Aceptación:**

**Dado** registro o reenvío de verificación
**Cuando** se envía TPL-009
**Entonces** usa layout con marca, preheader, CTA y fallback de enlace

**Dado** forgot-password o reset completado
**Cuando** se envía TPL-002 o TPL-008
**Entonces** usa el mismo layout compartido

**Dado** `RegisterUser`
**Cuando** el registro es exitoso
**Entonces** se envía exactamente un email (TPL-009), no TPL-001

---

### Historia 9.3: Tier 2 — TPL-003, TPL-004, TPL-005, TPL-006

Como donante o receptor,
quiero notificaciones de flujo (solicitud, selección, expiración, cancelación) con la misma identidad visual.

**Criterios de Aceptación:**

**Dado** cada evento EVT-003, EVT-004, EVT-005, EVT-006
**Cuando** se dispara el email correspondiente
**Entonces** el HTML usa `renderEmailLayout()` y conserva variables existentes

---

### Historia 9.4: Tier 3 — TPL-007 y catálogo TPL-001

Como operador,
quiero completar la migración visual y dejar TPL-001 en catálogo sin trigger en registro.

**Criterios de Aceptación:**

**Dado** EVT-012 / TPL-007
**Cuando** se envía degradación
**Entonces** usa layout con marca

**Dado** TPL-001 en registry
**Cuando** se revisa RegisterUser
**Entonces** no invoca TPL-001

---

### Historia 9.5: Limpieza — no unstyled email in prod

Como desarrollador,
quiero eliminar HTML inline legacy y validar cobertura,
para cumplir criterio de go-live.

**Criterios de Aceptación:**

**Dado** `resend.provider.ts`
**Cuando** se revisa
**Entonces** delega en registry; no queda `greetingHtml` ni strings inline por TPL

**Dado** `npm test`
**Cuando** se ejecuta
**Entonces** snapshots por TPL-001…009 (activos) pasan en CI

---

## Épica 10: Digest de proximidad y jobs HTTP

Usuarios activos con email verificado reciben un resumen horario de objetos nuevos publicados a ≤50 km. Cron externo invoca el backend; sin opt-out en MVP.

**Referencia:** `docs/architecture.md` v1.6 §7.6, `docs/email-flow-mapping.md` v1.4 EVT-015.

### Historia 10.1: Digest horario — migración, use case, TPL-010 y endpoint cron

Como usuario activo de la plataforma,
quiero recibir un email horario cuando haya objetos nuevos cerca de mi zona,
para descubrir oportunidades sin entrar a la app cada hora.

**Criterios de Aceptación:**

**Dado** un cron externo con `X-Cron-Secret` válido
**Cuando** `POST /api/jobs/nearby-items-digest`
**Entonces** responde `200` con `{ processedItems, recipientsNotified, emailsFailed, executionMs }`

**Dado** dos objetos publicados en la última hora a ≤50 km del mismo usuario (no donante)
**Cuando** se ejecuta el job
**Entonces** ese usuario recibe **un** email TPL-010 con ambos objetos ordenados por `distanceKm ASC`

**Dado** objetos pendientes de digest
**Cuando** el use case inicia el envío
**Entonces** `digest_notified_at` se establece **antes** de llamar a Resend (idempotencia)

**Dado** usuarios con `email_verified = FALSE` o `is_active = FALSE` o sin `location`
**Cuando** se calculan destinatarios
**Entonces** quedan excluidos

**Dado** petición sin secreto válido
**Cuando** se invoca el endpoint
**Entonces** responde `401` y no se envía ningún email

**Spec de implementación:** `_bmad-output/implementation-artifacts/spec-nearby-items-hourly-digest-email.md`

---

## Épica 11: Alineación ranking y reputación v1.0 (RFC-RANK)

Alinear código y documentación con `docs/ranking-spec-v1.0.md` (aprobado 2026-05-29). Las historias 3.2, 3.3, 4.3 y 4.4 permanecen como registro del MVP; esta épica supersede sus criterios de ranking/reputación.

### Historia 11.1: Migración `role` en `reputation_events`

Como sistema,
quiero registrar el rol del usuario en cada evento de reputación,
para auditar deltas asimétricos de donante y receptor (MIGR-001).

**Criterios de Aceptación:**

**Dado** la migración MIGR-001 aplicada
**Cuando** se inserta un evento tras confirmar entrega o declarar no-show
**Entonces** `reputation_events.role` es `'donor'` o `'receiver'` según corresponda

**Dado** filas históricas anteriores a la migración
**Cuando** se consultan
**Entonces** `role` puede ser `NULL` sin recalcular `users.reputation_score`

---

### Historia 11.2: Reputación asimétrica en confirm y cancel

Como plataforma,
quiero aplicar los deltas RFC-001, RFC-002 y RFC-004 en confirmación de entrega y no-show,
para incentivar la donación y equilibrar penalizaciones.

**Criterios de Aceptación:**

**Dado** confirmación de entrega con `total_donated` del donante = 0 antes del UPDATE
**Cuando** se completa la transacción
**Entonces** donante `+15`, receptor `+1`, dos filas en `reputation_events` con roles y deltas distintos

**Dado** confirmación con donante que ya donó antes
**Entonces** donante `+10`, receptor `+1`

**Dado** cancelación con `noShow: true`
**Entonces** `delta = -10 × consecutive_no_shows` en el receptor; evento con `role = 'receiver'`

**Dado** eventos AE-030 (`reputation.changed`)
**Entonces** emiten los deltas reales (`1`, `10`, `15`, `-10n`)

**Spec:** `docs/ranking-spec-v1.0.md` §7, matriz QA QA-01–QA-06

---

### Historia 11.3: SQL ranking Tier 1 / Tier 2 y requestCount

Como donante,
quiero ver candidatos según las reglas RFC-003 y que `requestCount` refleje la misma visibilidad,
para elegir receptores con el nuevo control de acaparador.

**Criterios de Aceptación:**

**Dado** `cycles_at_limit >= 2` y `total_donated = 0`
**Entonces** el usuario no aparece en `GET /items/:id/requests` ni cuenta en `requestCount` de `GET /users/me/items`

**Dado** `cycles_at_limit >= 1` y `total_donated = 0` (y no excluido por FR17)
**Entonces** aparece en ranking con `-15` sobre `effective_score` sin modificar `reputation_score` oficial

**Dado** `total_donated >= 1`
**Entonces** no aplica Tier 1 ni Tier 2

**Dado** filtros compartidos en `ranked-candidate-filters.ts`
**Entonces** `findRankedCandidates` y `requestCount` usan la misma exclusión Tier 2 que FR17 (pasivo)

**Spec:** `docs/ranking-spec-v1.0.md` §8; QA-07–QA-14

---

### Historia 11.4: Tests matriz QA ranking y reputación

Como equipo,
quiero cobertura automatizada de los casos QA-01 a QA-14 de la spec,
para evitar regresiones en ranking y reputación.

**Criterios de Aceptación:**

**Dado** `npm test` en el backend
**Cuando** se ejecutan tests de entrega, ranking y filtros
**Entonces** cubren los escenarios QA-01–QA-14 documentados en `docs/ranking-spec-v1.0.md` §12

---

### Historia 11.5: Sincronizar documentación ranking v1.0

Como mantenedor,
quiero que PRD, arquitectura y guías de ranking coincidan con la spec aprobada,
para que ningún PR mergee sin documentación al día.

**Criterios de Aceptación:**

**Dado** la lista §14 de `docs/ranking-spec-v1.0.md`
**Cuando** se cierra la épica 11
**Entonces** están actualizados: `docs/prd.md` (§10–11), `docs/architecture.md` (§5–6, §12.5–12.6), `docs/ranking-system.md`, `docs/ranking-guia-producto.md`

---

## Épica 12: Canal de contacto del candidato (Correct Course 2026-05-31)

El receptor proporciona su canal de contacto al postularse. Tras la selección, el donante puede iniciar la coordinación de forma proactiva sin depender del email al receptor. Referencia técnica: `docs/delta-candidato-contacto.md`.

### Historia 12.1: Schema y jobs de purga

Como sistema,
quiero persistir el canal del candidato en `item_requests` y el canal copiado en `delivery_sessions`, con purga programada de ambos canales de sesión,
para soportar contacto simétrico y privacidad acorde al delta aprobado.

**Criterios de Aceptación:**

**Dado** la migración aplicada
**Cuando** inspecciono el schema
**Entonces** `item_requests` incluye `contact_channel TEXT` nullable
**Y** `delivery_sessions` incluye `receiver_contact_channel TEXT` y `receiver_contact_purged BOOLEAN NOT NULL DEFAULT FALSE`

**Dado** el índice `idx_sessions_contact_purge`
**Cuando** se redefine según delta §2.3
**Entonces** cubre sesiones con `contact_purged = FALSE` **o** `receiver_contact_purged = FALSE`

**Dado** sesiones con `status IN ('completed','cancelled','expired')`, cualquiera de los flags de purga en `FALSE`, y `completed_at < NOW() - 7 días`
**Cuando** se ejecuta el job `purge-contact-channel` (03:30 UTC)
**Entonces** `contact_channel` y `receiver_contact_channel` pasan a `NULL`
**Y** `contact_purged = TRUE` y `receiver_contact_purged = TRUE`

**Dado** solicitudes `pending` existentes antes del deploy
**Cuando** no hay backfill
**Entonces** la política queda documentada: nuevas solicitudes requieren canal; solicitudes legacy sin canal fallan en 400 al postular de nuevo o al seleccionar según reglas de 12-2

**Spec:** `docs/delta-candidato-contacto.md` §2, §5

---

### Historia 12.2: API postulación, selección y sesión

Como plataforma,
quiero exigir el canal en la postulación, copiarlo al seleccionar receptor y exponerlo al donante bajo SEC-002c,
para desbloquear la comunicación proactiva del donante.

**Criterios de Aceptación:**

**Dado** `POST /items/:id/requests` con `{ "contactChannel": "string" }` no vacío y usuario autenticado
**Cuando** se crea la solicitud en transacción SERIALIZABLE
**Entonces** responde `201` y `item_requests.contact_channel` almacena el valor

**Dado** `POST /items/:id/requests` sin `contactChannel` o con valor vacío
**Entonces** responde `400` (contactChannel requerido)

**Dado** `GET /items/:id/requests` como donante
**Entonces** la respuesta **no** incluye el canal de ningún candidato (decisión 2B)

**Dado** `POST /items/:id/requests/:requestId/select` con canal del donante válido
**Cuando** la transacción atómica completa
**Entonces** `delivery_sessions.receiver_contact_channel` = canal leído de la solicitud seleccionada antes de la tx
**Y** todas las filas `item_requests` del mismo `item_id` tienen `contact_channel = NULL`
**Y** la solicitud ganadora queda `selected` y las demás `rejected`

**Dado** fallo en cualquier paso de `SelectReceiver`
**Entonces** no hay copia parcial; el canal permanece en `item_requests` hasta commit exitoso

**Dado** `GET /delivery-sessions/:id` con usuario = `donor_id`, `status = 'active'`, `receiver_contact_purged = FALSE`
**Entonces** `receiverContactChannel` contiene el valor

**Dado** consultante = receptor, o sesión no `active`, o `receiver_contact_purged = TRUE`
**Entonces** `receiverContactChannel` es `null`

**Dado** reglas SEC-002 y SEC-002b existentes
**Entonces** permanecen sin cambio de semántica para `contactChannel` y `sharedContactChannel`

**Dado** OpenAPI y tests Vitest
**Cuando** se cierra la historia
**Entonces** contratos y casos 400/201/visibilidad están cubiertos

**Spec:** `docs/delta-candidato-contacto.md` §3–4

---

### Historia 12.3: Sincronizar documentación

Como mantenedor,
quiero que PRD, arquitectura y épicas reflejen el canal del candidato,
para que implementación y revisiones futuras usen una sola fuente de verdad.

**Criterios de Aceptación:**

**Dado** el cierre de 12-2
**Cuando** se revisa `openapi/openapi.json`
**Entonces** documenta body en `POST /items/:id/requests` y `receiverContactChannel` en `GET /delivery-sessions/:id`

**Dado** la tabla §6 de `docs/delta-candidato-contacto.md`
**Cuando** se cierra la épica
**Entonces** están actualizados `docs/prd.md` (sesión de entrega, flujos §8 y §12), `docs/architecture.md` (§3.4–3.5, índices, Job 3, §12.2c, §12.4, §12.7, APIs F5/F6) y este archivo (`FR49`–`FR52`, notas supersede en historias 3.1 / 4.1 / 4.2 / 4.6)

**Dado** emails y ranking
**Entonces** `email-flow-mapping.md` y specs de ranking sin cambios (delta §6)

---

## Épica 13: Panel Administrativo Backend (PRD-ADM-BE-01)

Autenticación independiente para administradores y módulos de gestión operativa del ecosistema. Todas las rutas bajo `/api/admin/*` requieren `requireAdminAuth`. Todas las acciones que modifican entidades registran entrada en `admin_audit_log`.

**Referencia:** `docs/prd-backend-admin.md`

---

### Historia 13.1: Modelo de datos del panel administrativo

Como desarrollador,
quiero crear las tablas `admin_users`, `admin_otp_tokens` y `admin_audit_log`, añadir el campo `paused_by_admin` a `items` y ampliar el constraint de `reputation_events.type`,
para que todas las historias del módulo admin tengan el esquema de base de datos necesario.

**Criterios de Aceptación:**

**Dado** que se ejecuta la migración
**Cuando** se verifica el esquema
**Entonces** existen las tablas `admin_users`, `admin_otp_tokens` y `admin_audit_log` con las columnas y constraints del PRD §3.1–3.3
**Y** existe la columna `paused_by_admin BOOLEAN NOT NULL DEFAULT FALSE` en `items`
**Y** el constraint `reputation_events_type_check` acepta `delivery_completed`, `no_show` y `admin_correction`

---

### Historia 13.2: Autenticación de administrador

Como administrador,
quiero poder autenticarme con email, contraseña y código OTP enviado por email,
para acceder al panel de administración con doble factor de seguridad.

**Criterios de Aceptación:**

**Dado** que envío `POST /api/admin/auth/login` con credenciales correctas
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con mensaje de confirmación y envía TPL-ADM-001 con OTP de 6 dígitos válido 10 minutos

**Dado** que envío `POST /api/admin/auth/verify-otp` con OTP correcto dentro de los 10 minutos
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ token: JWT (8h), admin: { id, email } }` firmado con `ADMIN_JWT_SECRET`
**Y** se registra `admin.login` en `admin_audit_log`

**Dado** que envío una petición a `/api/admin/*` sin JWT admin o con JWT de usuario regular
**Entonces** responde `401 Unauthorized`

---

### Historia 13.3: Gestión de usuarios por el administrador

Como administrador autenticado,
quiero buscar usuarios, ver su perfil completo y ejecutar acciones operativas sobre ellos,
para mantener la integridad del ecosistema.

**Criterios de Aceptación:**

**Dado** que envío `GET /api/admin/users` con filtros opcionales
**Entonces** responde `200` con lista paginada incluyendo `isPassive` e `isHoarder` calculados; `location` nunca en respuesta

**Dado** que envío `POST /api/admin/users/:id/suspend` sobre un usuario activo
**Entonces** `is_active=FALSE`, `jwt_version++`, objetos activos sin pausa manual pasan a `requests_paused=TRUE, paused_by_admin=TRUE`
**Y** se registra `user.suspended` en `admin_audit_log`

**Dado** que envío `POST /api/admin/users/:id/reactivate` sobre usuario suspendido
**Entonces** solo los objetos con `paused_by_admin=TRUE` son reactivados; `is_active=TRUE`

---

### Historia 13.4: Gestión de objetos por el administrador

Como administrador autenticado,
quiero buscar objetos, ver su detalle completo y ejecutar acciones de cancelación o reactivación,
para intervenir sobre ítems problemáticos del ecosistema.

**Criterios de Aceptación:**

**Dado** que envío `POST /api/admin/items/:id/cancel` sobre objeto en estado `active` o `reserved`
**Entonces** el objeto pasa a `cancelled`; si había receptor seleccionado se envía TPL-005; se registra `item.cancelled` en audit log

**Dado** que envío `POST /api/admin/items/:id/reactivate` sobre objeto `cancelled`
**Entonces** `status='active'`, `requests_paused=FALSE`, `paused_by_admin=FALSE`, `degraded_at=NULL`; se registra `item.reactivated`

---

### Historia 13.5: Gestión de sesiones de entrega por el administrador

Como administrador autenticado,
quiero listar sesiones, ver su detalle y forzar expiración de sesiones activas atascadas,
para resolver problemas operativos en el flujo de entregas.

**Criterios de Aceptación:**

**Dado** que envío `GET /api/admin/sessions/:id` sobre sesión con `contact_purged=FALSE`
**Entonces** responde con `contactChannel` visible
**Y** se registra `data.contact_channel_accessed` en `admin_audit_log`

**Dado** que envío `POST /api/admin/sessions/:id/force-expire` sobre sesión `active`
**Entonces** `status='expired'`, objeto vuelve a `active`; se registra `session.force_expired` en audit log
**Y** no se envía TPL-004 (expiración forzada ≠ expiración natural)

---

### Historia 13.6: Métricas operativas y estado del sistema

Como administrador autenticado,
quiero ver métricas del estado del ecosistema y el estado de los jobs periódicos,
para identificar anomalías operativas sin consultar la base de datos directamente.

**Criterios de Aceptación:**

**Dado** que envío `GET /api/admin/metrics`
**Entonces** responde `200` con `{ users: {...}, items: {...}, sessions: {...} }` según PRD §6.6
**Y** respuesta llega en menos de 500ms

**Dado** que envío `GET /api/admin/system/health`
**Entonces** responde `200` con `{ cronJobs: [...], storageQueue: { pendingDeletions }, unverifiedUsers24h }`

**Nota de implementación:** el bloque `reports` se añade a `GET /api/admin/metrics` en Historia 14.7 una vez que la tabla `reports` exista en BD.

---

## Épica 14: Sistema de Reportes (PRD-REP-BE-01) — Correct Course 2026-06-09

Los usuarios autenticados con email verificado pueden reportar objetos o perfiles de usuario. El panel administrativo recibe una cola de moderación FIFO con herramientas de resolución, acciones de cascada y notificaciones automáticas.

**Referencia:** `docs/PRD-REP-BE-01.md`

---

### Historia 14.1: Migración SQL — tabla `reports`

Como sistema,
quiero la estructura de base de datos del módulo de reportes,
para que el resto de historias de la épica pueda apoyarse en un schema estable.

**Criterios de Aceptación:**

**Dado** que se ejecuta la migración
**Cuando** se inspecciona la base de datos
**Entonces** existe la tabla `reports` con todas las columnas, CHECK constraints y valores DEFAULT definidos en PRD-REP-BE-01 §3.1
**Y** existen los 4 índices: `idx_reports_status_created`, `idx_reports_entity`, `idx_reports_reporter_created`, `idx_reports_reporter_id`
**Y** existe la vista `reports_summary_by_entity` según §3.2
**Y** RLS está habilitado con política `reports_select_own` (SELECT por `reporter_id`) según §3.4
**Y** la columna `reporter_id` admite NULL (AC-REP-BE-25)

---

### Historia 14.2: Dominio y repositorio de reportes

Como desarrollador,
quiero las capas de dominio e infraestructura del módulo de reportes,
para que los use cases puedan persistir y consultar reportes sin conocer los detalles de Supabase.

**Criterios de Aceptación:**

**Dado** que el módulo está implementado
**Cuando** se examina la estructura de código
**Entonces** existe `src/domain/entities/Report.ts`, `src/domain/repositories/IReportRepository.ts` con métodos: `create`, `findAllAdmin`, `findByIdAdmin`, `update`, `countByReporterAndEntity`, `countByReporterSince`, `hasPendingByReporterAndEntity`
**Y** existe `src/infrastructure/database/supabase/report.repository.ts`
**Y** existen DTOs en `src/application/dtos/report/`: `CreateReportDto`, `ReportListDto`, `ReportDetailDto`, `ResolveReportDto`

---

### Historia 14.3: Endpoint público POST /api/reports

Como usuario autenticado con email verificado,
quiero poder reportar un objeto o un perfil de usuario,
para que el equipo de moderación pueda revisar contenido inapropiado.

**Criterios de Aceptación:**

**Dado** que envío `POST /api/reports` con payload válido, JWT con email verificado y reCAPTCHA score ≥ 0.5
**Entonces** responde `201` con `{ id, message }` y el reporte queda en BD con `entity_snapshot` capturado

**Dado** que el usuario intenta reportar su propio objeto o su propio perfil
**Entonces** responde `422 SELF_REPORT_FORBIDDEN` (AC-REP-BE-04, AC-REP-BE-05)

**Dado** que el objeto está en estado `cancelled`
**Entonces** responde `422 ENTITY_NOT_REPORTABLE` (AC-REP-BE-06)

**Dado** que ya existe un reporte pendiente del mismo usuario sobre la misma entidad
**Entonces** responde `409 REPORT_ALREADY_PENDING` (AC-REP-BE-08)

**Dado** que el usuario envió 3 reportes sobre la misma entidad en las últimas 24h
**Entonces** responde `429 RATE_LIMIT_ENTITY_EXCEEDED` (AC-REP-BE-09)

**Dado** que el usuario envió 10 reportes totales en los últimos 7 días
**Entonces** responde `429 RATE_LIMIT_TOTAL_EXCEEDED` (AC-REP-BE-10)

**Dado** que el reporte es creado exitosamente
**Entonces** se envían TPL-011 al denunciante y TPL-ADM-002 al operador (fire-and-forget)
**Y** rate limit HTTP: 20 req / 15 min por IP

---

### Historia 14.4: Templates de email del módulo de reportes

Como sistema,
quiero los cuatro templates de email implementados en `ResendMailProvider`,
para que los use cases de reportes puedan notificar correctamente a todas las partes.

**Criterios de Aceptación:**

**Dado** que `CreateReportUseCase` dispara post-commit
**Entonces** el denunciante recibe TPL-011 (confirmación sin mención al denunciado) (AC-REP-BE-12)
**Y** el operador (`ADMIN_EMAIL`) recibe TPL-ADM-002 con reportId, tipo, motivo legible, snapshot y timestamp (AC-REP-BE-13)

**Dado** que `AdminResolveReportUseCase` completa el commit y `reporter_id IS NOT NULL`
**Entonces** el denunciante recibe TPL-012 con mensaje genérico de resolución (AC-REP-BE-19)

**Dado** que la acción de resolución es `warn_user`
**Entonces** el denunciado recibe TPL-013 con aviso genérico sin mención al reporte ni al denunciante (AC-REP-BE-18)

**Y** todos los templates usan `renderEmailLayout()` coherente con TPL-001…010

---

### Historia 14.5: Cola de moderación admin (GET endpoints)

Como administrador,
quiero ver el listado paginado de reportes y el detalle de cada uno,
para revisar la cola de moderación y obtener el contexto necesario para tomar decisiones.

**Criterios de Aceptación:**

**Dado** que hago `GET /api/admin/reports` con `status=pending`
**Entonces** responde `200` con lista FIFO (`created_at ASC`), paginada, con `pendingCountForEntity` via JOIN a `reports_summary_by_entity`

**Dado** que hago `GET /api/admin/reports/:id`
**Entonces** responde `200` con detalle completo incluyendo `reporter` con estadísticas y `reportedEntity.currentState` (estado actual en BD)
**Y** se genera entrada en `admin_audit_log` con `action = 'report.viewed'` (AC-REP-BE-21)

**Dado** que `reporter_id` ha sido anonimizado
**Entonces** todos los campos de `reporter` son `null` sin errores

---

### Historia 14.6: Resolución de reportes admin (POST endpoint)

Como administrador,
quiero cerrar un reporte con una acción de resolución y nota obligatoria,
para dejar trazabilidad de cada decisión de moderación y ejecutar las consecuencias correspondientes.

**Criterios de Aceptación:**

**Dado** que envío `POST /api/admin/reports/:id/resolve` con `action='archive'` y `resolutionNote` no vacío
**Entonces** el reporte pasa a `status='archived'`; entrada en `admin_audit_log` con `action='report.resolved'` (AC-REP-BE-20)
**Y** se envía TPL-012 al denunciante si `reporter_id IS NOT NULL`

**Dado** que envío `action='warn_user'` sobre reporte de tipo `user`
**Entonces** `status='resolved'`; se envía TPL-013 al denunciado

**Dado** que envío `action='cancel_item'` sobre reporte de tipo `item`
**Entonces** se invoca `AdminCancelItemUseCase` en transacción atómica (AC-REP-BE-16)

**Dado** que envío `action='suspend_user'` sobre reporte de tipo `user`
**Entonces** se invoca `AdminSuspendUserUseCase` en transacción atómica (AC-REP-BE-17)

**Dado** que el reporte ya está en estado `resolved` o `archived`
**Entonces** responde `409 REPORT_ALREADY_CLOSED`; reporte sin cambios (AC-REP-BE-14)

**Dado** que envío `action='cancel_item'` sobre reporte de tipo `user`
**Entonces** responde `422 ACTION_ENTITY_MISMATCH` (AC-REP-BE-15)

**Dado** que la acción intenta aplicar un estado que ya tiene la entidad
**Entonces** responde `409 ENTITY_STATE_CONFLICT`; reporte permanece en `pending` (AC-REP-BE-28)

**Dado** que `resolutionNote` está vacío
**Entonces** responde `400 VALIDATION_ERROR` (AC-REP-BE-27)

---

### Historia 14.7: Extensión de métricas, job de anonimización y analítica

Como sistema,
quiero completar el módulo de reportes con la extensión del dashboard de métricas, el job mensual de anonimización RGPD y la instrumentación analítica,
para que el operador tenga visibilidad sobre el estado de la cola y los datos cumplan con la retención.

**Criterios de Aceptación:**

**Dado** que llamo a `GET /api/admin/metrics`
**Entonces** la respuesta incluye el bloque `reports` con `pending`, `resolvedLast30Days` y `archivedLast30Days` (AC-REP-BE-26)

**Dado** que el job mensual se ejecuta (primer día del mes, 03:00 UTC)
**Entonces** reportes `resolved`/`archived` con `created_at < NOW() - 2 años` y `reporter_id IS NOT NULL` quedan con `reporter_id = NULL`
**Y** `appLogger` registra el número de filas anonimizadas; sin entrada en `admin_audit_log`

**Dado** que `CreateReportUseCase` completa el commit
**Entonces** se emite `emitEvent('report.submitted', reporterIdHash, { entityType, reason })` (AE-032, AC-REP-BE-22)
**Y** `properties` no incluye `reporter_id` en crudo ni `reported_entity_id`

**Dado** que `AdminResolveReportUseCase` completa el commit
**Entonces** se emite `emitEvent('report.resolved', adminUserIdHash, { action, entityType, resolutionTimeHours })` (AE-033, AC-REP-BE-23)
## Épica 15: Descubrimiento Público y SEO

Permitir el acceso público a la consulta de objetos para favorecer el descubrimiento y la indexación por buscadores.

**Referencia:** `docs/architecture.md` v1.8 §8.7, §12.12–12.13.

### Historia 15.1: Infraestructura SEO y Endpoints Públicos

Como usuario invitado o bot de búsqueda,
quiero ver el feed de objetos y sus detalles sin estar autenticado,
para descubrir el catálogo de la plataforma y que sea indexable por Google.

**Criterios de Aceptación:**

**Dado** una petición a `GET /api/items` sin token JWT
**Cuando** se procesa
**Entonces** responde `200 OK` con una lista global de objetos activos (sin filtro de 50km)
**Y** `distanceMeters` es `null` en cada objeto.

**Dado** una petición a `GET /api/items/:id` sin token JWT
**Cuando** se procesa
**Entonces** responde `200 OK` con el detalle del objeto
**Y** los campos `donor.firstName`, `donor.lastName` y `donor.avatarUrl` están anonimizados ("Anónimo" / null).

**Dado** un UUID válido que no existe en la tabla `items`
**Cuando** se llama a `GET /api/items/:id`
**Entonces** responde `410 Gone`.

**Dado** un usuario autenticado
**Cuando** llama a `GET /api/items`
**Entonces** sigue recibiendo resultados filtrados por su radio de 50km (regresión).

**Spec:** `_bmad-output/implementation-artifacts/spec-public-discovery-seo.md`
