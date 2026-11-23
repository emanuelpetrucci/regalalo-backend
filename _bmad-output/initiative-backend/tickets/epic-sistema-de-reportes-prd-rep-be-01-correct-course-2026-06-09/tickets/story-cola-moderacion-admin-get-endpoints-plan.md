---
baseline_commit: fcbe53e912afa5029f6a19db7e1267a2adddea70
title: "Cola de moderación admin (GET endpoints)"
type: feature
ticket: 5
status: done
created: 2026-10-25
baseline_revision: fcbe53e912afa5029f6a19db7e1267a2adddea70
---

# Historia 14.5: Cola de moderación admin — GET endpoints

Status: done

## Story

Como administrador autenticado,
quiero ver el listado paginado de reportes y el detalle de cada uno,
para revisar la cola de moderación y obtener el contexto necesario para tomar decisiones.

## Acceptance Criteria

**AC-1 (Lista de reportes):** `GET /api/admin/reports` responde `200` con:
- Lista de reportes ordenada **FIFO** (`created_at ASC`) — los reportes más antiguos primero
- Filtros opcionales: `status` (default `pending`), `reportedEntityType`, `reason`, `dateFrom`, `dateTo`
- Paginación: `page` (default 1), `limit` (default 20, máx 100)
- Cada item incluye: `id`, `reportedEntityType`, `reportedEntityId`, `reason`, `status`, `createdAt`, `resolvedAt`, `entitySnapshot`, `reporter` (`id|null`, `firstName|null`, `lastName|null`), `pendingCountForEntity`
- `reporter` puede tener todos los campos `null` si `reporter_id` fue anonimizado (RGPD)

**AC-2 (Detalle de reporte):** `GET /api/admin/reports/:id` responde `200` con:
- Campos completos: id, reportedEntityType, reportedEntityId, reason, description, entitySnapshot, status, createdAt, resolvedAt, resolvedBy, resolutionAction, resolutionNote
- `reporter` con: id|null, email|null, firstName|null, lastName|null, reputationScore|null, isActive|null, totalReportsSubmitted, totalReportsPending
- `reporter` es `null` completo si `reporter_id` fue anonimizado
- `reportedEntity.currentState` — estado actual en BD (NO el snapshot), puede ser `null` si entidad eliminada
- Entrada en `admin_audit_log`: `action = 'report.viewed'`, `entity_type = 'report'`, `entity_id = reportId` (siempre, sin condición)

**AC-3 (Errores lista):**
- Filtros inválidos → `400`

**AC-4 (Errores detalle):**
- `:id` no UUID v4 → `400` (usa `validateAdminUuidParam` ya existente)
- Reporte no existe → `404`

**AC-5 (Auth):** todos los endpoints requieren `requireAdminAuth` (ya aplicado globalmente en router tras `router.use(requireAdminAuth)`)

**AC-6 (OpenAPI):** esquemas registrados en `src/openapi/schemas/report.schemas.ts` y paths en `register-paths.ts`

**AC-7 (Tests):** tests HTTP en `tests/admin-reports.test.ts` cubriendo: 401 sin token, lista básica + paginación, filtros, 404 detalle, detalle con reporter anonimizado, audit log invocado en detalle

## Tasks / Subtasks

- [x] Crear `src/application/use-cases/admin/reports/admin-list-reports.use-case.ts` (AC-1)
  - Inyectar `IReportRepository`
  - Llamar `reportRepo.findAllAdmin(query)` — ver IMPORTANTE abajo sobre el ORDER BY
  - Calcular `totalPages = Math.ceil(total / query.limit)`
  - Mapear `AdminReportRecord[]` → `ReportListResponseDto` (ya existe)
  - Retornar `ReportListResponseDto`

- [x] Crear `src/application/use-cases/admin/reports/admin-get-report-detail.use-case.ts` (AC-2)
  - Inyectar `IReportRepository`, `IAdminAuditLogRepository`
  - Llamar `reportRepo.findByIdAdmin(id)` — lanza `NotFoundException` si null
  - **Siempre** crear entrada en `auditLogRepo.create({ adminUserId, action: 'report.viewed', entityType: 'report', entityId: id, ipAddress })`
  - Mapear `AdminReportDetailRecord` → `ReportDetailResponseDto` (ya existe)

- [x] Crear `src/interfaces/validators/admin-list-reports.validator.ts` (AC-3)
  - Validar con Zod: `status` enum, `reportedEntityType` enum, `reason` enum, `dateFrom`/`dateTo` ISO string → `Date`, `page` int min 1, `limit` int min 1 max 100
  - Default: `status = 'pending'`, `page = 1`, `limit = 20`
  - Exportar `validateAdminListReports(req, res, next)`

- [x] Crear `src/interfaces/http/controllers/admin-reports.controller.ts` (AC-1, AC-2)
  - Importar y usar `assertAdminUser(req)` (copiar helper o extraerlo a shared)
  - `listReports`: usar `AdminListReportsUseCase`
  - `getReportDetail`: usar `AdminGetReportDetailUseCase` con `adminUser.id`, `req.params.id`, `req.ip ?? 'unknown'`

- [x] Extender `src/interfaces/http/routes/admin.routes.ts` (AC-5)
  - Añadir `reportRepo?: IReportRepository` a `AdminRouterDeps`
  - Importar `PostgresReportRepository`, `AdminListReportsUseCase`, `AdminGetReportDetailUseCase`, `AdminReportsController`, `validateAdminListReports`
  - Instanciar use cases y controller
  - Registrar rutas (bajo `requireAdminAuth`):
    - `GET /reports` con `validateAdminListReports`
    - `GET /reports/:id` con `validateAdminUuidParam`

- [x] **CORREGIR** `findAllAdmin` en `src/infrastructure/database/supabase/report.repository.ts`
  - Cambiar `ORDER BY r.created_at DESC` → `ORDER BY r.created_at ASC` (PRD §4.2: FIFO)

- [x] Añadir schemas OpenAPI en `src/openapi/schemas/report.schemas.ts` (AC-6)
  - `adminReportListResponseSchema`, `adminReportDetailResponseSchema`
  - Registrar paths en `src/openapi/register-paths.ts`

- [x] Crear `tests/admin-reports.test.ts` (AC-7)
  - Seguir patrón de `tests/admin-sessions.test.ts` con `buildTestApp(depOverrides)`
  - Cubrir todos los ACs

- [x] Verificar `npm test` y `npm run build`
- [x] Actualizar `CHANGELOG.md` bajo `## [Unreleased]` y bump de versión en `package.json`

## Dev Notes

### Infraestructura existente — NO reinventar

| Componente | Ubicación |
|---|---|
| Repositorio (interfaz) | `src/domain/repositories/report.repository.ts` — `IReportRepository` |
| Repositorio (impl) | `src/infrastructure/database/supabase/report.repository.ts` — `PostgresReportRepository` |
| Métodos relevantes | `findAllAdmin(query: AdminReportQuery)`, `findByIdAdmin(id: string)` |
| DTO lista | `src/application/dtos/report/report-list.dto.ts` — `ReportListResponseDto`, `ReportListItemDto` |
| DTO detalle | `src/application/dtos/report/report-detail.dto.ts` — `ReportDetailResponseDto` |
| Entidad | `src/domain/entities/report.entity.ts` — `Report`, `ReportEntityType`, `ReportReason`, `ReportStatus`, `ResolutionAction`, `EntitySnapshot` |
| Audit log repo | `src/domain/repositories/admin-audit-log.repository.ts` — `IAdminAuditLogRepository` |
| UUID validator admin | `src/interfaces/validators/admin-uuid-param.validator.ts` — `validateAdminUuidParam` |
| `requireAdminAuth` | `src/interfaces/http/middlewares/require-admin-auth.middleware.ts` |

### BUG CRÍTICO EN REPO — CORREGIR EN ESTA HISTORIA

`src/infrastructure/database/supabase/report.repository.ts` línea ~133:

```sql
-- ACTUAL (incorrecto — DESC)
ORDER BY r.created_at DESC

-- CORRECTO (FIFO según PRD §4.2)
ORDER BY r.created_at ASC
```

El PRD §4.2 exige FIFO: "los reportes más antiguos se atienden primero". La implementación actual tiene el orden invertido.

### AdminReportQuery — tipos de entrada

```typescript
// src/domain/repositories/report.repository.ts
interface AdminReportQuery {
  status?: ReportStatus;
  reportedEntityType?: ReportEntityType;
  reason?: ReportReason;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  limit: number;
}
```

El validator debe parsear los query params de Express (strings) y convertir a los tipos correctos antes de pasarlos al use case.

### Patrón use case — lista (de `admin-list-sessions.use-case.ts`)

```typescript
export class AdminListReportsUseCase {
  constructor(private readonly reportRepo: IReportRepository) {}

  async execute(query: AdminReportQuery): Promise<ReportListResponseDto> {
    const { reports: records, total } = await this.reportRepo.findAllAdmin(query);
    const totalPages = Math.ceil(total / query.limit);
    const adjustedPage = totalPages > 0 ? Math.min(query.page, totalPages) : 1;

    return {
      reports: records,  // AdminReportRecord ya tiene la estructura de ReportListItemDto
      pagination: { total, page: adjustedPage, limit: query.limit, totalPages },
    };
  }
}
```

`AdminReportRecord` (del repo) tiene exactamente los mismos campos que `ReportListItemDto` (del DTO). No hace falta mapear campo por campo — son compatibles structuralmente.

### Patrón use case — detalle (de `admin-get-session-detail.use-case.ts`)

```typescript
export class AdminGetReportDetailUseCase {
  constructor(
    private readonly reportRepo: IReportRepository,
    private readonly auditLogRepo: IAdminAuditLogRepository,
  ) {}

  async execute(adminUserId: string, reportId: string, ipAddress: string): Promise<ReportDetailResponseDto> {
    const record = await this.reportRepo.findByIdAdmin(reportId);
    if (!record) throw new NotFoundException('Report not found');

    // Siempre auditar — a diferencia de sessions (solo si !contactPurged), aquí es incondicional
    await this.auditLogRepo.create({
      adminUserId,
      action: 'report.viewed',
      entityType: 'report',
      entityId: reportId,
      ipAddress,
    });

    // AdminReportDetailRecord es structuralmente compatible con ReportDetailResponseDto
    return record;
  }
}
```

**Diferencia clave vs `AdminGetSessionDetailUseCase`:** el audit log se registra **siempre** (no hay condición). En sesiones, solo se registraba si `!contactPurged`.

### Patrón controller (de `admin-sessions.controller.ts`)

```typescript
import { UnauthorizedException } from '../../../domain/exceptions/unauthorized.exception';

function assertAdminUser(req: Request): { id: string } {
  if (!req.adminUser) throw new UnauthorizedException('Authentication required');
  return req.adminUser;
}

export class AdminReportsController {
  constructor(
    private readonly listReportsUseCase: AdminListReportsUseCase,
    private readonly getReportDetailUseCase: AdminGetReportDetailUseCase,
  ) {}

  async listReports(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as AdminReportQuery;
      const result = await this.listReportsUseCase.execute(query);
      res.status(200).json(result);
    } catch (err) { next(err); }
  }

  async getReportDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUser = assertAdminUser(req);
      const result = await this.getReportDetailUseCase.execute(
        adminUser.id,
        req.params.id,
        req.ip ?? 'unknown',
      );
      res.status(200).json(result);
    } catch (err) { next(err); }
  }
}
```

### Extensión de admin.routes.ts

Añadir al interface `AdminRouterDeps`:
```typescript
reportRepo?: IReportRepository;
```

En la función `createAdminRouter`:
```typescript
import { PostgresReportRepository } from '../../../infrastructure/database/supabase/report.repository';
import { IReportRepository } from '../../../domain/repositories/report.repository';
import { AdminListReportsUseCase } from '../../../application/use-cases/admin/reports/admin-list-reports.use-case';
import { AdminGetReportDetailUseCase } from '../../../application/use-cases/admin/reports/admin-get-report-detail.use-case';
import { AdminReportsController } from '../controllers/admin-reports.controller';
import { validateAdminListReports } from '../../validators/admin-list-reports.validator';

// En el cuerpo de createAdminRouter:
const reportRepo = deps.reportRepo ?? new PostgresReportRepository(db);
const reportsController = new AdminReportsController(
  new AdminListReportsUseCase(reportRepo),
  new AdminGetReportDetailUseCase(reportRepo, adminAuditLogRepo),
);

// Rutas (bajo requireAdminAuth):
router.get('/reports', validateAdminListReports, (req, res, next) =>
  reportsController.listReports(req, res, next),
);
router.get('/reports/:id', validateAdminUuidParam, (req, res, next) =>
  reportsController.getReportDetail(req, res, next),
);
```

### Validator de lista — patrón

```typescript
import { z } from '../../zod';
import { Request, Response, NextFunction } from 'express';

const adminListReportsSchema = z.object({
  status: z.enum(['pending', 'resolved', 'archived']).optional().default('pending'),
  reportedEntityType: z.enum(['item', 'user']).optional(),
  reason: z.enum([
    'contenido_inadecuado', 'fraude_o_enganio', 'spam',
    'objeto_ilegal', 'objeto_peligroso', 'información_falsa',
    'comportamiento_abusivo', 'otro',
  ]).optional(),
  dateFrom: z.string().datetime({ offset: true }).transform(v => new Date(v)).optional(),
  dateTo: z.string().datetime({ offset: true }).transform(v => new Date(v)).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export function validateAdminListReports(req: Request, res: Response, next: NextFunction): void {
  const result = adminListReportsSchema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid query parameters', errors: result.error.issues });
    return;
  }
  req.query = result.data as unknown as typeof req.query;
  next();
}
```

### Estructura de archivos nuevos

```
src/
  application/
    use-cases/
      admin/
        reports/                          ← nueva carpeta
          admin-list-reports.use-case.ts  ← NUEVO
          admin-get-report-detail.use-case.ts ← NUEVO
  interfaces/
    http/
      controllers/
        admin-reports.controller.ts       ← NUEVO
    validators/
      admin-list-reports.validator.ts     ← NUEVO
```

Archivos MODIFICADOS:
- `src/interfaces/http/routes/admin.routes.ts`
- `src/infrastructure/database/supabase/report.repository.ts` (fix ORDER BY)
- `src/openapi/schemas/report.schemas.ts`
- `src/openapi/register-paths.ts`
- `CHANGELOG.md`
- `package.json`

### Tests — patrón de `admin-sessions.test.ts`

```typescript
// tests/admin-reports.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAdminRouter } from '../src/interfaces/http/routes/admin.routes';
import { errorHandler } from '../src/interfaces/http/middlewares/error-handler';

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const REPORT_ID = 'cccccccc-dddd-4eee-8fff-111111111111';
const REPORTER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ENTITY_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

const baseReportRecord = {
  id: REPORT_ID,
  reportedEntityType: 'item',
  reportedEntityId: ENTITY_ID,
  reason: 'spam',
  status: 'pending',
  createdAt: new Date('2026-06-01T10:00:00Z'),
  resolvedAt: null,
  entitySnapshot: { entityType: 'item', title: 'Mesa de madera', status: 'active', category: 'furniture', description: 'Una mesa' },
  reporter: { id: REPORTER_ID, firstName: 'Ana', lastName: 'García' },
  pendingCountForEntity: 1,
};

const baseReportDetailRecord = {
  ...baseReportRecord,
  description: null,
  resolvedBy: null,
  resolutionAction: null,
  resolutionNote: null,
  reporter: {
    id: REPORTER_ID,
    email: 'ana@example.com',
    firstName: 'Ana',
    lastName: 'García',
    reputationScore: 10,
    isActive: true,
    totalReportsSubmitted: 3,
    totalReportsPending: 1,
  },
  reportedEntity: {
    type: 'item',
    currentState: { id: ENTITY_ID, title: 'Mesa de madera', status: 'active', category: 'furniture' },
  },
};

function buildTestApp(depOverrides = {}) {
  const app = express();
  app.use(express.json());

  const defaultDeps = {
    // Mocks mínimos para que requireAdminAuth pase
    adminUserRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn().mockResolvedValue({ id: ADMIN_ID, email: 'admin@test.example.com', isActive: true }),
      updateLastLogin: vi.fn(),
      updateJwtVersion: vi.fn(),
    },
    adminOtpTokenRepo: {
      findActiveByAdminId: vi.fn().mockResolvedValue(null),
      invalidateByAdminId: vi.fn(),
      create: vi.fn(),
      markUsed: vi.fn(),
      incrementAttempts: vi.fn().mockResolvedValue(1),
    },
    adminAuditLogRepo: { create: vi.fn().mockResolvedValue(undefined) },
    hashService: { hash: vi.fn(), verify: vi.fn().mockResolvedValue(true) },
    adminJwtService: {
      sign: vi.fn().mockReturnValue('mock-admin-jwt-token'),
      verify: vi.fn().mockReturnValue({ sub: ADMIN_ID, role: 'admin', jwtVersion: 1 }),
    },
    mailService: { send: vi.fn().mockResolvedValue(undefined) },
    // Repos con métodos mínimos para no romper createAdminRouter
    userRepo: { findByEmail: vi.fn(), findById: vi.fn(), adminFindAll: vi.fn(), adminFindById: vi.fn(), adminSuspend: vi.fn(), adminReactivate: vi.fn(), adminForceVerification: vi.fn(), adminCorrectReputation: vi.fn(), adminResetNoShows: vi.fn(), findReputationHistory: vi.fn(), findMyDeliverySessions: vi.fn(), findMyItems: vi.fn(), findMyRequests: vi.fn(), create: vi.fn(), updateProfile: vi.fn(), updateVerificationToken: vi.fn(), markEmailVerified: vi.fn(), findByVerificationTokenHash: vi.fn() },
    itemRepo: { createWithImages: vi.fn(), findActiveInRadius: vi.fn(), findById: vi.fn(), findItemOwnership: vi.fn(), hasActiveDeliverySession: vi.fn(), cancelItem: vi.fn(), setPauseStatus: vi.fn(), findNewlyDegradedItems: vi.fn(), claimPendingDigestItems: vi.fn(), findEligibleDigestUsersForItem: vi.fn(), adminFindAll: vi.fn().mockResolvedValue({ items: [], total: 0 }), adminFindById: vi.fn().mockResolvedValue(null), adminReactivateItem: vi.fn(), findForReport: vi.fn() },
    deliverySessionRepo: { adminFindAll: vi.fn().mockResolvedValue({ sessions: [], total: 0 }), adminFindById: vi.fn().mockResolvedValue(null), adminForceExpireSession: vi.fn(), selectReceiver: vi.fn(), findById: vi.fn(), findByIdForParticipant: vi.fn(), confirmDelivery: vi.fn(), cancelDelivery: vi.fn(), findExpiredSessions: vi.fn() },
    reportRepo: {
      create: vi.fn(),
      findAllAdmin: vi.fn().mockResolvedValue({ reports: [baseReportRecord], total: 1 }),
      findByIdAdmin: vi.fn().mockResolvedValue(baseReportDetailRecord),
      update: vi.fn(),
      countByReporterAndEntity: vi.fn(),
      countByReporterSince: vi.fn(),
      hasPendingByReporterAndEntity: vi.fn(),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/admin', createAdminRouter(deps));
  app.use(errorHandler);
  return { app, deps };
}

const AUTH_HEADER = { Authorization: 'Bearer valid-admin-token' };
```

#### Casos de test a cubrir

| Test ID | Descripción | Endpoint |
|---|---|---|
| 14.5.1 | Sin token → 401 | GET /admin/reports |
| 14.5.2 | Sin token → 401 | GET /admin/reports/:id |
| 14.5.3 | Lista básica → 200 con reports y pagination | GET /admin/reports |
| 14.5.4 | Filtro `status=archived` → llama repo con status correcto | GET /admin/reports |
| 14.5.5 | `limit=101` → 400 | GET /admin/reports |
| 14.5.6 | ID no UUID → 400 | GET /admin/reports/no-uuid |
| 14.5.7 | Reporte no existe (repo retorna null) → 404 | GET /admin/reports/:id |
| 14.5.8 | Detalle completo → 200 con todos los campos | GET /admin/reports/:id |
| 14.5.9 | Audit log invocado con action=report.viewed | GET /admin/reports/:id |
| 14.5.10 | reporter null (anonimizado) → 200 sin error | GET /admin/reports/:id |

### Manejo del reporter anonimizado

Cuando `reporter_id` es NULL en BD, el repo devuelve `reporter: null` en el detalle. El DTO ya contempla `reporter: {...} | null`. El controller simplemente pasa el resultado del use case directamente.

Para el test 14.5.10, mockear `findByIdAdmin` para devolver:
```typescript
{ ...baseReportDetailRecord, reporter: null }
```
y verificar que la respuesta es `200` con `reporter: null`.

### OpenAPI schemas — añadir a `report.schemas.ts`

Agregar schemas para:
- `AdminReportListResponse` — array de reports con pagination
- `AdminReportDetailResponse` — detalle completo

Y registrar paths en `register-paths.ts`:
```
GET /api/admin/reports       → adminReportListResponseSchema
GET /api/admin/reports/{id}  → adminReportDetailResponseSchema
```

Seguir patrón de `admin.schemas.ts` para los tipos de response de admin.

### Convenciones críticas (de project-context.md)

- **Capas:** `use-cases` solo lógica de negocio → `repositories` (interfaces) → `infrastructure` (implementaciones)
- **DTOs:** siempre en `application/dtos/` — ya existen, no crear nuevos
- **Controladores:** orquestan únicamente — validar → use case → HTTP
- **Autorización:** `requireAdminAuth` ya está aplicado en `router.use(requireAdminAuth)` antes de las rutas admin; NO duplicar en rutas individuales
- **UUID:** `validateAdminUuidParam` ya valida `:id` — no crear nuevo validator
- **Importaciones:** sin extensión `.js` en tests, CON extensión `.js` en `src/`
- **Zod:** importar desde `../../zod` (no desde `zod` directamente)
- **OpenAPI:** regenerar con `npm run openapi:generate` tras añadir schemas
- **Versioning:** bump `package.json` + entrada en `CHANGELOG.md`

### Dependencias — sin cambios en package.json

Todos los módulos necesarios ya están instalados. Sin nuevas dependencias.

## Project Context Reference

Ver `_bmad-output/project-context.md`. Puntos clave:
- Stack: Node.js + Express + TypeScript + PostgreSQL (pg, sin ORM)
- Clean Architecture: domain → application → infrastructure → interfaces
- Vitest + Supertest para tests
- `z` importar solo desde `src/zod.ts`
- `npm run build` = OpenAPI + tsc
- Admin routes: CORS restrictivo a `admin.regalalo.org`, JWT firmado con `ADMIN_JWT_SECRET`

## Dev Agent Record

### Completion Notes

- Implementados `AdminListReportsUseCase` y `AdminGetReportDetailUseCase` en `src/application/use-cases/admin/reports/` siguiendo patrones de sesiones admin.
- `AdminGetReportDetailUseCase` registra audit log SIEMPRE (a diferencia de sesiones que solo lo hacía si `!contactPurged`).
- Fix aplicado: `ORDER BY r.created_at DESC` → `ASC` en `findAllAdmin` del repo (bug FIFO).
- `AdminRouterDeps` extendido con `reportRepo?: IReportRepository`; instanciación lazy en `createAdminRouter`.
- Schemas OpenAPI `AdminReportListResponse` y `AdminReportDetailResponse` — `z.record()` requiere 2 args en Zod v4 (`z.record(z.string(), z.unknown())`).
- 12 tests pasan; fallos pre-existentes en tests de integración DB y snapshot de email no relacionados con esta historia.

### File List

**Archivos nuevos:**
- `src/application/use-cases/admin/reports/admin-list-reports.use-case.ts`
- `src/application/use-cases/admin/reports/admin-get-report-detail.use-case.ts`
- `src/interfaces/validators/admin-list-reports.validator.ts`
- `src/interfaces/http/controllers/admin-reports.controller.ts`
- `tests/admin-reports.test.ts`

**Archivos modificados:**
- `src/infrastructure/database/supabase/report.repository.ts` (fix ORDER BY ASC)
- `src/interfaces/http/routes/admin.routes.ts` (reportRepo + reportsController + rutas)
- `src/openapi/schemas/report.schemas.ts` (AdminReportListResponse, AdminReportDetailResponse)
- `src/openapi/register-paths.ts` (paths /admin/reports y /admin/reports/{id})
- `openapi/openapi.json` (regenerado)
- `CHANGELOG.md`
- `package.json` (1.1.0 → 1.2.0)

### Change Log

- 2026-06-11: Implementación completa de historia 14-5 — cola de moderación admin GET endpoints.

### Review Findings

**decision-needed:**

- [x] [Review][Decision] ¿Debería auditarse el listado de reportes? — No, mantener solo auditoría en detalle. Decidido por Emanuel.
- [x] [Review][Decision] ¿Soporte para consultar todos los status? — No, mantener default `pending`. Decidido por Emanuel.
- [x] [Review][Decision] ¿Dirección de ordenamiento configurable? — No, mantener FIFO (ASC fijo) según PRD. Decidido por Emanuel.

**patch:**

- [x] [Review][Patch] Inconsistencia de paginación: eliminado clamping post-query [admin-list-reports.use-case.ts:7-10]
- [x] [Review][Patch] Añadido `assertAdminUser` a `listReports` [admin-reports.controller.ts:18-26]
- [x] [Review][Patch] Añadido tiebreaker `r.id ASC` a ORDER BY [report.repository.ts:133]
- [x] [Review][Patch] Preprocess empty strings en Zod validator [admin-list-reports.validator.ts:4-10]
- [x] [Review][Patch] Audit log envuelto en try-catch (fire-and-forget) [admin-get-report-detail.use-case.ts:15-20]

**defer:**

- [x] [Review][Defer] Mock boilerplate en repos no relacionados [tests/admin-reports.test.ts] — deferred, pre-existing
- [x] [Review][Defer] Type coercion `req.query as unknown as AdminReportQuery` [admin-reports.controller.ts:20] — deferred, pre-existing
- [x] [Review][Defer] Sin rate limiting por endpoint admin [admin.routes.ts:203-209] — deferred, pre-existing
- [x] [Review][Defer] Subquery `pendingCountForEntity` por fila (N+1) [report.repository.ts] — deferred, pre-existing
- [x] [Review][Defer] `dateTo` inclusivo de medianoche — boundary issue — deferred, pre-existing
- [x] [Review][Defer] Ruta `/reports/:id` frágil ante futuras rutas como `/reports/stats` [admin.routes.ts:206] — deferred, pre-existing

## Completion Status

- [x] AC-1: `AdminListReportsUseCase` + validator + controller method + route
- [x] AC-2: `AdminGetReportDetailUseCase` + controller method + route + audit log
- [x] AC-3: Validación de filtros inválidos
- [x] AC-4: 400 UUID inválido, 404 not found
- [x] AC-5: Auth via `requireAdminAuth` en router
- [x] AC-6: OpenAPI schemas registrados
- [x] AC-7: Tests en `tests/admin-reports.test.ts`
- [x] Fix ORDER BY ASC en `findAllAdmin`
- [x] `npm test` pasa sin regresiones
- [x] `npm run build` sin errores
- [x] `CHANGELOG.md` actualizado
- [x] `package.json` versión bumpeada
