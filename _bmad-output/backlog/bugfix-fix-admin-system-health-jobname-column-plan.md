---
title: 'Corregir columna inexistente en cronJobs de /api/admin/system/health'
type: bugfix
created: 2026-10-25
status: done
baseline_commit: '0fbad9ca22a4a5c2028a65d39fcaf88809065453'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/docs/prd-backend-admin.md'
ticket: "story-fix-admin-system-health-jobname-column"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `GET /api/admin/system/health` está respondiendo `500` porque la consulta de `getCronJobsLastRun` intenta leer `jobname` desde `cron.job_run_details`, columna que no existe en el esquema real de `pg_cron` del entorno actual.

**Approach:** Ajustar la query para usar únicamente columnas garantizadas por `cron.job_run_details` y derivar `jobName` con fallback estable (`command` o `jobid`) sin romper el contrato actual del endpoint.

## Boundaries & Constraints

**Always:** mantener el shape de respuesta (`jobName`, `lastRunAt`, `lastStatus`, `returnMessage`); conservar comportamiento read-only; mantener `cronJobs: []` cuando `cron.job_run_details` no es accesible.

**Ask First:** introducir migraciones SQL o cambios en tablas/extensiones; renombrar campos públicos del DTO de health; cambiar semántica de alertas en `AdminGetSystemHealthUseCase`.

**Never:** depender de columnas opcionales/no garantizadas de `pg_cron` para responder; ocultar errores con catches genéricos silenciosos; tocar endpoints admin fuera de `/admin/system/health`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| PG_CRON_SCHEMA_SIN_JOBNAME | `cron.job_run_details` existe pero no tiene `jobname` | `200` en `/api/admin/system/health`; `cronJobs[]` poblado con `jobName` derivado (`command` o fallback por `jobid`) | N/A |
| COMMAND_VACIO | fila con `command` vacío o `NULL` | `jobName` se completa con fallback determinístico (`job-<jobid>`) | N/A |
| SIN_ACCESO_CRON | `canSelectRelation('cron.job_run_details') === false` | `cronJobs: []` y resto del payload de health disponible | No elevar `500` por esta condición |
| ERROR_REAL_DE_BD | falla no degradable en query de cron | el endpoint mantiene comportamiento actual de propagación de error | Error visible vía handler global (500) |

</frozen-after-approval>

## Code Map

- `src/infrastructure/database/supabase/admin-system-health.repository.ts` -- corrige SQL de `getCronJobsLastRun` para no referenciar columnas inexistentes y mantener mapeo del DTO.
- `tests/admin-system-health.repository.test.ts` -- agrega cobertura unitaria para query SQL y fallback de `jobName` al construir la respuesta.
- `tests/admin-metrics.test.ts` -- conserva cobertura de contrato HTTP; ajustar solo si el cambio de fallback afecta fixtures esperados.

## Tasks & Acceptance

**Execution:**
- [x] `src/infrastructure/database/supabase/admin-system-health.repository.ts` -- reemplazar `jobname AS "jobName"` por derivación robusta basada en columnas existentes (`command`, `jobid`) y mantener selección del último `runid` por `jobid`.
- [x] `tests/admin-system-health.repository.test.ts` -- crear tests de repositorio con `Pool` mockeado para validar que la SQL no usa `jobname` y que el fallback de `jobName` funciona con `command` nulo/vacío.
- [x] `tests/admin-metrics.test.ts` -- confirmar que la forma del response sigue estable y no requiere cambios de contrato público.

**Acceptance Criteria:**
- Given que `cron.job_run_details` no tiene columna `jobname`, when se ejecuta `GET /api/admin/system/health`, then responde `200` y no falla por `42703`.
- Given una ejecución de cron con `command` presente, when se mapea a DTO, then `jobName` usa ese `command`.
- Given una ejecución de cron con `command` ausente o vacío, when se mapea a DTO, then `jobName` usa un fallback determinístico basado en `jobid`.
- Given que `cron.job_run_details` no es accesible, when se consulta health, then `cronJobs` retorna `[]` sin romper el resto del payload.

## Spec Change Log

## Verification

**Commands:**
- `npm run test -- tests/admin-system-health.repository.test.ts` -- expected: cobertura del repositorio en verde con casos de SQL/fallback.
- `npm run test -- tests/admin-metrics.test.ts` -- expected: contrato de `/admin/system/health` sigue pasando.
