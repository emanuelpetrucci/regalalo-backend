---
title: "Migración SQL y dominio items (DLT-004)"
type: feature
ticket: 1
status: done
created: 2026-10-25
---

# Historia 7.1: Migración SQL y dominio items (DLT-004)

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como desarrollador,
quiero las columnas `category` y `weight_range` en `items` con constraints y la entidad de dominio actualizada,
para persistir dimensiones analíticas desde la publicación y habilitar instrumentación en historias 7.3–7.6.

## Criterios de aceptación

1. **Dado** que existe la tabla `items` de v1.2 (`003-create-items.sql` ya aplicada), **cuando** se aplica la migración `013-items-dlt-004.sql` vía `npm run migrate`, **entonces** existen las columnas `category` y `weight_range` NOT NULL con CHECK constraints alineados a `docs/architecture.md` §3.2 (v1.4).

2. **Dado** filas de ítem ya presentes antes de la migración, **cuando** termina `013-items-dlt-004.sql`, **entonces** reciben backfill `category = 'other'` y `weight_range = 'lt1'` **antes** de aplicar NOT NULL y CHECK.

3. **Dado** la entidad `Item` en dominio, **cuando** el repositorio Postgres persiste o lee un ítem vía `createWithImages`, **entonces** mapea `category` y `weightRange` en camelCase con tipos union estrictos.

4. **Dado** cualquier consumidor futuro (use cases en 7.3+, instrumentación en 7.5/7.6), **cuando** se construye un DTO HTTP en historias posteriores, **entonces** `category` y `weightRange` **no se exponen** en respuestas de listado/detalle por ítem en esta historia — **7.1 no modifica** DTOs HTTP, validadores Zod, rutas, OpenAPI ni `analytics.service`.

## Alcance explícito (IN / OUT)

| IN (7.1) | OUT (historias 7.2–7.6) |
|---|---|
| `013-items-dlt-004.sql` | `config/loggers.ts` y refactor pino (7.2) |
| `item.entity.ts` + tipos `ItemCategory`, `ItemWeightRange` | `emitEvent` / `analytics.service.ts` (7.2) |
| `mapRow` / SQL en `item.repository.ts` (`createWithImages`) | Validadores Zod `category`/`weightRange` en publicación (7.3) |
| Placeholders `'other'`/`'lt1'` en INSERT hasta 7.3 | `PublishItemUseCase` leyendo payload analítico (7.3) |
| Actualizar objetos `mockItem` en tests para compilar | AE-010…AE-031 en use cases y jobs (7.4–7.6) |
| Ejecutar `npm run migrate` en entorno con BD | Regenerar OpenAPI / cliente Angular (7.3+) |
| | Exponer `category`/`weightRange` en DTOs de respuesta HTTP |

**Regla de despliegue:** Tras merge de 7.1, `npm run migrate` debe ejecutarse **antes** de arrancar la API en cualquier entorno con datos; de lo contrario los `INSERT` actuales fallarán al faltar columnas NOT NULL.

**Orden de épica:** `7.1` → `7.2` (paralelo posible) → `7.3` (breaking API publicación) → `7.4` → `7.5` → `7.6`. No adelantar validadores ni OpenAPI en 7.1.

## Tareas / Subtareas

- [x] **Task 1 — Migración `013-items-dlt-004.sql`** (AC: #1, #2)
  - [x] Crear `src/infrastructure/database/supabase/migrations/013-items-dlt-004.sql` (siguiente número tras `012-users-dlt-003.sql`)
  - [x] Añadir columnas nullable; `UPDATE` backfill; `SET NOT NULL`; añadir CHECK constraints
  - [x] No crear índices nuevos (architecture §4 / delta DLT-004 §A: sin índices adicionales)
  - [x] Verificar con `npm run migrate` contra BD local o remota

- [x] **Task 2 — Entidad de dominio `Item`** (AC: #3)
  - [x] Extender `src/domain/entities/item.entity.ts` con `ItemCategory`, `ItemWeightRange` y campos en `Item`
  - [x] No exportar helpers de DTO ni mezclar concerns HTTP en dominio

- [x] **Task 3 — `PostgresItemRepository`** (AC: #3, #4)
  - [x] Introducir tipo `ItemDbRow` y helper `mapRow` (patrón de `user.repository.ts` post-6.1)
  - [x] Ampliar `INSERT`/`RETURNING` de `createWithImages` con columnas analíticas
  - [x] Mapear `category`/`weight_range` en el objeto `Item` retornado
  - [x] **No** tocar `request.repository.ts`, `delivery-session.repository.ts`, `user.repository.ts` ni use cases en esta historia

- [x] **Task 4 — Compilación de tests** (AC: #3)
  - [x] Buscar `mockItem` / objetos `Item` inline en `tests/**/*.ts` y añadir `category: 'other'`, `weightRange: 'lt1'` (o valores válidos coherentes)
  - [x] No añadir tests HTTP de publicación con category (pertenecen a 7.3)
  - [x] Ejecutar `npm test` y `npm run build` antes de marcar review

---

## Notas para el Dev Agent

### Contexto de épica 7 (DLT-004)

Correct Course (2026-05-24) incorporó **architecture v1.4**, `docs/prd-analytics.md` y la **Épica 7** sin reabrir historias `done` de épicas 1–6. Épica 6 (DLT-003) está **completa** (238 tests en verde tras 6.5). Esta es la **primera historia** de la épica 7: solo capa de persistencia + dominio. Las historias **7.2–7.6** añaden loggers, API breaking, OpenAPI e instrumentación AE.

**Referencias obligatorias:**

- [Source: docs/architecture.md#32-tabla-items] — definición canónica de columnas y semántica
- [Source: docs/delta-backend-DLT-004.md#a--sección-32--tabla-items] — delta, enums y nota de backfill
- [Source: docs/prd-analytics.md#4-cambios-en-el-modelo-de-datos] — enums y regla de no exposición ESG en DTOs
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md#historia-71-migración-sql-y-dominio-items-dlt-004]
- [Source: _bmad-output/initiative-backend/sprint-change-proposal-2026-05-24-DLT-004.md] — evidencia de brecha y orden 7.1→7.6
- [Source: _bmad-output/project-context.md — Analítica DLT-004]

### Estado actual del código (leer antes de editar)

**Migraciones existentes:** `001` … `012` en `src/infrastructure/database/supabase/migrations/`. **No existe** `013-items-dlt-004.sql`.

**Tabla `items` hoy** (`003-create-items.sql`): sin `category` ni `weight_range`.

**Entidad `Item` hoy** — solo campos v1.2:

```typescript
// src/domain/entities/item.entity.ts — estado pre-7.1
export interface Item {
  id: string;
  donorId: string;
  title: string;
  description: string;
  condition: ItemCondition;
  status: ItemStatus;
  requestsPaused: boolean;
  degradedAt: Date | null;
  createdAt: Date;
  reservedAt: Date | null;
  completedAt: Date | null;
}
```

**Repositorio:** `createWithImages` inserta sin columnas analíticas; el `RETURNING` y el mapeo manual no conocen DLT-004.

**Búsqueda en `src/`:** cero referencias a `category`, `weight_range`, `weightRange`, `analytics.service` o `loggers.ts` — commit `11ba3f4` solo actualizó **documentación** DLT-004, no código de aplicación.

### Task 1 — SQL de migración (plantilla obligatoria)

Nombre de archivo exacto: **`013-items-dlt-004.sql`** (AC de épica).

Patrón seguro para datos existentes (no asumir BD vacía):

```sql
-- 013-items-dlt-004.sql — DLT-004: columnas analíticas en items

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS category     TEXT,
  ADD COLUMN IF NOT EXISTS weight_range TEXT;

UPDATE items
SET
  category     = COALESCE(category, 'other'),
  weight_range = COALESCE(weight_range, 'lt1')
WHERE category IS NULL OR weight_range IS NULL;

ALTER TABLE items
  ALTER COLUMN category     SET NOT NULL,
  ALTER COLUMN weight_range SET NOT NULL;

ALTER TABLE items
  ADD CONSTRAINT chk_items_category
    CHECK (category IN (
      'furniture','electronics','clothing','books',
      'toys','kitchen','sports','tools','other'
    ));

ALTER TABLE items
  ADD CONSTRAINT chk_items_weight_range
    CHECK (weight_range IN ('lt1','1to5','5to20','gt20'));
```

**Enums canónicos (validación futura en 7.3 — no duplicar en dominio sin alinear):**

| Campo | Valores |
|---|---|
| `category` | `furniture`, `electronics`, `clothing`, `books`, `toys`, `kitchen`, `sports`, `tools`, `other` |
| `weight_range` | `lt1`, `1to5`, `5to20`, `gt20` |

Aplicación: `npm run migrate` (`scripts/migrate.ts` — orden lexicográfico por nombre de archivo).

### Task 2 — Entidad `Item` objetivo

```typescript
export type ItemCategory =
  | 'furniture' | 'electronics' | 'clothing' | 'books'
  | 'toys' | 'kitchen' | 'sports' | 'tools' | 'other';

export type ItemWeightRange = 'lt1' | '1to5' | '5to20' | 'gt20';

export interface Item {
  // … campos v1.2 existentes …
  category: ItemCategory;
  weightRange: ItemWeightRange;
}
```

- `weightRange` es **interno** para analítica/ESG agregado; **no** aparece en DTOs HTTP de listado/detalle (architecture §3.2, prd-analytics §4.2).
- `location` sigue sin existir en la entidad (solo en SQL); no añadir `location` a `Item`.

### Task 3 — Cambios en `PostgresItemRepository`

**Helper `mapRow` — mapeo snake_case → camelCase:**

| SQL | TypeScript |
|---|---|
| `category` | `category` |
| `weight_range` | `weightRange` |

**`createWithImages` — INSERT temporal hasta historia 7.3:**

El API de publicación aún no envía `category`/`weightRange`. Para que tests y `POST /items` v1.2 sigan funcionando tras la migración, el `INSERT` debe incluir literales alineados al backfill:

```sql
INSERT INTO items (
  id, donor_id, title, description, condition, category, weight_range, location, status
)
VALUES (
  $1, $2, $3, $4, $5, 'other', 'lt1',
  ST_SetSRID(ST_MakePoint($6, $7), 4326), 'active'
)
RETURNING id, donor_id, title, description, condition, category, weight_range,
          status, requests_paused, degraded_at, created_at, reserved_at, completed_at;
```

**Historia 7.3** ampliará `CreateItemInput` y sustituirá `'other'`/`'lt1'` por valores del payload validado; no adelantar validadores Zod ni cambios en `PublishItemUseCase` en 7.1.

**`CreateItemInput`:** puede permanecer sin `category`/`weightRange` en 7.1; los valores van en el SQL del repo como arriba.

**Métodos que no retornan `Item` completo** (`findById` → `ItemDetail`, `findItemOwnership`, etc.): **no** requieren incluir `category`/`weightRange` en 7.1. Historias 7.5/7.6 ampliarán SELECTs donde use cases necesiten `item.category` para `emitEvent`.

### Task 4 — Fixtures de tests

Tras extender `Item`, cada `mockItem` debe incluir como mínimo:

```typescript
category: 'other' as const,
weightRange: 'lt1' as const,
```

Archivos conocidos con `mockItem` u objetos `Item`: `items-publish.test.ts`, `items-get.test.ts`, `geocoding-shared-cache.test.ts`, y cualquier fixture inline con `requestsPaused`/`donorId` en tests de items, delivery-sessions, degrade-inactive-items.

### Anti-patrones (no hacer en 7.1)

- No modificar `src/application/dtos/*`, `publish-item.use-case.ts`, `publish-item.validator.ts`, rutas ni `openapi/`.
- No crear `config/loggers.ts` ni `analytics.service.ts` (7.2).
- No usar `SELECT *` en el repositorio (NFR / project-context).
- No exponer `category`/`weightRange` en DTOs de respuesta HTTP (7.3 decidirá exposición en publish response si aplica).
- No marcar épica 7 como `done` — solo `in-progress` al crear esta story.

### Cumplimiento de arquitectura

- **Clean Architecture:** cambios solo en `domain/entities`, `domain/repositories/item.repository.ts` (tipos si aplica), `infrastructure/database/supabase/migrations`, `infrastructure/.../item.repository.ts` y fixtures de test.
- **Sin ORM:** SQL explícito con `pg`.
- **Migraciones:** un archivo numerado; idempotencia parcial vía `ADD COLUMN IF NOT EXISTS`.

### Verificación

```bash
npm run migrate
npm run build
npm test
```

Si `migrate` falla en jobs pg_cron en CI, no confundir con esta migración (013 no usa pg_cron).

### Inteligencia de historias previas

- **6.1 (patrón análogo):** migración con backfill → NOT NULL → entidad → repo con placeholders en INSERT → fixtures de test. Misma secuencia aplicada a `users`/DLT-003; reutilizar estructura de story y `mapRow` de `user.repository.ts`.
- **6.5 (épica 6 cerrada):** emails con `firstName`; 238 tests en verde. No hay dependencia directa con 7.1, pero confirma que DLT-003 está estable antes de DLT-004.
- **Épicas 2–5 `done`:** flujos de ítems operativos sin campos analíticos; placeholders evitan regresión hasta 7.3.
- **Commit `11ba3f4`:** solo docs DLT-004 — la implementación queda para dev-story de este archivo.

### Contexto cross-story épica 7

| Story | Depende de 7.1 |
|---|---|
| 7.2 Loggers + analytics.service | No (paralelo posible) |
| 7.3 API publicar + OpenAPI | **Sí** — columnas NOT NULL deben existir |
| 7.4 Auth AE-001/002 | No directo |
| 7.5 Objetos/solicitudes AE | **Sí** — `item.category` en dominio/repo |
| 7.6 Entrega/reputación AE | **Sí** — `category`/`weightRange` persistidos |

### Git reciente (contexto, no implementar aquí)

- `9416bf1` — 6.5 emails firstName (épica 6 done).
- `11ba3f4` — documentación DLT-004 (architecture v1.4, prd-analytics, epics 7.x).
- Patrón de implementación migración: ver diff de `6-1` / commit de 6.1 en `012-users-dlt-003.sql` y `user.repository.ts`.

### Review Findings

- [x] [Review][Defer] Enum values duplicados entre SQL CHECK y TypeScript union types [src/infrastructure/database/supabase/migrations/013-items-dlt-004.sql + src/domain/entities/item.entity.ts] — deferred, pre-existing

---

## Dev Agent Record

### Agent Model Used

Composer (dev-story runner)

### Debug Log References

(n/a)

### Completion Notes List

- Migración `013-items-dlt-004.sql`: columnas `category`/`weight_range` con backfill `'other'`/`'lt1'`, NOT NULL y CHECK constraints alineados a architecture v1.4.
- Entidad `Item` extendida con `ItemCategory`, `ItemWeightRange`, `category` y `weightRange`.
- `PostgresItemRepository`: `ItemDbRow`, `mapRow`, INSERT con placeholders `'other'`/`'lt1'` hasta historia 7.3.
- Fixtures `mockItem` actualizados en `items-publish.test.ts` y `geocoding-shared-cache.test.ts`.
- `npm run db:migrate:dev`: aplicada 013 en entorno dev.
- `npm run build` y `npm test`: 238 tests en verde, sin regresiones.

### File List

- src/infrastructure/database/supabase/migrations/013-items-dlt-004.sql (nuevo)
- src/domain/entities/item.entity.ts (modificado)
- src/infrastructure/database/supabase/item.repository.ts (modificado)
- tests/items-publish.test.ts (modificado)
- tests/geocoding-shared-cache.test.ts (modificado)
- _bmad-output/initiative-backend/archive-v6/sprint-status.yaml (modificado)

---

## Change Log

- 2026-05-25: DLT-004 story 7.1 — migración SQL items, dominio Item y repositorio con mapRow/placeholders analíticos.

## Referencias

- [Source: docs/architecture.md — §3.2 Tabla items]
- [Source: docs/delta-backend-DLT-004.md — §A Tabla items]
- [Source: docs/prd-analytics.md — §4 Cambios en el Modelo de Datos]
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Épica 7, Historia 7.1]
- [Source: _bmad-output/initiative-backend/tickets/epic-ampliacion-del-modelo-de-usuario-dlt-003/tickets/story-migracion-sql-y-entidad-user-dlt-003-plan.md — patrón migración DLT-003]
- [Source: _bmad-output/project-context.md — Technology Stack, Analítica DLT-004]
- [Source: src/infrastructure/database/supabase/migrations/003-create-items.sql]
- [Source: src/domain/entities/item.entity.ts]
- [Source: src/infrastructure/database/supabase/item.repository.ts]

---

Ultimate context engine analysis completed — comprehensive developer guide created.
