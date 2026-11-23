---
title: "GET /auth/verify-email"
type: feature
ticket: 4
status: done
created: 2026-10-25
---

# Historia 8.4: GET /auth/verify-email

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como usuario,
quiero verificar mi email haciendo clic en el enlace del correo,
para desbloquear el acceso a la plataforma.

## Criterios de aceptación

1. **Dado** `GET /auth/verify-email?token=` con token válido (hash coincide en BD) y no expirado (`verification_token_expires_at > NOW()`), **cuando** el servidor procesa la petición, **entonces** responde `200` con `{ "message": "Email verificado correctamente" }` **y** en transacción atómica: `email_verified = TRUE` y `verification_token_hash`, `verification_token_expires_at`, `verification_resend_at` en `NULL`.

2. **Dado** token inválido (hash no encontrado, usuario ya verificado, o token ausente/malformado en query), **cuando** se procesa la petición, **entonces** responde `400 Bad Request`.

3. **Dado** token encontrado pero expirado (`verification_token_expires_at <= NOW()`), **cuando** se procesa la petición, **entonces** responde `400 Bad Request` (mismo código que inválido — no distinguir motivo en HTTP para evitar filtrado).

4. **Dado** la petición a `GET /auth/verify-email`, **cuando** llega al endpoint, **entonces** no requiere JWT ni header `Authorization` (endpoint público).

5. **Dado** verificación exitosa, **cuando** termina el use case, **entonces** no se envía email (EVT-014/TPL-009 es solo registro/reenvío — 8.2/8.5) ni se emite evento de analítica nuevo (fuera de alcance épica 8).

## Alcance explícito (IN / OUT)

| IN (8.4) | OUT (otras historias) |
|---|---|
| `VerifyEmailUseCase` | Middleware `EMAIL_NOT_VERIFIED` (8.3) |
| `GET /auth/verify-email` en router + controller | `POST /auth/resend-verification` (8.5) |
| Validator query `token` (Zod) | Registro con token / TPL-009 en register (8.2) |
| DTO request/response mínimos | Migración 015 / métodos repo base (8.1 — prerrequisito) |
| Wire en `auth.routes.ts` + `AuthController` | OpenAPI `register-paths.ts` + `openapi.json` (8.6) |
| Tests HTTP en `tests/auth-verify-email.test.ts` | Plantilla Resend dashboard (8.6) |
| `npm run build` + `npm test` | Bloqueo de rutas protegidas (8.3) |
| | Modificar `auth.middleware.ts` (8.3 añadirá exención verify-email) |

**Prerrequisitos bloqueantes:**

- **8.1** (`done` o mergeada): migración `015-email-verification.sql`, entidad `User` con campos de token, métodos `findByVerificationTokenHash` y `markEmailVerified` en `IUserRepository` / `PostgresUserRepository`.
- **8.2** (recomendado, no bloqueante para el endpoint): genera tokens en registro; sin 8.2 solo se puede probar con fixtures/seed manual.

**Nota integración frontend:** el email TPL-009 apunta a `{APP_PUBLIC_URL}/verificar-email?token={raw}` (SPA). La página Angular llama a `GET /api/auth/verify-email?token=…`. Este endpoint es la API; no confundir con la ruta SPA.

## Tareas / Subtareas

- [x] **Task 1 — Prerrequisito 8.1** (AC: #1)
  - [x] Confirmar que existen `findByVerificationTokenHash(tokenHash)` y `markEmailVerified(userId)` en repo
  - [x] Si 8.1 no está mergeada, implementar o mergear 8.1 primero — **no** duplicar migración/repo en 8.4

- [x] **Task 2 — DTOs** (AC: #1)
  - [x] Crear `src/application/dtos/email-verification.dto.ts`:
    ```typescript
    export interface VerifyEmailRequestDto {
      token: string;
    }
    export interface VerifyEmailResponseDto {
      message: string;
    }
    ```
  - [x] Mensaje de éxito exacto: `"Email verificado correctamente"` (sin punto final — alineado a architecture §8.6)

- [x] **Task 3 — `VerifyEmailUseCase`** (AC: #1–#3, #5)
  - [x] Crear `src/application/use-cases/user/verify-email.use-case.ts`
  - [x] Flujo (reutilizar patrón cripto de `reset-password.use-case.ts`):
    ```typescript
    import { createHash } from 'crypto';
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const user = await this.userRepo.findByVerificationTokenHash(tokenHash);
    if (!user) throw new BadRequestException();
    if (!user.verificationTokenExpiresAt || user.verificationTokenExpiresAt <= new Date()) {
      throw new BadRequestException();
    }
    await this.userRepo.markEmailVerified(user.id);
    return { message: 'Email verificado correctamente' };
    ```
  - [x] **No** enviar email ni llamar `emitEvent`
  - [x] **No** loguear token raw ni hash
  - [x] Si `markEmailVerified` falla (p. ej. `rowCount === 0` por carrera), propagar `BadRequestException` → 400

- [x] **Task 4 — Validator query** (AC: #2, #4)
  - [x] Crear `src/interfaces/validators/verify-email.validator.ts`:
    ```typescript
    export const verifyEmailQuerySchema = z.object({
      token: z.string().min(1).max(256),
    });
    ```
  - [x] Validar `req.query` (patrón `list-items.validator.ts`); 400 con `{ message: 'Invalid request', errors: … }` si falta `token`
  - [x] Token hex de registro = 64 chars; `max(256)` deja margen

- [x] **Task 5 — Controller + rutas** (AC: #1, #4)
  - [x] Añadir `verifyEmail` en `AuthController` — leer `req.query.token`, delegar a use case, `200` JSON
  - [x] Extender constructor de `AuthController` con `VerifyEmailUseCase`
  - [x] En `auth.routes.ts`:
    - Instanciar `VerifyEmailUseCase(userRepo)` (solo depende de `IUserRepository`)
    - Registrar `router.get('/verify-email', validateVerifyEmailQuery, …)` **sin** auth middleware
  - [x] La ruta vive bajo `/auth` montado en `routes/index.ts` → path final `/api/auth/verify-email` (prefijo `/api` en app)

- [x] **Task 6 — Tests** (AC: #1–#4)
  - [x] Crear `tests/auth-verify-email.test.ts` siguiendo `auth-password-reset.test.ts`:
    - Helper `buildTestApp` con mocks de `userRepo.findByVerificationTokenHash` y `markEmailVerified`
    - `mockUser` incluye campos de verificación (post-8.1):
      ```typescript
      verificationTokenHash: 'sha256hashvalue',
      verificationTokenExpiresAt: FUTURE,
      verificationResendAt: new Date(),
      emailVerified: false,
      ```
  - [x] Casos mínimos:
    - Token válido → 200 + mensaje exacto + `markEmailVerified` llamado con `userId`
    - Token no encontrado → 400
    - Token expirado → 400
    - Query sin `token` → 400
    - Sin header Authorization → 200 (público)
  - [x] Assert hash SHA-256: el use case hashea el token antes de `findByVerificationTokenHash`
  - [x] Ejecutar `npm test` y `npm run build`

### Review Findings

- [x] [Review][Decision] `markEmailVerified` — ¿errores no-rowcount deben mapear a 400? — Resuelto: solo rowCount=0 → 400. Errores de infraestructura (conexión, constraint) pueden propagarse como 500. Comportamiento actual correcto.
- [x] [Review][Patch] Tests: `PAST = new Date(Date.now() - 1)` es frágil en Windows/GC — cambiado a `-60_000` ms [tests/auth-verify-email.test.ts:9] ✓ aplicado
- [x] [Review][Patch] Tests: falta caso "usuario ya verificado → 400" (AC2 sub-caso explícito del spec) — añadido test 8.4.9 [tests/auth-verify-email.test.ts] ✓ aplicado
- [x] [Review][Patch] Sin rate limit explícito en `GET /verify-email` — `authRateLimit` ya aplicado globalmente a `/api/auth` en `app.ts:34`; descartado como falso positivo
- [x] [Review][Defer] Validator no rechaza token malformado (no-hex, ≠ 64 chars) — el endpoint igual devuelve 400 por hash-mismatch; comportamiento correcto aunque en capa diferente [src/interfaces/validators/verify-email.validator.ts:4] — deferred, pre-existing
- [x] [Review][Defer] `buildTestApp` reemplaza `userRepo` completo en overrides — si `IUserRepository` gana métodos, los tests rotos no tienen TypeScript guard [tests/auth-verify-email.test.ts:113] — deferred, pre-existing
- [x] [Review][Defer] Mensaje de éxito hardcoded en español, testeado como literal — concern de i18n futuro, patrón pre-existente en toda la codebase [src/application/use-cases/user/verify-email.use-case.ts:26] — deferred, pre-existing

---

## Notas para el Dev Agent

### Contexto de épica 8

Correct Course (2026-05-26) añadió verificación obligatoria de email. **8.1** schema + repo; **8.2** registro + primer EVT-014; **8.3** middleware 403; **8.4** (esta historia) endpoint público de confirmación; **8.5** reenvío; **8.6** OpenAPI + tests integración transversal.

**Orden recomendado:** `8.1` → `8.2` → `8.3` → **`8.4`** → `8.5` → `8.6`. Esta historia puede implementarse en paralelo con 8.3 si 8.1 está lista (no depende del middleware).

### Estado actual del código (leer antes de editar)

**No existe** endpoint verify-email: `grep` en `src/` sin coincidencias para `verify-email`, `VerifyEmail`, `findByVerificationTokenHash`, `markEmailVerified`.

**`auth.routes.ts` hoy** — solo POST register/login/forgot/reset; **falta** `GET /verify-email`.

**`AuthController`** — cuatro métodos; sin `verifyEmail`.

**`IUserRepository` hoy** — sin métodos de verificación (pendientes de 8.1):

```typescript
// src/domain/repositories/user.repository.ts — pre-8.1
export interface IUserRepository {
  findByEmail(...);
  findById(...);
  create(...);
  // FALTAN: findByVerificationTokenHash, markEmailVerified
}
```

**`auth.middleware.ts`** — valida JWT + jwtVersion + isActive; **no** comprueba `emailVerified` aún (8.3). El endpoint verify-email **no pasa** por auth middleware (rutas auth son públicas salvo las que monten middleware explícito en otro router).

**Patrón análogo — reset password:**

```typescript
// reset-password.use-case.ts — mismo flujo hash → buscar → validar expiración → mutación atómica
const tokenHash = createHash('sha256').update(dto.token).digest('hex');
const tokenRecord = await this.tokenRepo.findByTokenHash(tokenHash);
if (!tokenRecord || tokenRecord.expiresAt < new Date()) throw new BadRequestException();
```

Aquí la búsqueda es sobre `users.verification_token_hash` vía `findByVerificationTokenHash`, y la mutación es `markEmailVerified` (transacción en repo 8.1).

### Flujo completo end-to-end (contexto)

```
Email TPL-009 → enlace SPA /verificar-email?token=RAW
       ↓
Frontend Angular → GET /api/auth/verify-email?token=RAW
       ↓
VerifyEmailUseCase → markEmailVerified
       ↓
Usuario puede usar rutas protegidas (cuando 8.3 esté activo)
```

### Diseño del use case — decisiones

| Decisión | Elección | Motivo |
|---|---|---|
| 400 único para inválido/expirado | Sí | AC épica + anti-enumeración (igual que reset-password no distingue) |
| Idempotencia doble clic | Segundo intento → 400 | Token ya limpiado; AC no exige 200 idempotente |
| Email ya verificado | 400 | `findByVerificationTokenHash` filtra `email_verified = FALSE` |
| JWT tras verify | No emitir nuevo JWT | Usuario conserva JWT de registro; `emailVerified` se lee en middleware en siguiente request |
| Analytics | No | Sin evento definido en DLT-004 para verify |

### Invariantes (delta §3.1 — obligatorios)

- Tras verify exitoso: `email_verified = TRUE` y los tres campos de token en `NULL` en la **misma transacción** (`markEmailVerified`).
- Token raw **nunca** se persiste ni loguea — solo hash SHA-256 hex (64 chars).
- `findByVerificationTokenHash` debe usar `WHERE verification_token_hash = $1 AND email_verified = FALSE`.

### Anti-patrones (no hacer en 8.4)

- No modificar `auth.middleware.ts` ni crear `EmailNotVerifiedException` (8.3).
- No implementar `POST /auth/resend-verification` (8.5).
- No regenerar OpenAPI / `openapi/openapi.json` (8.6).
- No duplicar migración 015 ni métodos repo de 8.1.
- No enviar TPL-009 ni otro email tras verify.
- No exponer `emailVerified` ni datos de token en la respuesta (solo `message`).
- No requerir JWT en la ruta.
- No marcar épica 8 como `done`.

### Cumplimiento de arquitectura

- **Clean Architecture:** use case en `application/use-cases/user/`, DTO en `application/dtos/`, validator en `interfaces/validators/`, wire en `interfaces/http/`.
- **Contrato HTTP:** `docs/architecture.md` §8.6 — GET público, 200 con message fijo, 400 genérico.
- **Seguridad:** token de un solo uso; invalidación atómica al verificar.

### Cross-story context

| Historia | Relación con 8.4 |
|---|---|
| 8.1 | **Prerrequisito** — `findByVerificationTokenHash`, `markEmailVerified` |
| 8.2 | Persiste hash en registro; enlace email apunta a SPA que llama este endpoint |
| 8.3 | Tras 8.4+8.3, usuario verificado desbloquea rutas; añadir `GET /auth/verify-email` a rutas exentas |
| 8.5 | Genera nuevo token invalidando el anterior; verify con token viejo → 400 |
| 8.6 | Documentará endpoint en OpenAPI; ampliará tests integración — no duplicar todo aquí |

### Inteligencia de historias anteriores (8.1, 8.2)

- **8.1** define `markEmailVerified` con SQL transaccional y `WHERE email_verified = FALSE`; si `rowCount === 0`, lanzar excepción → use case responde 400.
- **8.1** define `findByVerificationTokenHash` con índice parcial `idx_users_verification_token`.
- **8.2** genera token hex 64 chars; URL email usa `/verificar-email` (SPA), no `/auth/verify-email` directamente en el enlace.
- **8.2** dejó explícitamente verify/resend fuera de alcance — **8.4 implementa solo verify**.

### Inteligencia git / historias relacionadas

- **1.5** (`reset-password`) — patrón hash SHA-256 + findByTokenHash + BadRequestException; reutilizar estructura.
- **6.2** — `email_verified = FALSE` en registro; verify es quien lo pone en `TRUE`.
- **7.4** — analítica en auth; verify **no** añade evento (sin spec).
- Commits recientes no tocaron verify-email — implementación greenfield sobre auth existente.

### Verificación

```bash
npm run db:migrate    # requiere 015 aplicada (8.1)
npm run build
npm test
# Manual: registrar usuario (post-8.2), extraer token de logs/mock mail, GET /api/auth/verify-email?token=...
```

---

## Dev Agent Record

### Agent Model Used

Composer (dev-story 2026-05-26)

### Debug Log References

### Completion Notes List

- Prerrequisito 8.1 confirmado: `findByVerificationTokenHash` y `markEmailVerified` en `IUserRepository` / `PostgresUserRepository`.
- `GET /auth/verify-email` público: hash SHA-256 → búsqueda → validación expiración → `markEmailVerified`; 400 único para inválido/expirado; sin email ni analytics.
- Tests HTTP: 8 casos en `auth-verify-email.test.ts`. `npm run build` y `npm test` (290 tests) OK.

### File List

- `src/application/dtos/email-verification.dto.ts` (nuevo)
- `src/application/use-cases/user/verify-email.use-case.ts` (nuevo)
- `src/interfaces/validators/verify-email.validator.ts` (nuevo)
- `src/interfaces/http/controllers/auth.controller.ts` (modificado)
- `src/interfaces/http/routes/auth.routes.ts` (modificado)
- `tests/auth-verify-email.test.ts` (nuevo)

### Change Log

- 2026-05-26: Historia 8.4 — endpoint GET verify-email, use case, validator, tests.

---

## Referencias

- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Épica 8, Historia 8.4, FR44]
- [Source: docs/architecture.md — §8.6 GET /auth/verify-email]
- [Source: docs/delta-backend-email-verification.md — §8.5 GET /auth/verify-email]
- [Source: docs/email-flow-mapping.md — v1.2 EVT-014 (contexto enlace)]
- [Source: _bmad-output/initiative-backend/tickets/epic-verificacion-de-email/tickets/story-migracion-sql-verificacion-email-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-verificacion-de-email/tickets/story-registro-token-y-email-tpl-009-plan.md]
- [Source: src/application/use-cases/user/reset-password.use-case.ts]
- [Source: src/interfaces/http/routes/auth.routes.ts]
- [Source: src/interfaces/http/controllers/auth.controller.ts]
- [Source: tests/auth-password-reset.test.ts]

---

Ultimate context engine analysis completed — comprehensive developer guide created.
