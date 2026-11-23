---
title: "Sprint Change Proposal — Panel Administrativo Backend"
date: "2026-06-08"
trigger: "Nuevo PRD aprobado: PRD-ADM-BE-01"
scope: major
status: draft
output_file: _bmad-output/initiative-backend/sprint-change-proposal-2026-06-08-admin-panel.md
---

# Sprint Change Proposal — Panel Administrativo Backend

**Fecha:** 2026-06-08
**Referencia PRD:** `docs/prd-backend-admin.md` (PRD-ADM-BE-01 v1.0, aprobado)
**Bloque:** Bloque 1 — Operabilidad mínima
**Prioridad:** P0

---

## 1. Resumen del desencadenante

Se incorpora al backlog el PRD aprobado `PRD-ADM-BE-01 — Backend del Panel Administrativo`, que define el sistema administrativo de Regálalo: autenticación independiente para admins, gestión operativa de usuarios/objetos/sesiones, cola de reportes, métricas y log de auditoría.

No hay conflicto con trabajo existente — todas las épicas 1–12 están `done`. El cambio es **aditivo**: añade Épica 13 y actualiza artefactos de planificación para incorporar los nuevos requisitos funcionales (FR53–FR60) y las modificaciones de esquema necesarias.

---

## 2. Análisis de impacto

### 2.1 Impacto en épicas existentes

| Épica | Estado | Impacto |
|-------|--------|---------|
| Épica 2 — Objetos | done | **Impacto de esquema**: el campo `paused_by_admin` se añade a `items` en la Historia 13.1. Las historias 2.4 y 2.5 ya implementadas NO se reabren; el campo nuevo tiene `DEFAULT FALSE` y no altera el comportamiento de las rutas existentes. |
| Épica 4 — Sesiones | done | **Impacto de esquema**: el constraint `reputation_events.type` se amplía para incluir `admin_correction`. Los use cases `ConfirmDelivery` (tipo `delivery_completed`) y `CancelSession` con no-show (tipo `no_show`) no se ven afectados — solo se añade un valor nuevo. |
| Épicas 3, 5–12 | done | Sin impacto. |

### 2.2 Impacto en artefactos de planificación

| Artefacto | Cambio requerido |
|-----------|-----------------|
| `_bmad-output/initiative-backend/archive-v6/epics.md` | Añadir FR53–FR60 al Inventario de Requisitos, mapa de cobertura, y definición completa de Épica 13 con 7 historias |
| `_bmad-output/initiative-backend/archive-v6/sprint-status.yaml` | Añadir entradas `epic-13` y todas las historias 13-1 a 13-7 en estado `backlog` |
| `docs/prd-backend-admin.md` | Ya existe — es el PRD fuente; sin cambios |
| `_bmad-output/project-context.md` | **Corrección menor**: campo Hosting dice `Railway`; el PRD §12 confirma que el hosting real es **Render**. Actualizar la tabla de Technology Stack. |

### 2.3 Impacto técnico — modificaciones de esquema

Estas tres migraciones son el único contacto con código implementado y deben ejecutarse atómicamente en la Historia 13.1:

```sql
-- 1. Tres tablas nuevas (sin tocar tablas existentes)
CREATE TABLE admin_users ...
CREATE TABLE admin_otp_tokens ...
CREATE TABLE admin_audit_log ...

-- 2. Campo nuevo en items (DEFAULT FALSE — no rompe queries existentes)
ALTER TABLE items ADD COLUMN paused_by_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Ampliar constraint en reputation_events (DROP + ADD)
ALTER TABLE reputation_events DROP CONSTRAINT reputation_events_type_check;
ALTER TABLE reputation_events ADD CONSTRAINT reputation_events_type_check
  CHECK (type IN ('delivery_completed', 'no_show', 'admin_correction'));
```

> **Riesgo de la migración 3:** DROP + ADD de CHECK constraint es una operación DDL sin datos incorrectos, pero requiere bloqueo breve de tabla. En producción (Render/Supabase) ejecutar en ventana de bajo tráfico.

### 2.4 Variables de entorno nuevas

| Variable | Descripción |
|----------|-------------|
| `ADMIN_JWT_SECRET` | Secret independiente para JWT admin (mín. 64 chars — `openssl rand -hex 64`) |
| `ADMIN_EMAIL` | Email del admin para seed inicial |

### 2.5 Template de email nuevo

| Código | Evento |
|--------|--------|
| TPL-ADM-001 | OTP para login de administrador (sin enlace de acción — código manual) |

---

## 3. Enfoque recomendado

**Opción seleccionada: Ajuste directo (Option 1)**

El PRD es aditivo y autocontenido. No requiere rollback ni revisión del scope MVP existente. La estrategia es:

1. Actualizar `epics.md` con FR53–FR60 y Épica 13 completa (7 historias)
2. Actualizar `sprint-status.yaml` con epic-13 en `backlog`
3. Corregir la nota de hosting en `project-context.md`
4. Implementar en orden según §11 del PRD: modelo de datos → auth → users → items → sessions → metrics → reports (bloqueado)

**Esfuerzo estimado:** Alto (módulo completo: auth 2FA, 6 submódulos CRUD + auditoría)
**Riesgo:** Bajo para el sistema existente; las migraciones de esquema tienen impacto mínimo.

---

## 4. Propuestas de cambio detalladas

### 4.1 Cambios en `epics.md`

#### 4.1.A — Inventario: Nuevos Requisitos Funcionales (añadir al final de "Requisitos Funcionales")

```
FR53: El sistema debe autenticar administradores con tabla `admin_users` independiente, password Argon2 + OTP de 6 dígitos por email (Resend), y emitir JWT de 8 horas firmado con `ADMIN_JWT_SECRET` separado del JWT de usuarios. No existe endpoint de registro; la cuenta se crea manualmente.
FR54: El sistema debe permitir al administrador autenticado gestionar usuarios: buscar con filtros (email, estado, verificación), ver perfil completo con historial de reputación, suspender (cascada: jwt_version++, objetos activos pausados), reactivar (solo revierte pausas de origen admin), forzar verificación de email, corregir reputación con delta y razón, y resetear contador de no-shows.
FR55: El sistema debe permitir al administrador gestionar objetos: buscar con filtros, ver detalle con solicitudes y sesión activa, cancelar objetos activos/reservados (reutilizando lógica de CancelItem), y reactivar objetos cancelados.
FR56: El sistema debe permitir al administrador gestionar sesiones de entrega: listar con filtros, ver detalle (con registro de acceso a contactChannel en audit log), y forzar expiración de sesiones activas (reutilizando lógica del Job 5).
FR57: El sistema debe exponer una cola de reportes al administrador: listar, ver detalle y resolver con acción y nota. Dependiente de INIT-REP-01 — contratos pendientes de definición conjunta.
FR58: El sistema debe exponer métricas operativas al administrador: totales de usuarios (activos, suspendidos, no verificados >24h, pasivos, acaparadores), objetos por estado, sesiones (últimos 30 días) y tasa de no-shows.
FR59: El sistema debe exponer el estado del sistema al administrador: últimas ejecuciones de jobs pg_cron (vía `cron.job_run_details`), cola de borrado de Storage pendiente y usuarios sin verificar >24h.
FR60: Toda acción del administrador debe registrarse en `admin_audit_log` con admin_user_id, action, entity_type, entity_id, payload_snapshot (estado anterior), e ip_address. Retención indefinida en MVP.
```

#### 4.1.B — Mapa de Cobertura (añadir al final del mapa existente)

```
FR53: Épica 13 — Autenticación admin (admin_users, OTP, JWT independiente)
FR54: Épica 13 — Gestión de usuarios por admin
FR55: Épica 13 — Gestión de objetos por admin
FR56: Épica 13 — Gestión de sesiones por admin
FR57: Épica 13 — Cola de reportes (bloqueado hasta INIT-REP-01)
FR58: Épica 13 — Métricas operativas
FR59: Épica 13 — Estado del sistema (pg_cron, Storage queue)
FR60: Épica 13 — Auditoría transversal (admin_audit_log)
```

#### 4.1.C — Lista de Épicas: nueva entrada (añadir tras Épica 12)

```markdown
### Épica 13: Panel Administrativo Backend (PRD-ADM-BE-01)

Autenticación independiente para administradores (tabla `admin_users`, OTP por email, JWT 8h con secret dedicado) y módulos de gestión operativa: usuarios, objetos, sesiones de entrega, cola de reportes (pendiente INIT-REP-01), métricas operativas y estado del sistema. Todas las acciones generan entrada en `admin_audit_log`. CORS restrictivo a `admin.regalalo.org`. Plataforma: Render.

**FRs cubiertos:** FR53, FR54, FR55, FR56, FR57 (bloqueado), FR58, FR59, FR60

**Referencia:** `docs/prd-backend-admin.md` (PRD-ADM-BE-01 v1.0)
**Dependencias:** INIT-REP-01 (Historia 13.7 bloqueada hasta esa entrega)
```

#### 4.1.D — Definición completa de Épica 13 con historias (añadir al final del documento)

```markdown
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

**Dado** que se ejecuta la migración
**Cuando** se consulta la tabla `items`
**Entonces** existe la columna `paused_by_admin BOOLEAN NOT NULL DEFAULT FALSE`
**Y** todos los registros existentes tienen `paused_by_admin = FALSE`

**Dado** que se ejecuta la migración
**Cuando** se verifica el constraint `reputation_events_type_check`
**Entonces** acepta los valores `delivery_completed`, `no_show` y `admin_correction`

**Dado** que existen registros en `reputation_events` con los tipos previos (`delivery_completed`, `no_show`)
**Cuando** se ejecuta la migración
**Entonces** esos registros no son afectados

**Notas de implementación:**
- Índices a crear: `idx_admin_otp_active`, `idx_admin_audit_created`, `idx_admin_audit_entity` (PRD §3.2–3.3)
- La migración del constraint debe DROP + ADD en la misma transacción DDL
- Archivos: migración SQL en `db/migrations/`, entidades en `src/modules/admin/domain/entities/`, interfaces de repositorios en `src/modules/admin/domain/repositories/`

---

### Historia 13.2: Autenticación de administrador

Como administrador,
quiero poder autenticarme con email, contraseña y código OTP enviado por email,
para acceder al panel de administración con doble factor de seguridad.

**Criterios de Aceptación:**

**Dado** que envío `POST /api/admin/auth/login` con email y contraseña correctos
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ message: "Código enviado al email registrado" }`
**Y** se envía TPL-ADM-001 con código OTP de 6 dígitos válido 10 minutos
**Y** se registra `admin.otp_requested` en `admin_audit_log`
**Y** tokens OTP previos del admin quedan invalidados (`used = TRUE`)

**Dado** que envío `POST /api/admin/auth/login` con email inexistente o contraseña incorrecta
**Cuando** el servidor procesa la petición
**Entonces** responde `401` con código `INVALID_CREDENTIALS` — respuesta idéntica en ambos casos (sin revelar si el email existe)

**Dado** que envío `POST /api/admin/auth/verify-otp` con email y OTP correcto dentro de los 10 minutos
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ token: JWT (8h), admin: { id, email } }`
**Y** el JWT incluye `{ sub, role: "admin", jwtVersion, iat, exp }` firmado con `ADMIN_JWT_SECRET`
**Y** se registra `admin.login` en `admin_audit_log`

**Dado** que envío `POST /api/admin/auth/verify-otp` con OTP incorrecto
**Cuando** el servidor procesa la petición
**Entonces** responde `401` con código `OTP_INVALID`
**Y** si se alcanzaron 3 intentos fallidos, el token se invalida y responde `OTP_MAX_ATTEMPTS`

**Dado** que el OTP lleva más de 10 minutos desde su creación
**Cuando** envío `POST /api/admin/auth/verify-otp`
**Entonces** responde `401` con código `OTP_EXPIRED`

**Dado** que envío una petición a cualquier ruta `/api/admin/*` (excepto auth) sin JWT admin o con JWT de usuario regular
**Cuando** el middleware `requireAdminAuth` procesa la petición
**Entonces** responde `401 Unauthorized`

**Dado** que envío más de 10 peticiones en 15 minutos a `POST /api/admin/auth/login` o `verify-otp` desde la misma IP
**Cuando** llega la petición 11
**Entonces** responde `429 Too Many Requests`

**Dado** que llega una petición a `/api/admin/*` desde un Origin distinto de `https://admin.regalalo.org`
**Cuando** el middleware CORS procesa la petición
**Entonces** la petición es rechazada (en producción)

**Notas de implementación:**
- `ADMIN_JWT_SECRET` independiente de `JWT_SECRET` (mín. 64 chars)
- Archivos: `AdminLoginUseCase`, `AdminVerifyOtpUseCase`, `AdminAuthController`, `requireAdminAuth.ts`, `adminRateLimit.ts`, `admin.routes.ts`, TPL-ADM-001

---

### Historia 13.3: Gestión de usuarios por el administrador

Como administrador autenticado,
quiero buscar usuarios, ver su perfil completo y ejecutar acciones operativas sobre ellos,
para mantener la integridad del ecosistema.

**Criterios de Aceptación:**

**Dado** que envío `GET /api/admin/users` con filtros opcionales (`search`, `status`, `emailVerified`, `page`, `limit`)
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con lista paginada de usuarios incluyendo `isPassive` e `isHoarder` calculados
**Y** el campo `location` nunca aparece en la respuesta

**Dado** que envío `GET /api/admin/users/:id` con UUID válido
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con perfil completo incluyendo `reputationHistory`, `activeItems` y `completedItems`

**Dado** que envío `POST /api/admin/users/:id/suspend` sobre un usuario activo
**Cuando** el servidor procesa la petición en transacción atómica
**Entonces** responde `200` con `{ message, itemsPaused: N }`
**Y** `users.is_active = FALSE`, `jwt_version` incrementado en 1
**Y** objetos con `status='active' AND requests_paused=FALSE` quedan `requests_paused=TRUE, paused_by_admin=TRUE`
**Y** objetos ya pausados por el donante no son modificados
**Y** se registra `user.suspended` en `admin_audit_log` con payload_snapshot antes de la acción

**Dado** que envío `POST /api/admin/users/:id/suspend` sobre un usuario ya suspendido
**Cuando** el servidor procesa la petición
**Entonces** responde `409 Conflict`

**Dado** que envío `POST /api/admin/users/:id/reactivate` sobre un usuario suspendido
**Cuando** el servidor procesa la petición en transacción atómica
**Entonces** responde `200` con `{ message, itemsUnpaused: N }`
**Y** `users.is_active = TRUE`
**Y** solo los objetos con `paused_by_admin=TRUE` quedan `requests_paused=FALSE, paused_by_admin=FALSE`
**Y** objetos pausados manualmente por el donante permanecen pausados

**Dado** que envío `POST /api/admin/users/:id/force-verification` sobre usuario con `email_verified=FALSE`
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ message: "Email de verificación enviado" }`
**Y** se genera nuevo token, se actualiza `verification_token_hash` y `expires_at = NOW() + 24h`
**Y** se envía TPL-009 sin respetar cooldown de 30s
**Y** se registra `user.verification_forced` en `admin_audit_log`

**Dado** que envío `POST /api/admin/users/:id/correct-reputation` con `{ delta: N ≠ 0, reason: "texto" }`
**Cuando** el servidor procesa la petición en transacción atómica
**Entonces** responde `200` con `{ newReputationScore, delta }`
**Y** se inserta en `reputation_events` con `type='admin_correction'`, `session_id=NULL`
**Y** `users.reputation_score` se actualiza con el delta

**Dado** que envío `POST /api/admin/users/:id/reset-no-shows` sobre usuario con `consecutive_no_shows > 0`
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ message, previousValue: N }`
**Y** `users.consecutive_no_shows = 0`

**Notas de implementación:**
- `isPassive`: `total_donated=0 AND total_received>0 AND last_active_at < NOW()-60d`
- `isHoarder`: `cycles_at_limit>=3 AND total_received > 5*total_donated`
- Archivos: `AdminGetUsersUseCase`, `AdminGetUserByIdUseCase`, `AdminSuspendUserUseCase`, `AdminReactivateUserUseCase`, `AdminForceVerificationUseCase`, `AdminCorrectReputationUseCase`, `AdminResetNoShowsUseCase`, `AdminUsersController`

---

### Historia 13.4: Gestión de objetos por el administrador

Como administrador autenticado,
quiero buscar objetos, ver su detalle completo y ejecutar acciones de cancelación o reactivación,
para intervenir sobre ítems problemáticos del ecosistema.

**Criterios de Aceptación:**

**Dado** que envío `GET /api/admin/items` con filtros opcionales (`search`, `status`, `category`, `degraded`, `donorId`, `page`, `limit`)
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con lista paginada incluyendo `pausedByAdmin` y `requestCount` por ítem

**Dado** que envío `GET /api/admin/items/:id`
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con detalle completo incluyendo `requests[]` con datos del solicitante y `activeSession`
**Y** `activeSession` es `null` si no existe sesión `active` o `completed` asociada

**Dado** que envío `POST /api/admin/items/:id/cancel` sobre objeto en estado `active` o `reserved`
**Cuando** el servidor procesa la petición en transacción atómica
**Entonces** responde `200` con `{ message: "Objeto cancelado" }`
**Y** si estaba `reserved`: la sesión activa asociada pasa a `cancelled`
**Y** el objeto pasa a `status='cancelled'`
**Y** si había receptor seleccionado: se envía TPL-005
**Y** se registra `item.cancelled` en `admin_audit_log`

**Dado** que envío `POST /api/admin/items/:id/cancel` sobre objeto ya cancelado o completado
**Cuando** el servidor procesa la petición
**Entonces** responde `409 Conflict`

**Dado** que envío `POST /api/admin/items/:id/reactivate` sobre objeto `cancelled`
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ message: "Objeto reactivado" }`
**Y** `status='active'`, `requests_paused=FALSE`, `paused_by_admin=FALSE`, `degraded_at=NULL`
**Y** se registra `item.reactivated` en `admin_audit_log`

**Notas de implementación:**
- `POST /api/admin/items/:id/cancel` reutiliza lógica de `CancelItemUseCase` existente
- Archivos: `AdminGetItemsUseCase`, `AdminGetItemByIdUseCase`, `AdminCancelItemUseCase`, `AdminReactivateItemUseCase`, `AdminItemsController`

---

### Historia 13.5: Gestión de sesiones de entrega por el administrador

Como administrador autenticado,
quiero listar sesiones de entrega, ver su detalle (incluyendo canal de contacto con registro de auditoría) y forzar la expiración de sesiones activas atascadas,
para resolver problemas operativos en el flujo de entregas.

**Criterios de Aceptación:**

**Dado** que envío `GET /api/admin/sessions` con filtros opcionales (`status`, `overdue`, `userId`, `page`, `limit`)
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con lista paginada; el filtro `overdue=true` retorna sesiones `active` con `deadline_at < NOW()`

**Dado** que envío `GET /api/admin/sessions/:id` sobre sesión con `contact_purged=FALSE`
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con el detalle completo incluyendo `contactChannel`
**Y** se registra `data.contact_channel_accessed` en `admin_audit_log`

**Dado** que envío `GET /api/admin/sessions/:id` sobre sesión con `contact_purged=TRUE`
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `contactChannel: null`
**Y** no se registra entrada en `admin_audit_log` (dato ya no existe)

**Dado** que envío `POST /api/admin/sessions/:id/force-expire` sobre sesión `active`
**Cuando** el servidor procesa la petición en transacción atómica
**Entonces** responde `200` con `{ message: "Sesión expirada. Objeto devuelto a estado activo." }`
**Y** `delivery_sessions.status='expired'`, `completed_at=NOW()`
**Y** el objeto asociado vuelve a `status='active'`, `reserved_at=NULL`
**Y** se registra `session.force_expired` en `admin_audit_log`
**Y** no se envía TPL-004 (expiración forzada ≠ expiración natural)

**Dado** que envío `POST /api/admin/sessions/:id/force-expire` sobre sesión no activa
**Cuando** el servidor procesa la petición
**Entonces** responde `409 Conflict`

**Notas de implementación:**
- `force-expire` reutiliza la lógica del Job 5 (`ExpireDeliverySessionsUseCase`)
- Archivos: `AdminGetSessionsUseCase`, `AdminGetSessionByIdUseCase`, `AdminForceExpireSessionUseCase`, `AdminSessionsController`

---

### Historia 13.6: Métricas operativas y estado del sistema

Como administrador autenticado,
quiero ver métricas del estado del ecosistema y el estado de los jobs periódicos,
para identificar anomalías operativas sin necesidad de consultar la base de datos directamente.

**Criterios de Aceptación:**

**Dado** que envío `GET /api/admin/metrics`
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ users: {...}, items: {...}, sessions: {...} }` según PRD §6.6
**Y** `noShowRate` es `null` si el denominador es 0
**Y** `degraded` cuenta objetos con `status='active' AND degraded_at IS NOT NULL`
**Y** la respuesta llega en menos de 500ms

**Dado** que envío `GET /api/admin/system/health`
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ cronJobs: [...], storageQueue: { pendingDeletions }, unverifiedUsers24h }`
**Y** `cronJobs` contiene el último run de cada job en `cron.job_run_details` con `jobName`, `lastRunAt`, `lastStatus`, `returnMessage`

**Notas de implementación:**
- Queries simples COUNT sin joins complejos; sin caché en MVP
- `cron.job_run_details` es de la extensión `pg_cron` en Supabase; verificar disponibilidad antes de implementar
- Archivos: `AdminGetMetricsUseCase`, `AdminGetSystemHealthUseCase`, `AdminMetricsController`, `AdminSystemController`

---

### Historia 13.7: Cola de reportes (bloqueado hasta INIT-REP-01)

Como administrador autenticado,
quiero listar, ver el detalle y resolver reportes de usuarios,
para gestionar contenido problemático y conflictos entre usuarios.

> **⚠️ BLOQUEADO:** Esta historia depende de INIT-REP-01 (diseño de tabla `reports` y modelo de datos). Los contratos de API están reservados pero sin definir. No implementar hasta recibir la especificación de INIT-REP-01.

**Endpoints reservados:**
- `GET /api/admin/reports`
- `GET /api/admin/reports/:id`
- `POST /api/admin/reports/:id/resolve`

**Criterios de Aceptación:** pendientes de INIT-REP-01.
```

---

### 4.2 Cambios en `sprint-status.yaml`

**Añadir al final del archivo** (después de `epic-12-retrospective: optional`):

```yaml
  # ─── Épica 13: Panel Administrativo Backend (PRD-ADM-BE-01) ───
  epic-13: backlog
  13-1-modelo-de-datos-panel-administrativo: backlog
  13-2-autenticacion-de-administrador: backlog
  13-3-gestion-de-usuarios-por-el-administrador: backlog
  13-4-gestion-de-objetos-por-el-administrador: backlog
  13-5-gestion-de-sesiones-de-entrega-por-el-administrador: backlog
  13-6-metricas-operativas-y-estado-del-sistema: backlog
  13-7-cola-de-reportes-bloqueado-init-rep-01: backlog
  epic-13-retrospective: optional
```

### 4.3 Corrección en `project-context.md`

**Cambio:**

```
ANTES:
| Hosting | Railway |

DESPUÉS:
| Hosting | Render |
```

> El PRD §12 confirma que el hosting real es Render. La referencia a Railway en la documentación de arquitectura es un error de origen (D-ADM registrada en PRD §2).

---

## 5. Handoff de implementación

**Clasificación de alcance: Mayor** (nuevo módulo completo con auth 2FA, 6 submódulos CRUD, auditoría transversal)

**Handoff a:** Developer Agent (`bmad-dev-story`)

**Orden de implementación según PRD §11:**

| Fase | Historia | Contenido |
|------|----------|-----------|
| 1 | 13.1 | Migraciones SQL (3 tablas + campo + constraint) |
| 2 | 13.2 | Auth admin (login + OTP + JWT + middleware + CORS + TPL-ADM-001) |
| 3 | 13.3 | Módulo usuarios (7 endpoints) |
| 4 | 13.4 | Módulo objetos (4 endpoints) |
| 5 | 13.5 | Módulo sesiones (3 endpoints) |
| 6 | 13.6 | Métricas + estado del sistema (2 endpoints) |
| 7 | 13.7 | Cola de reportes — **esperar INIT-REP-01** |

**Variables de entorno** a configurar en Render antes de implementar:
- `ADMIN_JWT_SECRET` — `openssl rand -hex 64`
- `ADMIN_EMAIL` — email del administrador

**Criterios de éxito (AC-ADM-BE-01 a AC-ADM-BE-14 del PRD §10):**
- Login requiere siempre 2FA (password + OTP)
- Suspensión de usuario incrementa `jwt_version`
- Toda acción genera entrada en `admin_audit_log`
- `location` nunca aparece en DTOs de respuesta admin
- JWT admin usa `ADMIN_JWT_SECRET`; token de usuario no autoriza en rutas admin

---

## 6. Resumen de ejecución del checklist

| Sección | Item | Estado |
|---------|------|--------|
| 1 — Trigger | 1.1 Trigger story | N/A (PRD nuevo, no trigger de historia existente) |
| 1 — Trigger | 1.2 Problema definido | ✅ Nuevo requisito PRD aprobado |
| 1 — Trigger | 1.3 Evidencia | ✅ `docs/prd-backend-admin.md` v1.0 aprobado |
| 2 — Épicas | 2.1 Épica afectada | N/A |
| 2 — Épicas | 2.2 Cambios necesarios | ✅ Añadir Épica 13 |
| 2 — Épicas | 2.3 Épicas futuras | ✅ Sin impacto en épicas 1–12 done |
| 2 — Épicas | 2.4 Obsolescencia / nuevas | ✅ Épica 13 nueva; ninguna obsoleta |
| 2 — Épicas | 2.5 Reordenación | ✅ Épica 13 al final (natural) |
| 3 — Artefactos | 3.1 PRD principal | ✅ Añadir FR53–FR60 |
| 3 — Artefactos | 3.2 Arquitectura | ⚠️ Acción recomendada: añadir sección admin en `docs/architecture.md` (opcional antes de implementar) |
| 3 — Artefactos | 3.3 UX/UI | N/A (backend) |
| 3 — Artefactos | 3.4 Otros artefactos | ✅ project-context.md (corrección hosting) |
| 4 — Camino | 4.1 Ajuste directo | ✅ Viable — seleccionado |
| 4 — Camino | 4.2 Rollback | N/A |
| 4 — Camino | 4.3 Revisión MVP | N/A |
