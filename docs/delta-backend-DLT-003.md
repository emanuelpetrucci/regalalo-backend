# Delta — technical-design-backend.md
**Referencia:** DLT-003
**Versión base:** 1.2
**Versión resultante:** 1.3
**Estado:** Incorporado — `docs/architecture.md` v1.3 (2026-05-24, Correct Course)
**Fecha:** Mayo 2026
**Motivo:** Ampliación del modelo de usuario — campos de identidad, avatar, contacto, control operativo e internacionalización

---

## Sección 3.1 — Tabla `users`

### Cambio

Añadir siete columnas a la tabla `users`.

```sql
ALTER TABLE users
  ADD COLUMN first_name         TEXT NOT NULL,
  ADD COLUMN last_name          TEXT NOT NULL,
  ADD COLUMN avatar_url         TEXT,
  ADD COLUMN phone              TEXT,
  ADD COLUMN email_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'es';
```

**Nota:** sin migración de datos requerida para `email_verified`, `is_active` y `preferred_language` — los valores por defecto cubren todos los registros existentes. Los campos `first_name` y `last_name` son `NOT NULL`; si existen registros previos deben recibir un valor antes de aplicar la constraint.

**Definición completa actualizada de la tabla:**

```sql
CREATE TABLE users (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                     TEXT NOT NULL UNIQUE,
  password_hash             TEXT NOT NULL,
  first_name                TEXT NOT NULL,
  last_name                 TEXT NOT NULL,
  avatar_url                TEXT,
  phone                     TEXT,
  postal_code               TEXT NOT NULL,
  location                  GEOGRAPHY(POINT, 4326) NOT NULL,
  reputation_score          INTEGER NOT NULL DEFAULT 0,
  total_received            INTEGER NOT NULL DEFAULT 0,
  total_donated             INTEGER NOT NULL DEFAULT 0,
  consecutive_no_shows      INTEGER NOT NULL DEFAULT 0,
  cycles_at_limit           INTEGER NOT NULL DEFAULT 0,
  last_cycle_incremented_at TIMESTAMPTZ,
  jwt_version               INTEGER NOT NULL DEFAULT 1,
  email_verified            BOOLEAN NOT NULL DEFAULT FALSE,
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  preferred_language        TEXT NOT NULL DEFAULT 'es',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at            TIMESTAMPTZ
);
```

### Notas de implementación

- **`first_name` / `last_name`:** obligatorios en registro. Mínimo 2 caracteres, máximo 50. Solo letras y caracteres Unicode válidos (acentos, ñ, ç). Validación en capa `validators/`.
- **`avatar_url`:** almacena URL pública de Supabase Storage. Se guarda en bucket `avatars/` — separado del bucket de imágenes de objetos. El bucket `avatars/` es público. La ruta de cada archivo sigue el patrón `avatars/{user_id}/{filename}`. La lógica de subida y borrado usa el adaptador de Storage existente. El avatar no está sujeto a purga automática por pg_cron — su ciclo de vida es exclusivamente manual (el usuario lo sube o lo elimina).
- **`phone`:** opcional. Texto libre, máximo 20 caracteres. No se expone en ningún DTO público. Solo visible en `GET /users/me`.
- **`email_verified`:** gestionado por artefacto externo aprobado. Este campo es la fuente de verdad; el backend lo expone en `GET /users/me` pero no lo modifica a través de los endpoints de este diseño.
- **`is_active`:** uso exclusivamente interno. Nunca se incluye en ningún DTO de respuesta. El middleware de autenticación lo verifica tras validar `jwt_version`. Si `is_active = FALSE` → HTTP 401.
- **`preferred_language`:** valor único en MVP (`'es'`). El campo existe para evitar migración futura al expandir cobertura geográfica. `ResendMailProvider` ramifica la selección de template sobre este valor sin cambios de schema.

---

## Sección 4 — Índices

### Cambio

Sin índices adicionales requeridos. Ninguno de los nuevos campos es candidato a índice en el contexto de las consultas del MVP.

---

## Sección 8 — Autenticación

### 8.2 — Flujo de registro actualizado

```
POST /auth/register
  { email, password, firstName, lastName, postalCode, phone?, recaptchaToken }

  1. Verificar reCAPTCHA V3 (score ≥ 0.5)
  2. Verificar email único
  3. Hash password (Argon2)
  4. Geocodificar postalCode (LRU Cache → Nominatim)
  5. Rechazar si código postal no existe
  6. Insertar usuario con:
       location geocodificada
       jwt_version = 1
       email_verified = FALSE       ← gestionado por artefacto externo
       is_active = TRUE
       preferred_language = 'es'
  7. Generar JWT incluyendo claim jwtVersion = 1
  8. Devolver JWT + DTO usuario
```

### 8.3 — Middleware de autenticación actualizado

Añadir verificación de `is_active` tras la validación de `jwt_version`.

```typescript
// middleware/auth.ts
const payload = verifyJwt(token);
const user = await userRepo.findById(payload.sub);

if (!user || user.jwtVersion !== payload.jwtVersion) {
  throw new UnauthorizedException();
}

// NUEVO: verificar cuenta activa
if (!user.isActive) {
  throw new UnauthorizedException();
}
```

---

## Sección nueva — Endpoint: POST /auth/register

### Cambio — Payload de entrada actualizado

```json
{
  "email": "string",
  "password": "string",
  "firstName": "string",
  "lastName": "string",
  "postalCode": "string",
  "phone": "string (opcional)",
  "recaptchaToken": "string"
}
```

### Cambio — Respuesta (201) actualizada

```json
{
  "token": "string (JWT)",
  "user": {
    "id": "uuid",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "postalCode": "string",
    "reputationScore": 0,
    "totalReceived": 0,
    "totalDonated": 0
  }
}
```

**Errores:** sin cambios respecto a v1.2.

---

## Sección nueva — Endpoint: POST /auth/login

### Cambio — Respuesta (200) actualizada

```json
{
  "token": "string (JWT)",
  "user": {
    "id": "uuid",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "reputationScore": "integer"
  }
}
```

---

## Sección nueva — Endpoint: GET /users/me

### Cambio — Respuesta (200) actualizada

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
  "emailVerified": "boolean",
  "reputationScore": "integer",
  "totalReceived": "integer",
  "totalDonated": "integer",
  "consecutiveNoShows": "integer",
  "createdAt": "ISO8601"
}
```

> `is_active`, `cycles_at_limit`, `last_cycle_incremented_at` y `location` no se exponen — siguen siendo internos del sistema.

---

## Sección nueva — Endpoint: GET /users/:id

### Cambio — Respuesta (200) actualizada

```json
{
  "id": "uuid",
  "firstName": "string",
  "lastName": "string",
  "avatarUrl": "string | null",
  "reputationScore": "integer",
  "totalReceived": "integer",
  "totalDonated": "integer",
  "createdAt": "ISO8601"
}
```

> `phone`, `email`, `consecutiveNoShows`, `emailVerified` y `preferredLanguage` no se exponen en perfil público.

---

## Sección nueva — Endpoint: PATCH /users/me

Endpoint nuevo. No existía en v1.2.

| Parámetro | Detalle |
|---|---|
| Método | PATCH |
| Ruta | `/users/me` |
| Autenticación | Requerida |
| Autorización | El propio usuario autenticado |

**Payload de entrada:**

```json
{
  "firstName": "string (opcional)",
  "lastName": "string (opcional)",
  "avatarUrl": "string | null (opcional)",
  "phone": "string | null (opcional)",
  "postalCode": "string (opcional)",
  "preferredLanguage": "string (opcional)"
}
```

**Respuesta (200):**

```json
{
  "id": "uuid",
  "firstName": "string",
  "lastName": "string",
  "avatarUrl": "string | null",
  "phone": "string | null",
  "postalCode": "string",
  "preferredLanguage": "string"
}
```

**Errores:**

| Código | Motivo |
|---|---|
| 400 | Payload inválido |
| 400 | Código postal no geocodificable |
| 401 | No autenticado |

**Notas de implementación:**

- Si `postalCode` se incluye en el payload, se ejecuta el flujo de re-geocodificación completo: LRU Cache → Nominatim → actualización de `location`. Si el código postal no es geocodificable, la operación se rechaza con 400 y ningún campo se actualiza.
- Si `postalCode` se modifica con éxito, se incrementa `jwt_version += 1` en la misma transacción atómica. Esto invalida todos los tokens previos del usuario, forzando re-login. El token actual del usuario queda invalidado al completar la operación — el cliente debe gestionar la redirección a `/login`.
- `email` y `emailVerified` no son editables por este endpoint.
- `avatarUrl` acepta `null` para eliminar el avatar actual. El borrado físico del archivo en Supabase Storage es responsabilidad del adaptador de Storage, siguiendo el patrón de cola de borrado existente.

---

## Sección 10 — Notificaciones por Email (Resend)

### Cambio

Todos los templates activos añaden saludo personalizado con `firstName`. El campo está disponible en el contexto de cada Use Case que dispara un email — el usuario ya se recupera de base de datos en cada Use Case, por lo que no se requiere consulta adicional.

| Template | Variable añadida | Uso |
|---|---|---|
| `TPL-001` | `{{firstName}}` | Saludo de apertura |
| `TPL-002` | `{{firstName}}` | Saludo de apertura |
| `TPL-003` | `{{firstName}}` | Saludo de apertura |
| `TPL-004` | `{{firstName}}` | Saludo de apertura |
| `TPL-005` | `{{firstName}}` | Saludo de apertura |
| `TPL-006` | `{{firstName}}` | Saludo de apertura |
| `TPL-007` | `{{firstName}}` | Saludo de apertura |
| `TPL-008` | `{{firstName}}` | Saludo de apertura |
