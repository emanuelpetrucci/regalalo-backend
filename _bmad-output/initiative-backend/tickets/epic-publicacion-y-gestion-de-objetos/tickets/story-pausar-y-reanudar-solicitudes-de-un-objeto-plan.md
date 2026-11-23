---
title: "Pausar y reanudar solicitudes de un objeto"
type: feature
ticket: 5
status: done
created: 2026-10-25
---

# Historia 2.5: Pausar y reanudar solicitudes de un objeto

Status: done

## Historia

Como donante autenticado,
quiero poder pausar temporalmente las solicitudes de mi objeto,
para controlar cuándo acepto nuevas solicitudes.

## Acceptance Criteria

1. **Dado** que envío `PATCH /items/:id/pause` con `{ "paused": true }` siendo el donante y el objeto en estado `active`, **cuando** el servidor procesa la petición, **entonces** responde `200` con `{ requestsPaused: true }` **y** el campo `requests_paused = TRUE` en la base de datos.

2. **Dado** que envío `PATCH /items/:id/pause` con `{ "paused": false }` siendo el donante, **cuando** el servidor procesa la petición, **entonces** responde `200` con `{ requestsPaused: false }` **y** el campo `requests_paused = FALSE` en la base de datos.

3. **Dado** que envío `PATCH /items/:id/pause` siendo autenticado pero no el donante, **cuando** el servidor procesa la petición, **entonces** responde `403 Forbidden`.

4. **Dado** que envío `PATCH /items/:id/pause` con un UUID que no existe, **cuando** el servidor procesa la petición, **entonces** responde `404 Not Found`.

5. **Dado** que envío `PATCH /items/:id/pause` sin autenticación, **cuando** el servidor procesa la petición, **entonces** responde `401 Unauthorized`.

6. **Dado** que envío `PATCH /items/not-a-uuid/pause`, **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request`.

7. **Dado** que envío `PATCH /items/:id/pause` sobre un objeto en estado distinto de `active` (e.g., `cancelled`, `reserved`, `completed`), **cuando** el servidor procesa la petición, **entonces** responde `409 Conflict`.

8. **Dado** que envío `PATCH /items/:id/pause` con cuerpo inválido (campo `paused` ausente o no boolean), **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request`.

> **Nota cross-story (AC FR13):** El bloqueo de solicitudes cuando `requests_paused = TRUE` (es decir, `POST /items/:id/requests` devuelve 409 si `requests_paused = TRUE`) se implementa en **Historia 3.1**, no en esta historia. Esta historia establece el campo y el endpoint de control; historia 3.1 lo lee durante la validación de solicitudes.

## Tasks / Subtasks

- [x] Task 1: Extender `FindItemOwnershipResult` en Dominio (AC: #1, #2, #3, #7)
  - [x] Modificar `src/domain/repositories/item.repository.ts`: añadir campo `status: string` a `FindItemOwnershipResult` y método `setPauseStatus` a `IItemRepository`

- [x] Task 2: Actualizar `findItemOwnership` en Infraestructura (AC: #4, #7)
  - [x] Modificar `src/infrastructure/database/supabase/item.repository.ts`: actualizar SQL de `findItemOwnership` para incluir `status`, e implementar `setPauseStatus`

- [x] Task 3: Capa de Aplicación (AC: #1–#8)
  - [x] Crear `src/application/dtos/pause-item.dto.ts` con `PauseItemResponseDto`
  - [x] Crear `src/application/use-cases/item/pause-item.use-case.ts` con `PauseItemUseCase`

- [x] Task 4: Validator de cuerpo (AC: #8)
  - [x] Crear `src/interfaces/validators/pause-item.validator.ts`

- [x] Task 5: Capa de Interfaces (AC: #1–#8)
  - [x] Modificar `src/interfaces/http/controllers/item.controller.ts`: añadir `pauseItemUseCase` al constructor (5.º parámetro) y método `pauseItem`
  - [x] Modificar `src/interfaces/http/routes/items.routes.ts`: instanciar `PauseItemUseCase`, añadirlo al constructor de `ItemController`, añadir ruta `PATCH /:id/pause`

- [x] Task 6: Tests (AC: #1–#8)
  - [x] Crear `tests/items-pause.test.ts` con los 9 casos de prueba (ver Dev Notes)
  - [x] Actualizar mocks de `itemRepo` en `tests/items-list.test.ts`, `tests/items-publish.test.ts`, `tests/items-get.test.ts`, `tests/items-cancel.test.ts`: añadir `setPauseStatus: vi.fn()` y cambiar `findItemOwnership` mock para que retorne `{ donorId, status }`
  - [x] Ejecutar `npx tsc --noEmit` sin errores
  - [x] Ejecutar `npx vitest run` — todos los tests pasan

## Dev Notes

### CRÍTICO: `FindItemOwnershipResult` debe extenderse para incluir `status`

Historia 2.4 definió `FindItemOwnershipResult` con solo `{ donorId: string }`. Historia 2.5 necesita `status` para verificar que el objeto está `active`. **Hay que modificar la interfaz existente y actualizar el SQL.**

**`src/domain/repositories/item.repository.ts`** — cambios:

```typescript
// MODIFICAR interfaz existente (añadir campo status):
export interface FindItemOwnershipResult {
  donorId: string;
  status: string;  // añadir en story 2.5
}

// AÑADIR a IItemRepository (después de cancelItem):
export interface IItemRepository {
  createWithImages(input: CreateItemInput): Promise<Item>;
  findActiveInRadius(input: FindActiveInRadiusInput): Promise<PaginatedItems>;
  findById(input: FindItemByIdInput): Promise<ItemDetail | null>;
  findItemOwnership(itemId: string): Promise<FindItemOwnershipResult | null>;
  hasActiveDeliverySession(itemId: string): Promise<boolean>;
  cancelItem(itemId: string): Promise<void>;
  setPauseStatus(itemId: string, paused: boolean): Promise<void>;  // añadir
}
```

**Impacto en `CancelItemUseCase` (historia 2.4):** ninguno — el use case de cancelación solo usa `item.donorId` e ignora `item.status`. TypeScript compilará sin cambios.

### Infraestructura — cambios en `item.repository.ts`

**1. Actualizar SQL de `findItemOwnership`** (añadir `status` al SELECT):

```typescript
async findItemOwnership(itemId: string): Promise<FindItemOwnershipResult | null> {
  const result = await this.db.query<{ donor_id: string; status: string }>(
    'SELECT donor_id, status FROM items WHERE id = $1',  // añadir status
    [itemId],
  );
  if (result.rows.length === 0) return null;
  return {
    donorId: result.rows[0].donor_id,
    status: result.rows[0].status,  // añadir
  };
}
```

**2. Implementar `setPauseStatus`:**

```typescript
async setPauseStatus(itemId: string, paused: boolean): Promise<void> {
  await this.db.query(
    'UPDATE items SET requests_paused = $2 WHERE id = $1',
    [itemId, paused],
  );
}
```

No se requiere transacción — es un UPDATE simple sobre un campo independiente.

### Capa de Aplicación

**`src/application/dtos/pause-item.dto.ts`:**
```typescript
export interface PauseItemResponseDto {
  requestsPaused: boolean;
}
```

**`src/application/use-cases/item/pause-item.use-case.ts`:**
```typescript
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { ConflictException } from '../../../domain/exceptions/conflict.exception';
import { PauseItemResponseDto } from '../../dtos/pause-item.dto';

export class PauseItemUseCase {
  constructor(private readonly itemRepo: IItemRepository) {}

  async execute(itemId: string, userId: string, paused: boolean): Promise<PauseItemResponseDto> {
    const item = await this.itemRepo.findItemOwnership(itemId);
    if (!item) throw new NotFoundException('Object not found');
    if (item.donorId !== userId) throw new ForbiddenException('Forbidden');
    if (item.status !== 'active') throw new ConflictException('Item is not in active status');
    await this.itemRepo.setPauseStatus(itemId, paused);
    return { requestsPaused: paused };
  }
}
```

`ForbiddenException` fue creada en historia 2.4 — ya existe en `src/domain/exceptions/forbidden.exception.ts`.

### Validator — `pause-item.validator.ts`

Usar el mismo patrón Zod que los validators existentes (`publish-item.validator.ts`, `list-items.validator.ts`):

```typescript
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

const pauseItemSchema = z.object({
  paused: z.boolean(),
});

export function validatePauseItemBody(req: Request, res: Response, next: NextFunction): void {
  const result = pauseItemSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request body', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
```

**Nota:** `z.boolean()` rechaza strings como `"true"` — acepta solo `true`/`false` JSON. Esto es correcto para este endpoint.

### Capa de Interfaces

**`src/interfaces/http/controllers/item.controller.ts`** — añadir `pauseItemUseCase` como 5.º parámetro:

```typescript
import { PauseItemUseCase } from '../../../application/use-cases/item/pause-item.use-case';

export class ItemController {
  constructor(
    private readonly publishItemUseCase: PublishItemUseCase,
    private readonly listItemsUseCase: ListItemsUseCase,
    private readonly getItemUseCase: GetItemUseCase,
    private readonly cancelItemUseCase: CancelItemUseCase,
    private readonly pauseItemUseCase: PauseItemUseCase,  // añadir
  ) {}

  // publishItem, listItems, getItem, cancelItem — sin cambios

  async pauseItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.pauseItemUseCase.execute(
        req.params.id,
        req.currentUser!.id,
        req.body.paused,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
```

**`src/interfaces/http/routes/items.routes.ts`** — cambios:

1. Importar `PauseItemUseCase` y `validatePauseItemBody`:
```typescript
import { PauseItemUseCase } from '../../../application/use-cases/item/pause-item.use-case';
import { validatePauseItemBody } from '../../validators/pause-item.validator';
```

2. Instanciar y pasar al constructor (dentro de `createItemRouter`):
```typescript
const pauseItemUseCase = new PauseItemUseCase(itemRepo);
const controller = new ItemController(
  publishItemUseCase,
  listItemsUseCase,
  getItemUseCase,
  cancelItemUseCase,
  pauseItemUseCase,
);
```

3. Añadir ruta `PATCH /:id/pause` **después de** `DELETE /:id`:
```typescript
router.patch(
  '/:id/pause',
  authMiddleware,
  validateUuidParam('id'),
  validatePauseItemBody,
  (req, res, next) => controller.pauseItem(req, res, next),
);
```

**Orden final de rutas en el router:**
- `GET /` — listar
- `GET /:id` — detalle (añadido en 2.3)
- `POST /` — publicar
- `DELETE /:id` — cancelar (añadido en 2.4)
- `PATCH /:id/pause` — pausar/reanudar (añadir)

**Por qué `PATCH /:id/pause` no conflicta con `GET /:id`:** son métodos HTTP distintos Y caminos distintos (`:id` tiene un segmento, `:id/pause` tiene dos). Express los discrimina correctamente.

### Tests — `tests/items-pause.test.ts`

Mismo patrón `buildTestApp` con `createItemRouter(deps)`.

**Mock de `itemRepo` completo** (defaults para este archivo):
```typescript
const ITEM_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_UUID = '11111111-2222-4333-8444-555555555555';

const defaultItemRepo = {
  createWithImages: vi.fn(),
  findActiveInRadius: vi.fn(),
  findById: vi.fn(),
  findItemOwnership: vi.fn().mockResolvedValue({ donorId: USER_UUID, status: 'active' }),
  hasActiveDeliverySession: vi.fn().mockResolvedValue(false),
  cancelItem: vi.fn(),
  setPauseStatus: vi.fn().mockResolvedValue(undefined),
};
```

**Casos de prueba (9):**

| # | Test | Mock override | Esperado |
|---|------|--------------|----------|
| 12.1 | PATCH /items/:id/pause `{ paused: true }` | default (status: 'active', donor) | 200 `{ requestsPaused: true }` |
| 12.2 | PATCH /items/:id/pause `{ paused: false }` | default | 200 `{ requestsPaused: false }` |
| 12.3 | No es el donante | `findItemOwnership → { donorId: 'otro', status: 'active' }` | 403 |
| 12.4 | Item no existe | `findItemOwnership → null` | 404 |
| 12.5 | Sin token de autenticación | — | 401 |
| 12.6 | UUID inválido (`/items/not-a-uuid/pause`) | — | 400 |
| 12.7 | Item no está en estado `active` | `findItemOwnership → { donorId: USER_UUID, status: 'cancelled' }` | 409 |
| 12.8 | Campo `paused` ausente en body | — | 400 |
| 12.9 | `paused` es string en lugar de boolean | body: `{ paused: "true" }` | 400 |

**Ejemplo test 12.1:**
```typescript
it('12.1 — PATCH /items/:id/pause { paused: true } → 200', async () => {
  const { app, itemRepo } = buildTestApp();
  const res = await request(app)
    .patch(`/items/${ITEM_UUID}/pause`)
    .set('Authorization', 'Bearer mock-jwt-token')
    .send({ paused: true });

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ requestsPaused: true });
  expect(itemRepo.setPauseStatus).toHaveBeenCalledWith(ITEM_UUID, true);
});
```

**Ejemplo test 12.7 (409 not active):**
```typescript
it('12.7 — Item no activo → 409', async () => {
  const { app } = buildTestApp({
    itemRepo: {
      ...defaultItemRepo,
      findItemOwnership: vi.fn().mockResolvedValue({ donorId: USER_UUID, status: 'cancelled' }),
    },
  });
  const res = await request(app)
    .patch(`/items/${ITEM_UUID}/pause`)
    .set('Authorization', 'Bearer mock-jwt-token')
    .send({ paused: true });

  expect(res.status).toBe(409);
});
```

**Ejemplo test 12.8 (400 body inválido):**
```typescript
it('12.8 — paused ausente → 400', async () => {
  const { app } = buildTestApp();
  const res = await request(app)
    .patch(`/items/${ITEM_UUID}/pause`)
    .set('Authorization', 'Bearer mock-jwt-token')
    .send({});  // sin paused

  expect(res.status).toBe(400);
});
```

### Actualización de mocks en tests existentes

**Cada** archivo de test que use `createItemRouter(deps)` con mock de `itemRepo` necesita:
1. **Añadir** `setPauseStatus: vi.fn()` al mock
2. **Actualizar** el valor de retorno de `findItemOwnership` para incluir `status` (puede ser cualquier string — el test no lo usa)

Archivos afectados:
- `tests/items-list.test.ts` — añadir `setPauseStatus: vi.fn()`, actualizar `findItemOwnership` mock si existe
- `tests/items-publish.test.ts` — ídem
- `tests/items-get.test.ts` — ídem
- `tests/items-cancel.test.ts` — añadir `setPauseStatus: vi.fn()` y actualizar mock de `findItemOwnership` para que retorne `{ donorId: USER_UUID, status: 'active' }` en el default

**Por qué es obligatorio:** `IItemRepository` ahora tiene `setPauseStatus`. TypeScript rechazará cualquier objeto que no lo implemente. Sin estas actualizaciones, los tests de historias anteriores fallarán con error de tipo.

### Nota para Historia 3.1 (FR13)

Historia 3.1 (`POST /items/:id/requests`) **debe** incluir en su `RequestItemUseCase` la verificación:
```typescript
if (item.requestsPaused) throw new ConflictException('Requests are paused for this item');
```
El campo `requests_paused` existe en la tabla `items` desde el schema inicial (Historia 1.1). Historia 2.5 gestiona su valor via PATCH. Historia 3.1 lo lee. Este acoplamiento está documentado para evitar que se omita en el siguiente story.

### Project Structure Notes

- `src/application/dtos/pause-item.dto.ts` — archivo nuevo
- `src/application/use-cases/item/pause-item.use-case.ts` — archivo nuevo
- `src/interfaces/validators/pause-item.validator.ts` — archivo nuevo
- `src/domain/repositories/item.repository.ts` — modificar interfaz existente + añadir método
- `src/infrastructure/database/supabase/item.repository.ts` — modificar método existente + añadir método
- `src/interfaces/http/controllers/item.controller.ts` — modificar constructor (5.º param) + añadir método
- `src/interfaces/http/routes/items.routes.ts` — añadir imports, instancia y ruta
- `tests/items-pause.test.ts` — archivo nuevo
- No se crea `ForbiddenException` — ya existe desde historia 2.4
- No se toca `delivery_sessions` ni `item_requests` — fuera del scope
- El campo `requests_paused` en `items` ya existe desde Historia 1.1 — no se modifica el schema

### Review Findings

- [x] [Review][Patch] `setPauseStatus` no verifica `rowCount` — retorna 200 silenciosamente si el item es eliminado entre `findItemOwnership` y el UPDATE (a diferencia de `cancelItem` que lanza NotFoundException) [src/infrastructure/database/supabase/item.repository.ts]

- [x] [Review][Defer] TOCTOU race: `findItemOwnership` y `setPauseStatus` son dos queries no atómicas sin transacción — un cancel concurrente puede actualizar `requests_paused` en un item ya no activo [src/application/use-cases/item/pause-item.use-case.ts] — deferred, pre-existing
- [x] [Review][Defer] `status: string` no tipado en `FindItemOwnershipResult` — comparación magic string `'active'` sin protección de compilación [src/domain/repositories/item.repository.ts:59] — deferred, pre-existing
- [x] [Review][Defer] `req.currentUser!` non-null assertion en controlador — produce TypeError en lugar de 401 si authMiddleware es reordenado [src/interfaces/http/controllers/item.controller.ts] — deferred, pre-existing
- [x] [Review][Defer] `setPauseStatus` SQL no actualiza `updated_at` — puede afectar auditoría si la columna existe sin trigger [src/infrastructure/database/supabase/item.repository.ts] — deferred, pre-existing
- [x] [Review][Defer] Validator sin `.strict()` — campos extra en el body son descartados silenciosamente [src/interfaces/validators/pause-item.validator.ts] — deferred, pre-existing

### References

- [Source: _bmad-output/initiative-backend/archive-v6/epics.md §Historia 2.5] — ACs de pausar/reanudar
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md §FR13] — Bloquear solicitudes si requests_paused = TRUE (Historia 3.1)
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md §FR14] — PATCH /items/:id/pause — activar/desactivar requests_paused
- [Source: docs/architecture.md §2, NFR5] — 403 genérico ante fallo de autorización
- [Source: docs/architecture.md §2, NFR3] — Validar UUID v4 antes del controlador
- [Source: docs/architecture.md §3.2] — Schema de items: campo `requests_paused BOOLEAN`
- [Source: src/domain/exceptions/forbidden.exception.ts] — ForbiddenException (creada en historia 2.4)
- [Source: src/interfaces/validators/publish-item.validator.ts] — Patrón Zod para validators de body
- [Source: src/interfaces/http/routes/items.routes.ts] — Factory `createItemRouter`, patrón actual del constructor
- [Source: _bmad-output/initiative-backend/tickets/epic-publicacion-y-gestion-de-objetos/tickets/story-cancelar-objeto-sin-sesion-activa-plan.md] — FindItemOwnershipResult original, patrón de CancelItemUseCase para referencia

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (bmad-create-story, 2026-05-06)

### Debug Log References

### Completion Notes List

- Task 1: `FindItemOwnershipResult` extendida con `status: string`. `setPauseStatus` añadido a `IItemRepository`.
- Task 2: SQL de `findItemOwnership` actualizado a `SELECT donor_id, status FROM items WHERE id = $1`. `setPauseStatus` implementado con `UPDATE items SET requests_paused = $2 WHERE id = $1`.
- Task 3: `PauseItemUseCase` implementa flujo: ownership check → forbidden check → status check ('active') → setPauseStatus → retorna `{ requestsPaused }`.
- Task 4: `validatePauseItemBody` con Zod — `z.boolean()` rechaza strings, acepta solo `true`/`false` JSON.
- Task 5: `ItemController` extendido con 5.º parámetro `pauseItemUseCase` y método `pauseItem`. Ruta `PATCH /:id/pause` añadida después de `DELETE /:id`.
- Task 6: 9 tests en `items-pause.test.ts` (200×2, 403, 404, 401, 400×3, 409). Mocks de los 4 test files existentes actualizados con `setPauseStatus: vi.fn()` y `findItemOwnership` retornando `{ donorId, status }`. `tsc --noEmit` limpio. `vitest run` 95/95 pasando.

### File List

- src/domain/repositories/item.repository.ts (modificado — añadir `status` a FindItemOwnershipResult + añadir `setPauseStatus` a IItemRepository)
- src/infrastructure/database/supabase/item.repository.ts (modificado — actualizar SQL de findItemOwnership + implementar setPauseStatus)
- src/application/dtos/pause-item.dto.ts (nuevo)
- src/application/use-cases/item/pause-item.use-case.ts (nuevo)
- src/interfaces/validators/pause-item.validator.ts (nuevo)
- src/interfaces/http/controllers/item.controller.ts (modificado — añadir pauseItemUseCase al constructor y método pauseItem)
- src/interfaces/http/routes/items.routes.ts (modificado — importar, instanciar PauseItemUseCase, extender constructor, añadir PATCH /:id/pause)
- tests/items-pause.test.ts (nuevo)
- tests/items-list.test.ts (modificado — mock itemRepo actualizado)
- tests/items-publish.test.ts (modificado — mock itemRepo actualizado)
- tests/items-get.test.ts (modificado — mock itemRepo actualizado)
- tests/items-cancel.test.ts (modificado — mock itemRepo actualizado)
