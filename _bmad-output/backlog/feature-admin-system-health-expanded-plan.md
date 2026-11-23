---
title: 'Expandir /api/admin/system/health para la vista completa de Sistema'
type: feature
created: 2026-10-25
status: done
baseline_commit: '0ac9adf8ac2d9bf1cafd5bab706a49e1dd801691'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/docs/prd-backend-admin.md'
ticket: "story-admin-system-health-expanded"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** El frontend ya avanzó la sección de Sistema/Health y necesita más datos operativos que los actualmente expuestos por `GET /api/admin/system/health` (hoy: `cronJobs`, `storageQueue.pendingDeletions`, `unverifiedUsers24h`). Falta cubrir el contrato necesario para representar el diseño completo de `adm-sistema.html`.

**Approach:** Ampliar el endpoint existente con bloques adicionales de solo lectura (alertas, almacenamiento, base de datos, configuración general y versiones), manteniendo compatibilidad backward con el shape actual para no romper el frontend ya integrado.

## Boundaries & Constraints

**Always:** preservar `cronJobs`, `storageQueue` y `unverifiedUsers24h`; resolver todo con lectura (sin efectos colaterales); seguir Clean Architecture (domain → application → infrastructure → interfaces/openapi); devolver `null` explícito cuando una métrica no sea determinable de forma confiable.

**Ask First:** agregar endpoints de acción (limpiar caché, reindexar, backup, maintenance mode), cambiar semántica de campos existentes o introducir migraciones de DB.

**Never:** romper el contrato actual del endpoint; devolver valores ficticios “hardcodeados” para métricas operativas; mezclar lógica HTTP en repositorios o SQL en controladores.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| VISTA_COMPLETA_OK | `GET /api/admin/system/health` autenticado, `pg_cron` y métricas DB disponibles | `200` con shape expandido y bloques nuevos poblados (`alerts`, `storage`, `database`, `generalConfig`, `stackVersions`) además del shape legado | N/A |
| PG_CRON_NO_DISPONIBLE | `cron.job_run_details` no existe o no accesible | `cronJobs: []`; el resto del payload se entrega | No elevar 500 por ausencia de `pg_cron` |
| STORAGE_OBJECTS_NO_DISPONIBLE | tabla `storage.objects` no existe o no accesible | `storage.objectsStored` y/o `storage.usedBytes` con fallback seguro (`null` o conteo alternativo), sin romper contrato | No elevar 500 por falta de metadata de storage |
| METRICA_DB_PARCIAL | una subconsulta no crítica (ej. `lastBackupAt`) no se puede resolver | campo puntual en `null` manteniendo respuesta 200, siempre que las métricas críticas se mantengan | Si falla una métrica crítica no degradable, propagar error y responder 500 |
| SIN_AUTH_ADMIN | request sin JWT admin válido | `401 Unauthorized` | middleware existente `requireAdminAuth` |

</frozen-after-approval>

## Code Map

- `src/domain/repositories/admin-system-health.repository.ts` -- interfaz de consultas de health a extender con métricas adicionales.
- `src/infrastructure/database/supabase/admin-system-health.repository.ts` -- implementación SQL read-only para cron, storage y database stats.
- `src/application/dtos/admin/admin-system-health.dto.ts` -- contrato tipado del response expandido.
- `src/application/use-cases/admin/metrics/admin-get-system-health.use-case.ts` -- composición del payload final y reglas de fallback/alertas.
- `src/openapi/schemas/admin.schemas.ts` -- schema OpenAPI de `AdminSystemHealthResponse` actualizado.
- `src/openapi/register-paths.ts` -- mantener path existente y alinear summary/description si aplica.
- `tests/admin-metrics.test.ts` -- cobertura de shape expandido y edge cases de degradación controlada.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/repositories/admin-system-health.repository.ts` -- agregar métodos explícitos para: métricas de storage (conteo/bytes), métricas de DB (versión, conexiones activas, máximo, tamaño), y disponibilidad de fuentes (`pg_cron`, storage schema) -- permite implementar lógica sin acoplar use-case a SQL.
- [x] `src/infrastructure/database/supabase/admin-system-health.repository.ts` -- implementar SQL read-only para nuevos métodos, con detección robusta de objetos opcionales (`to_regclass`/checks previos) y fallbacks controlados sin catch genérico -- evita 500 por dependencias opcionales del entorno.
- [x] `src/application/dtos/admin/admin-system-health.dto.ts` -- extender `AdminSystemHealthResponse` con bloques: `alerts[]`, `storage`, `database`, `generalConfig`, `stackVersions` y tipos `nullable` donde la fuente no sea garantizable -- define contrato estable para frontend.
- [x] `src/application/use-cases/admin/metrics/admin-get-system-health.use-case.ts` -- orquestar nuevas consultas en paralelo, derivar alertas desde estado real (jobs failed, cola pendiente, unverified >24h), y completar configuración/versiones desde fuentes internas (`env`, runtime y metadata del proyecto) manteniendo campos legacy -- centraliza reglas de negocio del endpoint.
- [x] `src/openapi/schemas/admin.schemas.ts` -- reflejar el response expandido con Zod/OpenAPI, respetando nullability y sin cambiar nombres legacy -- sincroniza contrato backend/frontend.
- [x] `src/openapi/register-paths.ts` -- mantener `/admin/system/health` y actualizar descripción para incluir bloques nuevos -- documentación consistente para cliente generado.
- [x] `tests/admin-metrics.test.ts` -- ampliar tests de `GET /admin/system/health` para validar shape expandido, compatibilidad con campos legacy, `cronJobs: []` cuando no hay fuente, y fallback parcial sin romper 200 -- cubre regresión funcional.
- [x] `openapi/openapi.json` -- regenerar con script existente para publicar contrato actualizado -- habilita regeneración del cliente admin.

**Acceptance Criteria:**
- Given un admin autenticado, when llama `GET /api/admin/system/health`, then recibe `200` con el shape legado intacto y los nuevos bloques de health requeridos por la vista completa.
- Given que `pg_cron` no está disponible, when se consulta health, then `cronJobs` es `[]` y el endpoint no falla.
- Given métricas opcionales no disponibles (p. ej. metadata de storage), when se consulta health, then los campos afectados retornan `null`/fallback definido sin romper el resto del payload.
- Given request sin autenticación admin válida, when llama el endpoint, then responde `401`.
- Given cambios de contrato en response, when se regenera OpenAPI, then `AdminSystemHealthResponse` queda actualizado y consumible por el frontend sin romper los campos existentes.

## Spec Change Log

## Design Notes

Los bloques nuevos deben modelarse como “capas de confianza”:

1. **Core health (obligatorio):** `cronJobs`, `storageQueue.pendingDeletions`, `unverifiedUsers24h`.
2. **Operational enrichment (best effort):** storage detallado, DB stats, alertas derivadas.
3. **Configuration snapshot (determinístico):** valores de entorno y constantes del sistema útiles para soporte.

Regla de degradación: cuando una fuente opcional no exista en un entorno, no inventar números; devolver `null` y mantener trazabilidad explícita de dato ausente.

## Verification

**Commands:**
- `npm run test -- tests/admin-metrics.test.ts` -- expected: tests de metrics/health en verde con cobertura de shape expandido.
- `npm run openapi:generate` -- expected: `openapi/openapi.json` actualizado sin errores.
- `npm run build` -- expected: compilación TypeScript exitosa con contratos actualizados.

## Suggested Review Order

**Orquestación del endpoint**

- Centraliza shape expandido y degradación de métricas opcionales.
  [`admin-get-system-health.use-case.ts:57`](../../src/application/use-cases/admin/metrics/admin-get-system-health.use-case.ts#L57)

- Deriva alertas operativas desde estado real de jobs y colas.
  [`admin-get-system-health.use-case.ts:12`](../../src/application/use-cases/admin/metrics/admin-get-system-health.use-case.ts#L12)

**Acceso a datos y resiliencia**

- Evita consultas opcionales sin permisos usando detección previa por relación.
  [`admin-system-health.repository.ts:26`](../../src/infrastructure/database/supabase/admin-system-health.repository.ts#L26)

- Implementa métricas de storage con fallback explícito y parsing seguro.
  [`admin-system-health.repository.ts:69`](../../src/infrastructure/database/supabase/admin-system-health.repository.ts#L69)

- Añade métricas de DB y control de precisión para enteros grandes.
  [`admin-system-health.repository.ts:106`](../../src/infrastructure/database/supabase/admin-system-health.repository.ts#L106)

- Expande el contrato de repositorio para nuevas capacidades de health.
  [`admin-system-health.repository.ts:8`](../../src/domain/repositories/admin-system-health.repository.ts#L8)

**Contrato API**

- Define el DTO completo consumible por frontend sin romper campos legacy.
  [`admin-system-health.dto.ts:22`](../../src/application/dtos/admin/admin-system-health.dto.ts#L22)

- Publica el nuevo esquema OpenAPI de System Health expandido.
  [`admin.schemas.ts:269`](../../src/openapi/schemas/admin.schemas.ts#L269)

- Alinea summary del endpoint con el alcance funcional agregado.
  [`register-paths.ts:923`](../../src/openapi/register-paths.ts#L923)

**Soporte y verificación**

- Cubre shape nuevo, compatibilidad y fallbacks opcionales en integración.
  [`admin-metrics.test.ts:296`](../../tests/admin-metrics.test.ts#L296)

- Refleja el contrato final generado para cliente admin.
  [`openapi.json:1`](../../openapi/openapi.json#L1)
