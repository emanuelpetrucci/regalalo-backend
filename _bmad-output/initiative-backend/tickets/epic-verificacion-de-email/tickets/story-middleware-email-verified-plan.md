---
title: "Middleware emailVerified"
type: feature
ticket: 3
status: done
created: 2026-10-25
---

# Historia 8.3: Middleware emailVerified

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como sistema,
quiero bloquear rutas protegidas si el email no está verificado,
para impedir uso de la plataforma con cuentas no confirmadas.

## Criterios de aceptación

1. **Dado** JWT válido, `jwtVersion` coincidente, `is_active = TRUE` y `email_verified = FALSE`, **cuando** accedo a una ruta protegida que usa el middleware de auth estándar, **entonces** responde `403 Forbidden` con cuerpo `{ "message": "...", "code": "EMAIL_NOT_VERIFIED" }`.

2. **Dado** el mismo usuario no verificado, **cuando** accedo a una ruta montada con `skipEmailVerification: true` (p. ej. futuro `POST /auth/resend-verification`), **entonces** la petición **no** es bloqueada por verificación de email (puede continuar al handler).

3. **Dado** rutas del flujo auth que **no montan** middleware (`POST /auth/register`, `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/reset-password`, y futuro `GET /auth/verify-email` público), **cuando** se accede sin email verificado, **entonces** el middleware de email no aplica (no hay middleware en esas rutas).

4. **Dado** JWT válido con `email_verified = TRUE`, **cuando** accedo a cualquier ruta protegida estándar, **entonces** el middleware continúa inyectando `req.currentUser` y responde normalmente (regresión de tests existentes).

5. **Dado** fallos de auth previos (`401` por token inválido, expirado, `jwtVersion` distinto o `is_active = FALSE`), **cuando** ocurren, **entonces** el comportamiento no cambia — la comprobación de `emailVerified` ocurre **después** de `isActive` y solo si las anteriores pasaron.

6. **Regresión tests:** todos los tests de rutas protegidas que mockean usuarios autenticados deben usar `emailVerified: true` en fixtures; los tests del middleware cubren el caso `false` explícitamente.

## Alcance explícito (IN / OUT)

| IN (8.3) | OUT (otras historias) |
|---|---|
| `EmailNotVerifiedException` en `domain/exceptions/` | `GET /auth/verify-email` use case y ruta (8.4) |
| Comprobación `emailVerified` en `auth.middleware.ts` tras `isActive` | `POST /auth/resend-verification` use case y ruta (8.5) |
| Opción `skipEmailVerification` en factory `createAuthMiddleware` | Plantilla TPL-009 / registro con token (8.2) |
| Mapeo en `error-handler.ts` → 403 + `code: EMAIL_NOT_VERIFIED` | OpenAPI paths verify/resend (8.6) |
| Tests nuevos en `auth-middleware.test.ts` (403, skip, regresión) | Migración SQL / métodos repo token (8.1) |
| Actualizar fixtures `mockUser` en tests de rutas protegidas → `emailVerified: true` | Cambios frontend / interceptor Angular |
| `npm run build` + `npm test` | Marcar épica 8 como `done` |

**Prerrequisitos:** **8.1** (columna `email_verified` mapeada en entidad/repo) y **8.2** (registro con token — opcional para middleware, pero épica en orden). El middleware solo **lee** `user.emailVerified` de `findById`; no requiere columnas de token.

**Nota coordinación frontend:** `GET /users/me` quedará bloqueado para usuarios no verificados. El cliente debe manejar `403` + `code: EMAIL_NOT_VERIFIED` vía interceptor (delta frontend, fuera de este repo).

## Tareas / Subtareas

- [x] **Task 1 — Excepción de dominio** (AC: #1)
  - [x] Crear `src/domain/exceptions/email-not-verified.exception.ts`:
    ```typescript
    export class EmailNotVerifiedException extends Error {
      readonly code = 'EMAIL_NOT_VERIFIED' as const;
      constructor(message = 'Email not verified') {
        super(message);
        this.name = 'EmailNotVerifiedException';
      }
    }
    ```
  - [x] **No** extender `ForbiddenException` genérico — el handler necesita distinguir el código para el frontend

- [x] **Task 2 — Error handler** (AC: #1)
  - [x] Importar `EmailNotVerifiedException` en `error-handler.ts`
  - [x] Añadir rama **antes** de `ForbiddenException`:
    ```typescript
    if (err instanceof EmailNotVerifiedException) {
      res.status(403).json({ message: err.message, code: err.code });
      return;
    }
    ```
  - [x] Mantener `ForbiddenException` existente sin campo `code` (BOLA genérico)

- [x] **Task 3 — Middleware** (AC: #1, #2, #5)
  - [x] Extender firma de factory:
    ```typescript
    export interface AuthMiddlewareOptions {
      skipEmailVerification?: boolean;
    }

    export function createAuthMiddleware(
      jwtService: IJwtService,
      userRepo: IUserRepository,
      options: AuthMiddlewareOptions = {},
    )
    ```
  - [x] Tras chequeo `isActive`, añadir:
    ```typescript
    if (!options.skipEmailVerification && !user.emailVerified) {
      throw new EmailNotVerifiedException();
    }
    ```
  - [x] Orden obligatorio: Bearer → verify JWT → findById → jwtVersion → isActive → emailVerified → inject currentUser
  - [x] `req.currentUser` sigue omitiendo `passwordHash` e `isActive`; **puede** incluir `emailVerified` (ya en tipo `Omit<User, 'passwordHash' | 'isActive'>`)

- [x] **Task 4 — Rutas (sin nuevos endpoints)** (AC: #2, #3)
  - [x] **No** modificar `auth.routes.ts` en 8.3 (verify/resend llegan en 8.4/8.5)
  - [x] Documentar en comentario breve junto a factory o en dev notes: 8.5 usará `createAuthMiddleware(jwt, userRepo, { skipEmailVerification: true })` en `POST /auth/resend-verification`
  - [x] Rutas exentas por diseño actual: auth pública sin middleware — **ningún cambio** en register/login/forgot/reset

- [x] **Task 5 — Tests middleware** (AC: #1, #2, #4, #5)
  - [x] En `tests/auth-middleware.test.ts`:
    - Cambiar `mockUser.emailVerified` default a `true` para tests de happy path (5.1, 5.8, etc.)
    - **Nuevo** `5.12 — emailVerified=false en ruta protegida estándar → 403` con `body.code === 'EMAIL_NOT_VERIFIED'`
    - **Nuevo** `5.13 — emailVerified=false con skipEmailVerification → 200`
    - **Nuevo** `5.14 — isActive=false sigue retornando 401` (email check no alcanzado)
  - [x] Verificar que 401 paths existentes (5.2–5.7, 5.9–5.11) siguen pasando sin cambio de status

- [x] **Task 6 — Fixtures tests rutas protegidas** (AC: #6)
  - [x] Buscar `emailVerified: false` en `tests/**/*.ts` **fuera** de auth-middleware (casos 403)
  - [x] Actualizar a `emailVerified: true` en todos los `mockUser` usados para simular usuarios autenticados en rutas protegidas
  - [x] Archivos afectados (lista no exhaustiva — grep antes de editar):
    `users-me.test.ts`, `users-me-patch.test.ts`, `users-public-profile.test.ts`, `users-items.test.ts`, `users-requests.test.ts`, `users-delivery-sessions.test.ts`, `users-reputation-history.test.ts`, `items-*.test.ts`, `delivery-sessions-*.test.ts`, `geocoding-shared-cache.test.ts`, `http-cache-headers.test.ts`
  - [x] **No** cambiar `emailVerified: false` en `auth-register.test.ts`, `auth-login.test.ts`, `auth-password-reset.test.ts` (rutas públicas / contrato sin emailVerified en respuesta)
  - [x] Ejecutar `npm test` completo — debe pasar sin falsos 403

- [x] **Task 7 — Verificación final**
  - [x] `npm run build`
  - [x] `npm test`

---

## Notas para el Dev Agent

### Contexto de épica 8

Correct Course (2026-05-26) añadió verificación obligatoria de email. **8.1** schema/repo; **8.2** registro + EVT-014; **8.3** (esta historia) activa el bloqueo en middleware; **8.4/8.5** endpoints verify/resend; **8.6** OpenAPI + docs transversales.

**Orden:** `8.1` → `8.2` → **`8.3`** → `8.4`/`8.5` → `8.6`. No implementar verify/resend ni OpenAPI aquí.

### Estado actual del código (leer antes de editar)

**`auth.middleware.ts` hoy** — valida JWT, jwtVersion, isActive; **no** comprueba emailVerified:

```typescript
// src/interfaces/http/middlewares/auth.middleware.ts — estado pre-8.3
if (!user.isActive) {
  throw new UnauthorizedException();
}
const { passwordHash: _, isActive: __, ...currentUser } = user;
req.currentUser = currentUser;
next();
```

**`error-handler.ts`** — `ForbiddenException` → `{ message }` sin `code`. No existe `EmailNotVerifiedException`.

**Rutas auth** — `auth.routes.ts` monta register/login/forgot/reset **sin** auth middleware. Verify-email y resend-verification **aún no existen** (8.4/8.5).

**Tests** — `auth-middleware.test.ts` usa `emailVerified: false` y espera 200 en happy path (5.1). Tras 8.3 fallará hasta corregir fixture + añadir tests 403. **~25 archivos** de tests de rutas protegidas tienen `emailVerified: false` en mocks y fallarán en cascada si no se actualizan.

### Diseño: lista blanca vs skip por ruta

Architecture §8.6 lista rutas exentas del bloqueo. En este codebase el middleware se aplica **por ruta**, no globalmente:

| Mecanismo | Rutas |
|---|---|
| Sin middleware | register, login, forgot-password, reset-password, verify-email (público, 8.4) |
| Middleware + `skipEmailVerification: true` | resend-verification (8.5) — JWT requerido pero email puede estar sin verificar |
| Middleware estándar | items, users, delivery-sessions, etc. |

**No** implementar whitelist por `req.path` dentro del middleware — frágil y duplica definición de rutas. Usar opción explícita en factory.

### Orden de validaciones (architecture §8.3)

```
401 ← token ausente / inválido / expirado / sub-jwtVersion malformado
401 ← usuario no encontrado
401 ← jwtVersion mismatch
401 ← isActive === false
403 EMAIL_NOT_VERIFIED ← emailVerified === false (solo si skipEmailVerification !== true)
200 ← currentUser inyectado
```

### Respuesta HTTP objetivo

```json
{
  "message": "Email not verified",
  "code": "EMAIL_NOT_VERIFIED"
}
```

Mensaje puede ser español si el proyecto unifica mensajes de error en ES — hoy `UnauthorizedException` usa `'Unauthorized'` en inglés; **mantener consistencia** con excepciones existentes (inglés genérico) salvo que producto pida copy ES en 8.6.

### Impacto en tests — acción obligatoria

Activar el middleware rompe el supuesto implícito de la suite: usuarios mockeados con `emailVerified: false` pasaban porque nadie comprobaba el flag. **Task 6 no es opcional.** Sin actualizar fixtures, `npm test` fallará masivamente.

Excepción: tests que **deliberadamente** prueban usuario no verificado van solo en `auth-middleware.test.ts` (y futuros E2E en 8.6).

### Anti-patrones (no hacer en 8.3)

- No añadir chequeo `emailVerified` en use cases individuales (§12 architecture — middleware centralizado).
- No crear rutas verify/resend (8.4/8.5).
- No modificar OpenAPI (8.6).
- No bloquear login/register con email no verificado — login debe seguir emitiendo JWT (usuario verifica después).
- No usar `ForbiddenException` genérico para email no verificado — frontend necesita `code` discriminable.
- No whitelist por path string en middleware.
- No marcar épica 8 como `done`.

### Cumplimiento de arquitectura

- **Clean Architecture:** excepción en `domain/exceptions/`; cambios en `interfaces/http/middlewares/` y `error-handler.ts`; tests.
- **FR46:** HTTP 403 + código `EMAIL_NOT_VERIFIED` en rutas protegidas.
- **NFR:** sin queries extra — `emailVerified` ya viene en `findById` existente.

### Cross-story context

| Historia | Relación con 8.3 |
|---|---|
| 8.1 | Provee `emailVerified` mapeado en entidad/repo |
| 8.2 | Usuarios nuevos tienen `emailVerified: false` + JWT; 8.3 bloquea rutas inmediatamente post-registro |
| 8.4 | `GET /auth/verify-email` público, sin middleware — sin cambios en 8.3 |
| 8.5 | Montará `createAuthMiddleware(..., { skipEmailVerification: true })` — **8.3 debe entregar la opción** |
| 8.6 | Documentará error `EMAIL_NOT_VERIFIED` en OpenAPI; tests integración E2E |

### Inteligencia de historias anteriores

**6.2** — patrón idéntico para `isActive`:
- Chequeo en middleware tras `jwtVersion`
- `401` genérico (no filtrar motivo)
- Tests 5.11 en auth-middleware
- Login no comprueba `is_active`; middleware sí

**8.2** — explícitamente dejó middleware fuera: *"No modificar auth.middleware.ts"*.

**1.4 / 6.2** — `createAuthMiddleware(jwtService, userRepo)` sin options; añadir tercer parámetro opcional es backward-compatible (default `{}`).

### Git reciente

Commits recientes tocaron analítica e items; middleware auth estable desde 6.2. Greenfield sobre `auth.middleware.ts` + cascada de fixtures.

### Verificación

```bash
npm run build
npm test
# Manual opcional: login con usuario emailVerified=false en BD → GET /api/users/me → 403 + EMAIL_NOT_VERIFIED
```

---

## Dev Agent Record

### Agent Model Used

Composer (dev-story 8-3)

### Debug Log References

(none)

### Completion Notes List

- Creada `EmailNotVerifiedException` con `code: EMAIL_NOT_VERIFIED` (no extiende `ForbiddenException`).
- `error-handler.ts` mapea la excepción a 403 con `{ message, code }` antes de `ForbiddenException`.
- `createAuthMiddleware` acepta `AuthMiddlewareOptions.skipEmailVerification`; chequeo tras `isActive`.
- Comentario en middleware documenta uso futuro en 8.5 (resend-verification).
- Tests 5.12–5.14 en auth-middleware; fixtures protegidos actualizados a `emailVerified: true`.
- `npm run build` y `npm test` (282 tests) pasan sin regresiones.

### File List

- `src/domain/exceptions/email-not-verified.exception.ts` (new)
- `src/interfaces/http/middlewares/auth.middleware.ts`
- `src/interfaces/http/middlewares/error-handler.ts`
- `tests/auth-middleware.test.ts`
- `tests/users-me.test.ts`
- `tests/users-me-patch.test.ts`
- `tests/users-public-profile.test.ts`
- `tests/users-items.test.ts`
- `tests/users-requests.test.ts`
- `tests/users-delivery-sessions.test.ts`
- `tests/users-reputation-history.test.ts`
- `tests/items-list.test.ts`
- `tests/items-get.test.ts`
- `tests/items-publish.test.ts`
- `tests/items-cancel.test.ts`
- `tests/items-cancel-with-session.test.ts`
- `tests/items-request.test.ts`
- `tests/items-pause.test.ts`
- `tests/items-select.test.ts`
- `tests/items-candidates.test.ts`
- `tests/delivery-sessions-get.test.ts`
- `tests/delivery-sessions-confirm.test.ts`
- `tests/delivery-sessions-cancel.test.ts`
- `tests/geocoding-shared-cache.test.ts`
- `tests/http-cache-headers.test.ts`

### Review Findings — CR 8-3 (2026-05-26)

Revisión adversarial (Blind Hunter + Edge Case Hunter + Acceptance Auditor): **sin hallazgos bloqueantes**.

- AC #1–#6 verificados: 403 + `EMAIL_NOT_VERIFIED`, skip `skipEmailVerification`, orden de validaciones, regresión fixtures, tests 5.12–5.14.
- Excepción de dominio separada de `ForbiddenException`; handler mapea antes de 403 genérico.
- Fixtures protegidos con `emailVerified: true`; `emailVerified: false` solo en auth público y casos 403 del middleware.
- `npm run build` y `npm test` (282/282) OK en revisión.

### Change Log

- 2026-05-26: Middleware bloquea rutas protegidas si `emailVerified=false` (403 + EMAIL_NOT_VERIFIED); opción skip para 8.5; fixtures de tests actualizados.
- 2026-05-26: Code review aprobado — status `done`.

---

## Referencias

- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Épica 8, Historia 8.3, FR46]
- [Source: docs/architecture.md — §8.3 Middleware, §8.6 Rutas exentas, §12 Nota transversal]
- [Source: docs/delta-backend-email-verification.md — §8.3 Middleware]
- [Source: docs/prd.md — fila email_verified]
- [Source: _bmad-output/initiative-backend/sprint-change-proposal-2026-05-26-email-verification.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-ampliacion-del-modelo-de-usuario-dlt-003/tickets/story-registro-login-y-middleware-is-active-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-verificacion-de-email/tickets/story-migracion-sql-verificacion-email-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-verificacion-de-email/tickets/story-registro-token-y-email-tpl-009-plan.md]
- [Source: src/interfaces/http/middlewares/auth.middleware.ts]
- [Source: src/interfaces/http/middlewares/error-handler.ts]
- [Source: src/interfaces/http/routes/auth.routes.ts]
- [Source: tests/auth-middleware.test.ts]

---

Ultimate context engine analysis completed — comprehensive developer guide created.
