---
title: "Cancelar objeto (sin sesión activa)"
type: feature
ticket: 4
status: done
created: 2026-10-25
---

# Historia 2.4: Cancelar objeto (sin sesión activa)

Status: done

## Historia

Como donante autenticado,
quiero poder cancelar un objeto que publiqué,
para retirarlo del sistema cuando ya no esté disponible.

## Acceptance Criteria

1. **Dado** que envío `DELETE /items/:id` siendo el donante del objeto y el objeto no tiene sesión activa, **cuando** el servidor procesa la petición, **entonces** responde `200` con mensaje de confirmación **y** el objeto queda en `status = 'cancelled'` y `completed_at = NOW()`.

2. **Dado** que envío `DELETE /items/:id` siendo autenticado pero no el donante del objeto, **cuando** el servidor procesa la petición, **entonces** responde `403 Forbidden` con mensaje genérico (nunca 404).

3. **Dado** que envío `DELETE /items/:id` con un UUID que no existe, **cuando** el servidor procesa la petición, **entonces** responde `404 Not Found`.

4. **Dado** que envío `DELETE /items/:id` sin autenticación, **cuando** el servidor procesa la petición, **entonces** responde `401 Unauthorized`.

5. **Dado** que envío `DELETE /items/not-a-uuid`, **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request`.

6. **Dado** que envío `DELETE /items/:id` siendo el donante y el objeto **tiene** una sesión de entrega activa, **cuando** el servidor procesa la petición, **entonces** responde `409 Conflict` (el manejo completo de este caso se implementa en Historia 4.5).

## Tasks / Subtasks

- [x] Task 1: Crear `ForbiddenException` y registrarla en el error handler (AC: #2)
  - [x] Crear `src/domain/exceptions/forbidden.exception.ts`
  - [x] Actualizar `src/interfaces/http/middlewares/error-handler.ts`: importar `ForbiddenException` y añadir caso `→ 403`

- [x] Task 2: Extender capa de Dominio (AC: #1, #2, #3, #6)
  - [x] Añadir a `src/domain/repositories/item.repository.ts`: interfaces `FindItemOwnershipResult`, `CancelItemInput` y métodos `findItemOwnership`, `hasActiveDeliverySession`, `cancelItem`

- [x] Task 3: Capa de Aplicación (AC: #1–#6)
  - [x] Crear `src/application/dtos/cancel-item.dto.ts` con `CancelItemResponseDto`
  - [x] Crear `src/application/use-cases/item/cancel-item.use-case.ts` con `CancelItemUseCase`

- [x] Task 4: Implementación del repositorio (AC: #1, #3, #6)
  - [x] Implementar `findItemOwnership`, `hasActiveDeliverySession` y `cancelItem` en `src/infrastructure/database/supabase/item.repository.ts`

- [x] Task 5: Capa de Interfaces (AC: #1–#5)
  - [x] Actualizar `src/interfaces/http/controllers/item.controller.ts`: importar y añadir `cancelItemUseCase` al constructor y método `cancelItem`
  - [x] Actualizar `src/interfaces/http/routes/items.routes.ts`: instanciar `CancelItemUseCase`, añadirlo al constructor de `ItemController`, añadir ruta `DELETE /:id` con `authMiddleware → validateUuidParam('id') → controller.cancelItem`

- [x] Task 6: Tests (AC: #1–#6)
  - [x] Crear `tests/items-cancel.test.ts` con los 6 casos de prueba (ver Dev Notes)
  - [x] Actualizar mocks en `tests/items-list.test.ts`, `tests/items-publish.test.ts`: añadir `findItemOwnership: vi.fn()`, `hasActiveDeliverySession: vi.fn()`, `cancelItem: vi.fn()` al mock de `itemRepo`
  - [x] Si `tests/items-get.test.ts` existe (creado por historia 2.3): añadir los mismos tres mocks
  - [x] Ejecutar `npx tsc --noEmit` sin errores
  - [x] Ejecutar `npx vitest run` — todos los tests pasan

## Dev Notes

### CRÍTICO: `ForbiddenException` no existe aún

A diferencia de `NotFoundException`, `ConflictException`, etc., **`ForbiddenException` no está creada ni registrada en el error handler**. Es el primer use case del proyecto que requiere HTTP 403. Hay que crear la clase Y actualizar el error handler.

**`src/domain/exceptions/forbidden.exception.ts`** (nuevo):
```typescript
export class ForbiddenException extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenException';
  }
}
```

**`src/interfaces/http/middlewares/error-handler.ts`** — añadir imports y bloque (mantener TODAS las entradas existentes):
```typescript
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
// ...en errorHandler, antes del bloque 500:
if (err instanceof ForbiddenException) {
  res.status(403).json({ message: err.message });
  return;
}
```

### Capa de Dominio — extensión de `item.repository.ts`

Añadir **después** de `ItemDetail` y **antes** de `IItemRepository`:

```typescript
export interface FindItemOwnershipResult {
  donorId: string;
}

export interface IItemRepository {
  createWithImages(input: CreateItemInput): Promise<Item>;
  findActiveInRadius(input: FindActiveInRadiusInput): Promise<PaginatedItems>;
  findById(input: FindItemByIdInput): Promise<ItemDetail | null>;
  findItemOwnership(itemId: string): Promise<FindItemOwnershipResult | null>;
  hasActiveDeliverySession(itemId: string): Promise<boolean>;
  cancelItem(itemId: string): Promise<void>;
}
```

### Capa de Aplicación

**`src/application/dtos/cancel-item.dto.ts`:**
```typescript
export interface CancelItemResponseDto {
  message: string;
}
```

**`src/application/use-cases/item/cancel-item.use-case.ts`:**
```typescript
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { ConflictException } from '../../../domain/exceptions/conflict.exception';
import { CancelItemResponseDto } from '../../dtos/cancel-item.dto';

export class CancelItemUseCase {
  constructor(private readonly itemRepo: IItemRepository) {}

  async execute(itemId: string, userId: string): Promise<CancelItemResponseDto> {
    const item = await this.itemRepo.findItemOwnership(itemId);
    if (!item) throw new NotFoundException('Object not found');
    if (item.donorId !== userId) throw new ForbiddenException('Forbidden');

    const hasActiveSession = await this.itemRepo.hasActiveDeliverySession(itemId);
    if (hasActiveSession) throw new ConflictException('Object has an active delivery session');

    await this.itemRepo.cancelItem(itemId);
    return { message: 'Item cancelled successfully' };
  }
}
```

**Por qué se chequea `hasActiveDeliverySession` en Story 2.4:**
Si el objeto tiene sesión activa y se cancela sin cancelar la sesión, queda una sesión huérfana activa apuntando a un item cancelado — estado inconsistente. El 409 protege la integridad. Historia 4.5 reemplaza ese `throw ConflictException` con la transacción completa (cancelar sesión + encolar email + cancelar item). El código del use case está diseñado para esa extensión.

### Capa de Infraestructura — `item.repository.ts`

Añadir los tres métodos a `PostgresItemRepository`. No se usa `client.connect()` — son queries simples sin transacción en este story:

```typescript
async findItemOwnership(itemId: string): Promise<FindItemOwnershipResult | null> {
  const result = await this.db.query<{ donor_id: string }>(
    'SELECT donor_id FROM items WHERE id = $1',
    [itemId],
  );
  if (result.rows.length === 0) return null;
  return { donorId: result.rows[0].donor_id };
}

async hasActiveDeliverySession(itemId: string): Promise<boolean> {
  const result = await this.db.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM delivery_sessions
       WHERE item_id = $1 AND status = 'active'
     ) AS exists`,
    [itemId],
  );
  return result.rows[0].exists;
}

async cancelItem(itemId: string): Promise<void> {
  await this.db.query(
    `UPDATE items
     SET status = 'cancelled', completed_at = NOW()
     WHERE id = $1`,
    [itemId],
  );
}
```

**Imports a añadir** en `infrastructure/database/supabase/item.repository.ts`:
```typescript
import {
  // ...existentes...
  FindItemOwnershipResult,  // añadir
} from '../../../domain/repositories/item.repository';
```

### Capa de Interfaces

**`src/interfaces/http/controllers/item.controller.ts`** — añadir `cancelItemUseCase`:

```typescript
import { CancelItemUseCase } from '../../../application/use-cases/item/cancel-item.use-case';

export class ItemController {
  constructor(
    private readonly publishItemUseCase: PublishItemUseCase,
    private readonly listItemsUseCase: ListItemsUseCase,
    private readonly getItemUseCase: GetItemUseCase,
    private readonly cancelItemUseCase: CancelItemUseCase,  // añadir
  ) {}

  // ...métodos existentes sin cambios...

  async cancelItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.cancelItemUseCase.execute(
        req.params.id,
        req.currentUser!.id,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
```

**`src/interfaces/http/routes/items.routes.ts`** — cambios necesarios:

1. Importar `CancelItemUseCase`:
```typescript
import { CancelItemUseCase } from '../../../application/use-cases/item/cancel-item.use-case';
```

2. Instanciar dentro de `createItemRouter` y pasar al constructor:
```typescript
const cancelItemUseCase = new CancelItemUseCase(itemRepo);
const controller = new ItemController(publishItemUseCase, listItemsUseCase, getItemUseCase, cancelItemUseCase);
```

3. Añadir la ruta `DELETE /:id` **después de** `GET /:id`:
```typescript
router.delete(
  '/:id',
  authMiddleware,
  validateUuidParam('id'),
  (req, res, next) => controller.cancelItem(req, res, next),
);
```

**Orden final de rutas en el router:**
- `GET /` — listar (ya existe)
- `GET /:id` — detalle (ya existe, de historia 2.3)
- `POST /` — publicar (ya existe)
- `DELETE /:id` — cancelar (añadir)

### Tests — `tests/items-cancel.test.ts`

Mismo patrón que `tests/items-list.test.ts` y `tests/items-get.test.ts`: `buildTestApp` con `createItemRouter(deps)`.

**Mock de `itemRepo` completo** (para este archivo):
```typescript
const ITEM_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_UUID = '11111111-2222-4333-8444-555555555555';

function buildTestApp(overrides: Partial<ItemRouterDeps> = {}) {
  const itemRepo = {
    createWithImages: vi.fn(),
    findActiveInRadius: vi.fn(),
    findById: vi.fn(),
    findItemOwnership: vi.fn().mockResolvedValue({ donorId: USER_UUID }),
    hasActiveDeliverySession: vi.fn().mockResolvedValue(false),
    cancelItem: vi.fn().mockResolvedValue(undefined),
    ...overrides.itemRepo,
  };
  // jwtService y userRepo: mismo patrón que tests/items-list.test.ts
  // (mockResolvedValue con usuario cuyo id = USER_UUID)
  // ...
}
```

**Casos de prueba (6):**

| # | Test | Mock de `findItemOwnership` | Mock de `hasActiveDeliverySession` | Esperado |
|---|------|---------------------------|------------------------------------|----------|
| 11.1 | DELETE /items/:id donante válido, sin sesión | `{ donorId: USER_UUID }` | `false` | 200 `{ message: '...' }` |
| 11.2 | No es el donante | `{ donorId: 'otro-uuid' }` | — | 403 |
| 11.3 | Item no existe | `null` | — | 404 |
| 11.4 | Sin token de autenticación | — | — | 401 |
| 11.5 | UUID inválido (`/items/not-a-uuid`) | — | — | 400 |
| 11.6 | Donante válido, con sesión activa | `{ donorId: USER_UUID }` | `true` | 409 |

**Ejemplo test 11.1:**
```typescript
it('11.1 — DELETE /items/:id: donante válido → 200', async () => {
  const { app } = buildTestApp();
  const res = await request(app)
    .delete(`/items/${ITEM_UUID}`)
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('message');
  expect(itemRepo.cancelItem).toHaveBeenCalledWith(ITEM_UUID);
});
```

**Ejemplo test 11.2 (403):**
```typescript
it('11.2 — No es el donante → 403', async () => {
  const { app } = buildTestApp({
    itemRepo: {
      // ...
      findItemOwnership: vi.fn().mockResolvedValue({ donorId: 'otro-uuid-diferente' }),
    },
  });
  const res = await request(app)
    .delete(`/items/${ITEM_UUID}`)
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(403);
});
```

**Ejemplo test 11.6 (409 active session):**
```typescript
it('11.6 — Sesión activa → 409', async () => {
  const { app } = buildTestApp({
    itemRepo: {
      // ...
      findItemOwnership: vi.fn().mockResolvedValue({ donorId: USER_UUID }),
      hasActiveDeliverySession: vi.fn().mockResolvedValue(true),
    },
  });
  const res = await request(app)
    .delete(`/items/${ITEM_UUID}`)
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(409);
});
```

### Actualización de mocks en tests existentes

En **cada** test que usa `createItemRouter(deps)` con un mock de `itemRepo`, añadir los tres nuevos métodos al mock. Afecta:
- `tests/items-list.test.ts` — añadir `findItemOwnership: vi.fn()`, `hasActiveDeliverySession: vi.fn()`, `cancelItem: vi.fn()`
- `tests/items-publish.test.ts` — ídem
- `tests/items-get.test.ts` (cuando exista, creado por historia 2.3) — ídem

Sin estas adiciones, TypeScript rechazará el mock por no cumplir `IItemRepository`.

### Extensión en Historia 4.5

Historia 4.5 modificará `CancelItemUseCase.execute` así:
```
// Cambiar este bloque:
if (hasActiveSession) throw new ConflictException('...');
await this.itemRepo.cancelItem(itemId);

// Por este (dentro de transacción atómica):
if (hasActiveSession) {
  await this.itemRepo.cancelItemWithSession(itemId);  // transacción: cancela sesión + item
  mailService.sendAsync(EVT-005 al receiver);
} else {
  await this.itemRepo.cancelItem(itemId);
}
```

El diseño de `CancelItemUseCase` en esta historia ya deja ese punto de extensión limpio.

### Project Structure Notes

- `src/domain/exceptions/forbidden.exception.ts` — archivo nuevo (primer 403 del proyecto)
- `src/application/dtos/cancel-item.dto.ts` — archivo nuevo
- `src/application/use-cases/item/cancel-item.use-case.ts` — archivo nuevo
- Los tres archivos de infraestructura/interfaces son **modificaciones** de archivos existentes
- `tests/items-cancel.test.ts` — archivo nuevo; copiar la estructura de `tests/items-get.test.ts` como referencia de patrón actualizado
- `delivery_sessions` table **ya existe** en la base de datos (creada en Historia 1.1) — el query de `hasActiveDeliverySession` es válido desde el primer día
- **No se toca `requests_paused`, `item_requests`, ni ninguna otra tabla** — el scope de esta historia es únicamente el campo `status` y `completed_at` de `items`

### References

- [Source: docs/architecture.md §12.3] — Reglas de autorización para CancelItem: ownership check, sesión activa, transacción atómica
- [Source: docs/architecture.md §2, NFR5] — 403 genérico ante fallo de autorización, nunca 404 como sustituto
- [Source: docs/architecture.md §2, NFR3] — Validar UUID v4 en `validators/` antes del controlador
- [Source: docs/architecture.md §3.2] — Schema de `items`: campos `status`, `completed_at`, constraint CHECK
- [Source: docs/architecture.md §3.5] — Schema de `delivery_sessions`: campo `status`, valores válidos
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md §Historia 2.4] — ACs de cancelación base
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md §Historia 4.5] — Extensión con sesión activa (email EVT-005)
- [Source: src/interfaces/http/middlewares/error-handler.ts] — Patrón existente para nuevas excepciones
- [Source: src/domain/exceptions/] — Patrón existente: bad-request, not-found, conflict (sin ForbiddenException aún)
- [Source: src/interfaces/http/routes/items.routes.ts] — Factory `createItemRouter(deps)`, `ItemRouterDeps`, patrón de rutas
- [Source: src/interfaces/http/controllers/item.controller.ts] — Constructor de `ItemController`, patrón de métodos
- [Source: tests/items-list.test.ts] — Patrón `buildTestApp`, mock de `jwtService`/`userRepo`/`itemRepo`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (bmad-create-story, 2026-05-06)

### Debug Log References

### Completion Notes List

- Task 1: `ForbiddenException` creada en `src/domain/exceptions/`. Registrada en `error-handler.ts` con bloque `→ 403` antes del bloque de `NotFoundException`.
- Task 2: Extendida `IItemRepository` con `FindItemOwnershipResult`, `CancelItemInput` (declarativo) y los tres métodos `findItemOwnership`, `hasActiveDeliverySession`, `cancelItem`.
- Task 3: `CancelItemUseCase` implementa el flujo: ownership check → forbidden check → active session check → cancel. Lanza `NotFoundException`, `ForbiddenException`, o `ConflictException` según el caso.
- Task 4: Tres métodos SQL simples sin transacción. `findItemOwnership` retorna solo `donor_id`. `hasActiveDeliverySession` usa `SELECT EXISTS(...)`. `cancelItem` actualiza `status='cancelled'` y `completed_at=NOW()`.
- Task 5: `ItemController` extendido con cuarto parámetro `cancelItemUseCase` y método `cancelItem`. Ruta `DELETE /:id` añadida después de `POST /` con `authMiddleware → validateUuidParam → controller.cancelItem`.
- Task 6: 6 tests en `items-cancel.test.ts` (200, 403, 404, 401, 400, 409). Mocks de `items-list`, `items-publish` e `items-get` actualizados con los tres nuevos métodos. `npx tsc --noEmit` limpio. `npx vitest run` 86/86 pasando.

### File List

- src/domain/exceptions/forbidden.exception.ts (nuevo)
- src/interfaces/http/middlewares/error-handler.ts (modificado — añadir ForbiddenException → 403)
- src/application/dtos/cancel-item.dto.ts (nuevo)
- src/application/use-cases/item/cancel-item.use-case.ts (nuevo)
- src/domain/repositories/item.repository.ts (modificado — añadir FindItemOwnershipResult, CancelItemInput + 3 métodos a IItemRepository)
- src/infrastructure/database/supabase/item.repository.ts (modificado — implementar findItemOwnership, hasActiveDeliverySession, cancelItem)
- src/interfaces/http/controllers/item.controller.ts (modificado — añadir cancelItemUseCase al constructor y método cancelItem)
- src/interfaces/http/routes/items.routes.ts (modificado — instanciar CancelItemUseCase, extender constructor, añadir DELETE /:id)
- tests/items-cancel.test.ts (nuevo)
- tests/items-list.test.ts (modificado — mock itemRepo actualizado)
- tests/items-publish.test.ts (modificado — mock itemRepo actualizado)
- tests/items-get.test.ts (modificado — mock itemRepo actualizado)

### Review Findings

- [x] [Review][Decision] `cancelItem` puede cancelar items en cualquier status — resuelto con opción 1: `WHERE id = $1 AND status = 'active'` en el UPDATE + `rowCount === 0 → NotFoundException`. [src/infrastructure/database/supabase/item.repository.ts]
- [x] [Review][Patch] `hasActiveDeliverySession` sin coerción de boolean — corregido: `return result.rows[0].exists === true`. [src/infrastructure/database/supabase/item.repository.ts]
- [x] [Review][Patch] `cancelItem` sin verificar rowCount — corregido junto con decision: `AND status = 'active'` + `rowCount === 0 → NotFoundException`. [src/infrastructure/database/supabase/item.repository.ts]
- [x] [Review][Patch] `CancelItemInput` dead code — eliminada la interfaz. [src/domain/repositories/item.repository.ts]
- [x] [Review][Patch] Tests 11.2 y 11.3 sin assertión `.not.toHaveBeenCalled()` — añadido en ambos tests. [tests/items-cancel.test.ts]
- [x] [Review][Patch] Test 11.2 sin assertión de body para AC2/NFR5 — añadido `expect(res.body).toHaveProperty('message')`. [tests/items-cancel.test.ts]
- [x] [Review][Patch] Test 11.6 sin assertión de body para AC6 — añadido `expect(res.body).toHaveProperty('message')`. [tests/items-cancel.test.ts]
- [x] [Review][Defer] TOCTOU entre session check y cancelItem — tres queries no atómicas; race condition teórica entre `hasActiveDeliverySession` y `cancelItem`. Intencional por spec para esta historia; la transacción completa se implementa en Historia 4.5. [src/application/use-cases/item/cancel-item.use-case.ts] — deferred, pre-existing
- [x] [Review][Defer] `req.currentUser!.id` non-null assertion sin guard explícito — si authMiddleware se reordena lanza TypeError en lugar de 401. Patrón pre-existente en el codebase; authMiddleware wired antes del handler en la ruta. [src/interfaces/http/controllers/item.controller.ts] — deferred, pre-existing
- [x] [Review][Defer] `buildTestApp` shallow merge para deps no-itemRepo — pasar partial `jwtService`/`userRepo` reemplaza el objeto completo. Latent footgun para futuros tests. No afecta tests actuales. [tests/items-cancel.test.ts] — deferred, pre-existing
- [x] [Review][Defer] ForbiddenException message delegado al throw site — patrón frágil para NFR5; si un futuro call-site pasa un mensaje revelador, el error handler lo expone. Actualmente el mensaje es genérico. [src/interfaces/http/middlewares/error-handler.ts] — deferred, pre-existing
- [x] [Review][Defer] Sin test para 500 path (error de DB en cancelItem) — cobertura del next(err) path no verificada. Patrón pre-existente en todos los test files del proyecto. [tests/items-cancel.test.ts] — deferred, pre-existing
