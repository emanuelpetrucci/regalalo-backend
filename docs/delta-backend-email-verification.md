# Delta — technical-design-backend.md
**Versión base:** 1.2  
**Versión resultante:** 1.3  
**Estado:** Incorporado (Correct Course 2026-05-26)  
**Fecha:** Mayo 2026  
**Motivo:** Incorporación de verificación de email en el registro de usuario

---

## Sección 3.1 — Tabla `users`

### Cambio

Añadir cuatro columnas a la tabla `users` para soportar el flujo de verificación de email.

```sql
ALTER TABLE users
ADD COLUMN email_verified             BOOLEAN    NOT NULL DEFAULT FALSE,
ADD COLUMN verification_token_hash    TEXT,
ADD COLUMN verification_token_expires_at TIMESTAMPTZ,
ADD COLUMN verification_resend_at     TIMESTAMPTZ;
```

**Nota:** sin migración de datos requerida. Los registros existentes quedan con `email_verified = FALSE`. Si el sistema se despliega sobre una base de datos ya poblada, se recomienda establecer `email_verified = TRUE` sobre los registros existentes mediante script de migración puntual antes de activar el middleware de verificación.

**Definición actualizada de las columnas relevantes:**

```sql
-- Columnas añadidas a la tabla users existente
email_verified                BOOLEAN    NOT NULL DEFAULT FALSE,
verification_token_hash       TEXT,                          -- NULL cuando no hay token pendiente
verification_token_expires_at TIMESTAMPTZ,                   -- NULL cuando no hay token pendiente
verification_resend_at        TIMESTAMPTZ                    -- NULL en el primer envío
```

**Invariantes:**
- `verification_token_hash` y `verification_token_expires_at` se establecen juntos y se limpian juntos (sobrescritos con `NULL`) tras verificación exitosa o emisión de nuevo token.
- `verification_resend_at` se actualiza en cada envío (registro inicial + reenvíos). Controla el cooldown de 30 segundos.
- Una vez `email_verified = TRUE`, los campos `verification_token_hash`, `verification_token_expires_at` y `verification_resend_at` se mantienen en `NULL` de forma permanente.

---

## Sección 4 — Índices

### Cambio

Añadir índice para la búsqueda por token de verificación.

```sql
-- Búsqueda de usuario por token de verificación (GET /auth/verify-email)
CREATE INDEX idx_users_verification_token
  ON users(verification_token_hash)
  WHERE email_verified = FALSE;
```

---

## Sección 8 — Autenticación (JWT + reCAPTCHA V3)

### 8.1 Decisiones de diseño — Cambio

Añadir fila a la tabla de parámetros:

| Parámetro | Valor |
|---|---|
| Expiración token de verificación de email | 24 horas |
| Cooldown de reenvío de verificación | 30 segundos |

---

### 8.2 Flujo de registro — Cambio

El flujo de registro se actualiza para incluir la generación y envío del token de verificación. El JWT se emite igualmente al completar el registro, pero el acceso a rutas protegidas queda bloqueado hasta que el email sea verificado (ver §8.5).

```
POST /auth/register
  { email, password, postalCode, recaptchaToken }

  1. Verificar reCAPTCHA V3 (score ≥ 0.5)
  2. Verificar email único
  3. Hash password (Argon2)
  4. Geocodificar postalCode (LRU Cache → Nominatim)
  5. Rechazar si código postal no existe
  6. Generar token de verificación (crypto.randomBytes(32))
  7. Calcular verification_token_hash = SHA-256(token)
  8. Insertar usuario con:
       email_verified = FALSE
       verification_token_hash = <hash>
       verification_token_expires_at = NOW() + INTERVAL '24 hours'
       verification_resend_at = NOW()
       jwt_version = 1
  9. Enviar email EVT-014 (TPL-009) con enlace de verificación
 10. Generar JWT incluyendo claim jwtVersion = 1
 11. Devolver JWT + datos de usuario
```

**Nota:** el enlace de verificación tiene la forma `GET /auth/verify-email?token=<token_raw>`. El token en texto plano se incluye en el enlace del email y nunca se almacena en base de datos. Solo se almacena su hash SHA-256.

---

### 8.3 Middleware de autenticación — Cambio

El middleware de autenticación incorpora una tercera verificación tras la validación de firma JWT y `jwt_version`:

```typescript
// middleware/auth.ts
const payload = verifyJwt(token);                              // verifica firma y expiración
const user = await userRepo.findById(payload.sub);
if (!user || user.jwtVersion !== payload.jwtVersion) {
  throw new UnauthorizedException();                           // HTTP 401
}
if (!user.emailVerified) {
  throw new EmailNotVerifiedException();                       // HTTP 403
}
```

**Códigos de respuesta diferenciados:**
- HTTP 401 — token inválido, expirado o `jwt_version` no coincide
- HTTP 403 con código `EMAIL_NOT_VERIFIED` — token válido pero email sin verificar

El frontend distingue ambos códigos para redirigir al destino correcto (ver delta frontend).

---

### 8.5 Nuevos endpoints de verificación de email

#### GET /auth/verify-email

**Descripción:** Verificación de email mediante token recibido por enlace. Endpoint público.

```
GET /auth/verify-email?token=<token_raw>

  1. Calcular hash = SHA-256(token_raw)
  2. Buscar usuario por verification_token_hash = hash
     → Si no existe: 400 (token inválido)
  3. Verificar verification_token_expires_at > NOW()
     → Si expirado: 400 (token expirado)
  4. En transacción atómica:
     a. email_verified = TRUE
     b. verification_token_hash = NULL
     c. verification_token_expires_at = NULL
     d. verification_resend_at = NULL
  5. Devolver 200 OK
```

**Respuesta esperada (200):**
```json
{
  "message": "Email verificado correctamente"
}
```

**Errores:**

| Código | Motivo |
|---|---|
| 400 | Token inválido o expirado |

**Nota operativa:** este endpoint no requiere JWT. El token de verificación actúa como credencial única y suficiente.

---

#### POST /auth/resend-verification

**Descripción:** Reenvío del email de verificación. Requiere JWT válido. El email del usuario no debe estar verificado.

```
POST /auth/resend-verification
  Authorization: Bearer <token>

  1. Validar JWT (firma + jwt_version)
     → Si inválido: 401
  2. Verificar email_verified === FALSE
     → Si ya verificado: 409
  3. Verificar cooldown: verification_resend_at < NOW() - INTERVAL '30 seconds'
     → Si cooldown activo: 429 con header Retry-After: <segundos restantes>
  4. Generar nuevo token (crypto.randomBytes(32))
  5. En transacción atómica:
     a. verification_token_hash = SHA-256(nuevo_token)
     b. verification_token_expires_at = NOW() + INTERVAL '24 hours'
     c. verification_resend_at = NOW()
  6. Enviar email EVT-014 (TPL-009)
  7. Devolver 200 OK
```

**Respuesta esperada (200):**
```json
{
  "message": "Email de verificación reenviado"
}
```

**Errores:**

| Código | Motivo |
|---|---|
| 401 | JWT inválido o expirado |
| 409 | El email ya está verificado |
| 429 | Cooldown activo — incluir header `Retry-After` con segundos restantes |

**Nota:** la emisión de un nuevo token invalida el anterior, ya que `verification_token_hash` se sobrescribe. Solo el enlace del último email enviado es válido.

---

## Sección 10 — Notificaciones por Email (Resend)

### Cambio

Añadir fila a la tabla de eventos de email:

| Evento | Destinatario | Contenido |
|---|---|---|
| Registro completado — verificación pendiente | Usuario recién registrado | Enlace de verificación de email (expira en 24 horas) |
| Reenvío de verificación solicitado | Usuario solicitante | Nuevo enlace de verificación de email (expira en 24 horas) |

**Nota:** ambos casos utilizan la misma plantilla TPL-009. La distinción entre registro inicial y reenvío es transparente para la plantilla.

---

## Sección 12 — Reglas de Autorización por Use Case

### Cambio

Añadir nota transversal al inicio de la sección:

**Nota transversal — Verificación de email:**
La verificación `user.emailVerified === TRUE` se ejecuta en el middleware de autenticación, con anterioridad a cualquier use case. Los use cases no necesitan implementar esta verificación de forma individual. Los únicos endpoints que no aplican esta verificación son los propios del flujo de autenticación: `POST /auth/register`, `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/verify-email` y `POST /auth/resend-verification`.
