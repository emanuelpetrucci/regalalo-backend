---
title: "API publicar ítem — category y weightRange"
type: feature
ticket: 3
status: done
created: 2026-10-25
---

# Historia 7.3: API publicar ítem — category y weightRange

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como donante autenticado,
quiero indicar categoría y rango de peso al publicar un objeto,
para cumplir el contrato analítico del MVP y habilitar dimensiones ESG desde el primer ítem creado.

## Criterios de aceptación

1. **Dado** `POST /items` con `category` y `weightRange` válidos (enums canónicos), **cuando** la publicación es exitosa, **entonces** el ítem persiste ambos campos en BD y la respuesta HTTP mantiene el DTO existente `{ id, title, status, createdAt }` — **sin** exponer `category` ni `weightRange` en el body de respuesta.

2. **Dado** una publicación exitosa, **cuando** `createWithImages` ha hecho commit, **entonces** se emite AE-010 `item.published` vía `emitEvent` con `properties`: `{ itemId, category, condition, weightRange }` y `userId` = donante autenticado — fire-and-forget, sin await, sin alterar la respuesta HTTP si el logger falla.

3. **Dado** `category` o `weightRange` ausentes, vacíos o fuera del enum, **cuando** se envía la petición, **entonces** responde `400 Bad Request` con el formato de validación Zod existente (`{ message, errors }`) **antes** de geocodificar, subir imágenes o tocar BD.

4. **Dado** el validador Zod actualizado, **cuando** se ejecuta `npm run openapi:generate`, **entonces** `openapi/openapi.json` incluye `category` y `weightRange` como campos **obligatorios** en el schema `PublishItemMultipart` / `PublishItemFields`.

5. **Dado** tests de integración `POST /items`, **cuando** se ejecutan, **entonces** todas las peticiones válidas incluyen los nuevos campos, hay casos negativos para enums inválidos/ausentes, y (con mock de `emitEvent`) se verifica la emisión AE-010 en éxito.

## Alcance explícito (IN / OUT)

| IN (7.3) | OUT (historias 7.4–7.6) |
|---|---|
| `publish-item.validator.ts` — enums `category`/`weightRange` obligatorios | AE-001/002 en auth (7.4) |
| `PublishItemRequestDto` + controller pasando campos | AE-011…AE-015 en solicitudes/objetos (7.5) |
| `CreateItemInput` + `createWithImages` con valores del payload | AE-020…AE-031 en entrega/reputación (7.6) |
| `PublishItemUseCase` — flujo + `emitEvent` AE-010 post-commit | Exponer `category`/`weightRange` en GET/list DTOs |
| Schemas OpenAPI (`common.schemas` o validator) + `openapi/openapi.json` | Migración SQL (7.1 — ya hecha) |
| Tests `items-publish.test.ts` ampliados | `config/loggers.ts` / `analytics.service` base (7.2) |
| Aviso en completion notes: frontend debe `npm run api:generate` | Instrumentación en otros use cases |

**Breaking change:** clientes que llamen `POST /items` sin `category`/`weightRange` recibirán 400. Coordinar con frontend tras merge.

**Prerrequisitos:**

| Story | Requisito |
|---|---|
| **7.1** | Columnas NOT NULL + entidad `Item` con tipos — **obligatorio** (en review; código ya en repo) |
| **7.2** | `analytics.service.ts` + `emitEvent` — **obligatorio para AC #2**; si 7.2 no está merged, completar 7.2 antes o en la misma rama |

**Orden recomendado:** `7.1` + `7.2` → **7.3** → `7.4` → `7.5` → `7.6`.

## Tareas / Subtareas

- [x] **Task 1 — Schemas Zod y OpenAPI** (AC: #3, #4)
  - [x] Añadir `itemCategorySchema` e `itemWeightRangeSchema` en `src/openapi/schemas/common.schemas.ts` (patrón de `itemConditionSchema`) alineados a `ItemCategory` / `ItemWeightRange` en `item.entity.ts`
  - [x] Extender `publishItemBodySchema` con `category: itemCategorySchema` y `weightRange: itemWeightRangeSchema` — ambos **requeridos** (no `.optional()`)
  - [x] Ejecutar `npm run openapi:generate` y commitear `openapi/openapi.json` actualizado

- [x] **Task 2 — DTO, controller y dominio** (AC: #1, #3)
  - [x] Ampliar `PublishItemRequestDto` con `category: ItemCategory` y `weightRange: ItemWeightRange`
  - [x] `item.controller.ts` — mapear `req.body.category` y `req.body.weightRange` al DTO
  - [x] Ampliar `CreateItemInput` en `domain/repositories/item.repository.ts` con los mismos campos

- [x] **Task 3 — Repositorio: sustituir placeholders** (AC: #1)
  - [x] En `PostgresItemRepository.createWithImages`, reemplazar literales `'other'`, `'lt1'` por `$n` bind params desde `input.category` e `input.weightRange`
  - [x] Verificar `mapRow` sigue mapeando correctamente (sin cambios esperados si 7.1 está bien)

- [x] **Task 4 — Use case + AE-010** (AC: #1, #2)
  - [x] Pasar `category`/`weightRange` del DTO a `createWithImages`
  - [x] Tras `await this.itemRepo.createWithImages(...)` exitoso, invocar:
    ```typescript
    emitEvent('item.published', dto.donorId, {
      itemId: item.id,
      category: item.category,
      condition: item.condition,
      weightRange: item.weightRange,
    });
    ```
  - [x] Import desde `../../services/analytics.service` (creado en 7.2)
  - [x] **No** envolver `emitEvent` en try/catch que cambie status HTTP; **no** await

- [x] **Task 5 — Tests** (AC: #3, #5)
  - [x] Actualizar **todos** los casos válidos en `tests/items-publish.test.ts` (8.1, 8.2, 8.9, etc.) con `.field('category', 'furniture')` y `.field('weightRange', '1to5')` (o valores coherentes)
  - [x] Añadir: category ausente → 400; weightRange ausente → 400; category inválida (`'invalid'`) → 400; weightRange inválida → 400
  - [x] Assert: `createWithImages` recibe `category`/`weightRange` del body en petición válida
  - [x] Mock `vi.mock('../src/application/services/analytics.service')` — assert `emitEvent` llamado una vez post-201 con payload AE-010
  - [x] Caso storage/geocode failure: `emitEvent` **no** debe llamarse

- [x] **Task 6 — Verificación** (AC: todos)
  - [x] `npm run build` (incluye openapi:generate + tsc)
  - [x] `npm test`
  - [x] Confirmar `PublishItemResponse` sin campos analíticos en OpenAPI

### Review Findings

- [x] [Review][Defer] Tests 8.6 y 8.16 son funcionalmente idénticos (geocode null → emitEvent no llamado) [tests/items-publish.test.ts] — deferred, pre-existing
- [x] [Review][Defer] emitEvent sin try/catch: si analyticsLogger.info lanzara sincrónicamente propagaría como 500 post-commit [src/application/use-cases/item/publish-item.use-case.ts:49] — deferred, spec prohíbe explícitamente el try/catch; pino no lanza
- [x] [Review][Defer] mapRow usa type assertions sin validación runtime (as ItemCategory, as ItemWeightRange) [src/infrastructure/database/supabase/item.repository.ts:373-374] — deferred, patrón preexistente en todo el repo

---

## Notas para el Dev Agent

### Contexto de épica 7 (DLT-004)

Correct Course (2026-05-24) añadió **architecture v1.4**, `docs/prd-analytics.md` y la Épica 7. **7.1** dejó columnas + dominio con placeholders `'other'`/`'lt1'` en INSERT. **7.2** entrega `emitEvent`. **7.3** es el **primer breaking change de API** de la épica: publicación exige dimensiones analíticas y es el único punto donde el usuario las captura (no se rellenan retroactivamente en ítems nuevos).

**Referencias obligatorias:**

- [Source: docs/architecture.md — §3.2 Tabla items, nota no exposición weight_range en DTOs]
- [Source: docs/delta-backend-DLT-004.md — §A enums, §D CreateItem AE-010]
- [Source: docs/prd-analytics.md — §4 Modelo de datos, §6 AE-010, SC-06]
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Historia 7.3]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-migracion-sql-y-dominio-items-dlt-004-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-loggers-y-analytics-service-plan.md]
- [Source: _bmad-output/project-context.md — Analítica DLT-004, OpenAPI]

### Estado actual del código (leer antes de editar)

**Validador hoy** — sin campos analíticos:

```typescript
// src/interfaces/validators/publish-item.validator.ts
export const publishItemBodySchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  condition: z.enum(['new', 'like_new', 'good', 'fair']),
  postalCode: z.string().min(1).max(10),
});
```

**Use case hoy** — no pasa category/weightRange; no emite analítica:

```typescript
// src/application/use-cases/item/publish-item.use-case.ts
const item = await this.itemRepo.createWithImages({
  id: itemId,
  donorId: dto.donorId,
  title: dto.title,
  description: dto.description,
  condition: dto.condition,
  lat: coords.lat,
  lng: coords.lon,
  imagePaths,
});
return { id: item.id, title: item.title, status: item.status, createdAt: item.createdAt };
```

**Repositorio hoy** (post-7.1) — placeholders hardcodeados:

```sql
VALUES ($1, $2, $3, $4, $5, 'other', 'lt1', ST_SetSRID(...), 'active')
```

**Entidad** — tipos ya definidos en 7.1:

```typescript
export type ItemCategory =
  | 'furniture' | 'electronics' | 'clothing' | 'books'
  | 'toys' | 'kitchen' | 'sports' | 'tools' | 'other';
export type ItemWeightRange = 'lt1' | '1to5' | '5to20' | 'gt20';
```

**OpenAPI** — `publishItemBodySchema` es fuente única; al extenderlo, `publishItemMultipartSchema` en `item.schemas.ts` hereda automáticamente.

**analytics.service** — **no existe** hasta 7.2; 7.3 **consume** `emitEvent` (no reimplementar logging analítico aquí).

### Task 1 — Enums canónicos (validación = dominio = BD)

| Campo API (camelCase) | Columna SQL | Valores |
|---|---|---|
| `category` | `category` | `furniture`, `electronics`, `clothing`, `books`, `toys`, `kitchen`, `sports`, `tools`, `other` |
| `weightRange` | `weight_range` | `lt1`, `1to5`, `5to20`, `gt20` |

Implementación recomendada en `common.schemas.ts`:

```typescript
export const itemCategorySchema = z.enum([
  'furniture', 'electronics', 'clothing', 'books',
  'toys', 'kitchen', 'sports', 'tools', 'other',
]);

export const itemWeightRangeSchema = z.enum(['lt1', '1to5', '5to20', 'gt20']);
```

Reutilizar en `publish-item.validator.ts`:

```typescript
import { itemCategorySchema, itemWeightRangeSchema } from '../../openapi/schemas/common.schemas';

export const publishItemBodySchema = z.object({
  // ... campos existentes ...
  category: itemCategorySchema,
  weightRange: itemWeightRangeSchema,
});
```

> **Import circular:** el proyecto ya importa validators desde openapi schemas (`item.schemas.ts` → `publish-item.validator.ts`). Si el validator importara `common.schemas`, verificar que no cree ciclo. Alternativa aceptable: definir enums **solo** en el validator y duplicar en `common.schemas` para OpenAPI — pero preferir **una fuente** (common.schemas) e importar en validator si el grafo lo permite; si no, extraer `item-enums.schema.ts` en `interfaces/validators/` compartido.

**Multipart:** los campos van como `.field('category', 'furniture')` en supertest — mismo patrón que `condition`/`postalCode`.

### Task 3 — SQL objetivo

```sql
INSERT INTO items (
  id, donor_id, title, description, condition, category, weight_range, location, status
)
VALUES (
  $1, $2, $3, $4, $5, $6, $7,
  ST_SetSRID(ST_MakePoint($8, $9), 4326), 'active'
)
```

Parámetros: `[input.id, input.donorId, input.title, input.description, input.condition, input.category, input.weightRange, input.lng, input.lat]`.

### Task 4 — AE-010: timing post-commit

`createWithImages` ejecuta `BEGIN` → INSERT → imágenes → `COMMIT` internamente. El use case debe llamar `emitEvent` **después** de que `createWithImages` resuelva (transacción ya commitada). Si geocoding/storage falla antes del repo, **no** emitir.

Propiedades AE-010 (delta §D / prd-analytics §6):

| Property | Origen |
|---|---|
| `itemId` | `item.id` |
| `category` | `item.category` |
| `condition` | `item.condition` |
| `weightRange` | `item.weightRange` |

**Prohibido en properties:** coordenadas, email, UUID crudo de ítem (solo `itemId` como identificador de negocio está en catálogo).

### Task 5 — Estrategia de tests

Patrón existente: `tests/items-publish.test.ts` con supertest multipart + mocks de deps.

Mock de analítica (requiere 7.2 merged):

```typescript
vi.mock('../src/application/services/analytics.service', () => ({
  emitEvent: vi.fn(),
}));
```

Casos mínimos nuevos (numeración sugerida 8.10+):

- `8.10` — category ausente → 400
- `8.11` — weightRange ausente → 400
- `8.12` — category enum inválido → 400
- `8.13` — weightRange enum inválido → 400
- `8.14` — éxito: `createWithImages` mock recibe category/weightRange
- `8.15` — éxito: `emitEvent('item.published', donorId, { itemId, category, condition, weightRange })`
- `8.16` — geocode null: `emitEvent` no llamado

Actualizar tests 8.1–8.9: **todos** los `.field(...)` válidos necesitan category + weightRange o fallarán tras 7.3.

### Respuesta HTTP — qué NO cambiar

`PublishItemResponseDto` y `publishItemResponseSchema` **permanecen**:

```typescript
{ id, title, status, createdAt }
```

`weightRange` **nunca** en respuestas por ítem (architecture §3.2, prd-analytics §4.2). `category` tampoco se expone en listado/detalle en esta historia (7.5/7.6 leen de dominio para eventos, no de DTO HTTP público).

### Anti-patrones (no hacer en 7.3)

- No añadir `category`/`weightRange` a `GetItemResponse`, `ItemSummary` ni otros DTOs de lectura.
- No emitir AE-010 dentro de la transacción del repositorio (violación fire-and-forget post-commit).
- No usar `await emitEvent(...)` — no es async.
- No capturar errores de `emitEvent` para devolver 500 tras 201 exitoso.
- No reintroducir placeholders `'other'`/`'lt1'` en INSERT cuando el payload trae valores válidos.
- No crear migración SQL (7.1).
- No implementar otros eventos AE (7.4–7.6).
- No modificar schedulers ni jobs.

### Cumplimiento de arquitectura

- **Clean Architecture:** validator (interfaces) → DTO (application) → use case → repo (infrastructure). `emitEvent` en capa application.
- **Zod único:** importar `z` desde `src/zod.ts`.
- **OpenAPI:** regenerar en build; commitear `openapi/openapi.json`.
- **NFR:** validación 400 antes de side-effects costosos (geocoding, storage).

### Verificación

```bash
npm run build
npm test
```

Post-merge checklist (documentar en completion notes):

1. Backend: `openapi/openapi.json` actualizado en repo
2. Frontend (`no-lo-vendo`): `npm run api:generate` con backend en path `../backend/openapi/openapi.json`
3. Formulario publicación: añadir selectores category/weightRange (historia frontend separada si aplica)

### Inteligencia de historias previas

**7.1 (migración/dominio):**

- Migración `013-items-dlt-004.sql` con CHECK constraints idénticos a los enums Zod — desalineación enum Zod ↔ CHECK = bugs en runtime.
- `createWithImages` usaba placeholders `'other'`/`'lt1'` **explícitamente** hasta 7.3 — esta historia **reemplaza** ese debt.
- `Item` ya incluye `category`/`weightRange`; fixtures `mockItem` ya los tienen.
- 7.1 **no** tocó validadores ni OpenAPI — scope exclusivo de 7.3.

**7.2 (loggers/analytics.service):**

- `emitEvent(userId, ...)` hashea UUID internamente — pasar `dto.donorId` crudo al servicio, no pre-hashear.
- Fire-and-forget post-commit — mismo patrón que documentará 7.4+ para auth.
- Si 7.2 no está en la rama: implementar 7.2 primero o traer `analytics.service.ts` + `config/loggers.ts` antes de tests AE-010.

### Contexto cross-story épica 7

| Story | Relación con 7.3 |
|---|---|
| 7.1 SQL/dominio | **Prerrequisito** — columnas y tipos |
| 7.2 analytics.service | **Prerrequisito** — `emitEvent` para AC #2 |
| 7.4 Auth AE | Independiente |
| 7.5 Objetos/solicitudes AE | Usará `item.category` ya persistido en 7.3 |
| 7.6 Entrega AE | Usará `category`/`weightRange` persistidos |

### Git reciente

- `9416bf1` — 6.5 emails (épica 6 cerrada).
- `11ba3f4` — docs DLT-004 (architecture v1.4, prd-analytics, epics 7.x).
- Implementación 7.1 en working tree: entity + repo + migración 013 (story en review).

---

## Dev Agent Record

### Agent Model Used

Composer (dev-story runner)

### Debug Log References

(n/a)

### Completion Notes List

- `POST /items` exige `category` y `weightRange` (enums canónicos); validación Zod antes de geocoding/storage/BD.
- Placeholders `'other'`/`'lt1'` eliminados del INSERT; valores vienen del payload.
- AE-010 `item.published` emitido post-commit vía `emitEvent` (fire-and-forget, sin await).
- `PublishItemResponse` sin cambios: `{ id, title, status, createdAt }`.
- OpenAPI regenerado: `PublishItemFields`/`PublishItemMultipart` incluyen campos obligatorios.
- **Breaking change:** frontend debe ejecutar `npm run api:generate` y añadir selectores en formulario de publicación.
- Tests: 16 casos en `items-publish.test.ts` (8.10–8.16 nuevos); fix en `geocoding-shared-cache.test.ts`.
- `npm run build` OK; `npm test` — 250/250 passed.

### File List

- src/openapi/schemas/common.schemas.ts
- src/interfaces/validators/publish-item.validator.ts
- src/application/dtos/publish-item.dto.ts
- src/application/use-cases/item/publish-item.use-case.ts
- src/domain/repositories/item.repository.ts
- src/infrastructure/database/supabase/item.repository.ts
- src/interfaces/http/controllers/item.controller.ts
- openapi/openapi.json
- tests/items-publish.test.ts
- tests/geocoding-shared-cache.test.ts

### Change Log

- 2026-05-25: Historia 7.3 — API publicar ítem con category/weightRange + AE-010 (dev-story completo).

---

## Referencias

- [Source: docs/architecture.md — §3.2 Tabla items]
- [Source: docs/delta-backend-DLT-004.md — §A, §D CreateItem AE-010]
- [Source: docs/prd-analytics.md — §4, §6 AE-010, SC-06]
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Historia 7.3]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-migracion-sql-y-dominio-items-dlt-004-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-loggers-y-analytics-service-plan.md]
- [Source: _bmad-output/project-context.md]
- [Source: src/interfaces/validators/publish-item.validator.ts]
- [Source: src/application/use-cases/item/publish-item.use-case.ts]
- [Source: src/application/dtos/publish-item.dto.ts]
- [Source: src/domain/repositories/item.repository.ts]
- [Source: src/infrastructure/database/supabase/item.repository.ts]
- [Source: src/openapi/schemas/item.schemas.ts]
- [Source: src/openapi/schemas/common.schemas.ts]
- [Source: tests/items-publish.test.ts]

---

Ultimate context engine analysis completed — comprehensive developer guide created.
