---
title: "POST /auth/resend-verification"
type: feature
ticket: 5
status: done
created: 2026-10-25
---

# Historia 8.5: POST /auth/resend-verification

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como usuario con email pendiente de verificación,
quiero solicitar un nuevo enlace de verificación,
para verificar mi cuenta si el anterior expiró o no llegó.

## Criterios de aceptación

1. **Dado** JWT válido (`Authorization: Bearer`), `jwt_version` coincidente, `is_active = TRUE` y `email_verified = FALSE`, **cuando** `verification_resend_at` es `NULL` o `verification_resend_at <= NOW() - 30 segundos`, **entonces** responde `200` con `{ "message": "Email de verificación reenviado" }` **y** se genera nuevo token (`crypto.randomBytes(32).toString('hex')`), se persiste hash SHA-256 + expiración 24 h + `verification_resend_at = NOW()` vía `updateVerificationToken` (invalidando token anterior) **y** se envía EVT-014 (`TPL-009`) con el mismo contrato de variables que registro (8.2).

2. **Dado** cooldown activo (`verification_resend_at > NOW() - 30 segundos`), **cuando** se solicita reenvío, **entonces** responde `429 Too Many Requests` con header `Retry-After: <segundos enteros restantes>` (mínimo 1) y cuerpo `{ "message": "..." }` — **sin** generar token ni enviar email.

3. **Dado** `email_verified = TRUE`, **cuando** se solicita reenvío con JWT válido, **entonces** responde `409 Conflict` (mensaje coherente con `ConflictException` existente).

4. **Dado** JWT ausente, inválido, expirado, `jwt_version` distinto o `is_active = FALSE`, **cuando** se accede al endpoint, **entonces** responde `401` (middleware/auth existente — sin cambiar semántica).

5. **Dado** usuario no verificado, **cuando** accede a `POST /auth/resend-verification`, **entonces** la ruta usa middleware de auth con `skipEmailVerification: true` (8.3) — no recibe `403 EMAIL_NOT_VERIFIED` por email pendiente.

6. **Dado** reenvío exitoso, **cuando** se construye `verificationLink`, **entonces** usa `{env.APP_PUBLIC_URL}/verificar-email?token={rawToken}` (misma regla que 8.2; no `CORS_ORIGIN` ni `/auth/verify-email` en el enlace del email).

7. **Regresión:** `npm run build` y `npm test` pasan; tests nuevos cubren 200, 429+Retry-After, 409, 401 y skip de bloqueo email.

## Alcance explícito (IN / OUT)

| IN (8.5) | OUT (otras historias) |
|---|---|
| `ResendVerificationUseCase` | `GET /auth/verify-email` (8.4) |
| `POST /auth/resend-verification` en router + controller | Middleware base `emailVerified` (8.3 — solo **consumir** `skipEmailVerification`) |
| Excepción dominio cooldown + rama `error-handler` → 429 + `Retry-After` | Migración 015 / métodos repo nuevos (8.1 — prerrequisito) |
| DTO response en `email-verification.dto.ts` | Registro inicial con token (8.2 — reutilizar TPL-009) |
| Wire: auth middleware + ruta en `auth.routes.ts` | OpenAPI / `openapi.json` (8.6) |
| Tests `tests/auth-resend-verification.test.ts` | Plantilla dashboard Resend (8.6) |
| `npm run build` + `npm test` | Tests E2E transversal épica (8.6) |
| | Marcar épica 8 como `done` |

**Prerrequisitos bloqueantes:**

- **8.1:** `updateVerificationToken(userId, hash, expiresAt, resendAt)` en `IUserRepository` / `PostgresUserRepository`; columnas de verificación en entidad `User`.
- **8.2 (recomendado):** `TPL-009` en `resend.provider.ts`, `env.APP_PUBLIC_URL`, patrón de variables EVT-014 — reenvío usa la **misma** plantilla y payload.
- **8.3 (recomendado):** `createAuthMiddleware(jwt, userRepo, { skipEmailVerification: true })` — si 8.3 no está mergeada, implementar la opción en middleware como parte del wire de esta ruta (mínimo: tercer parámetro opcional + chequeo `emailVerified`).

**Nota:** Sin 8.2, el dev debe asegurar que `TPL-009` existe antes de enviar email en tests (mock `mailService`).

## Tareas / Subtasks

- [x] **Task 1 — Prerrequisitos 8.1 + 8.3** (AC: #1, #5)
  - [x] Confirmar `updateVerificationToken` en repo (SQL de 8.1)
  - [x] Confirmar `createAuthMiddleware` acepta `{ skipEmailVerification?: boolean }` (8.3); si no, añadir opción sin implementar verify/resend de otras historias

- [x] **Task 2 — DTOs** (AC: #1)
  - [x] En `src/application/dtos/email-verification.dto.ts` (compartido con 8.4 si existe):
    ```typescript
    export interface ResendVerificationResponseDto {
      message: string;
    }
    ```
  - [x] Mensaje de éxito exacto: `"Email de verificación reenviado"` (architecture §8.6)

- [x] **Task 3 — Excepción cooldown 429** (AC: #2)
  - [x] Crear `src/domain/exceptions/resend-cooldown.exception.ts`:
    ```typescript
    export class ResendCooldownException extends Error {
      readonly retryAfterSeconds: number;
      constructor(retryAfterSeconds: number, message = 'Resend cooldown active') {
        super(message);
        this.name = 'ResendCooldownException';
        this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
      }
    }
    ```
  - [x] En `error-handler.ts`, rama **antes** de `ConflictException`:
    ```typescript
    if (err instanceof ResendCooldownException) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds));
      res.status(429).json({ message: err.message });
      return;
    }
    ```

- [x] **Task 4 — `ResendVerificationUseCase`** (AC: #1–#3, #6)
  - [x] Crear `src/application/use-cases/user/resend-verification.use-case.ts`
  - [x] Entrada: `userId: string` (desde `req.currentUser.id` en controller — no confiar en body)
  - [x] Flujo:
    ```typescript
    const user = await this.userRepo.findById(userId);
    if (!user) throw new UnauthorizedException(); // defensa; middleware ya validó
    if (user.emailVerified) throw new ConflictException('Email already verified');

    const COOLDOWN_MS = 30_000;
    if (user.verificationResendAt) {
      const elapsed = Date.now() - user.verificationResendAt.getTime();
      if (elapsed < COOLDOWN_MS) {
        const retryAfterSeconds = (COOLDOWN_MS - elapsed) / 1000;
        throw new ResendCooldownException(retryAfterSeconds);
      }
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const resendAt = new Date();
    await this.userRepo.updateVerificationToken(user.id, tokenHash, expiresAt, resendAt);

    const verificationLink = `${env.APP_PUBLIC_URL}/verificar-email?token=${rawToken}`;
    this.mailService.send({ to: user.email, templateId: 'TPL-009', variables: {
      recipientEmail: user.email,
      firstName: user.firstName,
      verificationLink,
      expiresInHours: 24,
    }}).catch((err) => logger.error({ err }, 'Failed to send verification email'));

    return { message: 'Email de verificación reenviado' };
    ```
  - [x] **No** loguear `rawToken` ni hash
  - [x] **No** `emitEvent` (sin spec analítica para reenvío)
  - [x] Email fire-and-forget igual que 8.2 — fallo de envío no revierte token ya persistido (mismo trade-off que registro)

- [x] **Task 5 — Controller + rutas** (AC: #1, #4, #5)
  - [x] Añadir `resendVerification` en `AuthController` — leer `req.currentUser!.id`, delegar use case, `200` JSON
  - [x] Extender constructor con `ResendVerificationUseCase`
  - [x] En `auth.routes.ts`:
    - Instanciar `ResendVerificationUseCase(userRepo, mailService)`
    - `const authWithSkipEmail = createAuthMiddleware(jwtService, userRepo, { skipEmailVerification: true });`
    - `router.post('/resend-verification', authWithSkipEmail, (req, res, next) => controller.resendVerification(req, res, next));`
  - [x] Path final: `POST /api/auth/resend-verification` (prefijo `/api` en app)
  - [x] **Sin** body validator (sin payload); **sin** reCAPTCHA

- [x] **Task 6 — Tests** (AC: #1–#7)
  - [x] Crear `tests/auth-resend-verification.test.ts` (patrón `auth-password-reset.test.ts` + middleware mock):
    - `buildTestApp` con `createAuthRouter({ userRepo, mailService, jwtService })` y usuario mockeado
    - `mockUser`: `emailVerified: false`, `verificationResendAt` configurable, campos token opcionales
  - [x] Casos mínimos:
    - Cooldown expirado / `verificationResendAt` null → 200, mensaje exacto, `updateVerificationToken` llamado, `mailService.send` TPL-009 con `verificationLink` correcto
    - Cooldown activo (`verificationResendAt = new Date()`) → 429, header `Retry-After` numérico ≥ 1, **no** `updateVerificationToken`, **no** email
    - `emailVerified: true` → 409
    - Sin `Authorization` → 401
    - Con JWT válido + `emailVerified: false` → no 403 `EMAIL_NOT_VERIFIED` (si 8.3 activo: usar middleware real con skip en ruta)
  - [x] Assert hash: capturar argumento de `updateVerificationToken` y verificar SHA-256 del token generado (spy `crypto` o inspección indirecta vía link en mock mail)
  - [x] `npm test` + `npm run build`

### Review Findings

- [x] [Review][Patch] Mensaje 429 en inglés — default `'Resend cooldown active'` viola convención española del API [src/domain/exceptions/resend-cooldown.exception.ts:3]
- [x] [Review][Patch] `expiresInHours: 24` hardcodeado independientemente de `expiresAt` — si cambia la duración en uno, el email muestra el valor incorrecto [src/application/use-cases/user/resend-verification.use-case.ts]
- [x] [Review][Patch] Test 8.5.3 — `verificationLink` no verifica prefijo `APP_PUBLIC_URL` (AC6) [tests/auth-resend-verification.test.ts]
- [x] [Review][Patch] Test 8.5.5 — `setTimeout(10)` innecesario; en cooldown el código nunca alcanza `mailService.send` [tests/auth-resend-verification.test.ts]
- [x] [Review][Patch] AC4 incompleto — falta test para `is_active = FALSE` → 401 [tests/auth-resend-verification.test.ts]
- [x] [Review][Defer] Race condition: requests concurrentes pueden pasar cooldown sin UPDATE atómico en DB [src/application/use-cases/user/resend-verification.use-case.ts] — deferred, pre-existing
- [x] [Review][Defer] `req.currentUser!` non-null assertion sin guard de runtime — patrón pre-existente en todos los controladores [src/interfaces/http/controllers/auth.controller.ts] — deferred, pre-existing
- [x] [Review][Defer] `updateVerificationToken` no verifica `rowCount` — usuario borrado mid-flight retorna 200 sin efecto [src/infrastructure/database/supabase/user.repository.ts] — deferred, pre-existing

---

## Notas para el Dev Agent

### Contexto de épica 8

Correct Course (2026-05-26): verificación obligatoria post-registro. **8.5** (esta historia) permite reenviar EVT-014 con cooldown 30 s e invalidación del token anterior. Depende de persistencia (8.1), plantilla (8.2) y middleware con skip (8.3). **8.4** verifica el token; **8.6** documenta OpenAPI y tests transversales.

**Orden:** `8.1` → `8.2` → `8.3` → `8.4`/`8.5` (paralelizables entre sí si prerrequisitos listos) → `8.6`.

### Estado actual del código (leer antes de editar)

**No existe** reenvío: `grep` en `src/` sin `resend-verification`, `ResendVerification`, `updateVerificationToken`, `ResendCooldownException`.

**`auth.routes.ts`** — solo POST register/login/forgot/reset; sin middleware en rutas auth actuales.

**`auth.middleware.ts`** — pre-8.3: sin `emailVerified` ni `skipEmailVerification`. La ruta 8.5 **debe** montar middleware con skip cuando 8.3 exista; si solo 8.5 se implementa antes, añadir al menos el parámetro opcional para no auto-bloquearse tras 8.3.

**`IUserRepository`** — pre-8.1: sin `updateVerificationToken`. **No** duplicar SQL de 8.1 en 8.5.

**`error-handler.ts`** — sin manejo 429 personalizado con `Retry-After`. `express-rate-limit` devuelve 429 genérico en `/auth/*` (10/15min por IP) — **distinto** del cooldown por usuario (30 s); ambos pueden aplicar.

**`RegisterUserUseCase`** — patrón token + TPL-009 en 8.2; 8.5 **reutiliza** generación cripto y variables, pero usa `updateVerificationToken` en lugar de INSERT.

### Diseño — decisiones

| Decisión | Elección | Motivo |
|---|---|---|
| Identidad del usuario | `req.currentUser.id` | JWT es la credencial; no aceptar email en body |
| Cooldown | 30 s desde `verificationResendAt` | FR45 / architecture §8.6 |
| `verificationResendAt === null` | Permitir reenvío | Usuarios legacy o edge post-migración |
| Token anterior | Invalidado al sobrescribir hash | AC épica |
| 409 si ya verificado | `ConflictException` | Mapeo existente en error-handler |
| 429 cooldown | Nueva excepción + `Retry-After` | AC explícito; no reutilizar rate-limit IP |
| Orden operaciones | Persistir token → enviar email | Igual que fire-and-forget en registro |
| Enlace email | SPA `/verificar-email` | Delta 2026-05-26; frontend llama API verify |

### Cálculo `Retry-After`

```typescript
const remainingMs = COOLDOWN_MS - (Date.now() - user.verificationResendAt.getTime());
throw new ResendCooldownException(remainingMs / 1000);
```

Usar `Math.ceil` en la excepción para cumplir "segundos restantes" ≥ 1.

### Wire middleware (8.3)

```typescript
// auth.routes.ts — patrón objetivo
const jwtService = new JwtService();
const authSkipEmailVerify = createAuthMiddleware(jwtService, userRepo, {
  skipEmailVerification: true,
});
router.post('/resend-verification', authSkipEmailVerify, handler);
```

Ruta **no** exenta de JWT — solo exenta del chequeo `emailVerified`. Sigue validando firma, `jwtVersion`, `isActive`.

### Anti-patrones (no hacer en 8.5)

- No implementar `GET /auth/verify-email` (8.4).
- No modificar `RegisterUserUseCase` salvo bugfix imprescindible.
- No duplicar migración 015 ni métodos repo de 8.1.
- No regenerar OpenAPI (8.6).
- No exponer token/hash en respuesta HTTP.
- No aceptar `email` en body para identificar usuario.
- No usar `ForbiddenException` para cooldown (necesita 429, no 403).
- No omitir header `Retry-After` en 429 de cooldown.
- No marcar épica 8 como `done`.

### Cumplimiento de arquitectura

- **Clean Architecture:** use case en `application/use-cases/user/`, excepción en `domain/exceptions/`, wire en `interfaces/http/`.
- **FR45:** POST con JWT, cooldown 30 s, invalidación token anterior.
- **§8.6:** contrato 200/409/429 documentado.
- **§12:** verificación email en middleware — este endpoint listado como exento del bloqueo `emailVerified`.

### Cross-story context

| Historia | Relación con 8.5 |
|---|---|
| 8.1 | **Prerrequisito** — `updateVerificationToken`, campos en `User` |
| 8.2 | TPL-009, `APP_PUBLIC_URL`, `verification_resend_at` en registro |
| 8.3 | **Prerrequisito wire** — `skipEmailVerification: true` en esta ruta |
| 8.4 | Token reenviado aquí es el que verify consume; token viejo → 400 en verify |
| 8.6 | OpenAPI + tests integración — no duplicar aquí |

### Inteligencia de historias anteriores

- **8.2:** variables TPL-009 y `verificationLink`; no copiar lógica de INSERT — usar `updateVerificationToken`.
- **8.3:** AC épica exige que resend no reciba 403; documentado como `skipEmailVerification`.
- **8.4:** verify limpia tokens; resend solo sobrescribe hash mientras `email_verified = FALSE`.
- **1.5 / forgot-password:** patrón `randomBytes` + SHA-256 + email async; tabla distinta — no reutilizar `password_reset_tokens`.
- **6.2 / isActive:** mismo orden middleware — email check después de isActive.

### Rate limiting global vs cooldown

`app.use('/auth', authRateLimit)` — 10 req/IP/15 min. El cooldown 30 s es **por usuario** en BD. Un cliente puede recibir 429 por IP (rate limit) o por cooldown (esta historia) — mensajes distintos; tests de 8.5 deben usar mocks/time para cooldown, no confundir con `express-rate-limit`.

### Verificación

```bash
npm run db:migrate    # 015 aplicada (8.1)
npm run build
npm test
# Manual: login usuario no verificado → POST /api/auth/resend-verification con Bearer → 200;
# repetir antes de 30s → 429 + Retry-After
```

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (2026-05-26)

### Debug Log References

### Completion Notes List

- Prerrequisitos 8.1 y 8.3 confirmados ya implementados: `updateVerificationToken(input: UpdateVerificationTokenInput)` en repo, `createAuthMiddleware` con `skipEmailVerification`.
- `ResendVerificationResponseDto` añadido a `email-verification.dto.ts`.
- `ResendCooldownException` creada en `domain/exceptions/`; manejada en `error-handler.ts` antes de `ConflictException` → 429 + header `Retry-After`.
- `ResendVerificationUseCase`: cooldown 30 s desde `verificationResendAt`, genera token `randomBytes(32)`, persiste SHA-256 + expiración 24 h via `updateVerificationToken`, email fire-and-forget TPL-009.
- `AuthController.resendVerification` añadido; constructor extendido con `ResendVerificationUseCase`.
- `auth.routes.ts`: ruta `POST /resend-verification` montada con `createAuthMiddleware(..., { skipEmailVerification: true })`.
- 9 tests en `auth-resend-verification.test.ts`: 200 (null resendAt, cooldown expirado), verificación hash SHA-256, 429 + Retry-After, sin updateVerificationToken/email en cooldown, 409 (ya verificado), 401 (sin auth / jwtVersion inválida), no-403 para no verificado.
- `npm run build` ✅ y `npm test` ✅ — 300 tests pasan, 0 regresiones.

### File List

- `src/application/dtos/email-verification.dto.ts` (modificado — añade `ResendVerificationResponseDto`)
- `src/domain/exceptions/resend-cooldown.exception.ts` (nuevo)
- `src/application/use-cases/user/resend-verification.use-case.ts` (nuevo)
- `src/interfaces/http/middlewares/error-handler.ts` (modificado — manejo 429 `ResendCooldownException`)
- `src/interfaces/http/controllers/auth.controller.ts` (modificado — método `resendVerification` + ctor)
- `src/interfaces/http/routes/auth.routes.ts` (modificado — ruta + wire `ResendVerificationUseCase`)
- `tests/auth-resend-verification.test.ts` (nuevo)

---

## Referencias

- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Épica 8, Historia 8.5, FR45]
- [Source: docs/architecture.md — §8.6 POST /auth/resend-verification]
- [Source: docs/delta-backend-email-verification.md — POST /auth/resend-verification]
- [Source: docs/email-flow-mapping.md — EVT-014 cooldown y reenvíos]
- [Source: _bmad-output/initiative-backend/tickets/epic-verificacion-de-email/tickets/story-migracion-sql-verificacion-email-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-verificacion-de-email/tickets/story-registro-token-y-email-tpl-009-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-verificacion-de-email/tickets/story-middleware-email-verified-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-verificacion-de-email/tickets/story-get-auth-verify-email-plan.md]
- [Source: src/application/use-cases/user/register-user.use-case.ts]
- [Source: src/application/use-cases/user/forgot-password.use-case.ts]
- [Source: src/interfaces/http/routes/auth.routes.ts]
- [Source: src/interfaces/http/middlewares/auth.middleware.ts]
- [Source: src/interfaces/http/middlewares/error-handler.ts]

---

Ultimate context engine analysis completed — comprehensive developer guide created.
