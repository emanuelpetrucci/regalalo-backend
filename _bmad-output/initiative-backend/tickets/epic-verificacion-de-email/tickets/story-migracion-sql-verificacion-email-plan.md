---
title: "Migración SQL y entidad User"
type: feature
ticket: 1
status: done
created: 2026-10-25
---

# Historia 8.1: Migración SQL y entidad User (verificación de email)

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como desarrollador,
quiero columnas e índice para tokens de verificación en `users` y la entidad/repositorio actualizados,
para soportar el flujo EVT-014 sin consultas full-table y habilitar historias 8.2–8.5.

## Criterios de aceptación

1. **Dado** que existe la tabla `users` con `email_verified` ya presente desde `012-users-dlt-003.sql`, **cuando** se aplica la migración `015-email-verification.sql` vía `npm run db:migrate`, **entonces** existen las columnas `verification_token_hash`, `verification_token_expires_at` y `verification_resend_at` (todas nullable) alineadas a `docs/architecture.md` §3.1 (v1.5).

2. **Dado** la migración aplicada, **cuando** se inspecciona el esquema, **entonces** existe el índice parcial `idx_users_verification_token ON users(verification_token_hash) WHERE email_verified = FALSE` según architecture §4.

3. **Dado** la entidad `User` en dominio, **cuando** el repositorio Postgres persiste o lee un usuario, **entonces** mapea los tres campos nuevos en camelCase (`verificationTokenHash`, `verificationTokenExpiresAt`, `verificationResendAt`) además de `emailVerified` ya existente.

4. **Dado** los métodos de repositorio para verificación, **cuando** se implementan `findByVerificationTokenHash`, `updateVerificationToken` y `markEmailVerified`, **entonces** respetan los invariantes del delta: hash y expiración se establecen/limpian juntos; tras `markEmailVerified` los tres campos de token quedan en `NULL`.

5. **Dado** cualquier consumidor futuro (use cases en 8.2+), **cuando** se construye un DTO HTTP en historias posteriores, **entonces** los campos de token **nunca** se exponen en respuestas — **esta historia no modifica** DTOs, controladores, rutas, OpenAPI, middleware, emails ni use cases de auth.

## Alcance explícito (IN / OUT)

| IN (8.1) | OUT (historias 8.2–8.6) |
|---|---|
| `015-email-verification.sql` (3 columnas + índice parcial) | Generación de token en `RegisterUserUseCase` (8.2) |
| `user.entity.ts` + `IUserRepository` + `PostgresUserRepository` | Envío EVT-014 / TPL-009 (8.2, 8.5, 8.6) |
| `findByVerificationTokenHash`, `updateVerificationToken`, `markEmailVerified` | Middleware `EMAIL_NOT_VERIFIED` (8.3) |
| Ampliar `USER_SELECT_COLUMNS`, `UserDbRow`, `mapRow` | `GET /auth/verify-email` (8.4) |
| Actualizar fixtures `mockUser` en tests para compilar | `POST /auth/resend-verification` (8.5) |
| `npm run build` + `npm test` | Regenerar OpenAPI / cliente Angular |
| | Modificar `create()` para persistir token en registro (8.2) |

**Nota pre-producción (épica 8):** no se requiere script de backfill. Usuarios existentes conservan `email_verified = FALSE` (desde 012) y columnas de token en `NULL` hasta que verifiquen o se implemente el flujo en 8.2+.

**Regla de despliegue:** Tras merge de 8.1, `npm run db:migrate` (o `db:migrate:dev`) debe ejecutarse **antes** de arrancar la API en cualquier entorno.

## Tareas / Subtareas

- [x] **Task 1 — Migración `015-email-verification.sql`** (AC: #1, #2)
  - [x] Crear `src/infrastructure/database/supabase/migrations/015-email-verification.sql` (siguiente número tras `014-analytics-events.sql`)
  - [x] Añadir **solo** las tres columnas de token — **no** re-añadir `email_verified` (ya en `012-users-dlt-003.sql`)
  - [x] Crear índice parcial `idx_users_verification_token`
  - [x] Usar `ADD COLUMN IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS` para idempotencia parcial
  - [x] Verificar con `npm run db:migrate` contra BD local o remota

- [x] **Task 2 — Entidad de dominio `User`** (AC: #3)
  - [x] Extender `src/domain/entities/user.entity.ts` con:
    - `verificationTokenHash: string | null`
    - `verificationTokenExpiresAt: Date | null`
    - `verificationResendAt: Date | null`
  - [x] No exportar helpers de DTO ni mezclar concerns HTTP en dominio

- [x] **Task 3 — Contrato `IUserRepository`** (AC: #4)
  - [x] Añadir interfaces de input en `src/domain/repositories/user.repository.ts`:
    ```typescript
    export interface UpdateVerificationTokenInput {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      resendAt: Date;
    }
    ```
  - [x] Añadir métodos:
    - `findByVerificationTokenHash(tokenHash: string): Promise<User | null>`
    - `updateVerificationToken(input: UpdateVerificationTokenInput): Promise<void>`
    - `markEmailVerified(userId: string): Promise<void>` — transacción atómica: `email_verified = TRUE` + limpiar los tres campos de token

- [x] **Task 4 — `PostgresUserRepository`** (AC: #3, #4)
  - [x] Ampliar `UserDbRow` y `USER_SELECT_COLUMNS` con las tres columnas snake_case
  - [x] Actualizar `mapRow` con mapeo camelCase
  - [x] Incluir columnas en **todos** los `SELECT`/`RETURNING` existentes (`findByEmail`, `findById`, `create`, `updateProfile`)
  - [x] Implementar `findByVerificationTokenHash` — `WHERE verification_token_hash = $1 AND email_verified = FALSE` (defensa en profundidad; el índice parcial cubre la búsqueda)
  - [x] Implementar `updateVerificationToken` — `UPDATE` atómico de hash + expires + resend
  - [x] Implementar `markEmailVerified` — patrón transaccional como `password-reset-token.repository.ts` (`BEGIN`/`COMMIT`/`ROLLBACK`)
  - [x] **No** modificar `create()` para escribir tokens (historia 8.2)
  - [x] **No** tocar otros repositorios

- [x] **Task 5 — Compilación de tests** (AC: #3)
  - [x] Buscar `mockUser` en `tests/**/*.ts` y añadir:
    ```typescript
    verificationTokenHash: null,
    verificationTokenExpiresAt: null,
    verificationResendAt: null,
    ```
  - [x] No añadir tests HTTP de verify/resend (pertenecen a 8.4/8.5)
  - [x] Opcional pero recomendado: tests unitarios del repositorio para los tres métodos nuevos (mock de `Pool` o integración si hay BD)
  - [x] Ejecutar `npm test` y `npm run build` antes de marcar review

---

## Notas para el Dev Agent

### Contexto de épica 8 (verificación de email)

Correct Course (2026-05-26) incorporó **architecture v1.5**, `docs/delta-backend-email-verification.md` y la **Épica 8** sin reabrir historias `done` de épicas 1–7. Esta es la **primera historia** de la épica: solo capa de persistencia + dominio. Las historias **8.2–8.6** implementan registro con token, middleware, endpoints, reenvío y plantilla TPL-009.

**Orden de épica:** `8.1` → `8.2` (registro + email) → `8.3` (middleware) → `8.4`/`8.5` (endpoints) → `8.6` (docs/plantilla). No adelantar generación de token, envío de email ni bloqueo middleware en 8.1.

**Referencias obligatorias:**

- [Source: docs/architecture.md#31-tabla-users] — columnas e invariantes v1.5
- [Source: docs/architecture.md#4-índices] — `idx_users_verification_token`
- [Source: docs/delta-backend-email-verification.md#sección-31--tabla-users] — delta columnas e invariantes
- [Source: docs/delta-backend-email-verification.md#sección-4--índices] — definición del índice parcial
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md#historia-81-migración-sql-y-entidad-user]
- [Source: _bmad-output/initiative-backend/tickets/epic-ampliacion-del-modelo-de-usuario-dlt-003/tickets/story-migracion-sql-y-entidad-user-dlt-003-plan.md] — patrón de migración + repo (historia análoga)

### Estado actual del código (leer antes de editar)

**Migraciones existentes:** `001` … `014` en `src/infrastructure/database/supabase/migrations/`. **No existe** `015-email-verification.sql`.

**Columna `email_verified`:** ya presente desde `012-users-dlt-003.sql` con `DEFAULT FALSE`. La migración 015 **no debe** volver a crearla.

**Entidad `User` hoy** — sin campos de token:

```typescript
// src/domain/entities/user.entity.ts — estado pre-8.1
export interface User {
  // … campos v1.2 + DLT-003 …
  emailVerified: boolean;
  isActive: boolean;
  preferredLanguage: string;
  // FALTAN: verificationTokenHash, verificationTokenExpiresAt, verificationResendAt
}
```

**Repositorio:** `USER_SELECT_COLUMNS` y `mapRow` no conocen columnas de verificación. `IUserRepository` no expone búsqueda por hash ni actualización de token.

**Patrón de hash existente** (reutilizar, no reinventar):

```typescript
// src/application/use-cases/user/forgot-password.use-case.ts
import { randomBytes, createHash } from 'crypto';
const rawToken = randomBytes(32).toString('hex');
const tokenHash = createHash('sha256').update(rawToken).digest('hex');
```

La generación ocurre en **8.2/8.5**; 8.1 solo persiste el hash recibido vía `updateVerificationToken`.

**Patrón de búsqueda por hash** (análogo a password reset):

```typescript
// password-reset-token.repository.ts — findByTokenHash
// Aquí la búsqueda es sobre users.verification_token_hash, no tabla separada
```

### Task 1 — SQL de migración (plantilla obligatoria)

Nombre de archivo exacto: **`015-email-verification.sql`**.

```sql
-- 015-email-verification.sql — Verificación de email: columnas de token en users

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS verification_token_hash       TEXT,
  ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_resend_at         TIMESTAMPTZ;

-- Búsqueda por token en GET /auth/verify-email (solo usuarios pendientes)
CREATE INDEX IF NOT EXISTS idx_users_verification_token
  ON users(verification_token_hash)
  WHERE email_verified = FALSE;
```

**Sin backfill:** columnas nullable; usuarios existentes quedan con `NULL` en los tres campos.

**Defaults finales esperados:**

| Columna | Tipo | NOT NULL | Default |
|---|---|---|---|
| `verification_token_hash` | TEXT | no | NULL |
| `verification_token_expires_at` | TIMESTAMPTZ | no | NULL |
| `verification_resend_at` | TIMESTAMPTZ | no | NULL |

Aplicación: `npm run db:migrate` / `npm run db:migrate:dev` (`scripts/migrate.ts` — orden lexicográfico).

### Task 2 — Entidad `User` objetivo

```typescript
export interface User {
  // … campos existentes …
  emailVerified: boolean;
  verificationTokenHash: string | null;
  verificationTokenExpiresAt: Date | null;
  verificationResendAt: Date | null;
  isActive: boolean;
  preferredLanguage: string;
}
```

### Task 3/4 — Mapeo y SQL del repositorio

**Columnas a añadir en `USER_SELECT_COLUMNS`:**

`verification_token_hash, verification_token_expires_at, verification_resend_at`

**`mapRow` — mapeo snake_case → camelCase:**

| SQL | TypeScript |
|---|---|
| `verification_token_hash` | `verificationTokenHash` |
| `verification_token_expires_at` | `verificationTokenExpiresAt` |
| `verification_resend_at` | `verificationResendAt` |

**`markEmailVerified(userId)` — SQL objetivo (transacción):**

```sql
UPDATE users
SET
  email_verified = TRUE,
  verification_token_hash = NULL,
  verification_token_expires_at = NULL,
  verification_resend_at = NULL
WHERE id = $1 AND email_verified = FALSE;
```

Si `rowCount === 0`, lanzar excepción de dominio apropiada (`BadRequestException` o similar) — el use case 8.4 decidirá el mensaje HTTP 400.

**`updateVerificationToken` — SQL objetivo:**

```sql
UPDATE users
SET
  verification_token_hash = $2,
  verification_token_expires_at = $3,
  verification_resend_at = $4
WHERE id = $1;
```

### Invariantes (obligatorios — delta §3.1)

- `verification_token_hash` y `verification_token_expires_at` se establecen juntos y se limpian juntos.
- `verification_resend_at` se actualiza en cada envío (registro 8.2 / reenvío 8.5).
- Tras `email_verified = TRUE`, los tres campos de token permanecen `NULL`.
- El token en texto plano **nunca** se persiste — solo SHA-256 hex (64 chars), igual que `password_reset_tokens.token_hash`.

### Anti-patrones (no hacer en 8.1)

- No re-crear columna `email_verified` en migración 015.
- No modificar `RegisterUserUseCase`, `auth.middleware.ts`, rutas, DTOs ni `openapi/`.
- No enviar emails ni referenciar TPL-009 / EVT-014 en código.
- No usar `SELECT *` en el repositorio (NFR4 / project-context).
- No exponer campos de token en ningún DTO.
- No marcar épica 8 como `done` — solo `in-progress` al crear esta story.

### Cumplimiento de arquitectura

- **Clean Architecture:** cambios en `domain/entities`, `domain/repositories`, `infrastructure/database/supabase/migrations`, `infrastructure/.../user.repository.ts` y fixtures de test.
- **Sin ORM:** SQL explícito con `pg`.
- **Índice parcial:** obligatorio para evitar full-table scan en verify-email (AC épica).

### Cross-story context (8.2–8.6 — no implementar aquí)

| Historia | Depende de 8.1 |
|---|---|
| 8.2 | `updateVerificationToken` tras `create()`; modificar `create()` INSERT |
| 8.3 | Lee `emailVerified` del `User` ya mapeado en middleware |
| 8.4 | `findByVerificationTokenHash` + `markEmailVerified` |
| 8.5 | `updateVerificationToken` con cooldown sobre `verificationResendAt` |
| 8.6 | Documentación TPL-009; sin cambios de schema |

### Verificación

```bash
npm run db:migrate    # o db:migrate:dev con APP_ENV=dev
npm run build
npm test
```

### Inteligencia de historias previas

- **6.1** estableció el patrón migración numerada + entidad + repo + fixtures; añadió `email_verified` en 012.
- **7.1** repitió el patrón para `items`; misma regla IN/OUT (solo persistencia).
- **Password reset (1.5):** tabla separada con `findByTokenHash` — aquí el token vive en `users`; reutilizar estilo transaccional de `markUsedAndResetUserPassword`.
- **Épicas 1–7 `done`:** repos de items/sessions no requieren JOIN a columnas de verificación; solo tests con `mockUser` comparten la entidad `User`.

### Git reciente (contexto, no implementar aquí)

Commits recientes (`95bf7c7`, `8a3a3aa`) tocaron analítica e items; **no** añadieron columnas de verificación ni métodos de repo — la implementación queda para dev-story de este archivo.

---

## Dev Agent Record

### Agent Model Used

Composer (dev-story runner)

### Debug Log References

- Migración `015-email-verification.sql` aplicada con `npm run db:migrate:dev` (BD remota dev).

### Completion Notes List

- Migración SQL con 3 columnas nullable + índice parcial `idx_users_verification_token`.
- Entidad `User` e `IUserRepository` ampliados con campos y métodos de verificación.
- `PostgresUserRepository`: mapeo snake_case→camelCase, `findByVerificationTokenHash`, `updateVerificationToken`, `markEmailVerified` (transacción + `BadRequestException` si rowCount=0).
- Fixtures `mockUser` actualizados en 25 archivos de test; 5 tests unitarios nuevos del repositorio.
- `npm test` (279 tests) y `npm run build` OK. Sin cambios en DTOs, rutas, OpenAPI ni use cases.

### File List

- `src/infrastructure/database/supabase/migrations/015-email-verification.sql` (nuevo)
- `src/domain/entities/user.entity.ts`
- `src/domain/repositories/user.repository.ts`
- `src/infrastructure/database/supabase/user.repository.ts`
- `tests/user-repository-email-verification.test.ts` (nuevo)
- `tests/*.test.ts` (25 archivos — fixtures mockUser)

### Review Findings — CR 8-1 (2026-05-26)

Revisión adversarial (Blind Hunter + Edge Case Hunter + Acceptance Auditor): **sin hallazgos bloqueantes**.

- AC #1–#5 verificados contra diff e implementación.
- Alcance IN/OUT respetado: sin cambios en DTOs, rutas, OpenAPI, middleware ni use cases.
- `npm test` (279) y `npm run build` OK en revisión.

### Change Log

- 2026-05-26: Historia 8.1 — persistencia y dominio para verificación de email (columnas, índice, repo, tests).
- 2026-05-26: Code review aprobado — status `done`.

## Referencias

- [Source: docs/architecture.md — §3.1 Tabla users, §4 Índices, §8.6 Verificación de email]
- [Source: docs/delta-backend-email-verification.md — §3.1, §4]
- [Source: docs/delta-email-flow-verification.md — EVT-014 (contexto 8.2+)]
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Épica 8, Historia 8.1]
- [Source: _bmad-output/project-context.md — Technology Stack, migraciones]
- [Source: src/infrastructure/database/supabase/migrations/012-users-dlt-003.sql]
- [Source: src/infrastructure/database/supabase/migrations/014-analytics-events.sql]
- [Source: src/domain/entities/user.entity.ts]
- [Source: src/domain/repositories/user.repository.ts]
- [Source: src/infrastructure/database/supabase/user.repository.ts]
- [Source: src/infrastructure/database/supabase/password-reset-token.repository.ts]

---

Ultimate context engine analysis completed — comprehensive developer guide created.
