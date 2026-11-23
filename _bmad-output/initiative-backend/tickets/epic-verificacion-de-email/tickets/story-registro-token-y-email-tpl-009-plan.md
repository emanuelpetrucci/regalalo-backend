---
title: "Registro con token y email EVT-014"
type: feature
ticket: 2
status: done
created: 2026-10-25
---

# Historia 8.2: Registro con token y email EVT-014 (TPL-009)

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como visitante recién registrado,
quiero recibir un email con enlace de verificación al completar el registro,
para confirmar que soy dueño del correo antes de usar la plataforma.

## Criterios de aceptación

1. **Dado** `POST /auth/register` exitoso (reCAPTCHA ≥ 0.5, email único, CP geocodificable), **cuando** el usuario se inserta en BD, **entonces** se genera token con `crypto.randomBytes(32).toString('hex')`, se persiste solo su hash SHA-256 hex, `verification_token_expires_at = NOW() + 24 h` y `verification_resend_at = NOW()` junto al INSERT (campos de 8.1).

2. **Dado** registro exitoso, **cuando** termina el use case, **entonces** se envían **secuencialmente** (mismo patrón fire-and-forget que TPL-001 hoy) EVT-001 (`TPL-001`) y EVT-014 (`TPL-009`), en ese orden, tras el commit implícito del INSERT.

3. **Dado** el email EVT-014, **cuando** se construye `verificationLink`, **entonces** usa `{baseUrl}/verificar-email?token={token_raw}` donde `baseUrl` es `env.APP_PUBLIC_URL` (nuevo, fallback `env.CORS_ORIGIN`) — alineado a `docs/architecture.md` §8.2 y `docs/email-flow-mapping.md` v1.2.

4. **Dado** EVT-014, **cuando** se invoca `IMailService.send`, **entonces** las variables son `recipientEmail`, `firstName`, `verificationLink`, `expiresInHours: 24` (valor fijo numérico).

5. **Dado** registro exitoso, **cuando** responde el servidor, **entonces** el contrato HTTP **no cambia**: `201` con `{ token, user: { id, email, firstName, lastName, postalCode, reputationScore, totalReceived, totalDonated } }` — sin exponer token, hash ni `emailVerified`.

6. **Dado** registro fallido (409, 400 geocode, 422 reCAPTCHA), **cuando** la petición termina, **entonces** no se genera token, no se persisten columnas de verificación y no se envía TPL-009 (ni TPL-001 si no hubo INSERT).

## Alcance explícito (IN / OUT)

| IN (8.2) | OUT (otras historias) |
|---|---|
| Generación token + hash en `RegisterUserUseCase` | Middleware `EMAIL_NOT_VERIFIED` (8.3) |
| Extender `CreateUserInput` + `PostgresUserRepository.create()` INSERT con columnas de token | `GET /auth/verify-email` (8.4) |
| Plantilla `TPL-009` en `resend.provider.ts` | `POST /auth/resend-verification` / `ResendVerificationUseCase` (8.5) |
| Segundo `mailService.send` (EVT-014) tras TPL-001 | OpenAPI endpoints verify/resend (8.6) |
| Variable `APP_PUBLIC_URL` en `env.ts` (fallback `CORS_ORIGIN`) | Migración SQL / métodos repo de 8.1 (prerrequisito) |
| Tests registro: dual-email + token persistido en `create` | Tests E2E middleware 403 / cooldown reenvío (8.6) |
| `npm run build` + `npm test` | Bloqueo de rutas protegidas (8.3) |

**Prerrequisito bloqueante:** Historia **8.1** debe estar implementada (`done` o al menos mergeada en la rama de trabajo) antes de dev-story de 8.2: migración `015-email-verification.sql`, campos en entidad `User`, `CreateUserInput` no requiere cambios de 8.1 salvo los que 8.2 añade para token en INSERT.

## Tareas / Subtareas

- [x] **Task 1 — Prerrequisito 8.1** (AC: #1)
  - [x] Confirmar que existen `verification_token_hash`, `verification_token_expires_at`, `verification_resend_at` en BD y entidad `User`
  - [x] Si 8.1 no está mergeada, implementar o mergear 8.1 primero — **no** duplicar migración/repo de 8.1 en 8.2

- [x] **Task 2 — `env.APP_PUBLIC_URL`** (AC: #3)
  - [x] Añadir en `src/config/env.ts`: `APP_PUBLIC_URL: process.env['APP_PUBLIC_URL'] ?? process.env['CORS_ORIGIN'] ?? 'http://localhost:4200'`
  - [x] Usar `env.APP_PUBLIC_URL` en `RegisterUserUseCase` para `verificationLink` (no hardcodear dominio)
  - [x] **No** cambiar `ForgotPasswordUseCase` (sigue con `CORS_ORIGIN` / reset-password — fuera de alcance)

- [x] **Task 3 — Extender persistencia en registro** (AC: #1)
  - [x] Ampliar `CreateUserInput` en `user.repository.ts`:
    ```typescript
    verificationTokenHash: string;
    verificationTokenExpiresAt: Date;
    verificationResendAt: Date;
    ```
  - [x] Modificar `INSERT` en `PostgresUserRepository.create()` para incluir las tres columnas en el mismo statement (atómico con creación de usuario)
  - [x] Reutilizar patrón cripto de `forgot-password.use-case.ts`:
    ```typescript
    import { randomBytes, createHash } from 'crypto';
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const resendAt = new Date();
    ```
  - [x] El `rawToken` solo vive en memoria del use case hasta construir `verificationLink`; **nunca** loguear ni persistir en claro

- [x] **Task 4 — `RegisterUserUseCase`** (AC: #1–#5)
  - [x] Generar token **antes** de `userRepo.create()`; pasar hash + fechas en `CreateUserInput`
  - [x] Mantener orden existente: reCAPTCHA → email único → hash password → geocode → create → JWT → `emitEvent('user.registered')` → emails
  - [x] Tras create exitoso, enviar TPL-001 (existente) y luego TPL-009 (nuevo), cada uno con `.catch(err => logger.error(...))` independiente
  - [ ] TPL-009 payload:
    ```typescript
    {
      to: user.email,
      templateId: 'TPL-009',
      variables: {
        recipientEmail: user.email,
        firstName: user.firstName,
        verificationLink: `${env.APP_PUBLIC_URL}/verificar-email?token=${rawToken}`,
        expiresInHours: 24,
      },
    }
    ```
  - [x] **No** modificar DTO de respuesta HTTP ni OpenAPI de register (contrato sin cambios)

- [x] **Task 5 — Plantilla `TPL-009` en Resend** (AC: #2, #4)
  - [x] Añadir entrada en `src/infrastructure/email/resend.provider.ts`:
    - `subject`: p. ej. `'Verifica tu email — Regálalo'`
    - `html`: saludo con `firstName`, enlace clickeable con `verificationLink`, texto de expiración usando `expiresInHours`
  - [x] Seguir estilo HTML inline de TPL-001–TPL-008 (`greetingHtml` + párrafos)
  - [x] La plantilla Resend/dashboard externa es opcional en MVP — el provider local renderiza HTML como el resto

- [x] **Task 6 — Tests** (AC: #1–#6)
  - [x] Actualizar `tests/auth-register.test.ts`:
    - `mockUser` incluye campos de verificación si 8.1 los añadió al tipo
    - Assert `userRepo.create` recibe `verificationTokenHash`, fechas coherentes (mock o captura de argumentos)
    - Assert `mailService.send` llamado **2 veces**: primero TPL-001, luego TPL-009 con variables correctas
    - Assert `verificationLink` contiene `/verificar-email?token=` y `expiresInHours: 24`
  - [x] Casos de error existentes: verificar que `mailService.send` **no** se llama con TPL-009 en 409/400/422
  - [x] Opcional: test unitario aislado de `RegisterUserUseCase` con spy de `crypto` — solo si simplifica assert del hash
  - [x] Ejecutar `npm test` y `npm run build`

---

## Notas para el Dev Agent

### Contexto de épica 8

Correct Course (2026-05-26) añadió verificación obligatoria de email. **8.1** entrega schema + repo; **8.2** (esta historia) conecta el registro con token y primer envío EVT-014. **8.3** bloqueará rutas; **8.4/8.5** completan verify/resend; **8.6** alinea docs OpenAPI e integración transversal.

**Orden:** `8.1` (done en dev) → **`8.2`** → `8.3` → `8.4`/`8.5` → `8.6`. No implementar middleware ni endpoints verify/resend aquí.

### Estado actual del código (leer antes de editar)

**`RegisterUserUseCase` hoy** — solo TPL-001, sin token:

```typescript
// src/application/use-cases/user/register-user.use-case.ts
const user = await this.userRepo.create({ email, passwordHash, firstName, lastName, phone, postalCode, lat, lon });
// … emitEvent …
this.mailService.send({ templateId: 'TPL-001', … }).catch(…);
// Falta: generación token, columnas en INSERT, TPL-009
```

**`PostgresUserRepository.create()`** — INSERT sin columnas de verificación:

```sql
INSERT INTO users (email, password_hash, postal_code, location, jwt_version,
  first_name, last_name, phone, email_verified, is_active, preferred_language)
VALUES (…, FALSE, TRUE, 'es')
```

**`resend.provider.ts`** — templates `TPL-001`…`TPL-008` únicamente; **no existe TPL-009**.

**`env.ts`** — no hay `APP_PUBLIC_URL`; `CORS_ORIGIN` default `http://localhost:4200`. Reset password usa `CORS_ORIGIN` para `resetLink`; verificación debe usar ruta SPA `/verificar-email` (no `/reset-password`).

**8.1 en código:** al redactar esta story, migración `015-email-verification.sql` y métodos `updateVerificationToken` / `findByVerificationTokenHash` **aún no están en `main`** — dev-story de 8.2 asume 8.1 completada.

### Diseño recomendado: token en INSERT (no post-update)

Architecture §8.2 lista token en el mismo paso 8 del INSERT. Preferir extender `create()` sobre `create()` + `updateVerificationToken()` para evitar ventana sin token y un round-trip extra. `updateVerificationToken` queda para **8.5** (reenvío).

### Invariantes (delta §3.1 — obligatorios)

- Hash y expiración se establecen juntos en registro; se limpian juntos en verify (8.4).
- `verification_resend_at = NOW()` en registro inicial (base para cooldown 8.5).
- Token en claro **solo** en URL del email; BD guarda SHA-256 hex (64 chars), igual que `password_reset_tokens.token_hash`.
- `email_verified = FALSE` en INSERT (ya presente).

### Patrones existentes — reutilizar, no reinventar

| Patrón | Referencia |
|---|---|
| Generación token + hash | `forgot-password.use-case.ts` |
| Fire-and-forget email + log error | `register-user.use-case.ts` (TPL-001), `forgot-password.use-case.ts` |
| Variables email con `firstName` | Historia 6.5 — todos los templates |
| INSERT usuario | `user.repository.ts` `create()` |

### TPL-009 — contenido mínimo

```typescript
'TPL-009': {
  subject: 'Verifica tu email — Regálalo',
  html: (v) =>
    greetingHtml(v) +
    `<p>Confirma tu dirección de email haciendo clic en el enlace:</p>` +
    `<p><a href="${v.verificationLink}">${v.verificationLink}</a></p>` +
    `<p>El enlace expira en ${v.expiresInHours} horas.</p>`,
},
```

Ajustar copy solo si producto lo pide; funcionalidad > marketing en MVP.

### Anti-patrones (no hacer en 8.2)

- No modificar `auth.middleware.ts` ni añadir `EmailNotVerifiedException` (8.3).
- No crear rutas `verify-email` / `resend-verification` (8.4/8.5).
- No persistir `rawToken` en BD, logs ni analytics (`emitEvent` sin PII — SC analítica).
- No cambiar forma del JSON de `POST /auth/register` (frontend depende del contrato estable).
- No usar `SELECT *` ni exponer campos de token en DTOs.
- No duplicar lógica de migración 015 si 8.1 ya la implementó.
- No marcar épica 8 como `done`.

### Cumplimiento de arquitectura

- **Clean Architecture:** cambios en `application/use-cases/user/register-user.use-case.ts`, `domain/repositories/user.repository.ts` (input), `infrastructure/database/supabase/user.repository.ts`, `infrastructure/email/resend.provider.ts`, `config/env.ts`, tests.
- **Emails:** EVT-014 → TPL-009 según `docs/email-flow-mapping.md` v1.2.
- **NFR:** registro sigue emitiendo JWT; bloqueo de rutas llega en 8.3 — usuarios nuevos tendrán JWT pero no podrán usar rutas protegidas hasta verificar (comportamiento esperado post-8.3).

### Cross-story context

| Historia | Relación con 8.2 |
|---|---|
| 8.1 | Prerrequisito schema + entidad + repo base |
| 8.3 | Consumirá `emailVerified = FALSE` en middleware — no tocar aquí |
| 8.4 | Consumirá hash persistido en registro vía `findByVerificationTokenHash` |
| 8.5 | Reutilizará TPL-009 y `updateVerificationToken`; cooldown usa `verification_resend_at` fijado aquí |
| 8.6 | Docs OpenAPI + tests integración verify/resend/middleware — ampliar, no duplicar todo en 8.2 |

### Inteligencia de historia anterior (8.1)

- Migración **`015-email-verification.sql`**: tres columnas nullable + índice parcial `idx_users_verification_token`.
- Métodos repo `findByVerificationTokenHash`, `updateVerificationToken`, `markEmailVerified` — **8.2 solo usa extensión de `create()`**; los demás métodos son para 8.4/8.5.
- 8.1 explícitamente dejó `create()` sin token — **8.2 es quien modifica `create()`**.

### Inteligencia git / historias relacionadas

- **6.2** estableció `email_verified = FALSE` en registro e INSERT actual.
- **6.5** exige `firstName` en variables de todos los emails.
- **7.4** añadió `emitEvent('user.registered')` post-create — mantener orden: create → JWT → analytics → emails.
- Commits recientes no tocaron verificación de email — greenfield sobre auth existente.

### Verificación

```bash
npm run db:migrate    # requiere 015 aplicada (8.1)
npm run build
npm test
# Manual opcional: POST /auth/register en dev y revisar logs Resend / mail mock
```

---

## Dev Agent Record

### Agent Model Used

Composer (dev-story 8-2)

### Debug Log References

(n/a)

### Completion Notes List

- Prerrequisito 8.1 confirmado: migración 015, entidad User y métodos repo de verificación ya presentes.
- `APP_PUBLIC_URL` añadido en env con fallback a `CORS_ORIGIN`; usado solo en registro para `verificationLink`.
- Token generado con `randomBytes(32)` + SHA-256 hex; persistido atómicamente en INSERT junto al usuario.
- `RegisterUserUseCase` envía TPL-001 y TPL-009 secuencialmente (fire-and-forget); contrato HTTP sin cambios.
- Plantilla TPL-009 añadida en `resend.provider.ts` con variables EVT-014.
- Tests ampliados: hash/fechas en create, dual-email, sin emails en errores 409/400/422.
- `npm test`: 279/279 OK. `npm run build`: OK.

### File List

- src/config/env.ts
- src/domain/repositories/user.repository.ts
- src/infrastructure/database/supabase/user.repository.ts
- src/application/use-cases/user/register-user.use-case.ts
- src/infrastructure/email/resend.provider.ts
- tests/auth-register.test.ts

### Review Findings — CR 8-2 (2026-05-26)

Revisión adversarial (Blind Hunter + Edge Case Hunter + Acceptance Auditor): **sin hallazgos bloqueantes**.

- AC #1–#6 verificados contra implementación y tests (`auth-register.test.ts`).
- Token/hash solo tras geocode exitoso; errores 409/400/422 sin emails ni persistencia de verificación.
- TPL-001 → TPL-009 en orden; `APP_PUBLIC_URL` + plantilla TPL-009 alineadas a docs.
- `npm test` (auth-register 19/19; suite 279) OK en revisión.

### Change Log

- 2026-05-26: Registro genera token de verificación, persiste hash en INSERT y envía EVT-014 (TPL-009) tras bienvenida.
- 2026-05-26: Code review aprobado — status `done`.

---

## Referencias

- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Épica 8, Historia 8.2]
- [Source: docs/architecture.md — §8.1 parámetros, §8.2 flujo registro, §10 TPL-009]
- [Source: docs/delta-backend-email-verification.md — §8.2 flujo registro]
- [Source: docs/delta-email-flow-verification.md — EVT-014, variables TPL-009]
- [Source: docs/email-flow-mapping.md — v1.2 EVT-014 / TPL-009]
- [Source: _bmad-output/initiative-backend/tickets/epic-verificacion-de-email/tickets/story-migracion-sql-verificacion-email-plan.md]
- [Source: src/application/use-cases/user/register-user.use-case.ts]
- [Source: src/application/use-cases/user/forgot-password.use-case.ts]
- [Source: src/infrastructure/database/supabase/user.repository.ts]
- [Source: src/infrastructure/email/resend.provider.ts]
- [Source: tests/auth-register.test.ts]

---

Ultimate context engine analysis completed — comprehensive developer guide created.
