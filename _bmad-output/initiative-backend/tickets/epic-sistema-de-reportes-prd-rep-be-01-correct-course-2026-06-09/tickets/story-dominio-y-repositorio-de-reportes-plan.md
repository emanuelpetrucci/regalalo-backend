---
title: "Dominio y repositorio de reportes"
type: feature
ticket: 2
status: done
created: 2026-10-25
---

# Story 14.2: Dominio y repositorio de reportes

Status: done

## Story

As a desarrollador,
I want las capas de dominio e infraestructura del módulo de reportes,
so that los use cases puedan persistir y consultar reportes sin conocer los detalles de Supabase.

## Requirements

### User Story

Como desarrollador, quiero la entidad `Report`, el contrato `IReportRepository` con métodos completos, la implementación `PostgresReportRepository` y los DTOs del módulo de reportes, para que los use cases de crear reportes y cola admin puedan implementarse sin acoplamiento a infraestructura.

### Acceptance Criteria

**AC-1 (Entidad Report):** existe `src/domain/entities/Report.ts` con todos los campos de la tabla `reports` mapeados a camelCase, incluyendo union types para `reported_entity_type`, `reason`, `status`, `resolution_action`.

**AC-2 (Contrato IReportRepository):** existe `src/domain/repositories/IReportRepository.ts` con los 7 métodos mínimos del contrato: `create`, `findAllAdmin`, `findByIdAdmin`, `update`, `countByReporterAndEntity`, `countByReporterSince`, `hasPendingByReporterAndEntity`.

**AC-3 (Input y record types):** el archivo del repositorio define interfaces `CreateReportInput`, `AdminReportQuery`, `AdminReportRecord`, `AdminReportDetailRecord` y `UpdateReportInput` con los campos necesarios para cada operación.

**AC-4 (Implementación):** existe `src/infrastructure/database/supabase/report.repository.ts` con clase `PostgresReportRepository implements IReportRepository`, inyectando `Pool` en constructor, usando `mapRow` privado para mapeo DB → dominio.

**AC-5 (DTOs):** existen en `src/application/dtos/report/`:
  - `CreateReportDto.ts` con `CreateReportRequestDto`, `CreateReportResponseDto`
  - `ReportListDto.ts` con `ReportListItemDto`, `ReportListResponseDto`
  - `ReportDetailDto.ts` con `ReportDetailResponseDto`
  - `ResolveReportDto.ts` con `ResolveReportRequestDto`, `ResolveReportResponseDto`

**AC-6 (entity_snapshot type):** existe tipo `EntitySnapshot` en la entidad Report y su mapeo desde JSONB se maneja en `mapRow`.

**AC-7 (Null safety):** `reporterId`, `resolvedAt`, `resolvedBy`, `resolutionAction`, `resolutionNote`, `description` se tipan como `string | null` o `Date | null` según corresponda.

## Dev Notes

### Entity Specification

La entidad `Report` representa una fila de la tabla `reports` (definida en `021-reports-schema.sql`).

Campos:
- `id: string` — UUID
- `reporterId: string | null` — FK a users.id, nullable (anonimización RGPD)
- `reportedEntityType: ReportEntityType` — `'item' | 'user'`
- `reportedEntityId: string` — UUID (sin FK, polimórfica)
- `reason: ReportReason` — union type con los 8 valores del CHECK
- `description: string | null` — texto libre, máx 500 chars
- `entitySnapshot: EntitySnapshot` — JSONB mapeado a `{ entityType, title?, firstName?, lastName?, status?, category?, description? }`
- `status: ReportStatus` — `'pending' | 'resolved' | 'archived'`
- `resolvedAt: Date | null`
- `resolvedBy: string | null`
- `resolutionAction: ResolutionAction | null` — `'archive' | 'warn_user' | 'cancel_item' | 'suspend_user'`
- `resolutionNote: string | null`
- `createdAt: Date`

La entidad también exporta los union types para los campos con CHECK constraint.

### IReportRepository Methods (from PRD-REP-BE-01 §8)

```typescript
interface IReportRepository {
  create(input: CreateReportInput): Promise<Report>;
  findAllAdmin(query: AdminReportQuery): Promise<{ reports: AdminReportRecord[]; total: number }>;
  findByIdAdmin(id: string): Promise<AdminReportDetailRecord | null>;
  update(id: string, input: UpdateReportInput): Promise<Report>;
  countByReporterAndEntity(reporterId: string, entityId: string, since: Date): Promise<number>;
  countByReporterSince(reporterId: string, since: Date): Promise<number>;
  hasPendingByReporterAndEntity(reporterId: string, entityId: string): Promise<boolean>;
}
```

### Input/Query Types

```typescript
interface CreateReportInput {
  reporterId: string;
  reportedEntityType: ReportEntityType;
  reportedEntityId: string;
  reason: ReportReason;
  description: string | null;
  entitySnapshot: EntitySnapshot;
}

interface AdminReportQuery {
  status?: ReportStatus;
  reportedEntityType?: ReportEntityType;
  reason?: ReportReason;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  limit: number;
}

interface UpdateReportInput {
  status: ReportStatus;
  resolvedAt: Date;
  resolvedBy: string;
  resolutionAction: ResolutionAction;
  resolutionNote: string;
}
```

### AdminReportRecord Shape

```typescript
interface AdminReportRecord {
  id: string;
  reportedEntityType: ReportEntityType;
  reportedEntityId: string;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  entitySnapshot: EntitySnapshot;
  reporter: {
    id: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  pendingCountForEntity: number;
}
```

### AdminReportDetailRecord Shape

```typescript
interface AdminReportDetailRecord {
  id: string;
  reportedEntityType: ReportEntityType;
  reportedEntityId: string;
  reason: ReportReason;
  description: string | null;
  entitySnapshot: EntitySnapshot;
  status: ReportStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionAction: ResolutionAction | null;
  resolutionNote: string | null;
  reporter: {
    id: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    reputationScore: number | null;
    isActive: boolean | null;
    totalReportsSubmitted: number;
    totalReportsPending: number;
  } | null;
  reportedEntity: {
    type: 'item' | 'user';
    currentState: Record<string, unknown> | null;
  } | null;
}
```

### DTOs Specification

#### `CreateReportDto.ts`
- `CreateReportRequestDto`: `{ reportedEntityType, reportedEntityId, reason, description?, recaptchaToken }`
- `CreateReportResponseDto`: `{ id, message }`

#### `ReportListDto.ts`
- `ReportListItemDto`: campos del list item (id, reportedEntityType, reportedEntityId, reason, status, createdAt, resolvedAt, entitySnapshot, reporter, pendingCountForEntity)
- `ReportListResponseDto`: `{ reports: ReportListItemDto[], pagination: { total, page, limit, totalPages } }`

#### `ReportDetailDto.ts`
- `ReportDetailResponseDto`: campos completos del detalle (id, reportedEntityType, reportedEntityId, reason, description, entitySnapshot, status, createdAt, resolvedAt, resolvedBy, resolutionAction, resolutionNote, reporter, reportedEntity)

#### `ResolveReportDto.ts`
- `ResolveReportRequestDto`: `{ action, resolutionNote }`
- `ResolveReportResponseDto`: `{ message, action, reportId }`

### SQL Reference (from 021-reports-schema.sql)

```sql
CREATE TABLE reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_entity_type  TEXT NOT NULL CHECK (reported_entity_type IN ('item', 'user')),
  reported_entity_id    UUID NOT NULL,
  reason                TEXT NOT NULL CHECK (reason IN (
    'contenido_inadecuado', 'fraude_o_enganio', 'spam', 'objeto_ilegal',
    'objeto_peligroso', 'información_falsa', 'comportamiento_abusivo', 'otro'
  )),
  description           TEXT CHECK (char_length(description) <= 500),
  entity_snapshot       JSONB NOT NULL DEFAULT '{}',
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'archived')),
  resolved_at           TIMESTAMPTZ,
  resolved_by           UUID REFERENCES admin_users(id),
  resolution_action     TEXT CHECK (resolution_action IN ('archive', 'warn_user', 'cancel_item', 'suspend_user')),
  resolution_note       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### SQL Indexes

```sql
CREATE INDEX idx_reports_status_created ON reports(status, created_at ASC);
CREATE INDEX idx_reports_entity ON reports(reported_entity_type, reported_entity_id);
CREATE INDEX idx_reports_reporter_created ON reports(reporter_id, created_at DESC) WHERE reporter_id IS NOT NULL;
CREATE INDEX idx_reports_reporter_id ON reports(reporter_id) WHERE reporter_id IS NOT NULL;
```

### SQL View

```sql
CREATE VIEW reports_summary_by_entity AS
SELECT reported_entity_type, reported_entity_id,
  COUNT(*) AS total_reports,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending_reports,
  COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_reports,
  COUNT(*) FILTER (WHERE status = 'archived') AS archived_reports,
  MAX(created_at) AS last_report_at
FROM reports
GROUP BY reported_entity_type, reported_entity_id;
```

### EntitySnapshot Type

```typescript
interface ItemSnapshot {
  entityType: 'item';
  title: string;
  status: string;
  category: string;
  description: string; // max 300 chars
}

interface UserSnapshot {
  entityType: 'user';
  firstName: string;
  lastName: string;
  reputationScore: number;
}

type EntitySnapshot = ItemSnapshot | UserSnapshot;
```

## Technical Requirements

### Conventional Alignment

Seguir los patrones exactos del proyecto (verificados en historias previas):

| Convención | Regla |
|---|---|
| Archivos | kebab-case: `report.entity.ts`, `report.repository.ts` |
| Clases | PascalCase: `PostgresReportRepository` |
| Interfaces | PascalCase con prefijo `I`: `IReportRepository` |
| Input/Record types | PascalCase con sufijo `Input`, `Record`, `Query` |
| Columnas BD | snake_case en DB rows, camelCase en dominio |
| DTOs | `XxxRequestDto`, `XxxResponseDto`, subcarpeta `report/` |

### No-Go's (prohibido)

- ❌ Clases con métodos de negocio en entidad (solo interface de tipos)
- ❌ ORM, query builders, `SELECT *`
- ❌ Serializar entidad directamente en respuestas HTTP (DTOs existen para eso)
- ❌ `any` para `entity_snapshot` — usar `EntitySnapshot` type
- ❌ Modificar `openapi/openapi.json` a mano
- ❌ Importar `z` desde otro sitio que no sea `src/zod.ts`

### EntitySnapshot Handling

`entity_snapshot` se almacena como `JSONB` en BD. El `mapRow` privado debe:
1. Leer `row.entity_snapshot` como `Record<string, unknown>`
2. Validar que `entityType` es `'item'` o `'user'` y castear al tipo correspondiente
3. Usar `as EntitySnapshot` (confiamos en que la BD almacenó datos válidos — validación ocurre en use case)

### DTO Folder Structure

Los DTOs van en `src/application/dtos/report/` (subcarpeta), no en archivos sueltos. Sigue el patrón de épicas previas (no hay subcarpetas existentes para comparar, pero se menciona en PRD-REP-BE-01 §8).

### Imports

- `IReportRepository` y sus tipos asociados deben ser importables desde `src/domain/repositories/IReportRepository`
- `Report` entidad desde `src/domain/entities/Report`
- DTOs desde `src/application/dtos/report/`

### Sobre `create` en el repositorio

`reporterId` al crear un reporte SIEMPRE tiene valor (el JWT del denunciante). `ON DELETE SET NULL` y job de anonimización son los únicos mecanismos que producen `reporter_id = NULL` en BD.

### TypeScript Config Note

El proyecto usa `moduleResolution: NodeNext` e imports con extensión `.js` en los archivos fuente (compilados a `.js`). Asegurar que los imports de `pg` y otros módulos sigan esta convención.

## Library / Framework Requirements

| Librería | Uso |
|---|---|
| `pg` (Pool) | Conexión a BD en `PostgresReportRepository` |
| `zod` | Para tipos DTO en validators (historia 14.3) — no necesario aún en esta historia |

Sin nuevas dependencias en `package.json`.

## File Structure Requirements

### Files to CREATE

| # | Archivo | Propósito |
|---|---|---|
| 1 | `src/domain/entities/Report.ts` | Entidad Report + union types |
| 2 | `src/domain/repositories/IReportRepository.ts` | Contrato + input/record types |
| 3 | `src/infrastructure/database/supabase/report.repository.ts` | Implementación Postgres |
| 4 | `src/application/dtos/report/CreateReportDto.ts` | DTOs crear reporte |
| 5 | `src/application/dtos/report/ReportListDto.ts` | DTOs listado admin |
| 6 | `src/application/dtos/report/ReportDetailDto.ts` | DTOs detalle admin |
| 7 | `src/application/dtos/report/ResolveReportDto.ts` | DTOs resolver reporte |

### Files to READ (existing patterns)

| Archivo | Por qué |
|---|---|
| `src/domain/entities/admin-audit-log.entity.ts` | Entidad "hermana" más cercana (Report referencia `resolved_by` a admin_users) |
| `src/domain/entities/item.entity.ts` | Patrón de union types + interface plana |
| `src/infrastructure/database/supabase/user.repository.ts` | Patrón PostgresRepository con `mapRow` |
| `src/infrastructure/database/supabase/item.repository.ts` | `findAllAdmin` pattern con filtros y paginación |

## Previous Story Intelligence (14-1)

### Dev Notes Summary

- Migración `021-reports-schema.sql` creada y aplicada exitosamente.
- Tabla `reports` con todas las columnas, CHECK constraints, 4 índices, vista, RLS.
- Migration file: `src/infrastructure/database/supabase/migrations/021-reports-schema.sql`
- Formato estándar: SQL plano, `IF NOT EXISTS` donde aplica, `DO $$` blocks para alteraciones condicionales.
- `reporter_id UUID REFERENCES users(id) ON DELETE SET NULL` — nullable desde el schema.
- La migración 020 (admin_users) debe existir previa (FK a `admin_users.id` en `resolved_by`).

### Relevant Design Decisions (from PRD-REP-BE-01)

| D-REP | Decisión | Impacto en código |
|---|---|---|
| D-REP-08 | Asociación polimórfica: `reported_entity_type` + `reported_entity_id`, sin FK | No hay FK hacia items/users; existencia validada en use case |
| D-REP-07 | `reporter_id` nullable: `ON DELETE SET NULL` + job anonimización | `reporterId: string \| null` en entidad |
| D-REP-11 | `status = 'archived'` para action=archive; `status = 'resolved'` para demás | CHECK constraint con 3 valores |
| D-REP-09 | Objetos `cancelled` no reportables | No se refleja en entidad; validado en use case |

### Commits Relacionados

```
93ff7b2 feat: implement SQL migration for reporting module
```

Archivos creados/modificados:
- `src/infrastructure/database/supabase/migrations/021-reports-schema.sql`

## Testing Requirements

### Unit Tests

Crear tests unitarios para `PostgresReportRepository` usando un Pool mockeado:

1. **`create`**: verificar que inserta y mapea correctamente los campos incluyendo `entity_snapshot` como JSON stringify
2. **`findByIdAdmin`**: verificar mapeo de JOIN con reporter y reportedEntity
3. **`countByReporterAndEntity`**: verificar query con filtros correctos
4. **`hasPendingByReporterAndEntity`**: verificar COUNT con status = 'pending'
5. **`findAllAdmin`**: verificar construcción de filtros dinámicos y paginación
6. **`update`**: verificar SET de campos de resolución

### Tests de Integración (diferidos a 14.3+)

Los tests HTTP que ejercitan el flujo completo (crear reporte, listar, resolver) pertenecen a las historias 14.3–14.6.

### Patrón de Test

Seguir el patrón establecido en el proyecto:
- `vitest` con `vi.mock` / `vi.mocked`
- Mock de `pg.Pool` con `query` espía
- Usar `pool.query.mockResolvedValue(...)` para simular respuestas

## Git Intelligence

### Recent commits on epic-14 branch

```
93ff7b2 feat: implement SQL migration for reporting module
```

### Work patterns observed

- Commits atómicos por historia (cada historia = 1 commit)
- CHANGELOG.md actualizado con entrada `## [Unreleased]`
- `package.json` version bump (1.1.0 → 1.2.0 en 14-1)
- Tests en `tests/` con naming `*.test.ts`
- OpenAPI regenerado cuando hay cambios de ruta (no aplica aquí)

## Project Context Reference

Ver `_bmad-output/project-context.md` completo. Puntos clave:

- Strict Clean Architecture: domain → application → infrastructure → interfaces
- `pg` directo sin ORM
- snake_case en BD, camelCase en TS
- uuid v4 validado en validators/ no en controladores
- `NotFoundException` para 404, `ForbiddenException` para 403, `ConflictException` para 409
- DTOs nunca exponen campo `location`

## Dev Agent Record

### Completion Notes

- Creados todos los archivos de dominio e infraestructura según especificación PRD-REP-BE-01.
- `EntitySnapshot` cast desde JSONB usa doble cast `as unknown as EntitySnapshot` (TypeScript strict mode con `Record<string, unknown>` sin overlap directo).
- `findAllAdmin`: subquery correlated para `pendingCountForEntity` en lugar de JOIN extra; `whereClause` duplicado en ambos queries (COUNT y SELECT) para consistencia con filtros.
- `findByIdAdmin`: dos queries adicionales para `reportedEntity` (items o users) según `reported_entity_type`; retorna `null` si no existe.
- Tests: 12 tests unitarios con `vi.mock` sobre `pg.Pool`; cubren todos los métodos del contrato.
- Build limpio (OpenAPI + tsc); 7 tests pre-existentes fallidos no relacionados con esta historia.

## File List

- `src/domain/entities/Report.ts` (creado)
- `src/domain/repositories/IReportRepository.ts` (creado)
- `src/infrastructure/database/supabase/report.repository.ts` (creado)
- `src/application/dtos/report/CreateReportDto.ts` (creado)
- `src/application/dtos/report/ReportListDto.ts` (creado)
- `src/application/dtos/report/ReportDetailDto.ts` (creado)
- `src/application/dtos/report/ResolveReportDto.ts` (creado)
- `tests/report-repository.test.ts` (creado)
- `CHANGELOG.md` (modificado)
- `package.json` (modificado — bump 1.1.0 → 1.2.0)
- `_bmad-output/initiative-backend/archive-v6/sprint-status.yaml` (modificado)

## Change Log

- 2026-06-09: Implementación completa de la historia 14-2 — dominio, infraestructura, DTOs y tests unitarios.

## Completion Status

- [x] AC-1: Entidad Report.ts
- [x] AC-2: IReportRepository.ts con 7 métodos
- [x] AC-3: Input y record types
- [x] AC-4: PostgresReportRepository implementación
- [x] AC-5: 4 DTOs en `src/application/dtos/report/`
- [x] AC-6: EntitySnapshot type
- [x] AC-7: Null safety en campos opcionales
- [x] Tests unitarios del repositorio
- [x] `npm test` pasa sin regresiones
- [x] `npm run build` (OpenAPI + tsc) sin errores
- [x] CHANGELOG.md actualizado con `## [Unreleased]`

### Review Findings

- [x] [Review][Patch] `update()` accede a `result.rows[0]` sin guardia — `TypeError` si el `id` no existe en BD [src/infrastructure/database/supabase/report.repository.ts:272-286]
- [x] [Review][Patch] DTOs usan tipos `string` sueltos para `reason`, `status`, `entitySnapshot` y `resolutionAction`/`action` en lugar de los union types del dominio (`ReportReason`, `ReportStatus`, `EntitySnapshot`, `ResolutionAction`) [src/application/dtos/report/]
- [x] [Review][Defer] `create()` sin guardia en resultado RETURNING vacío — patrón pre-existente en todos los repositorios [report.repository.ts:38-58] — deferred, pre-existing
- [x] [Review][Defer] `findAllAdmin` sin validación de `page`/`limit` — OFFSET negativo si `page < 1`, responsabilidad de la capa validators (historia 14-5) [report.repository.ts:93] — deferred, pre-existing
- [x] [Review][Defer] `reporter_id = null` saltea checks de rate-limit y duplicados en `countByReporter*` / `hasPending*` — responsabilidad del use-case (historia 14-3) [report.repository.ts:289-323] — deferred, pre-existing
- [x] [Review][Defer] `dateTo` filtro `<=` excluye registros creados después de medianoche del día de corte — semántica de fecha, concern del use-case (historia 14-5) [report.repository.ts:79] — deferred, pre-existing
- [x] [Review][Defer] `findAllAdmin` ejecuta COUNT + SELECT en dos queries sin transacción — total puede divergir de la lista bajo inserciones concurrentes [report.repository.ts:87-135] — deferred, pre-existing
- [x] [Review][Defer] `resolutionNote` sin límite de longitud en DTO ni validator — concern de la capa validators (historia 14-6) — deferred, pre-existing
- [x] [Review][Defer] Usuario borrado con `reporter_id` no-null devuelve objeto reporter con campos todos `null` excepto `id` [report.repository.ts:256-267] — deferred, pre-existing
- [x] [Review][Defer] `recaptchaToken` en `CreateReportRequestDto` no es validado en esta historia — se implementa en use-case (historia 14-3) — deferred, pre-existing
- [x] [Review][Defer] Array `params` compartido entre la query COUNT y la query SELECT en `findAllAdmin` — frágil si se agregan parámetros entre las dos queries [report.repository.ts:87] — deferred, pre-existing
