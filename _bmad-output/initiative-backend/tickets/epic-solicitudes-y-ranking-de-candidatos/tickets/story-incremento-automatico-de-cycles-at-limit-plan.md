---
title: "Incremento automático de cycles_at_limit"
type: feature
ticket: 3
status: done
created: 2026-10-25
---

# Historia 3.3: Incremento automático de cycles_at_limit

Status: done

## Historia

Como sistema,
quiero incrementar `cycles_at_limit` una vez por ciclo de 30 días para usuarios que agotaron su límite de solicitudes,
para que el ranking pueda identificar y penalizar a usuarios acaparadores.

## Acceptance Criteria

1. **Dado** que un usuario realizó 3 o más solicitudes en los últimos 30 días y `last_cycle_incremented_at IS NULL` o `last_cycle_incremented_at < NOW() - 30 días`, **cuando** se ejecuta el job `increment-cycles-at-limit` (pg_cron, 02:00 UTC diario), **entonces** `cycles_at_limit` se incrementa en 1 y `last_cycle_incremented_at = NOW()` para ese usuario.

2. **Dado** que el job ya incrementó `cycles_at_limit` de un usuario en los últimos 30 días, **cuando** se ejecuta el job nuevamente, **entonces** ese usuario no se vuelve a incrementar (protección de doble incremento via `last_cycle_incremented_at`).

3. **Dado** que un usuario realizó menos de 3 solicitudes en los últimos 30 días, **cuando** se ejecuta el job, **entonces** `cycles_at_limit` de ese usuario no cambia.

4. **Dado** que el job está definido en SQL puro via `pg_cron`, **cuando** se examina la configuración, **entonces** no existe código Node.js que ejecute esta lógica directamente.

## Tasks / Subtasks

- [x] Task 1: Crear migración SQL con el job pg_cron (AC: #1, #2, #3, #4)
  - [x] Crear `src/infrastructure/database/supabase/migrations/008-setup-increment-cycles-at-limit-job.sql`
  - [x] Incluir bloque `DO $$ ... cron.unschedule ... END $$;` de limpieza idempotente (mismo patrón que migrations 006 y 007)
  - [x] Incluir `SELECT cron.schedule(...)` con el SQL exacto de la arquitectura

- [ ] Task 2: Verificación (requiere acceso manual a la base de datos)
  - [ ] Aplicar la migración en la base de datos (Supabase SQL editor o `psql`)
  - [ ] Confirmar que el job aparece en `cron.job` con `SELECT * FROM cron.job WHERE jobname = 'increment-cycles-at-limit';`
  - [ ] Confirmar que el schedule es `'0 2 * * *'` (02:00 UTC diario)

### Review Findings

- [x] [Review][Decision] Subquery cuenta TODOS los estados de item_requests — resuelto: añadido `AND status IN ('pending', 'selected')` al subquery; solo usuarios con solicitudes activas son contados. [src/infrastructure/database/supabase/migrations/008-setup-increment-cycles-at-limit-job.sql:20]
- [x] [Review][Defer] Race condition: `unschedule` y `schedule` no están dentro de una transacción [008-setup-increment-cycles-at-limit-job.sql] — deferred, pre-existing pattern (misma estructura que 006/007)
- [x] [Review][Defer] Excepción silenciosa enmascara ausencia de pg_cron — `EXCEPTION WHEN OTHERS THEN NULL` suprime cualquier error incluyendo extensión no instalada [008-setup-increment-cycles-at-limit-job.sql:3-7] — deferred, pre-existing pattern (misma estructura que 006/007)
- [x] [Review][Defer] Mismatch de precisión temporal: app enforcea con `720 hours`, job usa `INTERVAL '30 days'` (calendar-aware) — diferencia de hasta 1 hora en transiciones DST [008-setup-increment-cycles-at-limit-job.sql:19] — deferred, diferencia mínima para batch diario
- [x] [Review][Defer] `cycles_at_limit` no tiene cota máxima ni mecanismo de reset — un usuario legítimo con 3+ solicitudes por mes acumula penalización indefinidamente — deferred, decisión de diseño pre-existente, fuera del alcance de esta historia
- [x] [Review][Defer] Índice parcial `idx_users_cycle_increment` no cubre nuevos usuarios (`cycles_at_limit = 0`) — la rama `IS NULL` hace full scan en users para usuarios nuevos [migrations/001-create-users.sql:23-25] — deferred, diseño de índice pre-existente en migración 001
- [x] [Review][Defer] Sin garantía de rollback para escrituras en catálogo pg_cron si la migración falla después del `cron.schedule` [008-setup-increment-cycles-at-limit-job.sql] — deferred, pre-existing pattern (misma estructura que 006/007)
- [x] [Review][Defer] Nombre de job sin prefijo de entorno (`'increment-cycles-at-limit'`) — colisión posible en entornos compartidos (staging/prod en mismo cluster) — deferred, pre-existing naming convention (mismo patrón que jobs 006/007)

## Dev Notes

### Naturaleza de la historia: solo SQL, sin Node.js

**Esta historia produce exactamente un archivo**: `src/infrastructure/database/supabase/migrations/008-setup-increment-cycles-at-limit-job.sql`.

No se toca ningún archivo Node.js, ningún repositorio, ningún use case, ningún controlador, ningún test. El AC #4 lo exige explícitamente: "no existe código Node.js que ejecute esta lógica directamente."

La lógica de penalización por `cycles_at_limit` (usada en el ranking) ya está implementada en el SQL de `findRankedCandidates` (historia 3.2). Este job solo actualiza el contador que esa query ya lee.

### SQL exacto del job (fuente: docs/architecture.md §7, Job 4)

```sql
DO $$
BEGIN
  PERFORM cron.unschedule('increment-cycles-at-limit');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;
SELECT cron.schedule(
  'increment-cycles-at-limit',
  '0 2 * * *',
  $$
    UPDATE users
    SET
      cycles_at_limit           = cycles_at_limit + 1,
      last_cycle_incremented_at = NOW()
    WHERE id IN (
      SELECT requester_id
      FROM item_requests
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY requester_id
      HAVING COUNT(*) >= 3
    )
    AND (
      last_cycle_incremented_at IS NULL
      OR last_cycle_incremented_at < NOW() - INTERVAL '30 days'
    );
  $$
);
```

**Explicación del SQL**:
- `HAVING COUNT(*) >= 3` sobre `created_at >= NOW() - INTERVAL '30 days'` → ventana deslizante de 30 días, misma lógica que el límite de solicitudes (FR12)
- `AND (last_cycle_incremented_at IS NULL OR last_cycle_incremented_at < NOW() - INTERVAL '30 days')` → protección de doble incremento (AC #2)
- El UPDATE afecta solo a usuarios que cumplen ambas condiciones simultáneamente — si solo cumple una, no se incrementa

### Patrón de migración (seguir exactamente)

Las migraciones 006 y 007 establecen el patrón a seguir:
1. Bloque `DO $$ BEGIN PERFORM cron.unschedule('nombre-job'); EXCEPTION WHEN OTHERS THEN NULL; END $$;` — desregistra el job si ya existía (idempotencia)
2. `SELECT cron.schedule('nombre-job', 'cron-expression', $$ ... $$);` — registra el job nuevo

El `EXCEPTION WHEN OTHERS THEN NULL` asegura que si el job no existía, el `unschedule` no falla.

### Índice ya existente — no crear

El índice `idx_users_cycle_increment` que optimiza este job **ya fue creado en la migración 001**:
```sql
-- En migrations/001-create-users.sql (líneas 23-25):
CREATE INDEX idx_users_cycle_increment
  ON users(last_cycle_incremented_at)
  WHERE cycles_at_limit > 0;
```
**No volver a crearlo.** La migración 008 solo debe contener el `cron.unschedule` + `cron.schedule`.

### Relación con historias adyacentes

**Historia 3.2 (anterior)**: El SQL de ranking ya usa `cycles_at_limit` para penalizar acaparadores (`cycles_at_limit >= 3 AND total_received > 5 * total_donated → -15 puntos`). Este job incrementa ese contador. No hay conflicto — el ranking lee el valor actual de la columna en tiempo real.

**Historia 4.1 (futura)**: No tiene dependencia con `cycles_at_limit`. Este job es autónomo.

### No hay tests unitarios

Los jobs de `pg_cron` se ejecutan directamente en PostgreSQL. No hay path de código Node.js para ejercer en Vitest. La verificación es manual: aplicar la migración y confirmar con `SELECT * FROM cron.job WHERE jobname = 'increment-cycles-at-limit';`.

Los tests de TypeScript (`npx tsc --noEmit` y `npx vitest run`) no son relevantes para esta historia porque no se modifica ningún archivo TypeScript. Sin embargo, ejecutarlos confirma que ninguna historia anterior rompió la compilación o la suite de tests.

### Convenciones del proyecto

- Nombre del archivo: `008-setup-increment-cycles-at-limit-job.sql` — kebab-case, con número de orden de 3 dígitos, descriptivo
- Ubicación: `src/infrastructure/database/supabase/migrations/`
- El job name en pg_cron: `'increment-cycles-at-limit'` — coincidir exactamente con la arquitectura (§7, Job 4)
- Schedule: `'0 2 * * *'` — las 02:00 UTC diario

### Project Structure Notes

- Solo se toca: `src/infrastructure/database/supabase/migrations/008-setup-increment-cycles-at-limit-job.sql` (NUEVO)
- Ningún archivo en `src/domain/`, `src/application/`, `src/interfaces/`, `src/infrastructure/` (fuera de migrations) se modifica

### References

- SQL del job: [Source: docs/architecture.md — §7 Jobs de pg_cron, Job 4]
- Índice `idx_users_cycle_increment`: [Source: src/infrastructure/database/supabase/migrations/001-create-users.sql:23-25]
- Patrón de migración: [Source: src/infrastructure/database/supabase/migrations/006-create-item-requests-and-degrade-job.sql, src/infrastructure/database/supabase/migrations/007-setup-purge-item-images-job.sql]
- Columnas `cycles_at_limit` y `last_cycle_incremented_at` en tabla `users`: [Source: docs/architecture.md — §3.1]
- FR27 (requisito funcional): [Source: _bmad-output/initiative-backend/archive-v6/epics.md — FR27]
- Uso del contador en ranking: [Source: src/infrastructure/database/supabase/request.repository.ts — método `findRankedCandidates`]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

(ninguno)

### Completion Notes List

- ✅ Task 1 completado: creado `src/infrastructure/database/supabase/migrations/008-setup-increment-cycles-at-limit-job.sql` siguiendo exactamente el patrón de migrations 006 y 007 (bloque `cron.unschedule` idempotente + `cron.schedule`).
- ✅ SQL del job copiado directamente de `docs/architecture.md §7 Job 4`, sin modificaciones.
- ✅ TypeScript compila sin errores (`npx tsc --noEmit`).
- ✅ Suite completa pasa sin regresiones: 118 tests en 16 archivos.
- ⚠️ Task 2 (Verificación) requiere acceso manual al SQL editor de Supabase o psql. Pasos a ejecutar por Emanuel:
  1. Abrir Supabase SQL Editor y pegar el contenido de `008-setup-increment-cycles-at-limit-job.sql`.
  2. Ejecutar y confirmar con: `SELECT * FROM cron.job WHERE jobname = 'increment-cycles-at-limit';`
  3. Verificar que `schedule = '0 2 * * *'`.

### File List

- `src/infrastructure/database/supabase/migrations/008-setup-increment-cycles-at-limit-job.sql` (NUEVO)

## Change Log

- 2026-05-09: Implementación de Task 1 — creado archivo de migración SQL `008-setup-increment-cycles-at-limit-job.sql` con job pg_cron `increment-cycles-at-limit` (schedule `0 2 * * *`). Historia marcada para review. Task 2 (verificación DB) pendiente de ejecución manual.
