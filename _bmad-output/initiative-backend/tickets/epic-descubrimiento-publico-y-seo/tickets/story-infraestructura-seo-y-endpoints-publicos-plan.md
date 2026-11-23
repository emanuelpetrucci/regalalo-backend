---
title: "Infraestructura SEO y Endpoints Públicos"
type: feature
ticket: 1
status: done
created: 2026-10-25
---

# Story 13.1: Infraestructura SEO y Endpoints Públicos

Status: done

## Story

Como usuario invitado o bot de búsqueda,
quiero ver el feed de objetos y sus detalles sin estar autenticado,
para descubrir el catálogo de la plataforma y que sea indexable por Google.

## Acceptance Criteria

1. **AC1 — Feed global sin token**: `GET /api/items` sin token JWT responde `200 OK` con lista de objetos activos globales (sin filtro de 50 km). `distanceMeters` es `null` en cada objeto.
2. **AC2 — Detalle sin token**: `GET /api/items/:id` sin token JWT responde `200 OK`. Campos del donante anonimizados: `donor.id = null`, `donor.firstName = "Anónimo"`, `donor.lastName = ""`, `donor.avatarUrl = null`. `donor.reputationScore` = valor real. `distanceMeters = null`.
3. **AC3 — 410 Gone**: `GET /api/items/:id` con UUID válido inexistente en `items` responde `410 Gone` (tanto para invitados como para usuarios autenticados).
4. **AC4 — Regresión autenticado (lista)**: Usuario autenticado que llama a `GET /api/items` sigue recibiendo resultados filtrados por radio de 50 km con `distanceMeters` calculado.
5. **AC5 — Regresión autenticado (detalle)**: Usuario autenticado que llama a `GET /api/items/:id` recibe el donante sin anonimizar y `distanceMeters` calculado.
6. **AC6 — Token inválido rechazado**: `GET /api/items` y `GET /api/items/:id` con token malformado o expirado responden `401 Unauthorized` (el middleware opcional aún rechaza tokens activamente malos).
7. **AC7 — Rutas protegidas sin cambio**: `POST /api/items`, `DELETE /api/items/:id`, `PATCH /api/items/:id/pause`, `GET /api/items/:id/requests` y `POST /api/items/:id/requests` siguen requiriendo JWT válido.

## Tasks / Subtasks

- [x] **T1 — Excepción GoneException** (AC: #3)
  - [x] Crear `src/domain/exceptions/gone.exception.ts` con clase `GoneException extends Error` (`name = 'GoneException'`)
  - [x] Añadir handler en `src/interfaces/http/middlewares/error-handler.ts`: `GoneException` → HTTP 410 con `{ message: err.message }`, antes del bloque de `NotFoundException`

- [x] **T2 — Middleware de auth opcional** (AC: #1, #2, #4, #5, #6)
  - [x] Añadir `createOptionalAuthMiddleware(jwtService, userRepo)` en `src/interfaces/http/middlewares/auth.middleware.ts`
  - [x] Lógica: si no hay `Authorization` header → `next()` sin tocar `req.currentUser`; si hay header válido → setear `req.currentUser` y `next()`; si hay header con token inválido/expirado → lanzar `UnauthorizedException` (fallo activo, no silencioso)

- [x] **T3 — Interfaces de dominio** (AC: #1, #2, #4, #5)
  - [x] `src/domain/repositories/item.repository.ts`: cambiar `FindActiveInRadiusInput.userId` a `string | null`
  - [x] `src/domain/repositories/item.repository.ts`: cambiar `FindItemByIdInput.userId` a `string | null`
  - [x] `src/domain/repositories/item.repository.ts`: cambiar `ItemDetail.distanceMeters` a `number | null`
  - [x] `src/domain/repositories/item.repository.ts`: cambiar `ItemDetail.donor.id` a `string | null`
  - [x] `src/domain/repositories/item.repository.ts`: cambiar `ItemWithDistance.distanceMeters` a `number | null`

- [x] **T4 — DTOs de aplicación** (AC: #1, #2, #4, #5)
  - [x] `src/application/dtos/list-items.dto.ts`: `ListItemsRequestDto.userId: string | null`; `ItemSummaryDto.distanceMeters: number | null`
  - [x] `src/application/dtos/get-item.dto.ts`: `GetItemResponseDto.distanceMeters: number | null`; `GetItemResponseDto.donor.id: string | null`

- [x] **T5 — Use cases** (AC: #3)
  - [x] `src/application/use-cases/item/get-item.use-case.ts`: cambiar firma de `execute(itemId: string, userId: string)` a `execute(itemId: string, userId: string | null)`. Reemplazar `NotFoundException` por `GoneException` cuando el ítem no existe (importar de `domain/exceptions/gone.exception.ts`)
  - [x] `src/application/use-cases/item/list-items.use-case.ts`: sin cambios funcionales; los tipos propagados por T3/T4 son suficientes

- [x] **T6 — Controlador** (AC: #1, #2, #4, #5)
  - [x] `src/interfaces/http/controllers/item.controller.ts`:
    - `listItems`: cambiar `userId: req.currentUser!.id` → `userId: req.currentUser?.id ?? null`
    - `getItem`: cambiar `req.currentUser!.id` → `req.currentUser?.id ?? null`

- [x] **T7 — Implementación SQL en repositorio** (AC: #1, #2, #4, #5)
  - [x] `src/infrastructure/database/supabase/item.repository.ts`: refactorizar `findActiveInRadius` para manejar `userId === null` → rama guest (sin filtro de radio, `distance_meters = NULL`, sin `donor_id != $1`)
  - [x] `src/infrastructure/database/supabase/item.repository.ts`: refactorizar `findById` para manejar `userId === null` → rama guest (sin `ST_Distance`, donor anonimizado)
  - [x] Asegurarse de que la rama autenticada queda byte-a-byte idéntica a hoy

- [x] **T8 — Rutas** (AC: #1, #2, #6, #7)
  - [x] `src/interfaces/http/routes/items.routes.ts`:
    - Importar y crear `optionalAuthMiddleware = createOptionalAuthMiddleware(jwtService, userRepo)`
    - `GET /` → reemplazar `authMiddleware` por `optionalAuthMiddleware`
    - `GET /:id` → reemplazar `authMiddleware` por `optionalAuthMiddleware`
    - Todas las demás rutas: sin cambio

- [x] **T9 — OpenAPI** (AC: #1, #2)
  - [x] Actualizar esquemas en `src/openapi/schemas/` para `distanceMeters` nullable en respuesta de lista y detalle; `donor.id` nullable en respuesta de detalle
  - [x] Ejecutar `npm run openapi:generate`

- [x] **T10 — Tests** (AC: #1–#7)
  - [x] Crear `tests/13-1-public-discovery-seo.test.ts` con cobertura de todos los ACs
  - [x] Incluir: 200 sin token (lista y detalle), anonimización del donante, 410 UUID inexistente, regresión autenticado (lista filtrada), regresión autenticado (detalle con donor real), 401 token malformado, 401 en rutas protegidas sin token

- [x] **T11 — Versioning** (obligatorio)
  - [x] Añadir entrada en `CHANGELOG.md` bajo `## [Unreleased]` → sección `Added`
  - [x] Bump de versión minor en `package.json`

## Dev Notes

### Middleware de Autenticación Opcional

El middleware actual `createAuthMiddleware` siempre lanza `UnauthorizedException` si no hay token. Para autenticación opcional, la diferencia clave es:

```typescript
// auth.middleware.ts — añadir DEBAJO de la función existente
export function createOptionalAuthMiddleware(
  jwtService: IJwtService,
  userRepo: IUserRepository,
  options: AuthMiddlewareOptions = {},
) {
  return async function optionalAuthMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // Sin token → invitado, continuar sin currentUser
        return next();
      }
      // Con token → validar igual que authMiddleware (falla activo si el token es malo)
      const token = authHeader.slice(7);
      // ... misma lógica de verificación que createAuthMiddleware ...
      req.currentUser = currentUser;
      next();
    } catch (err) {
      next(err);
    }
  };
}
```

**Regla crítica**: Un token presente pero inválido (expirado, firma incorrecta, usuario inexistente, `jwt_version` desactualizado, `is_active = false`, `email_verified = false`) DEBE fallar con 401/403. El middleware "opcional" solo omite la exigencia de que el token esté presente — no relaja la validación del token cuando este existe.

### SQL — Rama Guest en `findActiveInRadius`

Cuando `userId === null` (invitado), usar:

```sql
-- COUNT
SELECT COUNT(*) FROM items i WHERE i.status = 'active'

-- LIST
SELECT
  i.id, i.title, i.condition, i.category, i.degraded_at, i.created_at,
  NULL::int AS distance_meters,
  (SELECT COALESCE(ARRAY_AGG(storage_path ORDER BY created_at), ARRAY[]::text[])
   FROM item_images WHERE item_id = i.id) AS image_paths
FROM items i
WHERE i.status = 'active'
ORDER BY i.degraded_at NULLS FIRST, i.created_at DESC
LIMIT $1 OFFSET $2
-- parámetros: [limit, offset]  (sin userId)
```

Sin `donor_id != $1` (no hay userId). Sin `ST_DWithin`. Sin `CTE user_location`.

### SQL — Rama Guest en `findById`

Cuando `userId === null`, usar una sola query con donor anonimizado y sin distance:

```sql
SELECT
  i.id, i.title, i.description, i.condition, i.category, i.weight_range,
  i.status, i.requests_paused, i.degraded_at, i.created_at, i.completed_at,
  NULL::int AS distance_meters,
  CASE
    WHEN i.status IN ('completed', 'cancelled')
     AND COALESCE(i.completed_at, NOW()) < NOW() - INTERVAL '30 days'
    THEN ARRAY[]::text[]
    ELSE COALESCE(
      (SELECT ARRAY_AGG(ii.storage_path ORDER BY ii.created_at)
       FROM item_images ii WHERE ii.item_id = i.id),
      ARRAY[]::text[]
    )
  END AS image_paths,
  NULL       AS donor_id,
  'Anónimo'  AS donor_first_name,
  ''         AS donor_last_name,
  NULL       AS donor_avatar_url,
  u.reputation_score AS donor_reputation_score
FROM items i
JOIN users u ON u.id = i.donor_id
WHERE i.id = $1
-- parámetros: [itemId]
```

La rama autenticada queda **idéntica al código actual** — solo se añade un `if (input.userId === null)` al principio de cada método.

### Comportamiento de `GoneException` (410)

- **Solo** aplica a `GET /api/items/:id` cuando el ítem no existe.
- Las demás rutas que verifican existencia de ítem (cancel, pause, getRankedCandidates, requestItem, selectReceiver) siguen usando `NotFoundException` (404) — no cambiar.
- Cambiar únicamente `GetItemUseCase` para que lance `GoneException` en lugar de `NotFoundException`.

```typescript
// get-item.use-case.ts
import { GoneException } from '../../../domain/exceptions/gone.exception';
// ...
if (!item) throw new GoneException('Object not found');
```

### Tipos y Propagación

El cambio de `number` a `number | null` en `distanceMeters` y `donor.id` propaga a través de:

1. `IItemRepository` (dominio) → `item.repository.ts` (infra)
2. `ListItemsRequestDto` / `ItemSummaryDto` → `ListItemsUseCase` → `ItemController`
3. `FindItemByIdInput` / `ItemDetail` → `GetItemUseCase` → `GetItemResponseDto` → `ItemController`
4. Esquemas OpenAPI

TypeScript strict mode detectará si algún caller no maneja el `null`. No usar `!` (non-null assertion) donde antes había garantía de autenticación.

### Estructura de Tests (`tests/13-1-public-discovery-seo.test.ts`)

Patrón de nombres existente: `describe / it` con ID de historia (`13.1`). Mock de repos/servicios con `vi.mock`. Mocks necesarios:

- `itemRepo.findActiveInRadius` → para simular guest (retorna `distanceMeters: null`) y auth (retorna `distanceMeters: 1500`)
- `itemRepo.findById` → para simular guest (donor anonimizado), auth (donor real), ítem inexistente (retorna `null`)
- `userRepo.findById` → para simular usuario autenticado (auth tests)
- `jwtService.verify` → para simular token válido o inválido

Tests obligatorios:
```
13.1.1 — GET /api/items sin token → 200, distanceMeters null en items
13.1.2 — GET /api/items/:id sin token → 200, donor.id null, donor.firstName "Anónimo"
13.1.3 — GET /api/items/:id UUID inexistente → 410
13.1.4 — GET /api/items con token válido → 200, distanceMeters calculado (regresión)
13.1.5 — GET /api/items/:id con token válido → 200, donor.id real, distanceMeters calculado (regresión)
13.1.6 — GET /api/items con token malformado → 401
13.1.7 — POST /api/items sin token → 401
13.1.8 — DELETE /api/items/:id sin token → 401
```

### Project Structure Notes

- Archivos NUEVOS: `src/domain/exceptions/gone.exception.ts`
- Archivos MODIFICADOS:
  - `src/domain/exceptions/` → `gone.exception.ts` (nuevo)
  - `src/interfaces/http/middlewares/error-handler.ts`
  - `src/interfaces/http/middlewares/auth.middleware.ts`
  - `src/domain/repositories/item.repository.ts`
  - `src/application/dtos/list-items.dto.ts`
  - `src/application/dtos/get-item.dto.ts`
  - `src/application/use-cases/item/get-item.use-case.ts`
  - `src/interfaces/http/controllers/item.controller.ts`
  - `src/infrastructure/database/supabase/item.repository.ts`
  - `src/interfaces/http/routes/items.routes.ts`
  - `src/openapi/schemas/` (esquemas de items)
  - `openapi/openapi.json` (regenerado, no editar a mano)
  - `CHANGELOG.md`
  - `package.json`
- Archivos NUEVOS: `tests/13-1-public-discovery-seo.test.ts`
- No migración SQL — no hay cambios en el schema de BD

### Anti-patterns a Evitar

- **NO** crear un nuevo use-case separado para invitados — modificar `ListItemsUseCase` y `GetItemUseCase` para aceptar `userId: string | null`.
- **NO** añadir lógica de anonimización en el use-case o controlador — hacerlo en el repositorio SQL como hace el código existente con las imágenes purgadas.
- **NO** silenciar tokens inválidos en el middleware opcional — token malformado siempre devuelve 401.
- **NO** cambiar a 410 en otros use-cases que llaman a `findItemOwnership` (cancel, pause, etc.) — solo `GetItemUseCase`.
- **NO** editar `openapi/openapi.json` manualmente — usar `npm run openapi:generate`.
- **NO** omitir la rama autenticada existente en el repositorio — la lógica actual no cambia para usuarios autenticados.

### Review Findings

- [x] [Review][Decision] EmailNotVerifiedException yields HTTP 403 en rutas con auth opcional — resuelto: mantener 403 (comportamiento existente, avalado por dev notes "401/403")
- [x] [Review][Patch] INNER JOIN en users en rama guest de findById silenciosamente retorna 410 para ítems con donor eliminado — corregido: LEFT JOIN + COALESCE(u.reputation_score, 0) [src/infrastructure/database/supabase/item.repository.ts]
- [x] [Review][Patch] Sin rate limiting en los nuevos endpoints públicos GET / y GET /:id — corregido: createPublicItemsRateLimit() (60 req/min) agregado a ambas rutas [src/interfaces/http/routes/items.routes.ts, src/interfaces/http/middlewares/rate-limit.ts]
- [x] [Review][Patch] Falso positivo — test `13.1 — getItem con token pasa userId` ya tenía `{ app, deps }` correctamente destructurado
- [x] [Review][Patch] Tests de regresión AC7 faltantes para PATCH /api/items/:id/pause, GET /api/items/:id/requests, POST /api/items/:id/requests — corregido: tests 13.1.9, 13.1.10, 13.1.11 agregados [tests/13-1-public-discovery-seo.test.ts]
- [x] [Review][Defer] Race condition en paginación guest — COUNT y SELECT corren como queries separadas sin transacción [src/infrastructure/database/supabase/item.repository.ts] — deferred, pre-existing (mismo patrón en rama autenticada)
- [x] [Review][Defer] buildTestApp sobre-comparte estado de mocks via overrides parciales de deps — deferred, pre-existing en todos los test files
- [x] [Review][Defer] Header `Authorization: bearer` (minúsculas) silenciosamente degrada a guest en rutas opcionales [src/interfaces/http/middlewares/auth.middleware.ts] — deferred, pre-existing en ambos middlewares de auth
- [x] [Review][Defer] page=0 → SQL OFFSET negativo en findActiveInRadius [src/infrastructure/database/supabase/item.repository.ts] — deferred, pre-existing (cálculo del offset movido, no introducido)

### Referencias

- [Épica 13: Descubrimiento Público y SEO] `_bmad-output/initiative-backend/archive-v6/epics.md` — sección épica 13
- [Architecture §8.7 Rutas Públicas y SEO] `docs/architecture.md`
- [Architecture §12.12 ListItems Guest Mode] `docs/architecture.md`
- [Architecture §12.13 GetItem Guest Mode] `docs/architecture.md`
- [PRD §13 Descubrimiento Público] `docs/prd.md`
- [Auth Middleware] `src/interfaces/http/middlewares/auth.middleware.ts`
- [Error Handler] `src/interfaces/http/middlewares/error-handler.ts`
- [Item Repository SQL] `src/infrastructure/database/supabase/item.repository.ts`
- [Item Routes] `src/interfaces/http/routes/items.routes.ts`
- [GetItemUseCase] `src/application/use-cases/item/get-item.use-case.ts`
- [ListItemsUseCase] `src/application/use-cases/item/list-items.use-case.ts`
- [IItemRepository] `src/domain/repositories/item.repository.ts`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implementado `GoneException` (HTTP 410) para `GET /api/items/:id` cuando el ítem no existe — distingue semánticamente de 404 para recursos eliminados/inaccesibles.
- `createOptionalAuthMiddleware` añadido en `auth.middleware.ts`: sin header → guest; header presente → validación completa con fallo activo (401) si el token es inválido.
- Tipos `userId: string | null` propagados desde la interfaz de dominio hasta el controlador via DTOs — TypeScript strict detectó todos los puntos de uso.
- Repositorio SQL bifurcado con rama guest (sin ST_DWithin, sin filtro donor_id, distanceMeters=NULL, donor anonimizado) y rama autenticada idéntica al código anterior.
- Tests existentes `9.2` (items-list) y `10.3`, `10.4` (items-get) actualizados para reflejar el nuevo comportamiento correcto.
- 14 tests nuevos en `13-1-public-discovery-seo.test.ts` cubriendo los 7 ACs. Suite completa: 551 passed, 0 failed.
- OpenAPI regenerado con `distanceMeters: nullable` e `itemDonor.id: nullable`.
- Versión bumpeada a 1.3.0 (feature minor).

### File List

- `src/domain/exceptions/gone.exception.ts` (nuevo)
- `src/interfaces/http/middlewares/error-handler.ts`
- `src/interfaces/http/middlewares/auth.middleware.ts`
- `src/domain/repositories/item.repository.ts`
- `src/application/dtos/list-items.dto.ts`
- `src/application/dtos/get-item.dto.ts`
- `src/application/use-cases/item/get-item.use-case.ts`
- `src/interfaces/http/controllers/item.controller.ts`
- `src/infrastructure/database/supabase/item.repository.ts`
- `src/interfaces/http/routes/items.routes.ts`
- `src/openapi/schemas/item.schemas.ts`
- `openapi/openapi.json`
- `tests/13-1-public-discovery-seo.test.ts` (nuevo)
- `tests/items-list.test.ts`
- `tests/items-get.test.ts`
- `CHANGELOG.md`
- `package.json`
- `_bmad-output/initiative-backend/archive-v6/sprint-status.yaml`
