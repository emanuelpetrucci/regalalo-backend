# Changelog

Todos los cambios notables de este proyecto se documentarán en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto se adhiere a [Versionado Semántico](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-10-28

### Added

- Campo `slug` único en `items` (migración `026`, realineado en `027`). Se genera al publicar y la migración lo rellena en las filas existentes. `POST /api/items`, `GET /api/items`, `GET /api/items/:id` y `GET /api/users/me/items` lo devuelven. El detalle acepta un UUID v4 o un slug; un parámetro inválido responde 400 y un objeto ausente 410.

## [1.4.0] - 2026-06-18

### Added

- Scripts operativos y de entorno en `package.json`: `dev:remote:prod`, `backfill:location-names` (`dev`/`prod`) y `admin:create` (`dev`).
- Campo `locationName` agregado en DTOs/schemas admin relevantes y en OpenAPI para mantener consistencia entre API y panel.
- `GET /api/admin/system/health` ampliado con bloques de observabilidad de `storage`, `database`, `generalConfig` y `stackVersions`, manteniendo `alerts`, `cronJobs` y cola de borrado.

### Changed

- Contratos de `IAdminSystemHealthRepository` y `AdminSystemHealthResponse` extendidos con métricas de base de datos/Storage para diagnóstico operativo.
- Schemas OpenAPI y tests de admin metrics/system health alineados con la nueva forma de respuesta.

## [1.3.0] - 2026-06-15

### Added

- **Descubrimiento público y SEO (Epic 13):** `GET /api/items` y `GET /api/items/:id` ahora son accesibles sin token JWT (modo guest). El feed global retorna todos los objetos activos sin filtro de radio con `distanceMeters: null`. El detalle retorna el donante anonimizado (`donor.id: null`, `donor.firstName: "Anónimo"`, `donor.avatarUrl: null`) preservando `reputationScore`. Los tokens presentes pero inválidos siguen devolviendo 401 (fallo activo). Los usuarios autenticados siguen recibiendo resultados filtrados por radio de 50 km con `distanceMeters` calculado y datos reales del donante.
- **GoneException (HTTP 410):** `GET /api/items/:id` con UUID inexistente responde 410 Gone en lugar de 404 Not Found, tanto para invitados como para usuarios autenticados.
- **Middleware de autenticación opcional:** `createOptionalAuthMiddleware` en `auth.middleware.ts` permite rutas públicas que opcionalmente aceptan credenciales.

## [1.2.0] - 2026-06-15

### Added

- Localización de emails transaccionales en español (es), catalán (ca) e inglés (en). Los 10 templates (TPL-001…010) seleccionan idioma según `user.preferredLanguage`, incluyendo subject, body, botones CTA, saludo del layout, fallback-link label, footer y etiquetas de condición de objeto.
- Campo `language` opcional en `POST /api/auth/register` para que el frontend pase el idioma del usuario en el momento del alta; se persiste como `preferredLanguage` y se usa para el email de verificación inicial.
- Localización de templates de reportes: TPL-011 (confirmación al denunciante), TPL-012 (resolución al denunciante) y TPL-013 (advertencia al denunciado) ahora soportan es/ca/en según `user.preferredLanguage`. `getReportedEntityLabel` y `getReportReasonLabel` en `condition-labels.ts` convertidas a mapas multi-idioma.
- `EmailTemplateRenderer` firma extendida con `language?` en todos los templates del módulo de reportes y admin (TPL-ADM-001, TPL-ADM-002 la ignoran por ser emails internos).
- Bug fix: `CreateReportUseCase` ahora pasa `reportedEntityType` y `reason` a TPL-011 (anteriormente el email de confirmación recibía variables incompletas).
- Límite de 255 caracteres en campo email en validadores de registro, login y forgot-password (defensa en profundidad RFC 5321).
- Exención del rate limit global para `GET /api/health` (evita throttling en servicios de monitorización).

## [1.3.0] - 2026-06-11

### Added

- Historia 14-7: extensión de métricas, job de anonimización RGPD y analítica del módulo de reportes.
  - `GET /api/admin/metrics` incluye bloque `reports` con `pending`, `resolvedLast30Days` y `archivedLast30Days`.
  - `IReportRepository.countMetrics()` con implementación SQL (aggregate FILTER) en `PostgresReportRepository`.
  - `AdminGetMetricsUseCase` recibe `reportRepo` e incluye métricas de reportes en el `Promise.all`.
  - Migración `022-anonymize-reporter-id-job.sql`: job pg_cron mensual (1er día del mes, 03:00 UTC) que anonimiza `reporter_id` en reportes `resolved`/`archived` con más de 2 años (RGPD — D-REP-07).
  - AE-033 analytics: `safeEmitEvent('report.resolved', ...)` fire-and-forget post-commit en `AdminResolveReportUseCase` con `{ action, entityType, resolutionTimeHours }`.
  - Tests HTTP 14.7.1 (bloque reports en métricas) y 14.7.2 (AE-033 spy post-resolución).
  - Schema OpenAPI `adminMetricsResponseSchema` actualizado con bloque `reports`.

### Fixed

- Etiquetas de condición de ítem en emails (`new`, `fair`) alineadas con los labels del frontend: "a estrenar" y "aceptable" reemplazan "nuevo" y "estado regular" respectivamente (afecta TPL-003 y TPL-010).

### Added (cont.)

- Historia 14-6: resolución de reportes admin — POST endpoint.
  - `POST /api/admin/reports/:id/resolve`: cierra un reporte con acción (`archive`, `warn_user`, `cancel_item`, `suspend_user`) y nota obligatoria.
  - `AdminResolveReportUseCase` con cascada: ejecuta `AdminCancelItemUseCase` o `AdminSuspendUserUseCase` según acción, actualiza reporte y registra en `admin_audit_log` (action = `report.resolved`).
  - Emails post-commit fire-and-forget: TPL-012 al denunciante (si no anonimizado) y TPL-013 al denunciado si `warn_user`.
  - Validator Zod `admin-resolve-report.validator.ts`.
  - Schemas OpenAPI `AdminResolveReportRequest` y `AdminResolveReportResponse`; path registrado.
  - 14 tests HTTP en `tests/admin-reports.test.ts` cubriendo todos los ACs (401, 400, 404, 409 REPORT_ALREADY_CLOSED, 422 ACTION_ENTITY_MISMATCH, 409 ENTITY_STATE_CONFLICT, 200 archive/cancel_item/suspend_user/warn_user, audit log, TPL-012 anonimizado).

- Historia 14-5: cola de moderación admin — GET endpoints.
  - `GET /api/admin/reports`: lista paginada de reportes con filtros (status, reportedEntityType, reason, dateFrom, dateTo) y orden FIFO (created_at ASC).
  - `GET /api/admin/reports/:id`: detalle completo con estado actual de la entidad, datos del denunciante (o `null` si anonimizado) y entrada en `admin_audit_log` (action = `report.viewed`).
  - `AdminListReportsUseCase` y `AdminGetReportDetailUseCase` en `application/use-cases/admin/reports/`.
  - `AdminReportsController` en `interfaces/http/controllers/`.
  - Validator Zod `admin-list-reports.validator.ts` con defaults (`status=pending`, `page=1`, `limit=20`) y validación max limit=100.
  - Schemas OpenAPI `AdminReportListResponse` y `AdminReportDetailResponse` en `report.schemas.ts`; paths registrados.
  - Fix BUG: `findAllAdmin` cambia `ORDER BY created_at DESC` → `ASC` (FIFO según PRD §4.2).
  - 12 tests HTTP en `tests/admin-reports.test.ts` cubriendo 401, lista, filtros, validación 400, 404, detalle, audit log y reporter anonimizado.

- Historia 14-4: templates de email del módulo de reportes.
  - `TPL-011` (`tpl-011-report-confirmation.ts`): confirmación al denunciante tras crear un reporte.
  - `TPL-012` (`tpl-012-report-resolved.ts`): notificación al denunciante cuando su reporte es resuelto.
  - `TPL-013` (`tpl-013-warn-user.ts`): advertencia al usuario denunciado sin revelar el reporte ni al denunciante.
  - `TPL-ADM-002` (`tpl-adm-002-new-report-admin.ts`): notificación al operador con ID, enlace al panel, tipo, motivo, snapshot title, denunciante y timestamp.
  - Mapa `REPORT_REASON_LABELS` y helpers `getReportReasonLabel` / `getReportedEntityLabel` en `condition-labels.ts` para traducir enums a labels legibles en español.
  - Los 4 templates registrados en `emailTemplateRegistry` con claves `TPL-011`, `TPL-012`, `TPL-013`, `TPL-ADM-002`.
  - 36 tests Vitest (4 archivos individuales + fixtures en snap global) con snapshot + assertions de contenido.

- Historia 14-3: endpoint público `POST /api/reports`.
  - Nueva excepción `TooManyRequestsException` (HTTP 429) en `domain/exceptions/`.
  - Nuevo método `IItemRepository.findForReport(itemId)` con implementación SQL mínima en `PostgresItemRepository`.
  - Servicio liviano `ItemReadService` (`application/services/`) que lee datos de items y usuarios para el use case de reportes sin dependencias cruzadas.
  - Use case `CreateReportUseCase` con flujo completo: validación reCAPTCHA V3, verificación de auto-reporte, check de reportabilidad (items `cancelled`), deduplicación de reporte activo, límites de tasa (3/24h misma entidad + 10/7d total), INSERT vía `IReportRepository.create`, y post-commit fire-and-forget (TPL-011 al denunciante, TPL-ADM-002 al operador, AE-032 vía `safeEmitEvent`).
  - Validator Zod `report.validator.ts` con schema: `reportedEntityType`, `reportedEntityId` (UUID v4), `reason` (enum 8 valores), `description?` (max 500), `recaptchaToken`.
  - Controller `ReportController` y rutas `POST /api/reports` con middlewares: `requireAuth` + `requireEmailVerified`, `reportRateLimit` (20 req/15 min por IP), validación Zod.
  - Middleware `report-rate-limit.ts` con instancia separada de `express-rate-limit`.
  - Schema OpenAPI `report.schemas.ts` con body y response 201; path `/reports` registrado.
  - 15 tests HTTP de integración en `tests/reports-create.test.ts` cubriendo todos los códigos de respuesta del AC-5.

- Historia 14-2: dominio e infraestructura del módulo de reportes.
  - Entidad `Report` con todos los campos de la tabla `reports` mapeados a camelCase; union types `ReportEntityType`, `ReportReason`, `ReportStatus`, `ResolutionAction`; tipo `EntitySnapshot` (discriminated union `ItemSnapshot | UserSnapshot`).
  - Contrato `IReportRepository` con 7 métodos: `create`, `findAllAdmin`, `findByIdAdmin`, `update`, `countByReporterAndEntity`, `countByReporterSince`, `hasPendingByReporterAndEntity`; interfaces `CreateReportInput`, `AdminReportQuery`, `AdminReportRecord`, `AdminReportDetailRecord`, `UpdateReportInput`.
  - Implementación `PostgresReportRepository` con `pg.Pool`, SQL explícito y `mapRow` privado para mapeo DB → dominio; `findAllAdmin` con filtros dinámicos, paginación y subquery de `pendingCountForEntity`; `findByIdAdmin` con JOIN de reporter y lookup de entidad reportada.
  - DTOs en `src/application/dtos/report/`: `CreateReportDto`, `ReportListDto`, `ReportDetailDto`, `ResolveReportDto`.
- Historia 14-1: migración SQL para el módulo de reportes.
  - Nueva tabla `reports` con columnas, CHECK constraints y valores por defecto según PRD-REP-BE-01 §3.1. `reporter_id` permite NULL (anonimización RGPD futura).
  - RLS habilitado con política `reports_select_own` (SELECT por `reporter_id`).
  - Índices: `idx_reports_status_created`, `idx_reports_entity`, `idx_reports_reporter_created`, `idx_reports_reporter_id`.
  - Vista `reports_summary_by_entity` con conteos por estado por entidad.
- Historia 13-2: autenticación de administrador con doble factor (email + OTP).
  - Endpoint `POST /api/admin/auth/login`: valida credenciales y envía OTP por email (TPL-ADM-001).
  - Endpoint `POST /api/admin/auth/verify-otp`: verifica OTP y emite JWT admin (8h, `ADMIN_JWT_SECRET`).
  - Middleware `requireAdminAuth`: valida JWT admin, `jwtVersion` y `isActive`; inyecta `req.adminUser`.
  - Rate limit 10 req/15 min en rutas `/api/admin/auth`.
  - CORS restrictivo para `/api/admin/*` (`ADMIN_CORS_ORIGIN`, dev: `http://localhost:4201`).
  - Template de email `TPL-ADM-001` con código OTP de 6 dígitos para acceso al panel.
  - Nuevas variables de entorno: `ADMIN_JWT_SECRET` (min 64 chars), `ADMIN_EMAIL`, `ADMIN_CORS_ORIGIN`.
- Historia 13-3: gestión de usuarios por el administrador.
  - `GET /api/admin/users`: listado paginado con filtros (search, status, emailVerified). Incluye `isPassive` e `isHoarder` calculados en SQL.
  - `GET /api/admin/users/:id`: detalle completo del usuario con historial de reputación (delivery_completed, no_show, admin_correction), conteos de items activos y completados.
  - `POST /api/admin/users/:id/suspend`: suspensión atómica — desactiva usuario, incrementa `jwt_version`, pausa objetos `active` y no pausados; campo `paused_by_admin=TRUE` distingue la pausa admin de la voluntaria.
  - `POST /api/admin/users/:id/reactivate`: reactivación atómica — solo reactiva objetos con `paused_by_admin=TRUE`.
  - `POST /api/admin/users/:id/force-verification`: fuerza envío de TPL-009 sin cooldown de 30 segundos.
  - `POST /api/admin/users/:id/correct-reputation`: inserta evento `admin_correction` en `reputation_events` y actualiza `reputation_score` atómicamente.
  - `POST /api/admin/users/:id/reset-no-shows`: resetea `consecutive_no_shows` a 0.
  - Auditoría transversal: todas las acciones registran en `admin_audit_log` con `payloadSnapshot` del estado previo e `ip_address`.
  - El campo `location` (GEOGRAPHY) nunca aparece en ningún DTO de respuesta admin.
- Historia 13-4: gestión de objetos por el administrador.
  - `GET /api/admin/items`: listado paginado con filtros (search, status, category, degraded, donorId). Incluye `requestCount` e imágenes.
  - `GET /api/admin/items/:id`: detalle completo con donor, lista de solicitudes (incluyendo datos del solicitante y `reputationScore`), y sesión activa si existe.
  - `POST /api/admin/items/:id/cancel`: cancelación atómica — cancela objeto, sesión activa (si la hay) y requests pendientes. Envía TPL-005 al receptor si el objeto estaba `reserved`. Lanza 409 si el objeto ya está `cancelled` o `completed`.
  - `POST /api/admin/items/:id/reactivate`: reactiva objeto `cancelled`, resetea `requests_paused`, `paused_by_admin` y `degraded_at`. Lanza 409 si el objeto no está `cancelled`.
  - Auditoría: `item.cancelled` e `item.reactivated` registrados en `admin_audit_log` con `payloadSnapshot` del status previo.
  - Validación UUID en todos los `:id` params (400 para no-UUID).
- Historia 13-5: gestión de sesiones de entrega por el administrador.
  - `GET /api/admin/sessions`: listado paginado con filtros combinables (status, overdue, userId). Incluye item, donor y receiver anidados.
  - `GET /api/admin/sessions/:id`: detalle completo con `contactChannel` real (solo si `contactPurged=false`; si purgado retorna `null`). Registra `data.contact_channel_accessed` en `admin_audit_log` solo cuando el dato está visible.
  - `POST /api/admin/sessions/:id/force-expire`: expiración forzada atómica — actualiza sesión a `expired` y reactiva el objeto (`status='active', reserved_at=NULL`). Registra `session.force_expired` con `payloadSnapshot` del estado previo. No envía TPL-004.
  - Lanza 409 si la sesión no está `active`; 404 si no existe; 400 para IDs no-UUID.
- Historia 13-6: métricas operativas y estado del sistema para el panel administrativo.
  - `GET /api/admin/metrics`: retorna conteos en tiempo real de usuarios (total, activos, suspendidos, sin verificar >24h, pasivos, acaparadores), ítems (por estado + degradados) y sesiones (activas, últimos 30 días por estado). `noShowRate` es `null` si el denominador es 0. Todos los COUNTs ejecutados en paralelo (`Promise.all`) para respuesta sub-500ms.
  - `GET /api/admin/system/health`: retorna estado de los jobs pg_cron (última ejecución + status), cola de borrado de storage pendiente y usuarios sin verificar >24h. Resiliente a entornos sin extensión `pg_cron` (retorna `cronJobs: []`).
  - Nuevos métodos en `IDeliverySessionRepository`: `countActive()`, `countByStatusLast30Days()`, `countNoShowLast30Days()`.

## [1.1.0] - 2026-06-08

### Added

- Migración `020-admin-panel-schema.sql`: nuevas tablas `admin_users`, `admin_otp_tokens` y `admin_audit_log` para el panel administrativo (historia 13-1).
- Campo `paused_by_admin BOOLEAN NOT NULL DEFAULT FALSE` en tabla `items`, para distinguir pausas aplicadas por admin de las voluntarias del donante.
- Constraint `reputation_events_type_check` ampliado con el tipo `admin_correction`, necesario para la corrección manual de reputación desde el panel.

## [1.0.1] - 2026-06-08

### Fixed

- TPL-010: corregida ruta del botón "Explorar objetos" de `/explore` a `/explorar`, que causaba 404 en el frontend Angular.
- TPL-003: el botón "Ver en la app" ahora enlaza a `/entregas/{sessionId}` en lugar de la landing page, que disparaba `purgeAuthStorageGuard` y cerraba la sesión del receptor.
- Row Level Security (RLS) habilitado en todas las tablas de aplicación del esquema `public` sin políticas para `anon`/`authenticated`, bloqueando el acceso a datos de negocio vía PostgREST/Data API. El backend sigue autorizando en use-cases (BOLA) con conexión privilegiada (`DATABASE_URL` / `service_role`).
- Habilitada Content Security Policy (CSP) con Helmet. Reemplaza `contentSecurityPolicy: false` por una configuración que preserva los defaults seguros de Helmet, permite recursos de Supabase (`*.supabase.co`) y soporta Swagger UI mediante `unsafe-inline` en entornos no-productivos.

## [1.0.0] - 2026-05-29

Primera versión de producción del backend de **Regálalo**.

### Added

- API REST bajo `/api` con Clean Architecture (domain → application → infrastructure → interfaces).
- Registro de usuario con email, contraseña, nombre, apellido, código postal y reCAPTCHA v3.
- Geocodificación automática del código postal al registrarse (Nominatim + caché LRU).
- Login con emisión de JWT (7 días) e invalidación por `jwt_version`.
- Recuperación y reset de contraseña con token de 1 hora y email transaccional.
- Middleware de autenticación con validación de JWT y versión en base de datos.
- Verificación de email (`GET /auth/verify-email`, `POST /auth/resend-verification` con cooldown de 30 s).
- Middleware que rechaza usuarios con `email_verified = false` en rutas protegidas (403 `EMAIL_NOT_VERIFIED`).
- Publicación de objetos con título, descripción, condición, categoría, rango de peso, ubicación e imágenes (hasta 5).
- Listado geoespacial de objetos activos en radio de 50 km con paginación; objetos degradados al final.
- Detalle de objeto con distancia, imágenes y reputación del donante.
- Cancelación de objeto (con o sin sesión activa) y notificaciones por email.
- Pausa y reanudación de solicitudes (`PATCH /items/:id/pause`).
- Solicitud de objeto con límite de 3 solicitudes en ventana deslizante de 720 h (transacción SERIALIZABLE).
- Listado de candidatos rankeados para el donante (`GET /items/:id/requests`).
- Ranking por score efectivo, distancia y antigüedad de solicitud (perturbación ±2 puntos).
- Exclusión de solicitantes pasivos y control de acaparador Tier 1 (−15) y Tier 2 (exclusión del listado).
- Selección de receptor con sesión de entrega activa (deadline 7 días) y reserva del objeto.
- Detalle de sesión con canal de contacto visible solo al receptor en sesión activa.
- Confirmación de entrega con reputación asimétrica (+10/+15 donante, +1 receptor).
- Cancelación de sesión con opción de no-show y penalización escalonada (−10 × racha consecutiva).
- Perfil privado (`GET /users/me`) y actualización parcial (`PATCH /users/me`).
- Historial de reputación, sesiones de entrega, objetos publicados y solicitudes realizadas del usuario autenticado.
- Perfil público de usuario (`GET /users/:id`) sin email ni datos sensibles.
- Campos `category` y `weight_range` en ítems con validación en BD y API.
- Instrumentación analítica (eventos AE-001…AE-031) con persistencia dual en PostgreSQL.
- Plantillas de email transaccionales TPL-001…TPL-010 vía Resend con layout unificado de marca.
- Digest de objetos cercanos (`POST /jobs/nearby-items-digest`) protegido por `CRON_SECRET`; idempotencia por columna `digest_notified_at`.
- Jobs pg_cron: degradación de objetos inactivos, purga de imágenes, purga de canal de contacto, incremento de `cycles_at_limit` y expiración de sesiones de entrega.
- OpenAPI 3.0 generado en build; Swagger UI en desarrollo (`/api/docs`).
- PostgreSQL + PostGIS (Supabase); SQL directo sin ORM.
- Almacenamiento de imágenes en Supabase Storage con fallback local (`STORAGE_DRIVER=local`).
- Logging estructurado con Pino.
- Scripts de migración y seed para entornos local, dev y prod.
- Suite de tests con Vitest, incluyendo casos QA de ranking (CASO-01…24).

### Fixed

- Digest de objetos cercanos: eliminada ventana temporal de 1 hora en `claimPendingDigestItems`; objetos con `digest_notified_at IS NULL` ahora se procesan en el siguiente run del cron aunque hayan sido publicados hace más de 1 hora.
- Endpoint `/api/jobs/nearby-items-digest` responde también a `GET` para compatibilidad con cron-job.org.

### Security

- Contraseñas hasheadas con Argon2.
- Cabeceras de seguridad HTTP con Helmet (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy).
- Rate limiting global (60 req/IP/60 s) y por ruta en auth (10 req/IP/15 min) y ranking (10 req/IP/1 min).
- Invalidación de sesiones mediante `jwt_version` en reset de contraseña y cambio de código postal.
- Endpoints de jobs protegidos con `X-Cron-Secret`.
- Row Level Security (RLS) habilitado en todas las tablas de aplicación del esquema `public` sin políticas para `anon`/`authenticated`, bloqueando el acceso a datos de negocio vía PostgREST/Data API.
- Adaptador de almacenamiento local: validación de path traversal para prevenir acceso a ficheros fuera del directorio de almacenamiento designado.
- `trust proxy: 1` habilitado en Express para que `express-rate-limit` use la IP real del cliente detrás del proxy de Render.

[Unreleased]: https://github.com/emanuelpetrucci/regalalo-backend/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/emanuelpetrucci/regalalo-backend/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/emanuelpetrucci/regalalo-backend/releases/tag/v1.4.0
[1.0.0]: https://github.com/emanuelpetrucci/regalalo-backend/releases/tag/v1.0.0
