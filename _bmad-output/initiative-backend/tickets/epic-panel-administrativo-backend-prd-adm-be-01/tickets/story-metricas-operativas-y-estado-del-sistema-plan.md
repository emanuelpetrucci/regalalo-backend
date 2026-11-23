---
title: "Métricas operativas y estado del sistema"
type: feature
ticket: 6
status: done
created: 2026-10-25
---

# Story 13.6: Métricas operativas y estado del sistema

**Status:** done

---

## Story

Como administrador autenticado,
quiero ver métricas del estado del ecosistema y el estado de los jobs periódicos,
para identificar anomalías operativas sin necesidad de consultar la base de datos directamente.

---

## Acceptance Criteria (BDD)

### AC1: GET /api/admin/metrics — dashboard de métricas

**Dado** que envío `GET /api/admin/metrics` con autenticación admin válida
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con:
```json
{
  "users": {
    "total": "integer",
    "active": "integer",
    "suspended": "integer",
    "unverifiedOver24h": "integer",
    "passive": "integer",
    "hoarders": "integer"
  },
  "items": {
    "active": "integer",
    "reserved": "integer",
    "completed": "integer",
    "cancelled": "integer",
    "degraded": "integer"
  },
  "sessions": {
    "active": "integer",
    "completedLast30Days": "integer",
    "expiredLast30Days": "integer",
    "cancelledLast30Days": "integer",
    "noShowRate": "float | null"
  }
}
```

**Dado** que no hay sesiones completadas ni canceladas en los últimos 30 días
**Cuando** se calcula `noShowRate`
**Entonces** `noShowRate` es `null`

**Dado** que existen sesiones con `no_show_declared = TRUE` en los últimos 30 días
**Cuando** se calcula `noShowRate`
**Entonces** `noShowRate = count(no_show) / count(completed + cancelled)` en ventana de 30 días

**Dado** que envío `GET /api/admin/metrics` sin autenticación admin
**Cuando** el servidor procesa la petición
**Entonces** responde `401 Unauthorized`

**Dado** que envío `GET /api/admin/metrics` con token de usuario regular
**Cuando** el servidor procesa la petición
**Entonces** responde `401 Unauthorized`

### AC2: GET /api/admin/system/health — estado del sistema

**Dado** que envío `GET /api/admin/system/health` con autenticación admin válida
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con:
```json
{
  "cronJobs": [
    {
      "jobName": "string",
      "lastRunAt": "ISO8601 | null",
      "lastStatus": "succeeded | failed | null",
      "returnMessage": "string | null"
    }
  ],
  "storageQueue": {
    "pendingDeletions": "integer"
  },
  "unverifiedUsers24h": "integer"
}
```

**Dado** que la extensión `pg_cron` no tiene ejecuciones registradas en `cron.job_run_details`
**Cuando** se consulta `cronJobs`
**Entonces** se retorna un array vacío `[]`

**Dado** que existen filas en `storage_deletion_queue` sin procesar
**Cuando** se consulta `storageQueue.pendingDeletions`
**Entonces** retorna el COUNT exacto de filas con `processed_at IS NULL`

**Dado** que envío `GET /api/admin/system/health` sin autenticación admin
**Cuando** el servidor procesa la petición
**Entonces** responde `401 Unauthorized`

**Dado** que envío `GET /api/admin/system/health` con token de usuario regular
**Cuando** el servidor procesa la petición
**Entonces** responde `401 Unauthorized`

### AC3: Performance

**Dado** que envío `GET /api/admin/metrics`
**Cuando** el servidor procesa la petición
**Entonces** la respuesta llega en menos de 500ms (bajo condiciones de desarrollo normales)

---

## Tasks / Subtasks

### 1. DTOs

- [x] Crear `src/application/dtos/admin/admin-metrics.dto.ts`
  - `AdminMetricsResponse`: `{ users: { total, active, suspended, unverifiedOver24h, passive, hoarders }, items: { active, reserved, completed, cancelled, degraded }, sessions: { active, completedLast30Days, expiredLast30Days, cancelledLast30Days, noShowRate: number | null } }`
  - Todos los campos `integer` (salvo `noShowRate: number | null`)

- [x] Crear `src/application/dtos/admin/admin-system-health.dto.ts`
  - `CronJobInfo`: `{ jobName: string, lastRunAt: string | null, lastStatus: 'succeeded' | 'failed' | null, returnMessage: string | null }`
  - `AdminSystemHealthResponse`: `{ cronJobs: CronJobInfo[], storageQueue: { pendingDeletions: number }, unverifiedUsers24h: number }`

### 2. Repositorio (nuevo o existente)

- [x] Decidir approach de acceso a datos: Opción A — extender repos existentes con métodos count*.

  - [x] Extender `IUserRepository` con: `countTotal`, `countActive`, `countSuspended`, `countUnverifiedOver24h`, `countPassive`, `countHoarders` (ya estaban presentes de historia anterior)

  - [x] Extender `IItemRepository` con: `countByStatus`, `countDegraded` (ya estaban presentes de historia anterior)

  - [x] Extender `IDeliverySessionRepository` con:
    - `countActive(): Promise<number>`
    - `countByStatusLast30Days(): Promise<{ completed: number; expired: number; cancelled: number }>`
    - `countNoShowLast30Days(): Promise<number>`

- [x] Implementar los métodos en `PostgresUserRepository` (ya implementados de historia anterior)
- [x] Implementar los métodos en `PostgresItemRepository` (ya implementados de historia anterior)
- [x] Implementar los métodos en `PostgresDeliverySessionRepository` — 3 nuevos métodos añadidos

### 3. Use Cases

- [x] Crear `src/application/use-cases/admin/metrics/admin-get-metrics.use-case.ts`
  - 11 COUNTs en paralelo vía `Promise.all`; noShowRate null si denominador = 0

- [x] Crear `src/application/use-cases/admin/metrics/admin-get-system-health.use-case.ts`
  - 3 queries paralelas; `IAdminSystemHealthRepository` con try/catch para pg_cron

### 4. Queries SQL para system health

```sql
-- cronJobs: último run de cada job en cron.job_run_details
SELECT
  jobname AS "jobName",
  start_time AS "lastRunAt",
  status AS "lastStatus",
  return_message AS "returnMessage"
FROM cron.job_run_details
WHERE runid IN (
  SELECT MAX(runid) FROM cron.job_run_details GROUP BY jobid
)
ORDER BY start_time DESC;

-- storageQueue pending
SELECT COUNT(*)::int AS "pendingDeletions"
FROM storage_deletion_queue
WHERE processed_at IS NULL;

-- unverifiedUsers24h
SELECT COUNT(*)::int
FROM users
WHERE email_verified = FALSE
  AND created_at < NOW() - INTERVAL '24 hours';
```

### 5. Controlador

- [x] Crear `src/interfaces/http/controllers/admin-metrics.controller.ts`

### 6. Validadores

- [x] No se requieren validadores nuevos (GET sin query params ni body)

### 7. Rutas

- [x] `src/interfaces/http/routes/admin.routes.ts` ya tenía imports y rutas registradas (pre-implementado)

### 8. OpenAPI schemas

- [x] `src/openapi/schemas/admin.schemas.ts`: schemas `adminMetricsResponseSchema` y `adminSystemHealthResponseSchema` ya presentes
- [x] `src/openapi/register-paths.ts`: paths `/admin/metrics` y `/admin/system/health` ya registrados
- [x] `npm run openapi:generate` ejecutado

### 9. Tests

- [x] Crear `tests/admin-metrics.test.ts`: 9 test cases (5 para metrics, 4 para system/health) — todos pasan

---

## Dev Notes

### Story Context

Esta es la sexta historia de la **Épica 13 (Panel Administrativo Backend)**. El endpoint `POST /api/admin/system/health` **NO** es un health check de servidor — es un dashboard de salud del sistema (jobs pg_cron, cola de Storage, usuarios sin verificar). El health check de Express (`GET /health`) ya existe y es independiente.

Historias previas implementadas:
- **13.1:** Migraciones SQL (admin_users, admin_otp_tokens, admin_audit_log, paused_by_admin, constraint reputation_events)
- **13.2:** Autenticación admin con OTP, JWT independiente, middleware requireAdminAuth, CORS restrictivo
- **13.3:** Gestión de usuarios por admin (listado, detalle, suspender, reactivar, forzar-verificación, corregir-reputación, reset-no-shows)
- **13.4:** Gestión de objetos por admin (listado, detalle, cancelar, reactivar)
- **13.5:** Gestión de sesiones por admin (listado, detalle, force-expire) — **review**

### Architecture Compliance

**Estructura de capas (Clean Architecture):**

```
src/
  domain/
    repositories/
      user.repository.ts                   ← EXTENDER con 7 métodos count*
      item.repository.ts                   ← EXTENDER con 2 métodos count*
      delivery-session.repository.ts       ← EXTENDER con 3 métodos count*
  application/
    use-cases/
      admin/
        metrics/
          admin-get-metrics.use-case.ts    ← NUEVO
          admin-get-system-health.use-case.ts ← NUEVO
    dtos/
      admin/
        admin-metrics.dto.ts              ← NUEVO
        admin-system-health.dto.ts        ← NUEVO
  infrastructure/
    database/
      supabase/
        user.repository.ts                 ← EXTENDER (7 nuevos métodos)
        item.repository.ts                 ← EXTENDER (2 nuevos métodos)
        delivery-session.repository.ts     ← EXTENDER (3 nuevos métodos)
  interfaces/
    http/
      controllers/
        admin-metrics.controller.ts        ← NUEVO
      routes/
        admin.routes.ts                    ← MODIFICAR (añadir rutas metrics + system)
  openapi/
    schemas/
      admin.schemas.ts                     ← MODIFICAR (2 nuevos schemas)
    register-paths.ts                      ← MODIFICAR (2 nuevos paths)
```

### Critical Guardrails

1. **Son endpoints READ-ONLY.** No modifican ninguna entidad. No requieren `admin_audit_log` ni `IAdminAuditLogRepository`. No hay payload_snapshot que capturar.

2. **COUNTs paralelos para performance.** Los 11 COUNTs de métricas deben ejecutarse en paralelo (`Promise.all`) para no sumar latencia secuencial. Si son secuenciales se superan fácilmente los 500ms.

3. **noShowRate = null si denominador = 0.** La división entre 0 debe protegerse. Si `completedLast30Days + cancelledLast30Days === 0`, retornar `null`, no `NaN` ni `Infinity`.

4. **`cron.job_run_details` es de la extensión `pg_cron`.** Esta tabla existe en Supabase solo si la extensión está habilitada. Verificar disponibilidad. Si la extensión no está disponible, retornar `cronJobs: []`.

5. **`location` (GEOGRAPHY) NUNCA en DTOs.** No aplica directamente a métricas, pero mantener la práctica.

6. **No requiere autenticación de parámetros.** Ambos endpoints son GET sin query params ni body. Solo se validó token admin vía `requireAdminAuth`.

7. **No hay transacciones ni escritura.** Simple lectura de COUNTs. No usar `BEGIN/COMMIT`.

8. **Sin caché en MVP.** Según PRD §6.6, no requiere caché. Si en el futuro se necesita, implementar LRU como en geocoding.

### Existing Patterns

| Categoría | Archivo de referencia | Notas |
|-----------|----------------------|-------|
| Controller (read-only) | `src/interfaces/http/controllers/admin-items.controller.ts` | Método `listItems` es solo GET sin audit log |
| Controller (sin audit) | `src/interfaces/http/controllers/admin-auth.controller.ts` | Endpoints auth sin audit log en el GET |
| Route factory | `src/interfaces/http/routes/admin.routes.ts` | `createAdminRouter(deps)` con DI |
| Repo interfaz types | `src/domain/repositories/user.repository.ts` | Interfaz y tipos existentes para extender |
| Postgres repo | `src/infrastructure/database/supabase/user.repository.ts` | Implementación existente |
| OpenAPI schemas | `src/openapi/schemas/admin.schemas.ts` | Schema factory con `.openapi()` |
| OpenAPI paths | `src/openapi/register-paths.ts` | Patrón de registro con tags, adminSecured |
| DTOs admin | `src/application/dtos/admin/` | Patrón de DTOs sin audit log para read-only |

### Definición de métricas (desde PRD §6.6)

| Métrica | Definición SQL |
|---------|---------------|
| users.total | `SELECT COUNT(*) FROM users` |
| users.active | `SELECT COUNT(*) FROM users WHERE is_active = TRUE` |
| users.suspended | `SELECT COUNT(*) FROM users WHERE is_active = FALSE` |
| users.unverifiedOver24h | `SELECT COUNT(*) FROM users WHERE email_verified = FALSE AND created_at < NOW() - INTERVAL '24 hours'` |
| users.passive | `SELECT COUNT(*) FROM users WHERE total_donated = 0 AND total_received > 0 AND last_active_at < NOW() - INTERVAL '60 days'` |
| users.hoarders | `SELECT COUNT(*) FROM users WHERE cycles_at_limit >= 3 AND total_received > 5 * total_donated` |
| items.active | `SELECT COUNT(*) FROM items WHERE status = 'active'` |
| items.reserved | `SELECT COUNT(*) FROM items WHERE status = 'reserved'` |
| items.completed | `SELECT COUNT(*) FROM items WHERE status = 'completed'` |
| items.cancelled | `SELECT COUNT(*) FROM items WHERE status = 'cancelled'` |
| items.degraded | `SELECT COUNT(*) FROM items WHERE status = 'active' AND degraded_at IS NOT NULL` |
| sessions.active | `SELECT COUNT(*) FROM delivery_sessions WHERE status = 'active'` |
| sessions.completedLast30Days | `SELECT COUNT(*) FROM delivery_sessions WHERE status = 'completed' AND completed_at >= NOW() - INTERVAL '30 days'` |
| sessions.expiredLast30Days | `SELECT COUNT(*) FROM delivery_sessions WHERE status = 'expired' AND completed_at >= NOW() - INTERVAL '30 days'` |
| sessions.cancelledLast30Days | `SELECT COUNT(*) FROM delivery_sessions WHERE status = 'cancelled' AND completed_at >= NOW() - INTERVAL '30 days'` |
| sessions.noShowRate | `null` si `completedLast30Days + cancelledLast30Days = 0`; sino `noShowCount / (completedLast30Days + cancelledLast30Days)` |
| sessions.noShowCount (interno) | `SELECT COUNT(*) FROM delivery_sessions WHERE no_show_declared = TRUE AND completed_at >= NOW() - INTERVAL '30 days'` |

### Queries SQL para system health (desde PRD §6.7)

```sql
-- cronJobs: último run de cada job en cron.job_run_details (pg_cron)
SELECT
  jobname AS "jobName",
  start_time AS "lastRunAt",
  status AS "lastStatus",
  return_message AS "returnMessage"
FROM cron.job_run_details
WHERE runid IN (
  SELECT MAX(runid) FROM cron.job_run_details GROUP BY jobid
)
ORDER BY start_time DESC;

-- storageQueue pending
SELECT COUNT(*)::int AS "pendingDeletions"
FROM storage_deletion_queue
WHERE processed_at IS NULL;

-- unverifiedUsers24h
SELECT COUNT(*)::int
FROM users
WHERE email_verified = FALSE
  AND created_at < NOW() - INTERVAL '24 hours';
```

### Dependencies

- **Story 13.1** ✅ COMPLETADA: migraciones SQL aplicadas
- **Story 13.2** ✅ COMPLETADA: `requireAdminAuth`, `req.adminUser` type augmentation
- **Story 13.3** ✅ COMPLETADA: `IUserRepository`, `PostgresUserRepository` con métodos existentes
- **Story 13.4** ✅ COMPLETADA: `IItemRepository`, `PostgresItemRepository` con métodos existentes
- **Story 13.5** ✅ COMPLETADA (review): `IDeliverySessionRepository`, `PostgresDeliverySessionRepository`, patrones de admin.routes.ts
- **Infraestructura existente:** todos los repos con conexión a Supabase via `db` (pg pool)
- **pg_cron:** la extensión debe estar habilitada en Supabase project; verificar antes de implementar `cron.job_run_details`

### What this story must NOT break

- Los endpoints existentes de usuarios, items y sesiones (admin y regulares) deben seguir funcionando exactamente igual
- `GET /api/admin/metrics` y `GET /api/admin/system/health` son exclusivamente administrativos; ningún endpoint de usuario regular se ve afectado
- No se modifican esquemas de BD ni migraciones
- `cron.job_run_details` es solo lectura; no alterar estado de jobs pg_cron

### Implementation Order

1. DTOs (`admin-metrics.dto.ts`, `admin-system-health.dto.ts`)
2. Extender interfaces de repositorio con métodos `count*`
3. Implementar métodos `count*` en Postgres repos
4. Use cases (metrics first, system health second)
5. Controller
6. Modificar rutas `admin.routes.ts`
7. OpenAPI schemas y paths
8. Regenerar OpenAPI: `npm run openapi:generate`
9. Tests

### References

| Source | Section | Content |
|--------|---------|---------|
| `docs/prd-backend-admin.md` | §6.6 | Contrato de API GET /api/admin/metrics (shape completo, notas, definiciones) |
| `docs/prd-backend-admin.md` | §6.7 | Contrato de API GET /api/admin/system/health (shape, queries SQL, nota pg_cron) |
| `docs/prd-backend-admin.md` | §10 | AC-ADM-BE-13 (metrics < 500ms) |
| `docs/prd-backend-admin.md` | §9 | Arquitectura de código Clean Architecture admin |
| `_bmad-output/project-context.md` | Technology Stack | Versiones exactas de librerías |
| `_bmad-output/project-context.md` | Framework Rules | Clean Architecture, DTOs, prohibido SELECT *, prohibido location en DTOs |
| `_bmad-output/initiative-backend/sprint-change-proposal-2026-06-08-admin-panel.md` | §4.1.D | Definición de historia 13.6 con BDD |
| `src/application/dtos/admin/admin-item-list.dto.ts` | — | Patrón DTO admin con paginación (referencia para shape) |
| `src/application/dtos/admin/admin-action.dto.ts` | — | Patrón DTO admin simple (referencia) |
| `src/interfaces/http/controllers/admin-items.controller.ts` | `listItems` | Patrón controller admin read-only (sin adminUser ni audit log) |
| `src/interfaces/http/routes/admin.routes.ts` | — | Factory pattern con DI, requireAdminAuth middleware |
| `src/openapi/schemas/admin.schemas.ts` | — | Schemas OpenAPI existentes (adminErrorSchema reutilizable) |
| `src/openapi/register-paths.ts` | — | Patrón de registro con tags y adminSecured |
| `src/domain/repositories/user.repository.ts` | — | Interfaz IUserRepository existente (extender) |
| `src/domain/repositories/item.repository.ts` | — | Interfaz IItemRepository existente (extender) |
| `src/domain/repositories/delivery-session.repository.ts` | — | Interfaz IDeliverySessionRepository existente (extender) |
| `_bmad-output/initiative-backend/tickets/epic-panel-administrativo-backend-prd-adm-be-01/tickets/story-gestion-de-sesiones-de-entrega-por-el-administrador-plan.md` | Dev Notes | Estructura de capas, patrones, guardrails, implementation order |

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

- La mayoría de los archivos (DTOs, use cases, controller, OpenAPI schemas, rutas, tests) estaban pre-implementados como stub de historia anterior.
- Única implementación nueva: 3 métodos `count*` en `IDeliverySessionRepository` (interfaz) y `PostgresDeliverySessionRepository` (implementación). Los métodos de user repo e item repo ya existían.
- El `PostgresAdminSystemHealthRepository` maneja `pg_cron` con try/catch — retorna `[]` si la extensión no existe.
- `noShowRate` usa `completed_at >= NOW() - INTERVAL '30 days'` como ventana temporal (no `created_at`), alineado con la definición del PRD.
- 9/9 tests pasan. TypeScript sin errores. OpenAPI regenerado. Versión bumpeada a 1.2.0.
- Los 3 test files que fallan en la suite completa (`delivery-session-reputation-*.integration.test.ts` y `email-tpl-010.test.ts`) son fallas pre-existentes no relacionadas con esta historia.

### File List

- `src/domain/repositories/delivery-session.repository.ts` — añadidos 3 métodos count a `IDeliverySessionRepository`
- `src/infrastructure/database/supabase/delivery-session.repository.ts` — implementación de los 3 métodos count
- `openapi/openapi.json` — regenerado con los nuevos endpoints
- `CHANGELOG.md` — entrada historia 13-6
- `package.json` — versión 1.1.0 → 1.2.0

### Change Log

- 2026-06-09: Implementación historia 13-6 — métricas operativas y estado del sistema
- 2026-06-09: Code review completado

### Review Findings

- [x] [Review][Patch] `getCronJobsLastRun` bare `catch {}` engulle todos los errores de BD, no solo pg_cron ausente [`src/infrastructure/database/supabase/admin-system-health.repository.ts`]
- [x] [Review][Patch] Sin test para fallo parcial de `Promise.all` en `AdminGetMetricsUseCase` [`tests/admin-metrics.test.ts`]
- [x] [Review][Defer] `countUnverifiedOver24h` duplicado en `PostgresUserRepository` y `PostgresAdminSystemHealthRepository` — deferred, pre-existing

