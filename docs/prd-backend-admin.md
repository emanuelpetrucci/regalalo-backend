---
title: "PRD Backend — Panel Administrativo"
code: PRD-ADM-BE-01
version: "1.0"
date: "2026-06-07"
status: approved
priority: P0
bloque: "Bloque 1 — Operabilidad mínima"
proyecto: Regálalo (regalalo.org)
dependencias:
  - INIT-REP-01 (módulo de reportes — diseño en paralelo, salida simultánea)
plataforma_backend: Render
---

# PRD-ADM-BE-01 — Backend del Panel Administrativo

> Documento de requisitos de backend para el panel administrativo de Regálalo.
> Cubre modelo de datos, autenticación, contratos de API, seguridad y criterios de aceptación.
> Listo para handoff a agente de desarrollo backend.

---

## 1. Alcance

### 1.1 Incluido en esta iteración

- Autenticación de administrador independiente (tabla `admin_users`, OTP por email, JWT 8h)
- Gestión de usuarios: búsqueda, perfil completo, suspensión con cascada, reactivación, forzar verificación, corrección de reputación, reset de no-shows
- Gestión de objetos: búsqueda, detalle, cancelación, reactivación
- Gestión de sesiones de entrega: listado, detalle, forzar expiración
- Cola de reportes: listado, detalle, resolución (dependiente de INIT-REP-01)
- Métricas operativas: dashboard de salud del ecosistema
- Estado del sistema: jobs pg_cron, cola de Storage, usuarios sin verificar
- Log de auditoría: todas las acciones del administrador registradas en `admin_audit_log`

### 1.2 Fuera de alcance (esta iteración)

- Eliminación/anonimización de cuenta de usuario (RGPD) — fase posterior
- Roles múltiples de administrador
- Dashboard analítico avanzado (exportes, gráficos históricos)
- Configuración del sistema en tiempo real (feature flags)
- Comunicación directa con usuarios desde el panel
- Autenticación TOTP hardware

---

## 2. Decisiones de diseño registradas

| ID | Decisión | Resolución |
|---|---|---|
| D-ADM-01 | Autenticación | Tabla `admin_users` separada; JWT independiente del sistema de usuarios |
| D-ADM-02 | Frontend | Proyecto Angular separado en Vercel (`admin.regalalo.org`) |
| D-ADM-03 | Endpoints | Rutas `/api/admin/*` en el mismo servidor Express (Render) |
| D-ADM-04 | Acciones sobre usuarios | `suspender`, `reactivar`, `forzar-verificacion`, `corregir-reputacion`, `resetear-no-shows` |
| D-ADM-05 | Auditoría | Tabla `admin_audit_log`, retención indefinida en MVP |
| D-ADM-06 | Datos sensibles | `contact_channel` visible cuando no purgado; coordenadas exactas nunca expuestas |
| D-ADM-07 | Cola de reportes | En scope; dependiente de INIT-REP-01 (salida simultánea) |
| D-ADM-08 | Duración JWT admin | 8 horas |
| D-ADM-09 | Segundo factor | OTP de 6 dígitos por email en cada login (Resend) |
| D-ADM-10 | Cascada en suspensión | `is_active=FALSE` + `jwt_version++` + `requests_paused=TRUE` (solo activos no pausados) en `items`. Sesiones de entrega activas no intervenidas. Reactivación revierte solo pausas de origen admin (`paused_by_admin=TRUE`) |
| D-ADM-11 | Eliminar cuenta | Diferido a fase posterior |

---

## 3. Cambios en el modelo de datos

### 3.1 Nueva tabla `admin_users`

```sql
CREATE TABLE admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  jwt_version   INTEGER NOT NULL DEFAULT 1,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Notas:**
- `password_hash`: Argon2 — misma implementación que `users`.
- `jwt_version`: permite invalidar todos los tokens activos del admin (p. ej. ante cambio de contraseña o sospecha de compromiso).
- Sin `phone`, `postal_code`, `location` ni ningún campo del modelo de usuario público.
- Población inicial: INSERT manual en Render console o script de seed protegido; no existe endpoint de registro admin.

---

### 3.2 Nueva tabla `admin_otp_tokens`

```sql
CREATE TABLE admin_otp_tokens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  UUID NOT NULL REFERENCES admin_users(id),
  token_hash     TEXT NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
  used           BOOLEAN NOT NULL DEFAULT FALSE,
  attempts       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Notas:**
- `token_hash`: SHA-256 del código de 6 dígitos numéricos. El código en texto plano solo existe en el email enviado.
- `attempts`: máximo 3 intentos fallidos; al alcanzarlo, el token se marca `used = TRUE` y se invalida.
- Solo existe un token válido (`used = FALSE`, `expires_at > NOW()`) por admin en cada momento. Al solicitar un nuevo OTP, todos los tokens previos del admin se invalidan (`used = TRUE`).
- Índice recomendado:

```sql
CREATE INDEX idx_admin_otp_active
  ON admin_otp_tokens(admin_user_id, expires_at)
  WHERE used = FALSE;
```

---

### 3.3 Nueva tabla `admin_audit_log`

```sql
CREATE TABLE admin_audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id    UUID NOT NULL REFERENCES admin_users(id),
  action           TEXT NOT NULL,
  entity_type      TEXT,
  entity_id        UUID,
  payload_snapshot JSONB NOT NULL DEFAULT '{}',
  ip_address       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Valores definidos para `action`:**

| Valor | Descripción |
|---|---|
| `admin.login` | Login completado (tras OTP verificado) |
| `admin.otp_requested` | OTP solicitado |
| `user.suspended` | Usuario suspendido |
| `user.reactivated` | Usuario reactivado |
| `user.verification_forced` | Verificación de email forzada |
| `user.reputation_corrected` | Corrección manual de reputación |
| `user.no_shows_reset` | Contador de no-shows reseteado |
| `item.cancelled` | Objeto cancelado |
| `item.reactivated` | Objeto reactivado |
| `session.force_expired` | Sesión de entrega expirada forzosamente |
| `report.resolved` | Reporte resuelto |
| `data.contact_channel_accessed` | Acceso al `contact_channel` de una sesión |

**Notas:**
- `payload_snapshot`: estado de los campos relevantes **antes** de la acción (p. ej. `{ "is_active": true, "reputation_score": -20 }`). Permite auditoría forense.
- `ip_address`: extraída del header `X-Forwarded-For` (Render usa proxy) con validación de formato.
- Retención: indefinida en MVP.
- Índice recomendado:

```sql
CREATE INDEX idx_admin_audit_created ON admin_audit_log(created_at DESC);
CREATE INDEX idx_admin_audit_entity ON admin_audit_log(entity_type, entity_id);
```

---

### 3.4 Modificación tabla `items` — campo `paused_by_admin`

```sql
ALTER TABLE items
  ADD COLUMN paused_by_admin BOOLEAN NOT NULL DEFAULT FALSE;
```

**Propósito:** distinguir pausas aplicadas por el sistema admin durante la suspensión de un usuario de las pausas aplicadas voluntariamente por el donante. Permite revertir solo las pausas de origen admin en la reactivación del usuario, sin afectar las pausas manuales previas del donante.

**Regla de negocio:** `paused_by_admin` solo puede ser `TRUE` cuando `requests_paused = TRUE`. Nunca se establece `paused_by_admin = TRUE` sin establecer simultáneamente `requests_paused = TRUE`.

---

### 3.5 Modificación constraint `reputation_events.type`

El CHECK constraint actual debe ampliarse para incluir el tipo de corrección admin:

```sql
-- Eliminar constraint existente
ALTER TABLE reputation_events
  DROP CONSTRAINT reputation_events_type_check;

-- Añadir constraint ampliado
ALTER TABLE reputation_events
  ADD CONSTRAINT reputation_events_type_check
  CHECK (type IN ('delivery_completed', 'no_show', 'admin_correction'));
```

**Notas:**
- Los eventos `admin_correction` no tienen `session_id` (el campo acepta NULL).
- El `delta` puede ser positivo o negativo según el criterio del admin.
- La inserción del evento actualiza `reputation_score` en `users` de forma atómica en la misma transacción.

---

## 4. Autenticación del administrador

### 4.1 Flujo de login con OTP

```
POST /api/admin/auth/login
  { email, password }

  1. Verificar que el email existe en admin_users
  2. Verificar is_active = TRUE
  3. Verificar password contra password_hash (Argon2)
  4. Si credenciales incorrectas → HTTP 401 (respuesta genérica, sin distinguir email/password)
  5. Invalidar tokens OTP previos: UPDATE admin_otp_tokens SET used = TRUE WHERE admin_user_id = :id AND used = FALSE
  6. Generar código OTP: 6 dígitos numéricos aleatorios (crypto.randomInt)
  7. Calcular token_hash = SHA-256(código)
  8. Insertar en admin_otp_tokens con expires_at = NOW() + 10 minutos
  9. Enviar email TPL-ADM-001 con el código (via Resend)
  10. Registrar en admin_audit_log: action = 'admin.otp_requested', ip_address
  11. Devolver HTTP 200 { message: 'Código enviado' }
     (sin revelar si el email existe — respuesta idéntica en caso de email inexistente)
```

```
POST /api/admin/auth/verify-otp
  { email, otp }

  1. Buscar admin por email; si no existe → HTTP 401
  2. Buscar token válido: used = FALSE AND expires_at > NOW() para ese admin
  3. Si no existe token válido → HTTP 401
  4. Incrementar attempts en el token encontrado
  5. Calcular SHA-256(otp) y comparar con token_hash
  6. Si no coincide:
     a. Si attempts >= 3 → marcar token used = TRUE, HTTP 401 con código OTP_MAX_ATTEMPTS
     b. Si attempts < 3 → HTTP 401 con código OTP_INVALID (sin revelar intentos restantes)
  7. Si coincide:
     a. Marcar token used = TRUE
     b. Actualizar last_login_at = NOW() en admin_users
     c. Generar JWT admin (ver §4.2)
     d. Registrar en admin_audit_log: action = 'admin.login', ip_address
     e. Devolver HTTP 200 { token: 'JWT', admin: { id, email } }
```

### 4.2 Estructura del JWT admin

```json
{
  "sub": "admin_user_id (UUID)",
  "role": "admin",
  "jwtVersion": 1,
  "iat": "timestamp",
  "exp": "iat + 8 horas"
}
```

**Secret:** variable de entorno `ADMIN_JWT_SECRET` — independiente de `JWT_SECRET` del sistema de usuarios. Mínimo 64 caracteres; generar con `openssl rand -hex 64`.

### 4.3 Middleware `requireAdminAuth`

```typescript
// middleware/adminAuth.ts
const token = req.headers.authorization?.split(' ')[1];
const payload = verifyAdminJwt(token); // usa ADMIN_JWT_SECRET
const admin = await adminUserRepo.findById(payload.sub);
if (!admin || admin.jwtVersion !== payload.jwtVersion) {
  throw new UnauthorizedException();
}
if (!admin.isActive) {
  throw new UnauthorizedException();
}
req.adminUser = admin;
```

**Diferencia crítica con el middleware de usuarios:** no verifica `email_verified` ni `is_active` de `users`. Opera exclusivamente sobre `admin_users`.

### 4.4 Configuración CORS para rutas admin

Las rutas `/api/admin/*` deben aceptar requests únicamente desde el origen `https://admin.regalalo.org`. Configurar CORS diferenciado en Express para este prefijo de ruta.

```typescript
const adminCorsOptions = {
  origin: 'https://admin.regalalo.org',
  methods: ['GET', 'POST', 'PATCH'],
  allowedHeaders: ['Authorization', 'Content-Type'],
};
router.use('/api/admin', cors(adminCorsOptions));
```

En entorno de desarrollo local, añadir `http://localhost:4201` a `origin` como array.

---

## 5. Rate limiting en rutas admin

| Ruta | Límite | Ventana |
|---|---|---|
| `POST /api/admin/auth/login` | 10 req | 15 minutos por IP |
| `POST /api/admin/auth/verify-otp` | 10 req | 15 minutos por IP |
| Resto de `/api/admin/*` | 200 req | 15 minutos por IP |

Usar la instancia de `express-rate-limit` existente con configuración separada para el prefix `/api/admin/auth`.

---

## 6. Contratos de API

> **Nota transversal:** todas las rutas bajo `/api/admin/*` requieren el middleware `requireAdminAuth`, excepto las de autenticación.
> Todas las acciones que modifican entidades registran entrada en `admin_audit_log` antes de devolver respuesta.
> El campo `location` (GEOGRAPHY) nunca aparece en ningún DTO de respuesta (SEC-008).

---

### 6.1 Autenticación admin

#### POST /api/admin/auth/login

**Payload:**
```json
{ "email": "string", "password": "string" }
```

**Respuesta (200):**
```json
{ "message": "Código enviado al email registrado" }
```

**Errores:**

| Código HTTP | Código interno | Motivo |
|---|---|---|
| 400 | — | Payload inválido |
| 401 | `INVALID_CREDENTIALS` | Credenciales incorrectas o admin inexistente |
| 429 | — | Rate limit alcanzado |

> La respuesta 200 es idéntica independientemente de si el email existe, para evitar enumeración.

---

#### POST /api/admin/auth/verify-otp

**Payload:**
```json
{ "email": "string", "otp": "string (6 dígitos)" }
```

**Respuesta (200):**
```json
{
  "token": "string (JWT admin, 8h)",
  "admin": {
    "id": "uuid",
    "email": "string"
  }
}
```

**Errores:**

| Código HTTP | Código interno | Motivo |
|---|---|---|
| 400 | — | Payload inválido |
| 401 | `OTP_INVALID` | Código incorrecto |
| 401 | `OTP_EXPIRED` | Token expirado (>10 min) |
| 401 | `OTP_MAX_ATTEMPTS` | 3 intentos fallidos — token invalidado |
| 429 | — | Rate limit alcanzado |

---

### 6.2 Módulo de usuarios

#### GET /api/admin/users

**Query params:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `search` | string | Búsqueda por email, firstName o lastName (ILIKE) |
| `status` | string | `active` \| `suspended` |
| `emailVerified` | boolean | Filtrar por estado de verificación |
| `page` | integer | Default: 1 |
| `limit` | integer | Default: 20, máx: 100 |

**Respuesta (200):**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "string",
      "firstName": "string",
      "lastName": "string",
      "isActive": "boolean",
      "emailVerified": "boolean",
      "reputationScore": "integer",
      "totalDonated": "integer",
      "totalReceived": "integer",
      "consecutiveNoShows": "integer",
      "cyclesAtLimit": "integer",
      "createdAt": "ISO8601",
      "lastActiveAt": "ISO8601 | null",
      "isPassive": "boolean",
      "isHoarder": "boolean"
    }
  ],
  "pagination": {
    "total": "integer",
    "page": "integer",
    "limit": "integer",
    "totalPages": "integer"
  }
}
```

**Notas:**
- `isPassive`: calculado en query (FR17: `total_donated = 0 AND total_received > 0 AND last_active_at IS NOT NULL AND last_active_at < NOW() - 60 days`).
- `isHoarder`: calculado en query (FR18: `cycles_at_limit >= 3 AND total_received > 5 * total_donated`).
- `location` nunca incluida.

---

#### GET /api/admin/users/:id

**Respuesta (200):**
```json
{
  "id": "uuid",
  "email": "string",
  "firstName": "string",
  "lastName": "string",
  "avatarUrl": "string | null",
  "phone": "string | null",
  "postalCode": "string",
  "preferredLanguage": "string",
  "isActive": "boolean",
  "emailVerified": "boolean",
  "reputationScore": "integer",
  "totalDonated": "integer",
  "totalReceived": "integer",
  "consecutiveNoShows": "integer",
  "cyclesAtLimit": "integer",
  "isPassive": "boolean",
  "isHoarder": "boolean",
  "createdAt": "ISO8601",
  "lastActiveAt": "ISO8601 | null",
  "reputationHistory": [
    {
      "id": "uuid",
      "type": "delivery_completed | no_show | admin_correction",
      "delta": "integer",
      "sessionId": "uuid | null",
      "createdAt": "ISO8601"
    }
  ],
  "activeItems": "integer",
  "completedItems": "integer"
}
```

**Errores:**

| Código HTTP | Motivo |
|---|---|
| 400 | ID no es UUID válido |
| 404 | Usuario no encontrado |

---

#### POST /api/admin/users/:id/suspend

**Payload:** vacío.

**Comportamiento (transacción atómica):**
1. Verificar que el usuario existe y `is_active = TRUE`.
2. Capturar `payload_snapshot`: `{ is_active: true, jwt_version: N }`.
3. `UPDATE users SET is_active = FALSE, jwt_version = jwt_version + 1 WHERE id = :id`.
4. `UPDATE items SET requests_paused = TRUE, paused_by_admin = TRUE WHERE donor_id = :id AND status = 'active' AND requests_paused = FALSE`.
5. Insertar en `admin_audit_log`.

**Respuesta (200):**
```json
{ "message": "Usuario suspendido", "itemsPaused": "integer" }
```

`itemsPaused`: número de objetos que fueron pausados como resultado de esta acción.

**Errores:**

| Código HTTP | Motivo |
|---|---|
| 400 | ID inválido |
| 404 | Usuario no encontrado |
| 409 | Usuario ya está suspendido |

---

#### POST /api/admin/users/:id/reactivate

**Payload:** vacío.

**Comportamiento (transacción atómica):**
1. Verificar que el usuario existe y `is_active = FALSE`.
2. Capturar `payload_snapshot`: `{ is_active: false }`.
3. `UPDATE users SET is_active = TRUE WHERE id = :id`.
4. `UPDATE items SET requests_paused = FALSE, paused_by_admin = FALSE WHERE donor_id = :id AND paused_by_admin = TRUE`.
5. Insertar en `admin_audit_log`.

**Respuesta (200):**
```json
{ "message": "Usuario reactivado", "itemsUnpaused": "integer" }
```

**Errores:**

| Código HTTP | Motivo |
|---|---|
| 404 | Usuario no encontrado |
| 409 | Usuario ya está activo |

---

#### POST /api/admin/users/:id/force-verification

**Payload:** vacío.

**Comportamiento:**
1. Verificar que el usuario existe.
2. Si `email_verified = TRUE` → 409.
3. Generar nuevo token de verificación (`crypto.randomBytes(32)`).
4. Calcular `verification_token_hash = SHA-256(token)`.
5. Actualizar `users`: `verification_token_hash`, `verification_token_expires_at = NOW() + 24h`, `verification_resend_at = NOW()`. **No se aplica el cooldown de 30 segundos** en acciones admin.
6. Enviar email TPL-009 con el nuevo enlace.
7. Insertar en `admin_audit_log`.

**Respuesta (200):**
```json
{ "message": "Email de verificación enviado" }
```

**Errores:**

| Código HTTP | Motivo |
|---|---|
| 404 | Usuario no encontrado |
| 409 | Email ya verificado |

---

#### POST /api/admin/users/:id/correct-reputation

**Payload:**
```json
{
  "delta": "integer (positivo o negativo, distinto de 0)",
  "reason": "string (texto libre, máx. 500 caracteres)"
}
```

**Comportamiento (transacción atómica):**
1. Verificar usuario existe.
2. Capturar `payload_snapshot`: `{ reputation_score: N }`.
3. Insertar en `reputation_events`: `{ user_id, type: 'admin_correction', delta, session_id: NULL }`.
4. `UPDATE users SET reputation_score = reputation_score + delta WHERE id = :id`.
5. Insertar en `admin_audit_log` incluyendo `reason` en `payload_snapshot`.

**Respuesta (200):**
```json
{
  "newReputationScore": "integer",
  "delta": "integer"
}
```

**Errores:**

| Código HTTP | Motivo |
|---|---|
| 400 | Payload inválido o delta = 0 |
| 404 | Usuario no encontrado |

---

#### POST /api/admin/users/:id/reset-no-shows

**Payload:** vacío.

**Comportamiento (transacción atómica):**
1. Verificar usuario existe.
2. Si `consecutive_no_shows = 0` → 409.
3. Capturar `payload_snapshot`: `{ consecutive_no_shows: N }`.
4. `UPDATE users SET consecutive_no_shows = 0 WHERE id = :id`.
5. Insertar en `admin_audit_log`.

**Respuesta (200):**
```json
{ "message": "Contador de no-shows reseteado", "previousValue": "integer" }
```

**Errores:**

| Código HTTP | Motivo |
|---|---|
| 404 | Usuario no encontrado |
| 409 | El contador ya es 0 |

---

### 6.3 Módulo de objetos

#### GET /api/admin/items

**Query params:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `search` | string | Búsqueda en `title` y `description` (ILIKE) |
| `status` | string | `active` \| `reserved` \| `completed` \| `cancelled` |
| `category` | string | Filtro por categoría |
| `degraded` | boolean | Filtrar objetos con `degraded_at IS NOT NULL` |
| `donorId` | uuid | Filtrar por donante |
| `page` | integer | Default: 1 |
| `limit` | integer | Default: 20, máx: 100 |

**Respuesta (200):**
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "string",
      "description": "string",
      "condition": "string",
      "category": "string",
      "weightRange": "string",
      "status": "string",
      "requestsPaused": "boolean",
      "pausedByAdmin": "boolean",
      "degradedAt": "ISO8601 | null",
      "createdAt": "ISO8601",
      "completedAt": "ISO8601 | null",
      "donor": {
        "id": "uuid",
        "firstName": "string",
        "lastName": "string",
        "email": "string"
      },
      "requestCount": "integer",
      "images": ["url"]
    }
  ],
  "pagination": { "total": "integer", "page": "integer", "limit": "integer", "totalPages": "integer" }
}
```

---

#### GET /api/admin/items/:id

**Respuesta (200):**
```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "condition": "string",
  "category": "string",
  "weightRange": "string",
  "status": "string",
  "requestsPaused": "boolean",
  "pausedByAdmin": "boolean",
  "degradedAt": "ISO8601 | null",
  "digestNotifiedAt": "ISO8601 | null",
  "createdAt": "ISO8601",
  "reservedAt": "ISO8601 | null",
  "completedAt": "ISO8601 | null",
  "donor": {
    "id": "uuid",
    "firstName": "string",
    "lastName": "string",
    "email": "string"
  },
  "images": ["url"],
  "requests": [
    {
      "id": "uuid",
      "status": "string",
      "createdAt": "ISO8601",
      "requester": {
        "id": "uuid",
        "firstName": "string",
        "lastName": "string",
        "email": "string",
        "reputationScore": "integer"
      }
    }
  ],
  "activeSession": {
    "id": "uuid",
    "status": "string",
    "deadlineAt": "ISO8601",
    "receiverId": "uuid"
  }
}
```

**Nota:** `activeSession` es `null` si no existe sesión `active` o `completed` asociada.

---

#### POST /api/admin/items/:id/cancel

**Payload:** vacío.

**Comportamiento (transacción atómica):**
1. Verificar que el objeto existe y `status IN ('active', 'reserved')`.
2. Capturar `payload_snapshot`: `{ status: 'active|reserved' }`.
3. Si `status = 'reserved'`: verificar si existe sesión `active` asociada → establecer `delivery_sessions.status = 'cancelled'`, `completed_at = NOW()`. Objeto vuelve a `active` previamente antes de ser cancelado.
4. `UPDATE items SET status = 'cancelled' WHERE id = :id`.
5. Si existía receptor seleccionado: enviar TPL-005 al receptor (reutilizar `CancelItem` use case).
6. Insertar en `admin_audit_log`.

**Respuesta (200):**
```json
{ "message": "Objeto cancelado" }
```

**Errores:**

| Código HTTP | Motivo |
|---|---|
| 404 | Objeto no encontrado |
| 409 | Objeto ya está cancelado o completado |

---

#### POST /api/admin/items/:id/reactivate

**Payload:** vacío.

**Comportamiento:**
1. Verificar que el objeto existe y `status = 'cancelled'`.
2. Capturar `payload_snapshot`: `{ status: 'cancelled' }`.
3. `UPDATE items SET status = 'active', requests_paused = FALSE, paused_by_admin = FALSE, degraded_at = NULL WHERE id = :id`.
4. Insertar en `admin_audit_log`.

**Respuesta (200):**
```json
{ "message": "Objeto reactivado" }
```

**Errores:**

| Código HTTP | Motivo |
|---|---|
| 404 | Objeto no encontrado |
| 409 | El objeto no está cancelado |

---

### 6.4 Módulo de sesiones de entrega

#### GET /api/admin/sessions

**Query params:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `status` | string | `active` \| `completed` \| `cancelled` \| `expired` |
| `overdue` | boolean | Sesiones `active` con `deadline_at < NOW()` (posible fallo de pg_cron) |
| `userId` | uuid | Sesiones donde el usuario es donante o receptor |
| `page` | integer | Default: 1 |
| `limit` | integer | Default: 20, máx: 100 |

**Respuesta (200):**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "status": "string",
      "deadlineAt": "ISO8601",
      "createdAt": "ISO8601",
      "completedAt": "ISO8601 | null",
      "contactPurged": "boolean",
      "noShowDeclared": "boolean",
      "item": { "id": "uuid", "title": "string" },
      "donor": { "id": "uuid", "firstName": "string", "lastName": "string", "email": "string" },
      "receiver": { "id": "uuid", "firstName": "string", "lastName": "string", "email": "string" }
    }
  ],
  "pagination": { "total": "integer", "page": "integer", "limit": "integer", "totalPages": "integer" }
}
```

---

#### GET /api/admin/sessions/:id

**Comportamiento especial:** si se accede a una sesión con `contact_purged = FALSE`, registrar entrada en `admin_audit_log` con `action = 'data.contact_channel_accessed'`.

**Respuesta (200):**
```json
{
  "id": "uuid",
  "status": "string",
  "deadlineAt": "ISO8601",
  "createdAt": "ISO8601",
  "completedAt": "ISO8601 | null",
  "donorConfirmed": "boolean",
  "noShowDeclared": "boolean",
  "contactChannel": "string | null",
  "contactPurged": "boolean",
  "item": { "id": "uuid", "title": "string", "category": "string" },
  "donor": { "id": "uuid", "firstName": "string", "lastName": "string", "email": "string" },
  "receiver": { "id": "uuid", "firstName": "string", "lastName": "string", "email": "string" }
}
```

**Nota:** si `contactPurged = TRUE`, `contactChannel` es `null` y el frontend debe mostrar el estado "Dato purgado" explícitamente.

---

#### POST /api/admin/sessions/:id/force-expire

**Payload:** vacío.

**Comportamiento (transacción atómica — reutiliza lógica del Job 5):**
1. Verificar que la sesión existe y `status = 'active'`.
2. Capturar `payload_snapshot`: `{ status: 'active', deadline_at: '...' }`.
3. `UPDATE delivery_sessions SET status = 'expired', completed_at = NOW() WHERE id = :id`.
4. `UPDATE items SET status = 'active', reserved_at = NULL WHERE id = (SELECT item_id FROM delivery_sessions WHERE id = :id)`.
5. Insertar en `admin_audit_log`.
6. **No** se envía TPL-004 (la expiración forzada por admin es una acción administrativa, no una expiración natural).

**Respuesta (200):**
```json
{ "message": "Sesión expirada. Objeto devuelto a estado activo." }
```

**Errores:**

| Código HTTP | Motivo |
|---|---|
| 404 | Sesión no encontrada |
| 409 | La sesión no está activa |

---

### 6.5 Módulo de reportes

> **Dependencia:** este módulo requiere que INIT-REP-01 haya definido la tabla `reports` y su modelo de datos. Los contratos de API de este módulo se completarán en el diseño técnico conjunto con INIT-REP-01.

**Endpoints reservados (contratos pendientes de INIT-REP-01):**

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/reports` | Listado de reportes con filtros (`status`, `type`, paginación) |
| GET | `/api/admin/reports/:id` | Detalle completo del reporte con contexto (ítem/usuario reportado + denunciante) |
| POST | `/api/admin/reports/:id/resolve` | Resolver reporte con acción (`archive`, `warn_user`, `cancel_item`, `suspend_user`) y nota de resolución |

---

### 6.6 Métricas operativas

#### GET /api/admin/metrics

**Respuesta (200):**
```json
{
  "users": {
    "total": "integer",
    "active": "integer",
    "suspended": "integer",
    "unverifiedOver24h": "integer",
    "passive": "integer",
    "hoarders": "integer"
  },
  "items": {
    "active": "integer",
    "reserved": "integer",
    "completed": "integer",
    "cancelled": "integer",
    "degraded": "integer"
  },
  "sessions": {
    "active": "integer",
    "completedLast30Days": "integer",
    "expiredLast30Days": "integer",
    "cancelledLast30Days": "integer",
    "noShowRate": "float | null"
  }
}
```

**Notas:**
- `noShowRate`: `no_show_declared = TRUE / (total completadas + canceladas)` en los últimos 30 días. `null` si denominador = 0.
- `degraded`: objetos con `status = 'active' AND degraded_at IS NOT NULL`.
- `unverifiedOver24h`: `email_verified = FALSE AND created_at < NOW() - INTERVAL '24 hours'`.
- Todas las queries son COUNT simples sobre tablas existentes; sin joins complejos.
- No requiere caché en MVP; tiempo de respuesta esperado < 200ms.

---

### 6.7 Estado del sistema

#### GET /api/admin/system/health

**Respuesta (200):**
```json
{
  "cronJobs": [
    {
      "jobName": "string",
      "lastRunAt": "ISO8601 | null",
      "lastStatus": "succeeded | failed | null",
      "returnMessage": "string | null"
    }
  ],
  "storageQueue": {
    "pendingDeletions": "integer"
  },
  "unverifiedUsers24h": "integer"
}
```

**Implementación:**

```sql
-- cronJobs: query a extensión pg_cron
SELECT
  jobname,
  start_time,
  status,
  return_message
FROM cron.job_run_details
WHERE runid IN (
  SELECT MAX(runid) FROM cron.job_run_details GROUP BY jobid
)
ORDER BY start_time DESC;

-- storageQueue
SELECT COUNT(*) FROM storage_deletion_queue WHERE processed_at IS NULL;

-- unverifiedUsers24h
SELECT COUNT(*) FROM users
WHERE email_verified = FALSE
  AND created_at < NOW() - INTERVAL '24 hours';
```

**Nota:** la tabla `cron.job_run_details` es proporcionada por la extensión `pg_cron` en Supabase. Su disponibilidad debe verificarse antes de implementar.

---

## 7. Plantilla de email — TPL-ADM-001

| Campo | Valor |
|---|---|
| Código | TPL-ADM-001 |
| Evento | OTP para login de administrador |
| Destinatario | Admin (`admin_users.email`) |
| Asunto | `Código de acceso al panel de administración — Regálalo` |
| Variables | `{ otp: string, expiresInMinutes: 10 }` |
| Layout | `renderEmailLayout()` (coherente con el resto de TPLs) |

**Contenido mínimo del cuerpo:**
- Código de acceso: `{{ otp }}`
- Vigencia: 10 minutos
- Aviso: si no has solicitado este código, ignora este mensaje

**Nota de seguridad:** el email no debe incluir enlace de acción. El código se introduce manualmente en el panel. Esto previene ataques de phishing por redirección.

---

## 8. Variables de entorno nuevas

| Variable | Descripción | Ejemplo |
|---|---|---|
| `ADMIN_JWT_SECRET` | Secret para firmar JWT de admin | `openssl rand -hex 64` |
| `ADMIN_EMAIL` | Email del administrador (seed inicial) | `admin@regalalo.org` |

El resto de variables de entorno (Resend, Supabase, etc.) son compartidas con el sistema existente.

---

## 9. Arquitectura de código (Clean Architecture)

Siguiendo la estructura existente del proyecto:

```
src/
  modules/
    admin/
      domain/
        entities/
          AdminUser.ts
          AdminAuditLog.ts
        repositories/
          IAdminUserRepository.ts
          IAdminAuditLogRepository.ts
      application/
        use-cases/
          auth/
            AdminLoginUseCase.ts
            AdminVerifyOtpUseCase.ts
          users/
            AdminGetUsersUseCase.ts
            AdminGetUserByIdUseCase.ts
            AdminSuspendUserUseCase.ts
            AdminReactivateUserUseCase.ts
            AdminForceVerificationUseCase.ts
            AdminCorrectReputationUseCase.ts
            AdminResetNoShowsUseCase.ts
          items/
            AdminGetItemsUseCase.ts
            AdminGetItemByIdUseCase.ts
            AdminCancelItemUseCase.ts
            AdminReactivateItemUseCase.ts
          sessions/
            AdminGetSessionsUseCase.ts
            AdminGetSessionByIdUseCase.ts
            AdminForceExpireSessionUseCase.ts
          metrics/
            AdminGetMetricsUseCase.ts
            AdminGetSystemHealthUseCase.ts
      infrastructure/
        repositories/
          AdminUserRepository.ts
          AdminAuditLogRepository.ts
        http/
          controllers/
            AdminAuthController.ts
            AdminUsersController.ts
            AdminItemsController.ts
            AdminSessionsController.ts
            AdminMetricsController.ts
            AdminSystemController.ts
          middleware/
            requireAdminAuth.ts
            adminRateLimit.ts
          routes/
            admin.routes.ts
```

---

## 10. Criterios de aceptación

| ID | Criterio | Verificación |
|---|---|---|
| AC-ADM-BE-01 | El login admin requiere siempre dos factores (password + OTP); sin OTP no se emite JWT | Test de integración: login con password correcto sin OTP → 401 |
| AC-ADM-BE-02 | El OTP expira a los 10 minutos | Test: verificar OTP con timestamp manipulado > 10 min → 401 OTP_EXPIRED |
| AC-ADM-BE-03 | Tras 3 intentos fallidos de OTP, el token se invalida | Test: 3 intentos incorrectos → 401 OTP_MAX_ATTEMPTS; 4.º intento con OTP correcto → 401 |
| AC-ADM-BE-04 | Suspender usuario incrementa `jwt_version` en 1 | Verificar campo en BD post-acción |
| AC-ADM-BE-05 | Suspender usuario pausa solo los objetos `active` con `requests_paused = FALSE` | Test: objeto ya pausado por donante no se modifica; `paused_by_admin` permanece FALSE |
| AC-ADM-BE-06 | Reactivar usuario solo reactiva objetos con `paused_by_admin = TRUE` | Test: objeto pausado manualmente por donante permanece pausado tras reactivación |
| AC-ADM-BE-07 | `corregir-reputacion` inserta entrada en `reputation_events` de tipo `admin_correction` | Verificar fila en `reputation_events` + actualización coherente en `users.reputation_score` |
| AC-ADM-BE-08 | Toda acción admin genera entrada en `admin_audit_log` con `admin_user_id`, `action`, `entity_id` e `ip_address` | Test: ejecutar cada acción → verificar fila en `admin_audit_log` |
| AC-ADM-BE-09 | Acceder al detalle de una sesión con `contact_purged = FALSE` registra `data.contact_channel_accessed` en `admin_audit_log` | Test de integración |
| AC-ADM-BE-10 | `location` (GEOGRAPHY) nunca aparece en ningún DTO de respuesta admin | Revisión estática de todos los DTOs del módulo |
| AC-ADM-BE-11 | Las rutas `/api/admin/*` rechazan requests con Origin distinto de `https://admin.regalalo.org` | Test CORS con Origin alternativo |
| AC-ADM-BE-12 | El JWT admin usa `ADMIN_JWT_SECRET`; un token de usuario no autoriza en rutas admin y viceversa | Test cruzado de tokens |
| AC-ADM-BE-13 | `GET /api/admin/metrics` responde en < 500ms bajo carga de desarrollo | Test de rendimiento básico |
| AC-ADM-BE-14 | Forzar expiración de sesión reactiva el objeto (`status = 'active'`) en la misma transacción | Verificar atomicidad: estado de ambas entidades post-acción |

---

## 11. Dependencias y orden de implementación recomendado

| Fase | Contenido |
|---|---|
| 1 | Modelo de datos: `admin_users`, `admin_otp_tokens`, `admin_audit_log`, campo `paused_by_admin`, constraint `reputation_events` |
| 2 | Autenticación admin: login + OTP + JWT + middleware + TPL-ADM-001 |
| 3 | Módulo de usuarios (todos los endpoints) |
| 4 | Módulo de objetos (todos los endpoints) |
| 5 | Módulo de sesiones de entrega |
| 6 | Métricas operativas y estado del sistema |
| 7 | Módulo de reportes (bloqueado hasta INIT-REP-01) |

---

## 12. Nota sobre plataforma

El backend está desplegado en **Render**. Todas las referencias a Railway en la documentación de arquitectura existente (`architecture.md`) contienen un error de origen. Las variables de entorno nuevas (`ADMIN_JWT_SECRET`, `ADMIN_EMAIL`) deben configurarse en el dashboard de Render.

La estrategia de IP allowlist a nivel de plataforma no está disponible de forma nativa en Render para servicios web. La seguridad perimetral se sustenta en: autenticación de dos factores, CORS restrictivo, rate limiting y HTTPS obligatorio. Para mayor aislamiento futuro puede evaluarse el uso de Render Private Networks.
