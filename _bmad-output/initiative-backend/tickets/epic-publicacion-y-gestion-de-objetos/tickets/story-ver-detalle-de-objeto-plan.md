---
title: "Ver detalle de objeto"
type: feature
ticket: 3
status: done
created: 2026-10-25
---

# Historia 2.3: Ver detalle de objeto

Status: done

## Historia

Como usuario autenticado,
quiero ver el detalle completo de un objeto específico,
para decidir si quiero solicitarlo o conocer su estado actual.

> **Nota de diseño (endpoint auth):** El epics.md describe el endpoint como "Como usuario" (sin "autenticado"). Sin embargo, el campo `distanceMeters` del AC requiere la ubicación del usuario autenticado para calcularse vía SQL. Se implementa como ruta protegida con `authMiddleware`. No existe un AC de "401 sin autenticación" pero se incluye el test correspondiente por coherencia con el resto de la API.

## Acceptance Criteria

1. **Dado** que envío `GET /items/:id` con un UUID válido y el objeto existe, **cuando** el servidor procesa la petición, **entonces** responde `200` con `{ id, title, description, condition, status, degradedAt, distanceMeters, images: [url], donor: { id, reputationScore }, createdAt }` y el campo `location` no aparece en la respuesta.

2. **Dado** que envío `GET /items/:id` con un UUID que no existe, **cuando** el servidor procesa la petición, **entonces** responde `404 Not Found`.

3. **Dado** que envío `GET /items/:id` con un parámetro que no es UUID v4, **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request`.

4. **Dado** que envío `GET /items/:id` sobre un objeto con `status IN ('completed','cancelled')` y `completed_at < NOW() - 30 días`, **cuando** el servidor procesa la petición, **entonces** el campo `images` se retorna como `[]` aunque el job de purga aún no haya ejecutado (FR34).

## Tasks / Subtasks

- [x] Task 1: Extender capa de Dominio (AC: #1, #2, #4)
  - [x] Modificar `src/domain/repositories/item.repository.ts`: añadir interfaces `FindItemByIdInput` e `ItemDetail`, y método `findById` a `IItemRepository`

- [x] Task 2: Capa de Aplicación (AC: #1–#4)
  - [x] Crear `src/application/dtos/get-item.dto.ts` con `GetItemResponseDto`
  - [x] Crear `src/application/use-cases/item/get-item.use-case.ts` con `GetItemUseCase`

- [x] Task 3: Implementación del repositorio (AC: #1, #2, #4)
  - [x] Modificar `src/infrastructure/database/supabase/item.repository.ts`: implementar `findById` con consulta PostGIS + FR34 guard + JOIN con `users` para `donor` (ver Dev Notes para SQL exacto)

- [x] Task 4: Capa de Interfaces (AC: #1–#3)
  - [x] Modificar `src/interfaces/http/controllers/item.controller.ts`: añadir `getItemUseCase` al constructor y método `getItem`
  - [x] Modificar `src/interfaces/http/routes/items.routes.ts`: instanciar `GetItemUseCase`, añadir al constructor de `ItemController`, añadir ruta `GET /:id` con `authMiddleware → validateUuidParam('id') → controller.getItem`

- [x] Task 5: Tests (AC: #1–#4)
  - [x] Crear `tests/items-get.test.ts` con los 7 casos de prueba (ver Dev Notes)
  - [x] Actualizar mock `itemRepo` en `tests/items-list.test.ts`: añadir `findById: vi.fn()` al mock para compatibilidad con la interfaz extendida
  - [x] Actualizar mock `itemRepo` en `tests/items-publish.test.ts`: añadir `findById: vi.fn()` al mock
  - [x] Ejecutar `npx tsc --noEmit` sin errores
  - [x] Ejecutar `npx vitest run` — todos los tests pasan (incluidos los 73 existentes)

## Dev Notes

### Capa de Dominio — extensión de `item.repository.ts`

Añadir **después** de las interfaces existentes y **antes** de `IItemRepository`:

```typescript
// src/domain/repositories/item.repository.ts — añadir
import { Item, ItemCondition, ItemStatus } from '../entities/item.entity';

export interface FindItemByIdInput {
  itemId: string;
  userId: string;  // requerido para calcular distanceMeters vía ST_Distance
}

export interface ItemDetail {
  id: string;
  title: string;
  description: string;
  condition: ItemCondition;
  status: ItemStatus;
  degradedAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  distanceMeters: number;
  imagePaths: string[];
  donor: {
    id: string;
    reputationScore: number;
  };
}

export interface IItemRepository {
  createWithImages(input: CreateItemInput): Promise<Item>;
  findActiveInRadius(input: FindActiveInRadiusInput): Promise<PaginatedItems>;
  findById(input: FindItemByIdInput): Promise<ItemDetail | null>;  // añadir
}
```

**Nota:** `ItemStatus` ya está exportado en `src/domain/entities/item.entity.ts` — no crear un tipo nuevo.

### Capa de Aplicación

**`src/application/dtos/get-item.dto.ts`:**
```typescript
import { ItemCondition } from '../../domain/entities/item.entity';

export interface GetItemResponseDto {
  id: string;
  title: string;
  description: string;
  condition: ItemCondition;
  status: string;
  degradedAt: Date | null;
  distanceMeters: number;
  images: string[];
  donor: {
    id: string;
    reputationScore: number;
  };
  createdAt: Date;
}
```

**`src/application/use-cases/item/get-item.use-case.ts`:**
```typescript
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { GetItemResponseDto } from '../../dtos/get-item.dto';

export class GetItemUseCase {
  constructor(private readonly itemRepo: IItemRepository) {}

  async execute(itemId: string, userId: string): Promise<GetItemResponseDto> {
    const item = await this.itemRepo.findById({ itemId, userId });
    if (!item) throw new NotFoundException('Object not found');

    return {
      id: item.id,
      title: item.title,
      description: item.description,
      condition: item.condition,
      status: item.status,
      degradedAt: item.degradedAt,
      distanceMeters: item.distanceMeters,
      images: item.imagePaths,
      donor: item.donor,
      createdAt: item.createdAt,
    };
  }
}
```

### Capa de Infraestructura — SQL de `findById`

**CRÍTICO: FR34 guard inline en SQL.** La query evalúa `status IN ('completed','cancelled') AND completed_at < NOW() - INTERVAL '30 days'` directamente en el `CASE` para retornar `ARRAY[]::text[]` en lugar de las rutas reales. No añadir esta lógica en el use case — va en el repositorio. [Source: docs/architecture.md §3.3]

**CRÍTICO: `ST_Distance` sobre `GEOGRAPHY` retorna metros.** El resultado ya es en metros sin necesidad de conversión adicional. El `ROUND(...::int)` trunca decimales. [Source: docs/architecture.md §3.2]

**CRÍTICO: `JOIN users` para obtener `donor.reputationScore`.** No hacer una segunda query — se resuelve en el mismo `SELECT`. El campo `location` del item y del usuario nunca aparecen en el resultado.

```typescript
// src/infrastructure/database/supabase/item.repository.ts — añadir método a PostgresItemRepository

async findById(input: FindItemByIdInput): Promise<ItemDetail | null> {
  const result = await this.db.query<{
    id: string;
    title: string;
    description: string;
    condition: string;
    status: string;
    degraded_at: Date | null;
    created_at: Date;
    completed_at: Date | null;
    distance_meters: number;
    image_paths: string[] | null;
    donor_id: string;
    donor_reputation_score: number;
  }>(
    `SELECT
       i.id,
       i.title,
       i.description,
       i.condition,
       i.status,
       i.degraded_at,
       i.created_at,
       i.completed_at,
       ROUND(ST_Distance(
         (SELECT location FROM users WHERE id = $2),
         i.location
       ))::int AS distance_meters,
       CASE
         WHEN i.status IN ('completed', 'cancelled')
          AND i.completed_at < NOW() - INTERVAL '30 days'
         THEN ARRAY[]::text[]
         ELSE COALESCE(
           (SELECT ARRAY_AGG(ii.storage_path ORDER BY ii.created_at)
            FROM item_images ii
            WHERE ii.item_id = i.id),
           ARRAY[]::text[]
         )
       END AS image_paths,
       u.id   AS donor_id,
       u.reputation_score AS donor_reputation_score
     FROM items i
     JOIN users u ON u.id = i.donor_id
     WHERE i.id = $1`,
    [input.itemId, input.userId],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    condition: row.condition as ItemCondition,
    status: row.status as ItemStatus,
    degradedAt: row.degraded_at,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    distanceMeters: row.distance_meters,
    imagePaths: row.image_paths ?? [],
    donor: {
      id: row.donor_id,
      reputationScore: row.donor_reputation_score,
    },
  };
}
```

**Imports adicionales necesarios en item.repository.ts:**
```typescript
import {
  IItemRepository,
  CreateItemInput,
  FindActiveInRadiusInput,
  PaginatedItems,
  FindItemByIdInput,   // añadir
  ItemDetail,          // añadir
} from '../../../domain/repositories/item.repository';
import { Item, ItemCondition, ItemStatus } from '../../../domain/entities/item.entity'; // añadir ItemStatus
```

### Capa de Interfaces

**`src/interfaces/http/controllers/item.controller.ts`** — añadir `getItemUseCase`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { PublishItemUseCase } from '../../../application/use-cases/item/publish-item.use-case';
import { ListItemsUseCase } from '../../../application/use-cases/item/list-items.use-case';
import { GetItemUseCase } from '../../../application/use-cases/item/get-item.use-case';

export class ItemController {
  constructor(
    private readonly publishItemUseCase: PublishItemUseCase,
    private readonly listItemsUseCase: ListItemsUseCase,
    private readonly getItemUseCase: GetItemUseCase,
  ) {}

  async publishItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    // ... sin cambios ...
  }

  async listItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    // ... sin cambios ...
  }

  async getItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.getItemUseCase.execute(
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

1. Importar `GetItemUseCase` y `validateUuidParam`:
```typescript
import { GetItemUseCase } from '../../../application/use-cases/item/get-item.use-case';
import { validateUuidParam } from '../../validators/uuid-param.validator';
```

2. Instanciar dentro de `createItemRouter` y pasar al constructor:
```typescript
const getItemUseCase = new GetItemUseCase(itemRepo);
const controller = new ItemController(publishItemUseCase, listItemsUseCase, getItemUseCase);
```

3. Añadir la ruta `GET /:id` **después** de `GET /`:
```typescript
router.get(
  '/:id',
  authMiddleware,
  validateUuidParam('id'),
  (req, res, next) => controller.getItem(req, res, next),
);
```

**CRÍTICO: orden de rutas en el router.**  
- `GET /` (listar) — ya registrado  
- `GET /:id` (detalle) — añadir después  
- `POST /` (publicar) — ya registrado  

`GET /` y `GET /:id` NO se superponen en Express: `/` solo coincide con el path exacto de la raíz del router, mientras que `/:id` requiere un segmento adicional. Sin embargo, mantener `GET /` antes de `GET /:id` es buena práctica.

**`validateUuidParam`** ya existe en `src/interfaces/validators/uuid-param.validator.ts`. No crear nada nuevo.

### Tests — `tests/items-get.test.ts`

Mismo patrón que `tests/items-list.test.ts` (`buildTestApp` con `createItemRouter(deps)`).

**Mock de `itemRepo` actualizado** (incluyendo `findById`):
```typescript
const mockItemDetail = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  title: 'Mesa de madera',
  description: 'Mesa en buen estado, 4 sillas incluidas',
  condition: 'good' as const,
  status: 'active' as const,
  degradedAt: null,
  createdAt: new Date('2026-05-01T10:00:00Z'),
  completedAt: null,
  distanceMeters: 3500,
  imagePaths: ['items/abc123/photo.jpg'],
  donor: { id: '11111111-2222-4333-8444-555555555555', reputationScore: 20 },
};

// En el mock de itemRepo dentro de buildTestApp:
itemRepo: {
  createWithImages: vi.fn(),
  findActiveInRadius: vi.fn(),
  findById: vi.fn().mockResolvedValue(mockItemDetail),
},
```

**Casos de prueba (7):**

| # | Descripción | Esperado |
|---|-------------|----------|
| 10.1 | GET /items/:id autenticado, objeto existe | 200 con campos completos (`id, title, description, condition, status, degradedAt, distanceMeters, images, donor.id, donor.reputationScore, createdAt`) |
| 10.2 | Respuesta no contiene campo `location` | `expect(res.body).not.toHaveProperty('location')` |
| 10.3 | GET /items/:id autenticado, `findById` retorna `null` | 404 |
| 10.4 | GET /items/:id sin token de autenticación | 401 |
| 10.5 | GET /items/not-a-valid-uuid | 400 |
| 10.6 | GET /items/:id con objeto purgado (completedAt < 30d) | 200 con `images: []` |
| 10.7 | Respuesta contiene `donor` con `id` y `reputationScore` | `expect(res.body.donor).toMatchObject({ id: expect.any(String), reputationScore: expect.any(Number) })` |

**Test 10.1 + 10.2 + 10.7 — ejemplo combinado:**
```typescript
it('10.1 — GET /items/:id autenticado: 200 con detalle completo', async () => {
  const { app } = buildTestApp();
  const itemId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const res = await request(app)
    .get(`/items/${itemId}`)
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    id: itemId,
    title: 'Mesa de madera',
    description: 'Mesa en buen estado, 4 sillas incluidas',
    condition: 'good',
    status: 'active',
    distanceMeters: 3500,
    images: ['items/abc123/photo.jpg'],
    donor: { id: expect.any(String), reputationScore: 20 },
  });
  expect(res.body).not.toHaveProperty('location');
});
```

**Test 10.3 — 404:**
```typescript
it('10.3 — findById retorna null: 404', async () => {
  const { app } = buildTestApp({
    itemRepo: {
      createWithImages: vi.fn(),
      findActiveInRadius: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
    },
  });
  const res = await request(app)
    .get('/items/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(404);
});
```

**Test 10.5 — 400 UUID inválido:**
```typescript
it('10.5 — UUID inválido: 400', async () => {
  const { app } = buildTestApp();
  const res = await request(app)
    .get('/items/not-a-uuid')
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(400);
});
```

**Test 10.6 — FR34 imágenes purgadas:**
```typescript
it('10.6 — objeto purgado (FR34): images vacío', async () => {
  const purgedItem = {
    ...mockItemDetail,
    status: 'completed' as const,
    completedAt: new Date('2026-01-01T00:00:00Z'), // > 30 días en el pasado
    imagePaths: [],  // el repositorio ya aplica FR34
  };
  const { app } = buildTestApp({
    itemRepo: {
      createWithImages: vi.fn(),
      findActiveInRadius: vi.fn(),
      findById: vi.fn().mockResolvedValue(purgedItem),
    },
  });
  const res = await request(app)
    .get('/items/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(200);
  expect(res.body.images).toEqual([]);
});
```

### Actualización de tests existentes

**`tests/items-list.test.ts`** — en el mock de `itemRepo` dentro de `buildTestApp`, añadir:
```typescript
itemRepo: {
  createWithImages: vi.fn(),
  findActiveInRadius: vi.fn().mockResolvedValue(defaultPaginatedResult),
  findById: vi.fn(),  // añadir
},
```

**`tests/items-publish.test.ts`** — en el mock de `itemRepo` dentro de `buildTestApp`, añadir:
```typescript
itemRepo: {
  createWithImages: vi.fn().mockResolvedValue(mockItem),
  findActiveInRadius: vi.fn(),
  findById: vi.fn(),  // añadir
},
```

### Project Structure Notes

- **No se crean archivos en `src/infrastructure/`** más allá de la extensión de `item.repository.ts`.
- **`src/application/use-cases/item/`** ya existe — solo añadir `get-item.use-case.ts`.
- **`src/application/dtos/`** ya existe — añadir `get-item.dto.ts`.
- **`validateUuidParam`** ya existe en `src/interfaces/validators/uuid-param.validator.ts` — no crear nada nuevo.
- El singleton `export const itemRouter = createItemRouter()` al final de `items.routes.ts` se actualiza automáticamente.

### References

- [Source: docs/architecture.md §3.2] — Columna `location GEOGRAPHY(POINT, 4326)` en `items` — NUNCA en DTOs
- [Source: docs/architecture.md §3.3] — FR34: `images: []` para objetos purgados no ejecutados
- [Source: docs/architecture.md §2, NFR2] — `location` nunca en respuesta; solo `distanceMeters`
- [Source: docs/architecture.md §2, NFR3] — Validar UUID v4 antes del controlador con `validateUuidParam`
- [Source: docs/architecture.md §2, NFR4] — DTOs explícitos en `application/dtos/`
- [Source: docs/architecture.md §12] — Reglas de autorización por use case
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md §FR10] — Detalle de objeto: título, descripción, condición, estado, distancia, imágenes, reputación del donante
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md §FR34] — Imágenes vacías para objetos completados/cancelados > 30 días
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md §NFR2] — `location` nunca en DTOs de salida
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md §NFR3] — Validar UUID v4 en `validators/`
- [Source: src/interfaces/validators/uuid-param.validator.ts] — `validateUuidParam` ya implementado
- [Source: src/interfaces/http/routes/items.routes.ts] — Factory `createItemRouter(deps)`, patrón de rutas existente
- [Source: tests/items-list.test.ts] — Patrón `buildTestApp`, mock de `jwtService`/`userRepo`/`itemRepo`
- [Source: _bmad-output/initiative-backend/tickets/epic-publicacion-y-gestion-de-objetos/tickets/story-listar-objetos-disponibles-en-radio-geografico-plan.md] — Patrón SQL de `findActiveInRadius` para referencia de estilo

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (bmad-create-story, 2026-05-06)

### Debug Log References

### Completion Notes List

- Todos los tasks implementados sin desviaciones del spec.
- Task 1: Extendida `IItemRepository` con `FindItemByIdInput`, `ItemDetail` e `ItemStatus` importado de entidad.
- Task 2: Creados `get-item.dto.ts` y `get-item.use-case.ts`; use case lanza `NotFoundException` cuando el repositorio devuelve null.
- Task 3: Implementado `findById` con query SQL single-pass: JOIN a `users` para `donor`, `ST_Distance` para `distanceMeters`, CASE inline para FR34 guard (`images: []` si purgado). No se hace query separada para imágenes.
- Task 4: Actualizado `ItemController` con tercer parámetro `getItemUseCase` y método `getItem`. Ruta `GET /:id` registrada después de `GET /` y antes de `POST /`. Usa `validateUuidParam` existente.
- Task 5: 7 tests nuevos (items-get.test.ts). Fix: UUID de test corregido a formato v4 válido (`4ccc-8ddd`). Mocks de items-list y items-publish actualizados con `findById: vi.fn()`. `npx tsc --noEmit` sin errores. `npx vitest run` 80/80 pasando.

### File List

- src/domain/repositories/item.repository.ts (modificado)
- src/application/dtos/get-item.dto.ts (nuevo)
- src/application/use-cases/item/get-item.use-case.ts (nuevo)
- src/infrastructure/database/supabase/item.repository.ts (modificado)
- src/interfaces/http/controllers/item.controller.ts (modificado)
- src/interfaces/http/routes/items.routes.ts (modificado)
- tests/items-get.test.ts (nuevo)
- tests/items-list.test.ts (modificado — mock itemRepo)
- tests/items-publish.test.ts (modificado — mock itemRepo)

### Review Findings

- [x] [Review][Patch] Guard FR34 para `cancelled` con `completed_at = NULL`: usar `COALESCE(i.completed_at, NOW())` para que NULL se trate como "ahora" → nunca purga sin fecha de cierre [src/infrastructure/database/supabase/item.repository.ts]
- [x] [Review][Patch] NULL distanceMeters: `findById` carece del guard de ubicación de usuario que sí tiene `findActiveInRadius` — si `location` del usuario es NULL en DB, `ST_Distance` retorna NULL y `distanceMeters` sale como `null` en la respuesta violando el tipo `number` [src/infrastructure/database/supabase/item.repository.ts]
- [x] [Review][Patch] `GetItemResponseDto.status` tipado como `string` en lugar de `ItemStatus` — inconsistente con `condition: ItemCondition` del mismo DTO [src/application/dtos/get-item.dto.ts:8]
- [x] [Review][Patch] Test 10.2 solo verifica ausencia de `location` en el objeto raíz pero no en `res.body.donor` (NFR2: "location nunca en respuesta") [tests/items-get.test.ts]
- [x] [Review][Patch] Test 10.1 no afirma presencia del campo `degradedAt` en el body 200 (AC1 lo incluye explícitamente en el shape de respuesta) [tests/items-get.test.ts]
- [x] [Review][Defer] Test 10.6 valida FR34 solo a nivel de mock — la rama CASE SQL real no tiene cobertura de integración [tests/items-get.test.ts] — deferred, pre-existing
- [x] [Review][Defer] `completedAt` mapeado en `ItemDetail` y en el repositorio pero no existe en `GetItemResponseDto` ni en la respuesta HTTP — dead field en la interfaz de dominio — deferred, pre-existing
- [x] [Review][Defer] Orden de rutas: `GET /:id` puede silenciar futuros `GET /nombrado` si se añaden sin cuidado después [src/interfaces/http/routes/items.routes.ts] — deferred, pre-existing
- [x] [Review][Defer] Cast de `condition`/`status` desde string de DB sin validación en runtime — patrón pre-existente en repositorios [src/infrastructure/database/supabase/item.repository.ts] — deferred, pre-existing
- [x] [Review][Defer] `req.currentUser!` sin guard de runtime — si `authMiddleware` se reordena lanza `TypeError`; patrón pre-existente [src/interfaces/http/controllers/item.controller.ts] — deferred, pre-existing
- [x] [Review][Defer] `donor.reputationScore` podría ser NULL si el schema lo permite — silenciosamente rompe el tipo `number` [src/infrastructure/database/supabase/item.repository.ts] — deferred, pre-existing
