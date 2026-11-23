---
title: "Registro, login y middleware is_active"
type: feature
ticket: 2
status: done
created: 2026-10-25
---

# Historia 6.2: Registro, login y middleware is_active

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como visitante o usuario registrado,
quiero registrarme e iniciar sesión con nombre y apellido, y que cuentas desactivadas no autentiquen en rutas protegidas,
para cumplir el contrato DLT-003 de auth (FR36, FR40; architecture §8.2–8.3, §8.5).

## Criterios de aceptación

1. **Dado** `POST /auth/register` con `firstName`, `lastName`, email, password, postalCode y reCAPTCHA válidos (score ≥ 0.5), **cuando** el registro es exitoso, **entonces** responde `201` con `user` incluyendo `firstName`, `lastName`, `postalCode`, `reputationScore`, `totalReceived`, `totalDonated` según §8.5 architecture v1.3; **y** el usuario se inserta con `email_verified = FALSE`, `is_active = TRUE`, `preferred_language = 'es'`.

2. **Dado** `firstName` o `lastName` inválidos (< 2 caracteres, > 50, o caracteres no permitidos tras trim), **cuando** se envía el registro, **entonces** responde `400 Bad Request` (validación Zod en `validators/`).

3. **Dado** `POST /auth/login` exitoso con credenciales y reCAPTCHA válidos, **cuando** el servidor responde, **entonces** el DTO `user` incluye `firstName` y `lastName` además de `id`, `email`, `reputationScore`.

4. **Dado** un usuario con `is_active = FALSE` en BD, **cuando** presenta un JWT válido (firma OK, no expirado, `jwtVersion` coincidente) en una ruta protegida, **entonces** el middleware responde `401 Unauthorized` (mismo cuerpo/mensaje genérico que otros fallos de auth).

5. **Dado** cualquier respuesta HTTP de auth en esta historia, **cuando** se serializa el `user`, **entonces** no incluye `isActive`, `is_active`, `location`, `passwordHash`, `emailVerified`, `preferredLanguage` ni `phone` en registro/login (contrato §8.5).

6. **Regresión:** flujos existentes de registro/login (email duplicado `409`, CP inválido `400`, reCAPTCHA bajo umbral `422`, login credenciales inválidas `401` sin enumeración) se mantienen sin cambio de código de estado.

## Alcance explícito (IN / OUT)

| IN (6.2) | OUT (6.3–6.5 / otras) |
|---|---|
| `register.validator.ts`: `firstName`, `lastName`, `phone?` | `GET /users/me`, `GET /users/:id` |
| `RegisterRequestDto`, `AuthUserDto`, `LoginUserDto`, use cases register/login | `PATCH /users/me` |
| `RegisterUserUseCase`: persistir nombres reales vía repo | Variables `firstName` en TPL emails (6.5) |
| `LoginUserUseCase`: mapear `firstName`/`lastName` en respuesta | Desactivar cuenta vía API admin |
| `auth.middleware.ts`: chequeo `isActive` tras `jwtVersion` | Regenerar cliente Angular (`no-lo-vendo`) |
| `CreateUserInput` + `create()` INSERT con campos DLT-003 | Lógica `email_verified` externa |
| OpenAPI: `auth.schemas.ts` + `npm run openapi:generate` | Tests E2E frontend |
| Tests: `auth-register`, `auth-login`, `auth-middleware` | |

**Prerrequisito bloqueante:** Historia **6-1** (`012-users-dlt-003.sql`, entidad `User` con siete campos, `mapRow` y SELECTs del repo). No iniciar dev-story de 6.2 hasta que 6.1 esté implementada y `npm run migrate` aplicado en el entorno de test.

## Tareas / Subtareas

- [x] **Task 0 — Verificar 6-1** (prerrequisito)
  - [x] Confirmar migración `012-users-dlt-003.sql` aplicada y entidad/repo con `firstName`, `isActive`, etc.
  - [x] Si `create()` aún usa placeholders `'Usuario'`/`'Pendiente'`, esta historia los reemplaza por payload validado

- [x] **Task 1 — Validación de nombres (AC #2, #5)** 
  - [x] Crear esquema reutilizable (p. ej. `src/interfaces/validators/person-name.schema.ts`) exportando `personNameSchema` y `optionalPhoneSchema`
  - [x] Reglas: `trim()` → longitud 2–50 → regex Unicode letras/marcas + espacio, guion, apóstrofo: `/^[\p{L}\p{M}'\-\s]+$/u`
  - [x] `phone`: opcional, `string`, max 20 (architecture §3.1)
  - [x] Integrar en `registerBodySchema`; importar `z` solo desde `src/zod.ts`

- [x] **Task 2 — DTOs y dominio (AC #1, #3, #5)**
  - [x] Extender `RegisterRequestDto` con `firstName`, `lastName`, `phone?: string`
  - [x] Extender `AuthUserDto` con `firstName`, `lastName`
  - [x] Extender `LoginUserDto` con `firstName`, `lastName`
  - [x] Extender `CreateUserInput` en `domain/repositories/user.repository.ts` con `firstName`, `lastName`, `phone?: string | null`

- [x] **Task 3 — Repositorio `create()` (AC #1)**
  - [x] Actualizar `INSERT` en `user.repository.ts` para persistir `first_name`, `last_name`, `phone` (NULL si ausente)
  - [x] Incluir defaults explícitos o confiar en BD: `email_verified=FALSE`, `is_active=TRUE`, `preferred_language='es'`, `jwt_version=1`
  - [x] Eliminar literales temporales `'Usuario'`/`'Pendiente'` de 6.1 si siguen en el INSERT
  - [x] `RETURNING` debe devolver columnas necesarias para `mapRow` completo

- [x] **Task 4 — `RegisterUserUseCase` (AC #1, #6)**
  - [x] Pasar `firstName`, `lastName`, `phone` a `userRepo.create()`
  - [x] Respuesta `user`: `{ id, email, firstName, lastName, postalCode, reputationScore, totalReceived, totalDonated }`
  - [x] No cambiar contrato del email TPL-001 (sigue sin `firstName` hasta 6.5)

- [x] **Task 5 — `LoginUserUseCase` (AC #3, #6)**
  - [x] Mapear `user.firstName`, `user.lastName` en respuesta 200
  - [x] **No** añadir chequeo `is_active` en login (FR40 solo exige middleware; login con cuenta inactiva puede emitir JWT pero rutas protegidas fallan en 401)

- [x] **Task 6 — Middleware (AC #4)**
  - [x] Tras validar `user.jwtVersion === jwtVersion`, añadir:
    ```typescript
    if (!user.isActive) {
      throw new UnauthorizedException();
    }
    ```
  - [x] Orden obligatorio: firma JWT → `sub`/`jwtVersion` claims → usuario existe → `jwtVersion` BD → **`isActive`** → `req.currentUser`

- [x] **Task 7 — OpenAPI (AC #1, #3)**
  - [x] Actualizar `authUserSchema` y `loginUserSchema` en `src/openapi/schemas/auth.schemas.ts` (derivan de validators/DTOs)
  - [x] Ejecutar `npm run openapi:generate` y commitear `openapi/openapi.json` si el repo lo versiona

- [x] **Task 8 — Tests (AC #1–#6)**
  - [x] Actualizar `mockUser` en `auth-register.test.ts`, `auth-login.test.ts`, `auth-middleware.test.ts` con campos DLT-003 mínimos (`firstName`, `lastName`, `isActive: true`, etc.)
  - [x] Registro: 201 incluye `firstName`/`lastName`; body sin `firstName` → 400; nombre `"A"` → 400; nombre con dígitos → 400
  - [x] Login: 200 incluye `firstName`/`lastName`
  - [x] Middleware: nuevo caso `isActive: false` con JWT válido → 401 (numerar p. ej. 5.11)
  - [x] Verificar que respuestas no exponen `isActive` ni `passwordHash`
  - [x] `npm test` + `npm run build`

---

## Notas para el Dev Agent

### Dependencia de historia 6-1

La story **6-1** (`6-1-migracion-sql-y-entidad-user-dlt-003.md`) define migración, entidad y `mapRow`. Sin ella, `create()` fallará por columnas NOT NULL o el middleware no tendrá `isActive` en el objeto `User`.

**Tras 6-1, el repo puede tener INSERT temporal:**

```sql
'Usuario', 'Pendiente', FALSE, TRUE, 'es'
```

**6.2 debe reemplazarlos** por `$firstName`, `$lastName` del payload y `phone` opcional.

### Estado actual del código (pre-implementación 6.2)

| Archivo | Estado v1.2 / pre-DLT-003 |
|---|---|
| `register.validator.ts` | Solo `email`, `password`, `postalCode`, `recaptchaToken` |
| `auth.dto.ts` | Sin `firstName`/`lastName` en register ni login |
| `register-user.use-case.ts` | `create()` sin nombres; respuesta sin identidad |
| `login-user.use-case.ts` | Respuesta `{ id, email, reputationScore }` |
| `auth.middleware.ts` | Valida JWT + `jwtVersion`; **sin** `isActive` |
| `user.entity.ts` | Sin campos DLT-003 (pendiente 6-1) |
| `user.repository.ts` | INSERT v1.2 sin columnas nuevas |

### Contrato HTTP exacto (architecture §8.5)

**POST /auth/register — entrada:**

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

**POST /auth/register — respuesta 201:**

```json
{
  "token": "string",
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

**POST /auth/login — respuesta 200 (cambio DLT-003):**

```json
{
  "token": "string",
  "user": {
    "id": "uuid",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "reputationScore": 0
  }
}
```

### Validación `firstName` / `lastName` (implementación sugerida)

```typescript
// person-name.schema.ts — import { z } from '../../zod';
export const personNameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(50, 'Name must be at most 50 characters')
  .regex(/^[\p{L}\p{M}'\-\s]+$/u, 'Name contains invalid characters');

export const optionalPhoneSchema = z.string().trim().max(20).optional();
```

- Aplicar **después** de `trim()` para que `"  Ana  "` sea válida.
- Rechazar strings vacíos post-trim (`.min(2)`).
- Ejemplos válidos: `María`, `José`, `O'Connor`, `Jean-Pierre`, `Niño`.
- Ejemplos inválidos: `A`, `123`, `John3`, emoji-only.

### Middleware — semántica `is_active`

- Mismo `UnauthorizedException` que JWT inválido o `jwtVersion` desincronizado (no revelar motivo).
- `req.currentUser` no debe incluir `isActive` en el objeto expuesto (ya se omite `passwordHash`; no añadir `isActive` al spread si se filtra en middleware).
- Cuenta inactiva **no** requiere cambio en login según AC de épica; documentado para evitar scope creep.

### Persistencia en `create()`

INSERT objetivo (ajustar placeholders según columnas de 6-1):

```sql
INSERT INTO users (
  email, password_hash, postal_code, location, jwt_version,
  first_name, last_name, phone,
  email_verified, is_active, preferred_language
)
VALUES (
  $1, $2, $3, ST_MakePoint($4, $5)::geography, 1,
  $6, $7, $8,
  FALSE, TRUE, 'es'
)
```

`$8` = `phone` o `NULL`.

### OpenAPI y build

```bash
npm run openapi:generate   # antes de tsc en build
npm run build
npm test
```

Los schemas OpenAPI de auth se generan desde Zod (`registerBodySchema` → `registerRequestSchema`).

### Tests existentes a extender

| Archivo | Casos actuales | Añadir en 6.2 |
|---|---|---|
| `tests/auth-register.test.ts` | 10.x registro v1.2 | `firstName`/`lastName` en body y assert; 400 nombres inválidos |
| `tests/auth-login.test.ts` | 6.1 login sin nombres | assert `firstName`, `lastName` en 200 |
| `tests/auth-middleware.test.ts` | 5.1–5.10 jwtVersion | 5.11 `isActive: false` → 401 |

**Fixture `mockUser` mínimo tras 6-1:**

```typescript
firstName: 'Test',
lastName: 'User',
avatarUrl: null,
phone: null,
emailVerified: false,
isActive: true,
preferredLanguage: 'es',
```

### Anti-patrones (no hacer en 6.2)

- No modificar `GET /users/me` ni controladores de users (historia 6.3).
- No exponer `isActive` en ningún DTO HTTP (FR40).
- No añadir `firstName` a variables de email en `RegisterUserUseCase` (6.5).
- No usar `SELECT *`.
- No devolver 403 por cuenta inactiva — debe ser **401** en middleware.
- No bloquear login por `is_active` salvo nueva decisión de producto (fuera de AC).

### Cumplimiento de arquitectura

- **Clean Architecture:** validators → use-cases → repo; middleware en `interfaces/http/middlewares/`.
- **NFR8:** reCAPTCHA sin cambios.
- **NFR9:** Argon2 sin cambios.
- **Rate limit** `/auth/*`: sin cambios.

### Inteligencia de historia 6-1

- Migración `012-users-dlt-003.sql` con backfill `Usuario`/`Pendiente` para filas legacy.
- 6.2 consume esos campos en registro real y deja de usar placeholders en nuevos usuarios.
- Tests de todo el proyecto usan `mockUser` — actualizar solo los de auth en 6.2; otros archivos ya cubiertos por 6-1 Task 4.

### Historias posteriores (contexto)

- **6.3:** perfiles `GET /users/me` y `GET /users/:id` con `avatarUrl`, `phone`, `emailVerified`.
- **6.4:** `PATCH /users/me` reutilizará `personNameSchema`.
- **6.5:** TPL-001…008 con `{{firstName}}` en `IMailService.send`.

### Git reciente

Commit `7cc7200` actualizó documentación DLT-003; la implementación de auth en código sigue en contrato v1.2 hasta dev-story de 6-1 y esta 6-2.

---

## Dev Agent Record

### Agent Model Used

Composer (dev-story runner)

### Debug Log References

- Prerrequisito 6-1 verificado: entidad `User` con campos DLT-003; `create()` tenía placeholders `'Usuario'`/`'Pendiente'` — reemplazados.
- Build falló inicialmente: tipo `Request.currentUser` incluía `isActive`; corregido en `@types/express/index.d.ts`.
- Regresión en `geocoding-shared-cache.test.ts`: body de registro sin `firstName`/`lastName` → 400; corregido.

### Completion Notes List

- Implementado `personNameSchema` y `optionalPhoneSchema` reutilizables para 6.4.
- Registro persiste nombres reales y phone opcional; login devuelve `firstName`/`lastName`.
- Middleware rechaza cuentas inactivas con 401 genérico; `req.currentUser` omite `passwordHash` e `isActive`.
- OpenAPI regenerado con campos DLT-003 en auth.
- 221 tests pasando; build OK.

### File List

- src/interfaces/validators/person-name.schema.ts (nuevo)
- src/interfaces/validators/register.validator.ts
- src/application/dtos/auth.dto.ts
- src/domain/repositories/user.repository.ts
- src/infrastructure/database/supabase/user.repository.ts
- src/application/use-cases/user/register-user.use-case.ts
- src/application/use-cases/user/login-user.use-case.ts
- src/interfaces/http/middlewares/auth.middleware.ts
- src/@types/express/index.d.ts
- src/openapi/schemas/auth.schemas.ts
- openapi/openapi.json
- tests/auth-register.test.ts
- tests/auth-login.test.ts
- tests/auth-middleware.test.ts
- tests/geocoding-shared-cache.test.ts

### Change Log

- 2026-05-24: DLT-003 auth — registro/login con firstName/lastName, validación Zod, middleware isActive, OpenAPI y tests.

### Review Findings

- [x] [Review][Patch] `optionalPhoneSchema` sin `.min(1)` — empty string `""` pasaba validación y persistía como cadena vacía (no-null) en BD [src/interfaces/validators/person-name.schema.ts:10] — **APLICADO**: añadido `.min(1)`
- [x] [Review][Patch] Cobertura de tests de AC #2 incompleta — ningún test verificaba `lastName` inválido (ausente, demasiado corto, con dígitos) [tests/auth-register.test.ts] — **APLICADO**: tests 10.10–10.12 añadidos
- [x] [Review][Defer] `phone: null` en body devuelve 400 en lugar de interpretarse como campo omitido [src/interfaces/validators/register.validator.ts] — deferred, decisión de diseño Zod (no viola ningún AC; clientes deben omitir el campo en lugar de enviar null)

---

## Referencias

- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Épica 6, Historia 6.2]
- [Source: docs/architecture.md — §3.1 users, §8.2 registro, §8.3 middleware, §8.5 contratos]
- [Source: docs/delta-backend-DLT-003.md — §8 registro/middleware]
- [Source: docs/prd.md — FR36, FR40]
- [Source: _bmad-output/initiative-backend/tickets/epic-ampliacion-del-modelo-de-usuario-dlt-003/tickets/story-migracion-sql-y-entidad-user-dlt-003-plan.md]
- [Source: src/interfaces/validators/register.validator.ts]
- [Source: src/application/use-cases/user/register-user.use-case.ts]
- [Source: src/application/use-cases/user/login-user.use-case.ts]
- [Source: src/interfaces/http/middlewares/auth.middleware.ts]
- [Source: src/application/dtos/auth.dto.ts]
- [Source: src/openapi/schemas/auth.schemas.ts]
- [Source: tests/auth-register.test.ts, tests/auth-login.test.ts, tests/auth-middleware.test.ts]

---

Ultimate context engine analysis completed — comprehensive developer guide created.
