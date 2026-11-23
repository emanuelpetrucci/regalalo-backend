---
title: "Persistencia de eventos en Postgres (Correct Course 2026-05-26)"
type: feature
ticket: 7
status: done
created: 2026-10-25
---

# Historia 7.7: Persistencia de eventos de analítica en Postgres

Status: done

**Origen:** Sprint Change Proposal 2026-05-26 (Correct Course — Opción A).  
**Depende de:** 7-2 (`emitEvent`, `analyticsLogger`) — **done**. No modificar use cases 7.4–7.6 salvo regresión accidental.

## Historia

Como responsable de producto,
quiero que cada evento de analítica se persista en Postgres además del log estructurado,
para consultar métricas del MVP con SQL y no depender solo de la retención efímera de Railway.

## Criterios de aceptación

1. **Dado** la migración `014-analytics-events.sql` aplicada, **cuando** se inspecciona el esquema, **entonces** existe la tabla `analytics_events` con columnas `id`, `event`, `occurred_at`, `user_id_hash`, `session_id`, `properties` (JSONB), `created_at` e índices en `event`, `occurred_at` y `user_id_hash`.

2. **Dado** `emitEvent` invocado tras commit exitoso, **cuando** `ANALYTICS_PERSISTENCE` es `postgres` (default en prod), **entonces** se escribe en `analyticsLogger` (stdout) **y** se inserta una fila en `analytics_events` con el mismo payload lógico (`event`, `occurred_at`, `user_id_hash`, `session_id`, `properties`).

3. **Dado** un fallo al insertar en BD (timeout, conexión), **cuando** `safeEmitEvent` o el wrapper de persistencia captura el error, **entonces** la operación de negocio ya completada **no** se revierte y el log stdout sigue intentándose.

4. **Dado** tests con `ANALYTICS_PERSISTENCE=stdout` o repositorio mock, **cuando** se ejecuta `npm test`, **entonces** no se requiere Supabase real para la suite unitaria/integración estándar.

5. **Dado** `properties` en cualquier evento, **cuando** se persiste, **entonces** cumple SC-02 (sin email, coordenadas exactas, `contact_channel`, UUID crudo) — misma regla que logs.

6. **Dado** documentación actualizada, **cuando** se revisa pre-lanzamiento, **entonces** `docs/prd-analytics.md` SC-07 y `docs/architecture.md` §3.9 reflejan el destino MVP.

## Alcance explícito (IN / OUT)

| IN (7.7) | OUT |
|----------|-----|
| Migración `014-analytics-events.sql` | Re-instrumentar use cases (7.4–7.6) |
| `domain/repositories/analytics-event.repository.ts` (interfaz) | Dashboard o UI de métricas |
| `infrastructure/database/...` implementación insert | PostHog / herramientas externas |
| Extender `analytics.service.ts` (dual-write) | Export a Supabase Storage (post-MVP) |
| `env.ANALYTICS_PERSISTENCE` | Job de purga/retención (opcional deferred) |
| Tests `analytics-persistence.test.ts` o ampliar `analytics-service.test.ts` | Cambios OpenAPI / frontend |

## Esquema SQL (referencia)

```sql
CREATE TABLE IF NOT EXISTS analytics_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event         TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL,
  user_id_hash  TEXT NOT NULL CHECK (char_length(user_id_hash) = 64),
  session_id    UUID,
  properties    JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event
  ON analytics_events(event);

CREATE INDEX IF NOT EXISTS idx_analytics_events_occurred_at
  ON analytics_events(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_hash
  ON analytics_events(user_id_hash);
```

**Notas:**

- `user_id_hash` = SHA-256 hex del UUID (mismo valor que en log Pino).
- `occurred_at` = timestamp del evento (ISO del payload de emisión).
- Sin FK a `users` — evita acoplar analítica al ciclo de vida de cuenta y preserva privacidad.
- Acceso solo vía service role del backend (sin API pública).

## Tareas / Subtareas

- [x] **Task 1 — Migración** (AC: #1)
  - [x] Crear `src/infrastructure/database/supabase/migrations/014-analytics-events.sql`
  - [x] Añadir índices en `docs/architecture.md` §4 si no están en migración
  - [x] Aplicar en dev/staging (`npm run db:migrate:dev`)

- [x] **Task 2 — Dominio e infraestructura** (AC: #1, #2)
  - [x] Interfaz `IAnalyticsEventRepository` con `insert(event: AnalyticsEventRecord): Promise<void>`
  - [x] Implementación Postgres (pool existente / patrón de otros repos Supabase)
  - [x] DTO/registro tipado para fila (sin `any` en properties — `Record<string, unknown>` serializado a JSONB)

- [x] **Task 3 — `analytics.service.ts`** (AC: #2, #3)
  - [x] Tras `analyticsLogger.info`, invocar persistencia en `setImmediate` o equivalente fire-and-forget
  - [x] Usar `safeEmitEvent` path para capturar errores de BD sin propagar
  - [x] Respetar `env.ANALYTICS_PERSISTENCE`: `postgres` | `stdout` (solo log)

- [x] **Task 4 — Config** (AC: #4)
  - [x] `ANALYTICS_PERSISTENCE` en `env.ts` con default `postgres` si `NODE_ENV=production`, else `stdout` en test
  - [x] Documentar en `.env.*.example` y `docs/logging.md` (párrafo breve)

- [x] **Task 5 — Tests** (AC: #2, #3, #4, #5)
  - [x] Mock repositorio: assert insert con payload correcto
  - [x] Assert: fallo de insert no lanza al caller de `safeEmitEvent`
  - [x] Regresión tests existentes `analytics-service.test.ts`

- [x] **Task 6 — Verificación** (AC: #6)
  - [x] `npm run build` && `npm test` (273 tests)
  - [ ] Smoke manual: acción que emita AE-002 → `SELECT * FROM analytics_events ORDER BY created_at DESC LIMIT 5`

## Patrón de implementación

```typescript
// Pseudocódigo — dual-write en emitEvent
analyticsLogger.info(payload);
if (env.ANALYTICS_PERSISTENCE === 'postgres') {
  setImmediate(() => {
    void analyticsEventRepository.insert(toRecord(payload)).catch(() => {
      /* no throw — SC-03 negocio */
    });
  });
}
```

**Inyección:** preferir factory o `getDefaultAnalyticsEventRepository()` lazy para no romper tests; evitar import circular con use cases.

## Referencias

- [Source: docs/prd-analytics.md — SC-07, §8 MVP Postgres]
- [Source: docs/architecture.md — §3.9, regla loggers DLT-004]
- [Source: _bmad-output/initiative-backend/sprint-change-proposal-2026-05-26.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-loggers-y-analytics-service-plan.md]

## Dev Agent Record

### Completion Notes

- Dual-write: `emitEvent` → Pino + `scheduleAnalyticsPersistence` (módulo `analytics-persistence.ts`).
- `session_id` solo persiste si es UUID v4 válido.
- Migración `014` aplicada en dev con `db:migrate:dev`.

### File List

- `src/infrastructure/database/supabase/migrations/014-analytics-events.sql`
- `src/domain/repositories/analytics-event.repository.ts`
- `src/infrastructure/database/supabase/analytics-event.repository.ts`
- `src/application/services/analytics-persistence.ts`
- `src/application/services/analytics.service.ts`
- `src/config/env.ts`
- `tests/analytics-persistence.test.ts`
- `tests/analytics-service.test.ts`
- `vitest.config.ts`, `.env.dev.example`, `.env.prod.example`, `docs/logging.md`

### Change Log

- 2026-05-26: Historia 7-7 implementada (persistencia Postgres + SC-07).

### Review Findings

- [x] [Review][Patch] Application importa infra desde `analytics-persistence.ts` — Resuelto: `initAnalyticsPersistence` en `main.ts`.
- [x] [Review][Patch] Tests no resetean el mock del repositorio — Resuelto: `afterEach` limpia override.
- [x] [Review][Patch] `ANALYTICS_PERSISTENCE` inválido se ignora silenciosamente — Resuelto: error de arranque si valor definido e inválido.
- [x] [Review][Patch] Fallos de insert sin traza operativa — Resuelto: `appLogger.warn` en `.catch`.
- [x] [Review][Patch] `occurredAt` inválido si `timestamp` corrupto — Resuelto: `payloadToRecord` retorna `null` + warn.
- [x] [Review][Patch] Regex UUID de sesión demasiado permisivo — Resuelto: regex alineado a `uuid-param.validator.ts`.
- [x] [Review][Defer] Smoke manual post-deploy sin ejecutar [`7-7-persistencia-eventos-analytics-postgres.md:97`] — deferred, ya listado en Task 6 como pendiente manual.
- [x] [Review][Defer] Inserts pendientes en `setImmediate` pueden perderse en shutdown [`analytics-persistence.ts:56`] — deferred, trade-off MVP fire-and-forget aceptado (SC-07).
