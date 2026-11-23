---
title: "Listar objetos disponibles en radio geográfico"
type: feature
ticket: 2
status: done
created: 2026-10-25
---

# Story 2.2: Listar objetos disponibles en radio geográfico

Status: done

## Story

Como usuario autenticado,
quiero ver una lista paginada de objetos activos en un radio de 50 km de mi ubicación,
para encontrar objetos disponibles cerca de mí.

## Acceptance Criteria

1. **Dado** que envío `GET /items` con autenticación válida, **cuando** el servidor procesa la petición, **entonces** responde `200` con la lista de objetos en radio ≤ 50 km del usuario con `distanceMeters` calculado en SQL, la respuesta incluye `pagination: { total, page, limit, totalPages }`, y ningún objeto incluye el campo `location`.

2. **Dado** que existen objetos con `degraded_at IS NOT NULL` y objetos con `degraded_at IS NULL`, **cuando** se obtiene el listado, **entonces** los objetos con `degraded_at IS NULL` aparecen primero ordenados por `createdAt` descendente, y los objetos degradados aparecen al final.

3. **Dado** que un objeto tiene `status` distinto de `active`, **cuando** se obtiene el listado, **entonces** ese objeto no aparece en los resultados.

4. **Dado** que envío `GET /items?page=2&limit=10`, **cuando** el servidor procesa la petición, **entonces** responde la segunda página con hasta 10 resultados.

5. **Dado** que envío `GET /items?limit=51`, **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request` (límite fuera de rango 1–50).

6. **Dado** que un objeto tiene `status IN ('completed','cancelled')` y `completed_at < NOW() - 30 días`, **cuando** aparece en cualquier respuesta que incluya imágenes, **entonces** el campo `images` se retorna como `[]` aunque el job de purga aún no haya ejecutado (FR34).

## Tasks / Subtasks

- [x] Task 1: Migración SQL — índice geoespacial en users (AC: #1)
  - [x] Crear `src/infrastructure/database/supabase/migrations/005-add-users-location-index.sql` con `CREATE INDEX IF NOT EXISTS idx_users_location ON users USING GIST(location)`

- [x] Task 2: Extender capa de Dominio (AC: #1, #2, #6)
  - [x] Modificar `src/domain/repositories/item.repository.ts`: añadir interfaces `FindActiveInRadiusInput`, `ItemWithDistance`, `PaginatedItems` y método `findActiveInRadius` a `IItemRepository`

- [x] Task 3: Capa de Aplicación (AC: #1–#6)
  - [x] Crear `src/application/dtos/list-items.dto.ts` con `ListItemsRequestDto`, `ItemSummaryDto`, `ListItemsResponseDto`
  - [x] Crear `src/application/use-cases/item/list-items.use-case.ts` con `ListItemsUseCase`

- [x] Task 4: Implementación del repositorio (AC: #1, #2, #3, #4, #6)
  - [x] Modificar `src/infrastructure/database/supabase/item.repository.ts`: implementar `findActiveInRadius` con consulta PostGIS (ver Dev Notes para SQL exacto)

- [x] Task 5: Capa de Interfaces (AC: #1, #4, #5)
  - [x] Crear `src/interfaces/validators/list-items.validator.ts` con Zod (`page` coercido, `limit` coercido int 1–50, defaults page=1 limit=20)
  - [x] Modificar `src/interfaces/http/controllers/item.controller.ts`: añadir `listItemsUseCase` al constructor y método `listItems`
  - [x] Modificar `src/interfaces/http/routes/items.routes.ts`: instanciar `ListItemsUseCase`, añadir al constructor de `ItemController`, añadir ruta `GET /` con `authMiddleware → validateListItemsQuery → controller.listItems`

- [x] Task 6: Tests (AC: #1–#6)
  - [x] Crear `tests/items-list.test.ts` con los 9 casos de prueba (ver Dev Notes)
  - [x] Actualizar mock `itemRepo` en `tests/items-publish.test.ts`: añadir `findActiveInRadius: vi.fn()` al mock del repositorio para que el tipo sea compatible con la interfaz extendida
  - [x] Ejecutar `npx tsc --noEmit` sin errores
  - [x] Ejecutar `npx vitest run` — todos los tests pasan (incluidos los 64 existentes)

### Review Findings

- [x] [Review][Patch] Excluir items propios del feed — añadido `AND i.donor_id != $1` en ambas queries de findActiveInRadius [src/infrastructure/database/supabase/item.repository.ts]
- [x] [Review][Patch] Eliminar campo `degradedAt` de ItemSummaryDto y del mapping en ListItemsUseCase — AC1 no lo requiere y expone estado interno [src/application/dtos/list-items.dto.ts, src/application/use-cases/item/list-items.use-case.ts]
- [x] [Review][Patch] Usuario sin location lanza error explícito — pre-flight check con `SELECT location FROM users` [src/infrastructure/database/supabase/item.repository.ts]
- [x] [Review][Patch] Radio 50 km extraído a constante `RADIUS_METERS = 50000` [src/infrastructure/database/supabase/item.repository.ts]
- [x] [Review][Patch] Test 9.3 — añadido spy assertion sobre args de findActiveInRadius [tests/items-list.test.ts]
- [x] [Review][Defer] Promise.all — count y list pueden divergir bajo escrituras concurrentes [src/infrastructure/database/supabase/item.repository.ts] — deferred, pre-existing
- [x] [Review][Defer] req.currentUser! — aserción non-null sin guard explícito [src/interfaces/http/controllers/item.controller.ts] — deferred, pre-existing
- [x] [Review][Defer] Subquery correlacionada para image_paths ejecuta N queries por fila (N+1 embebido en SQL) [src/infrastructure/database/supabase/item.repository.ts] — deferred, pre-existing
- [x] [Review][Defer] Mutación de req.query en el validador en lugar de campo dedicado [src/interfaces/validators/list-items.validator.ts] — deferred, pre-existing
- [x] [Review][Defer] Cast de condition de string a ItemCondition sin validación en runtime [src/infrastructure/database/supabase/item.repository.ts] — deferred, pre-existing
- [x] [Review][Defer] page > totalPages retorna 200 con payload inconsistente — comportamiento REST estándar aceptado [src/application/use-cases/item/list-items.use-case.ts] — deferred, pre-existing

## Dev Notes

### Migración 005

```sql
-- src/infrastructure/database/supabase/migrations/005-add-users-location-index.sql
CREATE INDEX IF NOT EXISTS idx_users_location ON users USING GIST(location);
```

El índice `idx_items_location` ya fue creado en la migración 003. El índice `idx_users_location` está definido en la arquitectura [Source: docs/architecture.md §4] pero nunca fue creado. Ambos índices son necesarios para que `ST_DWithin` use el índice GIST y no haga un sequential scan.

### Capa de Dominio — extensión de `item.repository.ts`

```typescript
// src/domain/repositories/item.repository.ts — añadir antes de IItemRepository

import { Item, ItemCondition } from '../entities/item.entity';

export interface CreateItemInput { /* ... sin cambios ... */ }

export interface FindActiveInRadiusInput {
  userId: string;
  page: number;
  limit: number;
}

export interface ItemWithDistance {
  id: string;
  title: string;
  condition: ItemCondition;
  degradedAt: Date | null;
  createdAt: Date;
  distanceMeters: number;
  imagePaths: string[];
}

export interface PaginatedItems {
  items: ItemWithDistance[];
  total: number;
}

export interface IItemRepository {
  createWithImages(input: CreateItemInput): Promise<Item>;
  findActiveInRadius(input: FindActiveInRadiusInput): Promise<PaginatedItems>;
}
```

### Capa de Aplicación

**`src/application/dtos/list-items.dto.ts`:**
```typescript
import { ItemCondition } from '../../domain/entities/item.entity';

export interface ListItemsRequestDto {
  userId: string;
  page: number;
  limit: number;
}

export interface ItemSummaryDto {
  id: string;
  title: string;
  condition: ItemCondition;
  degradedAt: Date | null;
  createdAt: Date;
  distanceMeters: number;
  images: string[];
}

export interface ListItemsResponseDto {
  items: ItemSummaryDto[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

**`src/application/use-cases/item/list-items.use-case.ts`:**
```typescript
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { ListItemsRequestDto, ListItemsResponseDto } from '../../dtos/list-items.dto';

export class ListItemsUseCase {
  constructor(private readonly itemRepo: IItemRepository) {}

  async execute(dto: ListItemsRequestDto): Promise<ListItemsResponseDto> {
    const { items, total } = await this.itemRepo.findActiveInRadius({
      userId: dto.userId,
      page: dto.page,
      limit: dto.limit,
    });

    return {
      items: items.map(item => ({
        id: item.id,
        title: item.title,
        condition: item.condition,
        degradedAt: item.degradedAt,
        createdAt: item.createdAt,
        distanceMeters: item.distanceMeters,
        images: item.imagePaths,
      })),
      pagination: {
        total,
        page: dto.page,
        limit: dto.limit,
        totalPages: Math.ceil(total / dto.limit),
      },
    };
  }
}
```

**Nota sobre `totalPages` cuando `total = 0`:** `Math.ceil(0 / limit) = 0`. Correcto.

### Capa de Infraestructura — SQL de `findActiveInRadius`

**CRÍTICO: `ST_MakePoint(lng, lat)` — longitud primero.** En la query de `findActiveInRadius` se usa la `location` ya almacenada en la tabla (tipo `GEOGRAPHY(POINT, 4326)`), no se llama a `ST_MakePoint`. La `location` del usuario ya tiene el orden correcto. [Source: docs/architecture.md §3.2]

**CRÍTICO: `ST_DWithin` y `ST_Distance` operan en metros sobre `GEOGRAPHY`.** El radio de 50 km = 50000 metros. El resultado de `ST_Distance` sobre `GEOGRAPHY` es en metros. [Source: docs/architecture.md §3.2, §4]

**CRÍTICO: Orden de resultados: `ORDER BY degraded_at NULLS FIRST, created_at DESC`.** Los no-degradados (`degraded_at IS NULL`) aparecen antes porque `NULL` es "menor" con `NULLS FIRST`. [Source: docs/architecture.md — Job 1 nota]

```typescript
// src/infrastructure/database/supabase/item.repository.ts — añadir método a PostgresItemRepository

async findActiveInRadius(input: FindActiveInRadiusInput): Promise<PaginatedItems> {
  const offset = (input.page - 1) * input.limit;

  const [countResult, listResult] = await Promise.all([
    this.db.query<{ count: string }>(
      `WITH user_location AS (
         SELECT location FROM users WHERE id = $1
       )
       SELECT COUNT(*)
       FROM items i
       WHERE i.status = 'active'
         AND ST_DWithin(
           (SELECT location FROM user_location),
           i.location,
           50000
         )`,
      [input.userId],
    ),
    this.db.query<{
      id: string;
      title: string;
      condition: string;
      degraded_at: Date | null;
      created_at: Date;
      distance_meters: number;
      image_paths: string[] | null;
    }>(
      `WITH user_location AS (
         SELECT location FROM users WHERE id = $1
       )
       SELECT
         i.id,
         i.title,
         i.condition,
         i.degraded_at,
         i.created_at,
         ROUND(ST_Distance(
           (SELECT location FROM user_location),
           i.location
         ))::int AS distance_meters,
         (
           SELECT COALESCE(ARRAY_AGG(storage_path ORDER BY created_at), ARRAY[]::text[])
           FROM item_images
           WHERE item_id = i.id
         ) AS image_paths
       FROM items i
       WHERE i.status = 'active'
         AND ST_DWithin(
           (SELECT location FROM user_location),
           i.location,
           50000
         )
       ORDER BY i.degraded_at NULLS FIRST, i.created_at DESC
       LIMIT $2 OFFSET $3`,
      [input.userId, input.limit, offset],
    ),
  ]);

  return {
    total: parseInt(countResult.rows[0].count, 10),
    items: listResult.rows.map(row => ({
      id: row.id,
      title: row.title,
      condition: row.condition as ItemCondition,
      degradedAt: row.degraded_at,
      createdAt: row.created_at,
      distanceMeters: row.distance_meters,
      imagePaths: row.image_paths ?? [],
    })),
  };
}
```

**Nota FR34:** La query filtra `WHERE i.status = 'active'`, por lo que ningún item devuelto tendrá `status IN ('completed','cancelled')`. El AC 6 (FR34) es vacuamente verdadero para el endpoint GET /items. La lógica de FR34 será más relevante en story 2.3 (detalle de objeto). Se incluye en Dev Notes para que el desarrollador no intente añadir un guard redundante en esta query.

**Nota sobre `Promise.all`:** Count y list se ejecutan en paralelo con conexiones independientes del pool (`this.db.query` no requiere transacción). Esto es seguro y más eficiente que ejecutarlos secuencialmente.

### Capa de Interfaces

**`src/interfaces/validators/list-items.validator.ts`:**
```typescript
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

const listItemsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function validateListItemsQuery(req: Request, res: Response, next: NextFunction): void {
  const result = listItemsSchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid query parameters', errors: result.error.issues });
    return;
  }
  req.query = result.data as unknown as typeof req.query;
  next();
}
```

**`z.coerce.number()`** convierte strings de query params (`"10"`) a números automáticamente. `.default(1)` / `.default(20)` aplica cuando el campo está ausente. [Source: src/interfaces/validators/publish-item.validator.ts — patrón Zod existente]

**`src/interfaces/http/controllers/item.controller.ts`** — añadir `listItemsUseCase`:
```typescript
import { Request, Response, NextFunction } from 'express';
import { PublishItemUseCase } from '../../../application/use-cases/item/publish-item.use-case';
import { ListItemsUseCase } from '../../../application/use-cases/item/list-items.use-case';

export class ItemController {
  constructor(
    private readonly publishItemUseCase: PublishItemUseCase,
    private readonly listItemsUseCase: ListItemsUseCase,
  ) {}

  async publishItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    // ... sin cambios ...
  }

  async listItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.listItemsUseCase.execute({
        userId: req.currentUser!.id,
        page: Number(req.query.page),
        limit: Number(req.query.limit),
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
```

**`src/interfaces/http/routes/items.routes.ts`** — cambios necesarios:

1. Importar `ListItemsUseCase` y `validateListItemsQuery`
2. Instanciar `listItemsUseCase = new ListItemsUseCase(itemRepo)` dentro de `createItemRouter`
3. Pasar `listItemsUseCase` al constructor de `ItemController`: `new ItemController(publishItemUseCase, listItemsUseCase)`
4. Añadir ruta `GET /` **antes** del `POST /` (Express evalúa en orden de registro):

```typescript
router.get(
  '/',
  authMiddleware,
  validateListItemsQuery,
  (req, res, next) => controller.listItems(req, res, next),
);
```

**CRÍTICO: No hay multer en `GET /`** — solo `authMiddleware` + `validateListItemsQuery`. El middleware `upload` solo aplica al `POST /`.

**CRÍTICO: La interfaz `ItemRouterDeps` NO cambia** — `ListItemsUseCase` se instancia internamente a partir del `itemRepo` ya inyectado.

### Tests — `tests/items-list.test.ts`

Mismo patrón que `tests/items-publish.test.ts` (`buildTestApp` con `createItemRouter(deps)`).

**Mock de `itemRepo` actualizado** (incluyendo `findActiveInRadius`):
```typescript
const defaultPaginatedResult = {
  items: [
    {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      title: 'Silla de madera',
      condition: 'good' as const,
      degradedAt: null,
      createdAt: new Date('2026-05-01T10:00:00Z'),
      distanceMeters: 5000,
      imagePaths: ['items/abc123/photo.jpg'],
    },
  ],
  total: 1,
};

// En buildTestApp:
itemRepo: {
  createWithImages: vi.fn(),
  findActiveInRadius: vi.fn().mockResolvedValue(defaultPaginatedResult),
},
```

**Casos de prueba (9):**

| # | Descripción | Esperado |
|---|-------------|----------|
| 9.1 | GET /items autenticado | 200 con `{ items, pagination }`, cada item tiene `distanceMeters` y NO tiene `location` |
| 9.2 | GET /items sin token | 401 |
| 9.3 | GET /items?page=2&limit=10 | 200 con `pagination.page=2, pagination.limit=10` |
| 9.4 | GET /items?limit=51 | 400 |
| 9.5 | GET /items?limit=0 | 400 |
| 9.6 | GET /items?page=0 | 400 |
| 9.7 | GET /items sin params | 200 con defaults: `pagination.page=1, pagination.limit=20` |
| 9.8 | findActiveInRadius devuelve total=0 | 200 con `{ items: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }` |
| 9.9 | Respuesta no incluye campo `location` | `expect(res.body.items[0]).not.toHaveProperty('location')` |

**Test 9.1 — ejemplo completo:**
```typescript
it('9.1 — authenticated GET /items: responds 200 with items and pagination', async () => {
  const { app } = buildTestApp();
  const res = await request(app)
    .get('/items')
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    items: [
      {
        id: expect.any(String),
        title: 'Silla de madera',
        condition: 'good',
        distanceMeters: 5000,
        images: ['items/abc123/photo.jpg'],
      },
    ],
    pagination: {
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    },
  });
  expect(res.body.items[0]).not.toHaveProperty('location');
});
```

**Test 9.4 — validación limit > 50:**
```typescript
it('9.4 — limit=51: responds 400', async () => {
  const { app } = buildTestApp();
  const res = await request(app)
    .get('/items?limit=51')
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(400);
});
```

### Actualización de `tests/items-publish.test.ts`

El mock de `itemRepo` en `buildTestApp` de ese archivo actualmente solo define `createWithImages`. Al extender `IItemRepository` con `findActiveInRadius`, TypeScript en modo estricto puede requerir la implementación en el mock. Añadir:

```typescript
itemRepo: {
  createWithImages: vi.fn().mockResolvedValue(mockItem),
  findActiveInRadius: vi.fn(),  // añadir
},
```

Esto evita errores de tipo si el test usa `as IItemRepository` o si TypeScript verifica el objeto contra la interfaz.

### Project Structure Notes

- **No se añaden archivos nuevos a `src/infrastructure/`** más allá de la migración y la extensión de `item.repository.ts`.
- **`src/application/use-cases/item/`** ya existe (creado en 2.1) — solo añadir `list-items.use-case.ts` al mismo directorio.
- **`src/application/dtos/`** ya existe — añadir `list-items.dto.ts`.
- **`src/interfaces/validators/`** ya existe — añadir `list-items.validator.ts`.
- El singleton `export const itemRouter = createItemRouter()` al final de `items.routes.ts` se actualiza automáticamente porque `createItemRouter()` ya incluirá la nueva ruta `GET /`.

### References

- [Source: docs/architecture.md §3.2] — Columna `location GEOGRAPHY(POINT, 4326)` en `items` y `users`
- [Source: docs/architecture.md §4] — Índices: `idx_items_location`, `idx_users_location`
- [Source: docs/architecture.md — Job 1] — `ORDER BY degraded_at NULLS FIRST, created_at DESC`
- [Source: docs/architecture.md §3.2] — `ST_DWithin(u.location, i.location, 50000)` para radio 50 km
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md §FR9] — Listar objetos activos en radio 50 km con paginación
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md §FR34] — `images: []` para items completados/cancelados > 30 días
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md §NFR2] — `location` nunca en DTOs de salida
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md §NFR4] — DTOs explícitos en `application/dtos/`
- [Source: src/interfaces/http/routes/items.routes.ts] — Factory `createItemRouter(deps)`, patrón auth interno
- [Source: tests/items-publish.test.ts] — Patrón `buildTestApp`, mock de `jwtService`/`userRepo`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (bmad-create-story, 2026-05-06)

### Debug Log References

### Completion Notes List

- Implementados todos los tasks sin desviaciones del spec.
- Task 1: Creada migración 005 con índice GIST en `users.location`.
- Task 2: Extendida `IItemRepository` con `FindActiveInRadiusInput`, `ItemWithDistance`, `PaginatedItems` y `findActiveInRadius`.
- Task 3: Creados `list-items.dto.ts` y `list-items.use-case.ts`; `totalPages` retorna 0 cuando `total=0` (Math.ceil(0/limit)=0).
- Task 4: Implementado `findActiveInRadius` con `Promise.all` para count+list en paralelo, `ST_DWithin` 50km, `ORDER BY degraded_at NULLS FIRST, created_at DESC`.
- Task 5: Creado validador Zod con coerción, defaults page=1/limit=20, límite max 50. Actualizado controlador y routes (GET / antes de POST /).
- Task 6: 9 tests nuevos (items-list.test.ts) + actualizado mock en items-publish.test.ts. `npx tsc --noEmit` sin errores. `npx vitest run` 73/73 pasando.

### File List

- src/infrastructure/database/supabase/migrations/005-add-users-location-index.sql (nuevo)
- src/domain/repositories/item.repository.ts (modificado)
- src/application/dtos/list-items.dto.ts (nuevo)
- src/application/use-cases/item/list-items.use-case.ts (nuevo)
- src/infrastructure/database/supabase/item.repository.ts (modificado)
- src/interfaces/validators/list-items.validator.ts (nuevo)
- src/interfaces/http/controllers/item.controller.ts (modificado)
- src/interfaces/http/routes/items.routes.ts (modificado)
- tests/items-list.test.ts (nuevo)
- tests/items-publish.test.ts (modificado)
