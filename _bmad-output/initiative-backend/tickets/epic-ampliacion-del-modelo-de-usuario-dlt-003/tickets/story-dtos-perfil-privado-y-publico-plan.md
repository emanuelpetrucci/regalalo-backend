---
title: "DTOs de perfil privado y público"
type: feature
ticket: 3
status: done
created: 2026-10-25
---

# Historia 6.3: DTOs de perfil privado y público

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como usuario autenticado,
quiero ver perfiles con nombre, avatar y campos de cuenta según la visibilidad definida en DLT-003,
para alinear `GET /users/me` y `GET /users/:id` con el contrato de architecture v1.3 (FR37, FR38).

## Criterios de aceptación

1. **Dado** `GET /users/me` con autenticación válida, **cuando** el servidor responde `200`, **entonces** el cuerpo incluye `firstName`, `lastName`, `avatarUrl`, `phone`, `preferredLanguage`, `emailVerified` además de los campos ya existentes (`id`, `email`, `postalCode`, `reputationScore`, `totalReceived`, `totalDonated`, `consecutiveNoShows`, `createdAt`).

2. **Dado** cualquier respuesta `200` de `GET /users/me`, **cuando** se serializa el JSON, **entonces** no incluye `isActive`, `is_active`, `location`, `passwordHash`, `jwtVersion`, `cyclesAtLimit`, `lastCycleIncrementedAt` ni `lastActiveAt`.

3. **Dado** `GET /users/:id` con UUID v4 válido y usuario existente, **cuando** el servidor responde `200`, **entonces** el cuerpo incluye `firstName`, `lastName`, `avatarUrl` además de `id`, `reputationScore`, `totalReceived`, `totalDonated`, `createdAt`.

4. **Dado** cualquier respuesta `200` de `GET /users/:id`, **cuando** se serializa el JSON, **entonces** no incluye `email`, `phone`, `postalCode`, `consecutiveNoShows`, `emailVerified`, `preferredLanguage`, `passwordHash`, `isActive` ni `location`.

5. **Regresión:** `reputationScore` negativo se retorna sin truncar en ambos endpoints; sin auth → `401`; UUID inválido en `:id` → `400`; usuario inexistente → `404`; usuario autenticado eliminado entre middleware y use case en `/users/me` → `401`.

6. **OpenAPI:** `privateProfileSchema` y `publicProfileSchema` en `src/openapi/schemas/user.schemas.ts` reflejan los contratos anteriores; ejecutar `npm run openapi:generate` y versionar `openapi/openapi.json` si el repo lo exige.

## Alcance explícito (IN / OUT)

| IN (6.3) | OUT (6.4–6.5 / otras) |
|---|---|
| `GetPrivateProfileResponseDto` + `GetPrivateProfileUseCase` | `PATCH /users/me` (6.4) |
| `GetPublicProfileResponseDto` + `GetPublicProfileUseCase` | Validadores Zod de PATCH |
| `privateProfileSchema`, `publicProfileSchema` + OpenAPI | Variables `firstName` en TPL emails (6.5) |
| Tests `users-me.test.ts`, `users-public-profile.test.ts` | Regenerar cliente Angular |
| Asegurar que `findById` devuelve campos DLT-003 al use case | Ampliar `donor` en `GET /items/:id` (sigue v1.2: solo `id` + `reputationScore`) |
| | `POST /auth/register` / login (6.2) |
| | Middleware `is_active` (6.2) |

**Prerrequisitos bloqueantes:**

- **6-1:** migración `012-users-dlt-003.sql`, entidad `User` con siete campos, `mapRow` y `SELECT`/`RETURNING` en `findById`/`findByEmail`/`create` incluyendo `first_name` … `preferred_language`. Sin esto, los use cases no pueden leer nombres ni flags.
- **6-2 (recomendado antes o en paralelo):** no es estrictamente necesario para los GET de perfil, pero conviene tener registro con nombres reales en tests de integración manual.

**Nota de estado del repo (2026-05-24):** la entidad `user.entity.ts` y la migración `012` pueden existir mientras `PostgresUserRepository.mapRow` / `findById` aún no mapean columnas DLT-003. Si dev-story de 6-1 no terminó el repo, **completar el mapeo en 6-1 o como primer sub-paso de 6.3** antes de tocar DTOs.

## Tareas / Subtareas

- [x] **Task 0 — Verificar prerrequisito 6-1** (bloqueante)
  - [x] `findById` devuelve `User` con `firstName`, `lastName`, `avatarUrl`, `phone`, `emailVerified`, `preferredLanguage`, `isActive`
  - [x] Si faltan columnas en SQL/`mapRow`, resolver en repo (no duplicar lógica en use case con queries ad hoc)

- [x] **Task 1 — DTO perfil privado (AC #1, #2)**
  - [x] Extender `src/application/dtos/get-private-profile.dto.ts` con los seis campos nuevos (tipos abajo)
  - [x] Actualizar `get-private-profile.use-case.ts`: mapear desde `User` sin pasar `isActive`, `passwordHash`, etc.

- [x] **Task 2 — DTO perfil público (AC #3, #4)**
  - [x] Extender `src/application/dtos/get-public-profile.dto.ts` con `firstName`, `lastName`, `avatarUrl`
  - [x] Actualizar `get-public-profile.use-case.ts`: solo campos públicos del AC

- [x] **Task 3 — OpenAPI (AC #6)**
  - [x] Ampliar `privateProfileSchema` y `publicProfileSchema` en `src/openapi/schemas/user.schemas.ts` (alineado a DTOs, `createdAt` como `z.string().datetime()`)
  - [x] `npm run openapi:generate`

- [x] **Task 4 — Tests (AC #1–#5)**
  - [x] Actualizar `mockUser` / `mockPublicUser` en tests con campos DLT-003 mínimos
  - [x] `users-me.test.ts`: assert presencia de nuevos campos; assert ausencia de `isActive`, `cyclesAtLimit`, etc.; renumerar comentario “8 campos” → contrato v1.3 (~14 campos visibles)
  - [x] `users-public-profile.test.ts`: assert `firstName`, `lastName`, `avatarUrl`; assert no `email`, `phone`, `emailVerified`, `preferredLanguage`, `consecutiveNoShows`
  - [x] `npm test` + `npm run build`

---

## Notas para el Dev Agent

### Contrato HTTP exacto (architecture §8.5)

**GET /users/me — respuesta 200:**

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
  "emailVerified": false,
  "reputationScore": 0,
  "totalReceived": 0,
  "totalDonated": 0,
  "consecutiveNoShows": 0,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

**Campos prohibidos en salida:** `is_active` / `isActive`, `location`, `cycles_at_limit` / `cyclesAtLimit`, `last_cycle_incremented_at` / `lastCycleIncrementedAt`, `passwordHash`, `jwtVersion`, `lastActiveAt`.

**GET /users/:id — respuesta 200:**

```json
{
  "id": "uuid",
  "firstName": "string",
  "lastName": "string",
  "avatarUrl": "string | null",
  "reputationScore": 0,
  "totalReceived": 0,
  "totalDonated": 0,
  "createdAt": "2026-02-01T00:00:00.000Z"
}
```

**Campos prohibidos en salida:** `email`, `phone`, `postalCode`, `consecutiveNoShows`, `emailVerified`, `preferredLanguage`, `isActive`, `location`, `passwordHash`.

### Estado actual del código (leer antes de editar)

| Archivo | Estado pre-6.3 |
|---|---|
| `get-private-profile.dto.ts` | Solo v1.2: sin `firstName`, `avatarUrl`, etc. |
| `get-public-profile.dto.ts` | Solo `id`, reputación, totales, `createdAt` |
| `get-private-profile.use-case.ts` | Mapea 8 campos v1.2 |
| `get-public-profile.use-case.ts` | Mapea 5 campos v1.2 |
| `user.entity.ts` | **Ya incluye** campos DLT-003 (si 6-1 avanzó en entidad) |
| `user.repository.ts` | `findById` SELECT **puede** omitir columnas DLT-003; `mapRow` **puede** no asignar `firstName`… — verificar |
| `user.schemas.ts` | `privateProfileSchema` / `publicProfileSchema` en contrato v1.2 |
| `user.controller.ts` | Sin cambios de lógica esperados (solo DTO de salida) |
| `users.routes.ts` | Rutas ya montadas; auth obligatoria en ambos GET |

**Use cases actuales (referencia — reemplazar mapeo):**

```typescript
// get-private-profile.use-case.ts — estado v1.2
return {
  id: user.id,
  email: user.email,
  postalCode: user.postalCode,
  reputationScore: user.reputationScore,
  totalReceived: user.totalReceived,
  totalDonated: user.totalDonated,
  consecutiveNoShows: user.consecutiveNoShows,
  createdAt: user.createdAt,
};
```

```typescript
// get-public-profile.use-case.ts — estado v1.2
return {
  id: user.id,
  reputationScore: user.reputationScore,
  totalReceived: user.totalReceived,
  totalDonated: user.totalDonated,
  createdAt: user.createdAt,
};
```

### DTOs objetivo (TypeScript)

```typescript
// get-private-profile.dto.ts
export interface GetPrivateProfileResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  phone: string | null;
  postalCode: string;
  preferredLanguage: string;
  emailVerified: boolean;
  reputationScore: number;
  totalReceived: number;
  totalDonated: number;
  consecutiveNoShows: number;
  createdAt: Date;
}
```

```typescript
// get-public-profile.dto.ts
export interface GetPublicProfileResponseDto {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  reputationScore: number;
  totalReceived: number;
  totalDonated: number;
  createdAt: Date;
}
```

- `avatarUrl` y `phone` nullable en BD → `string | null` en DTO (JSON `null` permitido).
- `preferredLanguage`: string (BD default `'es'`); exponer tal cual en privado.
- No crear DTO compartido “base profile” salvo que reduzca duplicación real; dos interfaces explícitas están bien (NFR4: DTOs explícitos).

### OpenAPI (`user.schemas.ts`)

Añadir a `privateProfileSchema`:

```typescript
firstName: z.string(),
lastName: z.string(),
avatarUrl: z.string().url().nullable(), // o z.string().nullable() si URLs no siempre son http
phone: z.string().nullable(),
preferredLanguage: z.string(),
emailVerified: z.boolean(),
```

Añadir a `publicProfileSchema`:

```typescript
firstName: z.string(),
lastName: z.string(),
avatarUrl: z.string().nullable(),
```

**Decisión `avatarUrl`:** si en MVP las URLs son siempre HTTPS de Storage, `z.string().url().nullable()`; si pueden ser rutas relativas futuras, usar `z.string().nullable()` y documentar en comentario. Alinear con cómo se persistirá en 6.4 (por ahora puede ser `null` en fixtures).

Los paths en `register-paths.ts` ya referencian estos schemas; no debería hacer falta nuevo path, solo ampliar componentes.

### Tests — fixtures mínimos

Tras 6-1, cada `mockUser` en tests de users debe incluir:

```typescript
firstName: 'María',
lastName: 'García',
avatarUrl: null,
phone: '+34600111222',
emailVerified: false,
isActive: true,
preferredLanguage: 'es',
```

Para perfil público, el mock del usuario objetivo puede usar `firstName: 'Carlos'`, `lastName: 'López'`, `avatarUrl: 'https://example.com/avatar.webp'` para assert de URL nullable.

**Casos nuevos sugeridos:**

| Test | Assert |
|---|---|
| `users-me` 21.2 | `toMatchObject` incluye `firstName`, `lastName`, `avatarUrl`, `phone`, `preferredLanguage`, `emailVerified` |
| `users-me` 21.3 | Mantener prohibidos internos (`isActive`, `cyclesAtLimit`, `location`, …); **debe** incluir `emailVerified` |
| `users-public` 26.2 | incluye `firstName`, `lastName`, `avatarUrl` |
| `users-public` 26.3 | no `email`, `phone`, `emailVerified`, `preferredLanguage`, `consecutiveNoShows` |

### Anti-patrones (no hacer en 6.3)

- No implementar `PATCH /users/me` ni validadores de actualización (6.4).
- No exponer `isActive` aunque exista en `User` (FR40).
- No añadir `firstName` al objeto `donor` en `GetItemResponseDto` (fuera de AC; posible mejora futura).
- No usar `SELECT *` ni devolver la entidad `User` directamente desde el controlador.
- No cambiar reglas de auth middleware (6.2).
- No modificar emails ni `RegisterUserUseCase`.

### Cumplimiento de arquitectura

- **Clean Architecture:** cambios en `application/dtos`, `application/use-cases/user`, `openapi/schemas/user.schemas.ts`, tests; controlador sin lógica nueva.
- **NFR2:** `location` nunca en respuesta.
- **NFR4:** DTOs explícitos; mapeo en use case.
- **NFR5:** `GET /users/:id` inexistente sigue siendo **404** (no 403).

### Inteligencia de historias 6-1 y 6-2

**6-1** (`6-1-migracion-sql-y-entidad-user-dlt-003.md`):

- Define migración `012`, entidad y `mapRow`. Historia 6.3 **consume** esos campos en lectura; si el repo no los expone, completar 6-1 primero.
- Placeholders `Usuario`/`Pendiente` en backfill: perfiles mostrarán esos nombres para usuarios legacy hasta que editen perfil en 6.4.

**6-2** (`6-2-registro-login-y-middleware-is-active.md`):

- Auth responses incluyen `firstName`/`lastName` pero **no** `emailVerified`, `phone`, `avatarUrl` — distinto contrato que `/users/me`.
- Middleware `isActive` no afecta esta historia salvo que el usuario inactivo nunca llegue al use case (401 previo).

### Historia siguiente (6.4)

`PATCH /users/me` respuesta 200 reutiliza el mismo shape que **GET /users/me** salvo `email` y `emailVerified` (architecture §8.5). Diseñar los DTOs de 6.3 de forma que 6.4 pueda reutilizar el mismo tipo de salida o un alias (`UpdateProfileResponseDto` = omit email fields) sin reescribir mapeo.

### Verificación

```bash
npm run openapi:generate
npm run build
npm test -- users-me users-public-profile
```

### Git reciente

- `7cc7200`: documentación DLT-003 (architecture, epics, delta).
- Entidad/migración pueden estar parcialmente en working tree; DTOs de perfil siguen en contrato v1.2 hasta dev-story de este archivo.

---

## Review Findings

- [x] [Review][Patch] `openapi/openapi.json` generado pero no staged/commiteado [`openapi/openapi.json`] — AC #6 exige versionarlo; el archivo existe en disco pero aparece como `??` (untracked) en git. Fix: `git add openapi/openapi.json` previo al commit de la historia.
- [x] [Review][Defer] `avatarUrl` usa `.url()` en `privateProfileSchema` vs solo `.string()` en `publicProfileSchema` [`src/openapi/schemas/user.schemas.ts`] — deferred, pre-existing (inconsistencia documentada en spec story; alinear en historia 6.4 según cómo se persistirá `avatarUrl`)
- [x] [Review][Defer] `phone: null` ya no cubierto en test 21.2 tras cambio de fixture (null→ '+34600111222') [`tests/users-me.test.ts`] — deferred, pre-existing gap menor; null serialization cubierto implícitamente por `avatarUrl: null` en el mismo test

## Dev Agent Record

### Agent Model Used

Composer (dev-story 2026-05-24)

### Debug Log References

- Prerrequisito 6-1 verificado: `USER_SELECT_COLUMNS` + `mapRow` ya exponen campos DLT-003 en `PostgresUserRepository`.

### Completion Notes List

- `GET /users/me` devuelve contrato v1.3 (14 campos visibles) sin campos internos (`isActive`, `jwtVersion`, etc.).
- `GET /users/:id` expone `firstName`, `lastName`, `avatarUrl` y oculta datos privados.
- OpenAPI regenerado; suite completa 224 tests OK.

### File List

- `src/application/dtos/get-private-profile.dto.ts`
- `src/application/dtos/get-public-profile.dto.ts`
- `src/application/use-cases/user/get-private-profile.use-case.ts`
- `src/application/use-cases/user/get-public-profile.use-case.ts`
- `src/openapi/schemas/user.schemas.ts`
- `openapi/openapi.json`
- `tests/users-me.test.ts`
- `tests/users-public-profile.test.ts`

### Change Log

- 2026-05-24: DTOs y use cases de perfil privado/público alineados a DLT-003 (architecture §8.5); OpenAPI y tests actualizados.

---

## Referencias

- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Épica 6, Historia 6.3]
- [Source: docs/architecture.md — §3.1 users, §8.5 GET /users/me y GET /users/:id]
- [Source: docs/delta-backend-DLT-003.md]
- [Source: docs/prd.md — FR37, FR38]
- [Source: _bmad-output/initiative-backend/tickets/epic-ampliacion-del-modelo-de-usuario-dlt-003/tickets/story-migracion-sql-y-entidad-user-dlt-003-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-ampliacion-del-modelo-de-usuario-dlt-003/tickets/story-registro-login-y-middleware-is-active-plan.md]
- [Source: src/application/dtos/get-private-profile.dto.ts]
- [Source: src/application/dtos/get-public-profile.dto.ts]
- [Source: src/application/use-cases/user/get-private-profile.use-case.ts]
- [Source: src/application/use-cases/user/get-public-profile.use-case.ts]
- [Source: src/openapi/schemas/user.schemas.ts]
- [Source: tests/users-me.test.ts]
- [Source: tests/users-public-profile.test.ts]

---

Ultimate context engine analysis completed — comprehensive developer guide created.
