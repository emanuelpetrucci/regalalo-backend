---
baseline_commit: 2601358d19e3eefa8e61a0ecdb2fba097209da34
title: "Resolución de reportes admin (POST endpoint)"
type: feature
ticket: 6
status: done
created: 2026-10-25
baseline_revision: 2601358d19e3eefa8e61a0ecdb2fba097209da34
---

# Historia 14.6: Resolución de reportes admin (POST endpoint)

Status: done

## Story

Como administrador autenticado,
quiero cerrar un reporte con una acción de resolución y nota obligatoria,
para dejar trazabilidad de cada decisión de moderación y ejecutar las consecuencias correspondientes.

## Acceptance Criteria

**AC-1 (Resolución básica):** `POST /api/admin/reports/:id/resolve` con `action='archive'` y `resolutionNote` no vacío responde `200`:
```json
{ "message": "Reporte cerrado", "action": "archive", "reportId": "<uuid>" }
```
El reporte pasa a `status='archived'`; `resolved_at` y `resolved_by` quedan registrados.

**AC-2 (Audit log):** Siempre se inserta en `admin_audit_log` con `action='report.resolved'`, `entity_type='report'`, `entity_id=reportId`.

**AC-3 (TPL-012 al denunciante):** Si `reporter_id IS NOT NULL` (campo `reporter !== null` en `findByIdAdmin`), se envía TPL-012 al denunciante post-commit (fire-and-forget).

**AC-4 (warn_user):** `action='warn_user'` sobre reporte de tipo `user` → `status='resolved'`; se envía TPL-013 al usuario denunciado (fire-and-forget, post-commit).

**AC-5 (cancel_item):** `action='cancel_item'` sobre reporte de tipo `item` → `status='resolved'`; se invoca `AdminCancelItemUseCase` (que maneja su propia cascada: actualiza item, inserta `item.cancelled` en audit_log, fuego TPL-005 si había receptor).

**AC-6 (suspend_user):** `action='suspend_user'` sobre reporte de tipo `user` → `status='resolved'`; se invoca `AdminSuspendUserUseCase` (que actualiza user, inserta `user.suspended` en audit_log).

**AC-7 (Ya cerrado):** Reporte en `status='resolved'` o `'archived'` → `409 REPORT_ALREADY_CLOSED`, sin modificaciones.

**AC-8 (Incompatibilidad acción/entidad):** `cancel_item` sobre reporte de `user`, o `warn_user`/`suspend_user` sobre reporte de `item` → `422 ACTION_ENTITY_MISMATCH`.

**AC-9 (Estado de entidad conflictivo):** Entidad ya en el estado que la acción aplicaría (objeto ya cancelado/completado, usuario ya suspendido) → `409 ENTITY_STATE_CONFLICT`; reporte **permanece en `pending`**.

**AC-10 (Errores de validación):** `resolutionNote` vacío o `action` inválido → `400`.

**AC-11 (Errores estándar):** `:id` no UUID v4 → `400`; reporte no existe → `404`.

**AC-12 (Auth):** Requiere `requireAdminAuth` (ya aplicado globalmente en el router).

**AC-13 (OpenAPI):** Schemas registrados en `report.schemas.ts`; path en `register-paths.ts`.

**AC-14 (Tests):** Tests HTTP en `tests/admin-reports.test.ts` cubriendo todos los ACs.

## Tasks / Subtasks

- [x] Crear `src/application/use-cases/admin/reports/admin-resolve-report.use-case.ts`
  - Inyectar: `IReportRepository`, `IUserRepository`, `IAdminAuditLogRepository`, `IMailService`, `AdminCancelItemUseCase`, `AdminSuspendUserUseCase`
  - Secuencia: fetch report → validar pending → validar action/entity → cascade use case (si aplica) → update report → audit log → post-commit emails

- [x] Crear `src/interfaces/validators/admin-resolve-report.validator.ts`
  - Validar body: `action` enum, `resolutionNote` string min 1 max 1000

- [x] Modificar `src/interfaces/http/controllers/admin-reports.controller.ts`
  - Añadir `AdminResolveReportUseCase` al constructor
  - Añadir método `resolveReport`

- [x] Modificar `src/interfaces/http/routes/admin.routes.ts`
  - Importar `AdminResolveReportUseCase` y `validateAdminResolveReport`
  - Actualizar `reportsController` con el nuevo use case
  - Registrar `POST /reports/:id/resolve` con `validateAdminUuidParam` + `validateAdminResolveReport`

- [x] Añadir schemas OpenAPI en `src/openapi/schemas/report.schemas.ts`
  - `adminResolveReportRequestSchema`, `adminResolveReportResponseSchema`

- [x] Registrar path en `src/openapi/register-paths.ts`

- [x] Extender `tests/admin-reports.test.ts` con tests 14.6.x

- [x] Verificar `npm test` y `npm run build`
- [x] Actualizar `CHANGELOG.md` y bump `package.json` (1.1.0 → 1.2.0)

## Dev Notes

### Infraestructura existente — NO reinventar

| Componente | Ubicación |
|---|---|
| Repo (interfaz) | `src/domain/repositories/report.repository.ts` — `IReportRepository` |
| Repo (impl) | `src/infrastructure/database/supabase/report.repository.ts` — `PostgresReportRepository` |
| Método `update` | `reportRepo.update(id, UpdateReportInput)` — ya existe, usa `ReportDbRow` RETURNING |
| Método `findByIdAdmin` | `reportRepo.findByIdAdmin(id)` — retorna `AdminReportDetailRecord | null` (con `reporter.email`, `reporter.firstName`) |
| DTO respuesta | `src/application/dtos/report/resolve-report.dto.ts` — `ResolveReportResponseDto` |
| `AdminCancelItemUseCase` | `src/application/use-cases/admin/items/admin-cancel-item.use-case.ts` |
| `AdminSuspendUserUseCase` | `src/application/use-cases/admin/users/admin-suspend-user.use-case.ts` |
| `IUserRepository.findById` | Devuelve `User | null` con `{ email, firstName }` — necesario para TPL-013 |
| Exceptions | `ConflictException`, `NotFoundException`, `UnprocessableEntityException` en `src/domain/exceptions/` |
| Templates | TPL-012: `tpl-012-report-resolved.ts`; TPL-013: `tpl-013-warn-user.ts` |
| Validator UUID admin | `validateAdminUuidParam` — valida `:id` como UUID v4 |
| `requireAdminAuth` | Ya aplicado en `router.use(requireAdminAuth)` — **NO duplicar** |

### Estrategia de atomicidad (CRÍTICO)

El PRD requiere que `cancel_item` y `suspend_user` se ejecuten en la misma transacción que la actualización del reporte. Dado que el proyecto no expone un cliente `pg.PoolClient` compartido entre repos, se usa el patrón **"cascade primero, update después"**:

```
1. fetchReport (findByIdAdmin)
2. validar pending → ConflictException('REPORT_ALREADY_CLOSED') si no
3. validar action/entity compatibility → UnprocessableEntityException si no aplica
4. capturar payloadSnapshot para audit log
5. SI action='cancel_item': AdminCancelItemUseCase.execute(adminUserId, report.reportedEntityId, ipAddress)
   → Si lanza ConflictException: el reporte sigue en 'pending' → 409 ENTITY_STATE_CONFLICT ✓
6. SI action='suspend_user': AdminSuspendUserUseCase.execute(adminUserId, report.reportedEntityId, ipAddress)
   → Si lanza ConflictException: el reporte sigue en 'pending' → 409 ENTITY_STATE_CONFLICT ✓
7. reportRepo.update(reportId, { status, resolvedAt, resolvedBy, resolutionAction, resolutionNote })
8. auditLogRepo.create({ action: 'report.resolved', ... })
9. Post-commit fire-and-forget: TPL-012, TPL-013
```

**Por qué este orden:** Si el cascade (paso 5/6) falla con `ConflictException`, saltamos directamente al error handler → el reporte nunca fue modificado → cumple AC-9 sin rollback manual.

**Riesgo aceptado:** Si el paso 7 (update report) falla después del cascade exitoso, el item/usuario ya fue modificado pero el reporte queda en pending. Probabilidad muy baja (fallo de conexión DB entre dos queries consecutivas); aceptable para v1.

### Signature del use case

```typescript
// src/application/use-cases/admin/reports/admin-resolve-report.use-case.ts
import { IReportRepository } from '../../../../domain/repositories/report.repository.js';
import { IUserRepository } from '../../../../domain/repositories/user.repository.js';
import { IAdminAuditLogRepository } from '../../../../domain/repositories/admin-audit-log.repository.js';
import { IMailService } from '../../../../domain/services/mail.service.js';
import { AdminCancelItemUseCase } from '../items/admin-cancel-item.use-case.js';
import { AdminSuspendUserUseCase } from '../users/admin-suspend-user.use-case.js';
import type { ResolveReportResponseDto } from '../../../dtos/report/resolve-report.dto.js';
import type { ResolutionAction } from '../../../../domain/entities/report.entity.js';
import { NotFoundException } from '../../../../domain/exceptions/not-found.exception.js';
import { ConflictException } from '../../../../domain/exceptions/conflict.exception.js';
import { UnprocessableEntityException } from '../../../../domain/exceptions/unprocessable-entity.exception.js';
import { appLogger } from '../../../../config/loggers.js';

export class AdminResolveReportUseCase {
  constructor(
    private readonly reportRepo: IReportRepository,
    private readonly userRepo: IUserRepository,
    private readonly auditLogRepo: IAdminAuditLogRepository,
    private readonly mailService: IMailService,
    private readonly cancelItemUseCase: AdminCancelItemUseCase,
    private readonly suspendUserUseCase: AdminSuspendUserUseCase,
  ) {}

  async execute(
    adminUserId: string,
    reportId: string,
    action: ResolutionAction,
    resolutionNote: string,
    ipAddress: string,
  ): Promise<ResolveReportResponseDto> {
    // 1. Fetch report
    const report = await this.reportRepo.findByIdAdmin(reportId);
    if (!report) throw new NotFoundException('Report not found');

    // 2. Verificar que está pending
    if (report.status !== 'pending') throw new ConflictException('REPORT_ALREADY_CLOSED');

    // 3. Validar compatibilidad acción/entidad
    if (action === 'cancel_item' && report.reportedEntityType !== 'item') {
      throw new UnprocessableEntityException('ACTION_ENTITY_MISMATCH');
    }
    if ((action === 'warn_user' || action === 'suspend_user') && report.reportedEntityType !== 'user') {
      throw new UnprocessableEntityException('ACTION_ENTITY_MISMATCH');
    }

    // 4. Payload snapshot para audit log
    const payloadSnapshot = {
      status: 'pending',
      reason: report.reason,
      reported_entity_type: report.reportedEntityType,
      reported_entity_id: report.reportedEntityId,
      action,
      resolutionNote,
    };

    // 5. Ejecutar cascade ANTES de update del reporte (si falla → ConflictException → 409 → reporte queda pending)
    if (action === 'cancel_item') {
      await this.cancelItemUseCase.execute(adminUserId, report.reportedEntityId, ipAddress);
    } else if (action === 'suspend_user') {
      await this.suspendUserUseCase.execute(adminUserId, report.reportedEntityId, ipAddress);
    }

    // 6. Determinar nuevo status del reporte
    const newStatus = action === 'archive' ? 'archived' : 'resolved';

    // 7. Actualizar reporte
    await this.reportRepo.update(reportId, {
      status: newStatus as typeof report.status,
      resolvedAt: new Date(),
      resolvedBy: adminUserId,
      resolutionAction: action,
      resolutionNote,
    });

    // 8. Audit log report.resolved
    await this.auditLogRepo.create({
      adminUserId,
      action: 'report.resolved',
      entityType: 'report',
      entityId: reportId,
      payloadSnapshot,
      ipAddress,
    });

    // 9. Post-commit fire-and-forget
    // TPL-012 al denunciante (si no fue anonimizado)
    if (report.reporter !== null && report.reporter.id !== null && report.reporter.email) {
      const entityTypeLabel = report.reportedEntityType === 'item' ? 'objeto' : 'usuario';
      this.mailService
        .send({
          to: report.reporter.email,
          templateId: 'TPL-012',
          variables: {
            recipientEmail: report.reporter.email,
            firstName: report.reporter.firstName ?? '',
            reportedEntityType: entityTypeLabel,
          },
        })
        .catch((err) => appLogger.error({ err }, 'TPL-012 email failed'));
    }

    // TPL-013 al denunciado (solo si action='warn_user')
    if (action === 'warn_user') {
      try {
        const reportedUser = await this.userRepo.findById(report.reportedEntityId);
        if (reportedUser) {
          this.mailService
            .send({
              to: reportedUser.email,
              templateId: 'TPL-013',
              variables: {
                recipientEmail: reportedUser.email,
                firstName: reportedUser.firstName,
              },
            })
            .catch((err) => appLogger.error({ err }, 'TPL-013 email failed'));
        }
      } catch (err) {
        appLogger.error({ err }, 'TPL-013 user lookup failed');
      }
    }

    return { message: 'Reporte cerrado', action, reportId };
  }
}
```

### Notas importantes sobre `getReportedEntityLabel`

`src/infrastructure/email/templates/condition-labels.ts` — `getReportedEntityLabel` espera `'objeto'` o `'usuario'` (español), **no** `'item'`/`'user'`. Mapear antes de pasar a la variable del template:

```typescript
const entityTypeLabel = report.reportedEntityType === 'item' ? 'objeto' : 'usuario';
```

### Validator body (patrón de `admin-correct-reputation.validator.ts`)

```typescript
// src/interfaces/validators/admin-resolve-report.validator.ts
import { z } from '../../zod.js';
import { Request, Response, NextFunction } from 'express';

const adminResolveReportSchema = z.object({
  action: z.enum(['archive', 'warn_user', 'cancel_item', 'suspend_user']),
  resolutionNote: z.string().min(1).max(1000),
});

export function validateAdminResolveReport(req: Request, res: Response, next: NextFunction): void {
  const result = adminResolveReportSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request body', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
```

### Controller — añadir método `resolveReport` y tercer argumento al constructor

```typescript
// src/interfaces/http/controllers/admin-reports.controller.ts
// Añadir import:
import { AdminResolveReportUseCase } from '../../../application/use-cases/admin/reports/admin-resolve-report.use-case.js';

// Actualizar constructor:
export class AdminReportsController {
  constructor(
    private readonly listReportsUseCase: AdminListReportsUseCase,
    private readonly getReportDetailUseCase: AdminGetReportDetailUseCase,
    private readonly resolveReportUseCase: AdminResolveReportUseCase,  // ← NUEVO
  ) {}

  // ... métodos existentes ...

  async resolveReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUser = assertAdminUser(req);
      const result = await this.resolveReportUseCase.execute(
        adminUser.id,
        req.params.id,
        req.body.action,
        req.body.resolutionNote,
        req.ip ?? 'unknown',
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
```

### Routes — extender `admin.routes.ts`

Añadir imports:
```typescript
import { AdminResolveReportUseCase } from '../../../application/use-cases/admin/reports/admin-resolve-report.use-case.js';
import { validateAdminResolveReport } from '../../validators/admin-resolve-report.validator.js';
```

Actualizar instanciación de `reportsController`:
```typescript
const reportsController = new AdminReportsController(
  new AdminListReportsUseCase(reportRepo),
  new AdminGetReportDetailUseCase(reportRepo, adminAuditLogRepo),
  new AdminResolveReportUseCase(
    reportRepo,
    userRepo,
    adminAuditLogRepo,
    mailService,
    new AdminCancelItemUseCase(itemRepo, userRepo, mailService, adminAuditLogRepo),
    new AdminSuspendUserUseCase(userRepo, adminAuditLogRepo),
  ),
);
```

Añadir ruta (después de las dos rutas GET de reports ya existentes):
```typescript
router.post('/reports/:id/resolve', validateAdminUuidParam, validateAdminResolveReport, (req, res, next) =>
  reportsController.resolveReport(req, res, next),
);
```

### OpenAPI schemas — añadir a `report.schemas.ts`

```typescript
export const adminResolveReportRequestSchema = z
  .object({
    action: z.enum(['archive', 'warn_user', 'cancel_item', 'suspend_user']),
    resolutionNote: z.string().min(1).max(1000),
  })
  .openapi('AdminResolveReportRequest');

export const adminResolveReportResponseSchema = z
  .object({
    message: z.string(),
    action: z.enum(['archive', 'warn_user', 'cancel_item', 'suspend_user']),
    reportId: z.string().uuid(),
  })
  .openapi('AdminResolveReportResponse');
```

### OpenAPI path — añadir a `register-paths.ts`

Añadir los imports de los nuevos schemas y registrar path. Insertar **antes** del path de `/admin/metrics` (después de `/admin/reports/{id}`):

```typescript
// En imports al inicio de registerOpenApiPaths (dentro del bloque imports de report.schemas):
// Añadir: adminResolveReportRequestSchema, adminResolveReportResponseSchema

registry.registerPath({
  method: 'post',
  path: '/admin/reports/{id}/resolve',
  tags: ['Admin-Reports'],
  summary: 'Cerrar reporte con acción de resolución y nota obligatoria',
  security: [...adminSecured],
  request: {
    params: z.object({ id: uuidParamSchema }),
    body: { content: { 'application/json': { schema: adminResolveReportRequestSchema } } },
  },
  responses: {
    200: json(adminResolveReportResponseSchema, 'Reporte cerrado'),
    400: err400,
    401: err401,
    404: err404,
    409: err409,
    422: err422,
    500: err500,
  },
});
```

### Tests — extender `tests/admin-reports.test.ts`

Añadir al mock `reportRepo` en `buildTestApp` el método `update`:
```typescript
reportRepo: {
  // ... métodos existentes de 14-5 ...
  update: vi.fn().mockResolvedValue({
    id: REPORT_ID,
    reporterId: REPORTER_ID,
    reportedEntityType: 'item',
    reportedEntityId: ENTITY_ID,
    reason: 'spam',
    description: null,
    entitySnapshot: {},
    status: 'resolved',
    resolvedAt: new Date(),
    resolvedBy: ADMIN_ID,
    resolutionAction: 'archive',
    resolutionNote: 'Test note',
    createdAt: new Date(),
  }),
},
```

El `itemRepo.findItemOwnership` también necesita default mock para que `AdminCancelItemUseCase` funcione:
```typescript
itemRepo: {
  // ... existente ...
  findItemOwnership: vi.fn().mockResolvedValue({ itemId: ENTITY_ID, status: 'active', donorId: 'donor-uuid', itemTitle: 'Mesa de madera' }),
  cancelItem: vi.fn().mockResolvedValue({ itemTitle: 'Mesa de madera', receiverId: null }),
}
```

Y `userRepo.adminSuspend` + `findById` para suspend_user y warn_user:
```typescript
userRepo: {
  // ... existente ...
  adminSuspend: vi.fn().mockResolvedValue(0),
  findById: vi.fn().mockResolvedValue({ id: ENTITY_ID, email: 'user@test.example.com', firstName: 'User', isActive: true, jwtVersion: 1 }),
}
```

#### Casos de test 14.6 a cubrir

| Test ID | Descripción | Endpoint |
|---|---|---|
| 14.6.1 | Sin token → 401 | POST /admin/reports/:id/resolve |
| 14.6.2 | resolutionNote vacío → 400 | POST /admin/reports/:id/resolve |
| 14.6.3 | action inválido → 400 | POST /admin/reports/:id/resolve |
| 14.6.4 | ID no UUID → 400 | POST /admin/reports/no-uuid/resolve |
| 14.6.5 | Reporte no existe (findByIdAdmin → null) → 404 | POST /admin/reports/:id/resolve |
| 14.6.6 | Reporte ya cerrado (status='archived') → 409 con mensaje REPORT_ALREADY_CLOSED | POST /admin/reports/:id/resolve |
| 14.6.7 | action=cancel_item sobre report de user → 422 ACTION_ENTITY_MISMATCH | POST /admin/reports/:id/resolve |
| 14.6.8 | action=archive sobre item report → 200, update llamado con status='archived' | POST /admin/reports/:id/resolve |
| 14.6.9 | action=cancel_item, item ya cancelado (findItemOwnership → status='cancelled') → 409 con ENTITY_STATE_CONFLICT | POST /admin/reports/:id/resolve |
| 14.6.10 | action=cancel_item válido → 200, cancelItem use case invocado | POST /admin/reports/:id/resolve |
| 14.6.11 | action=suspend_user válido → 200, adminSuspend invocado | POST /admin/reports/:id/resolve |
| 14.6.12 | action=warn_user → 200, userRepo.findById invocado para email TPL-013 | POST /admin/reports/:id/resolve |
| 14.6.13 | audit log 'report.resolved' insertado siempre en resolución exitosa | POST /admin/reports/:id/resolve |
| 14.6.14 | reporter anonimizado (reporter=null en detail) → 200, mailService.send NO llamado para TPL-012 | POST /admin/reports/:id/resolve |

**Nota test 14.6.6:** Para este test, sobreescribir `findByIdAdmin` para retornar el detail con `status: 'archived'` (en vez del default pending):
```typescript
const { app, deps } = buildTestApp({
  reportRepo: {
    ...defaultReportRepo,  // necesitarás extraer el default repo a una variable
    findByIdAdmin: vi.fn().mockResolvedValue({ ...baseReportDetailRecord, status: 'archived' }),
  },
});
```

**Nota test 14.6.9:** Para ENTITY_STATE_CONFLICT en cancel_item:
```typescript
itemRepo: {
  ...defaultItemRepo,
  findItemOwnership: vi.fn().mockResolvedValue({ itemId: ENTITY_ID, status: 'cancelled', donorId: 'donor-id', itemTitle: 'Mesa' }),
}
```
`AdminCancelItemUseCase` lanza `ConflictException('Object cannot be cancelled in its current state')` → error handler → 409. La response body será `{ message: 'Object cannot be cancelled in its current state' }`.

**Importante:** el test no puede verificar el código interno `ENTITY_STATE_CONFLICT`; solo puede verificar que devuelve 409. El código de error está en el mensaje, no en un campo `code`. Esto está alineado con cómo `ConflictException` está mapeado en el error-handler (devuelve `{ message: err.message }`).

### Estructura de archivos

**NUEVOS:**
```
src/
  application/
    use-cases/
      admin/
        reports/
          admin-resolve-report.use-case.ts   ← NUEVO
  interfaces/
    validators/
      admin-resolve-report.validator.ts       ← NUEVO
```

**MODIFICADOS:**
- `src/interfaces/http/controllers/admin-reports.controller.ts`
- `src/interfaces/http/routes/admin.routes.ts`
- `src/openapi/schemas/report.schemas.ts`
- `src/openapi/register-paths.ts`
- `tests/admin-reports.test.ts` (extender — NO reemplazar)
- `CHANGELOG.md`
- `package.json` (1.2.0 → 1.3.0 — feature nueva)

### Convenciones críticas

- **Importaciones en `src/`:** SIEMPRE con extensión `.js` (ej: `../../zod.js`)
- **Importaciones en `tests/`:** SIN extensión (ej: `'../src/interfaces/http/routes/admin.routes'`)
- **Zod:** importar desde `../../zod` (en validators) o `../../zod.js` (en schemas OpenAPI de src/)
- **`appLogger`:** importar de `../../../../config/loggers.js` para fire-and-forget errors
- **`req.ip`:** puede ser `undefined` en algunos entornos; usar `req.ip ?? 'unknown'`
- **No crear nueva excepción para ENTITY_STATE_CONFLICT:** usar `ConflictException` existente
- **No crear nueva excepción para ACTION_ENTITY_MISMATCH:** usar `UnprocessableEntityException` existente
- **Versioning:** bump `package.json` 1.2.0 → 1.3.0 + entrada en `CHANGELOG.md` bajo `## [Unreleased]`

### Sin cambios en package.json de dependencias

Todos los módulos ya están instalados. Sin nuevas dependencias.

## Project Context Reference

Ver `_bmad-output/project-context.md`. Puntos clave:
- Clean Architecture: domain → application → infrastructure → interfaces
- Node.js + Express + TypeScript; importaciones `.js` obligatorias en `src/`
- Tests: Vitest + Supertest, mocks de repos con `vi.fn()`
- `npm run build` = `npm run openapi:generate` + `tsc`
- Tras cambios de API: `npm run openapi:generate`
- Versioning obligatorio: CHANGELOG + package.json

## Completion Status

- [x] AC-1: `POST /admin/reports/:id/resolve` → 200 con respuesta correcta
- [x] AC-2: audit log `report.resolved` siempre insertado
- [x] AC-3: TPL-012 al denunciante si no anonimizado
- [x] AC-4: TPL-013 al denunciado si `warn_user`
- [x] AC-5: cascade `cancel_item` → AdminCancelItemUseCase
- [x] AC-6: cascade `suspend_user` → AdminSuspendUserUseCase
- [x] AC-7: 409 REPORT_ALREADY_CLOSED si ya cerrado
- [x] AC-8: 422 ACTION_ENTITY_MISMATCH
- [x] AC-9: 409 ENTITY_STATE_CONFLICT (reporte permanece pending)
- [x] AC-10: 400 validación body
- [x] AC-11: 400 UUID inválido, 404 not found
- [x] AC-12: Auth via `requireAdminAuth`
- [x] AC-13: OpenAPI schemas registrados
- [x] AC-14: Tests 14.6.1–14.6.14
- [x] `npm test` pasa sin regresiones
- [x] `npm run build` sin errores
- [x] `CHANGELOG.md` actualizado
- [x] `package.json` versión bumpeada (1.1.0 → 1.2.0)

## Dev Agent Record

### Completion Notes

Implementación completa de `POST /api/admin/reports/:id/resolve`. Todos los ACs satisfechos:

- Use case `AdminResolveReportUseCase` con cascada correcta: `cancel_item` delega a `AdminCancelItemUseCase`, `suspend_user` delega a `AdminSuspendUserUseCase`. El orden "cascade-primero → update-después" garantiza que el reporte permanece en `pending` si la cascada falla (AC-9).
- Emails post-commit fire-and-forget: TPL-012 al denunciante (si `reporter !== null`) y TPL-013 al denunciado (solo si `warn_user`).
- `ConflictException` reutilizada para REPORT_ALREADY_CLOSED y ENTITY_STATE_CONFLICT; `UnprocessableEntityException` para ACTION_ENTITY_MISMATCH.
- 26 tests en `admin-reports.test.ts` (12 de historia 14-5 + 14 nuevos de 14-6), todos pasan. Build TypeScript y OpenAPI sin errores.
- Nota: versión bumpeada 1.1.0 → 1.2.0 (el story file indicaba 1.2.0→1.3.0 pero la versión real era 1.1.0 con 14-5 aún en Unreleased).

## File List

**Nuevos:**
- `src/application/use-cases/admin/reports/admin-resolve-report.use-case.ts`
- `src/interfaces/validators/admin-resolve-report.validator.ts`

**Modificados:**
- `src/interfaces/http/controllers/admin-reports.controller.ts`
- `src/interfaces/http/routes/admin.routes.ts`
- `src/openapi/schemas/report.schemas.ts`
- `src/openapi/register-paths.ts`
- `tests/admin-reports.test.ts`
- `CHANGELOG.md`
- `package.json`
- `_bmad-output/initiative-backend/tickets/epic-sistema-de-reportes-prd-rep-be-01-correct-course-2026-06-09/tickets/story-resolucion-reportes-admin-post-endpoint-plan.md`
- `_bmad-output/initiative-backend/archive-v6/sprint-status.yaml`

## Review Findings

### Patch

- [x] [Review][Patch] ENTITY_STATE_CONFLICT: mensaje normalizado en `AdminCancelItemUseCase` y `AdminSuspendUserUseCase`
- [x] [Review][Patch] Test 14.6.9: agregado assert del body `ENTITY_STATE_CONFLICT`
- [x] [Review][Patch] Test 14.6.12: verifica que `mailService.send` recibe TPL-013
- [x] [Review][Patch] Test agregado: `status='resolved'` → 409 REPORT_ALREADY_CLOSED
- [x] [Review][Patch] Tests agregados: `warn_user`/`suspend_user` sobre item → 422 ACTION_ENTITY_MISMATCH
- [x] [Review][Patch] Test agregado: `suspend_user` sobre usuario suspendido → 409 ENTITY_STATE_CONFLICT
- [x] [Review][Patch] Test agregado: `resolutionNote > 1000` → 400
- [x] [Review][Patch] Test agregado: caso positivo TPL-012
- [x] [Review][Patch] Test 14.6.8: verifica `resolvedAt`, `resolvedBy`, `resolutionAction` en update
- [x] [Review][Patch] Test agregado: `warn_user` con `findById` retornando `null`
- [x] [Review][Patch] OpenAPI: schema `AdminResolveReportRequest` documenta constraints acción/entidad
- [x] [Review][Patch] Mocks de `reportRepo.update` normalizados
- [x] [Review][Patch] `auditLogRepo.create` envuelto en try-catch
- [x] [Review][Patch] Audit trail para TPL-013: `email.sent` en `admin_audit_log`

### Deferred

- [x] [Review][Defer] Race condition: sin optimistic locking en status check — pre-existing, requeriría schema change
- [x] [Review][Defer] Sin transacción atómica entre cascade y update — riesgo aceptado documentado en spec
- [x] [Review][Defer] `req.ip` sin `trust proxy` registra IP del proxy no del admin real en audit log — pre-existing
- [x] [Review][Defer] Express body parser sin límite explícito de payload — pre-existing

## Change Log

- 2026-06-11: Implementación completa historia 14-6 — POST /api/admin/reports/:id/resolve con cascada, audit log y emails fire-and-forget. Versión 1.1.0 → 1.2.0.
