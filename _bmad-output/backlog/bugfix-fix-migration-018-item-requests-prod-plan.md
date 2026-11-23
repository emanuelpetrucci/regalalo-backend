---
title: 'Fix: Migration 018 falla en producción por item_requests inexistente'
type: bugfix
created: 2026-10-25
status: done
route: 'one-shot'
ticket: "story-fix-migration-018-item-requests-prod"
---

## Intent

**Problem:** En producción, la tabla `item_requests` no existe físicamente a pesar de que la migración 006 figura como aplicada en `schema_migrations`. Esto causa un error runtime en `findMyItems` y hace que `db:migrate:prod` falle en la migración 018 con `relation "item_requests" does not exist`.

**Approach:** Añadir un recovery guard (`CREATE TABLE IF NOT EXISTS item_requests`) al inicio de la migración 018 — que aún no fue registrada en `schema_migrations` — para que sea auto-suficiente independientemente del estado de la tabla. El guard es idempotente: si la tabla ya existe, es un no-op.

## Suggested Review Order

- [`src/infrastructure/database/supabase/migrations/018-candidate-contact-channel-schema.sql`](../../src/infrastructure/database/supabase/migrations/018-candidate-contact-channel-schema.sql) — recovery guard añadido al inicio + comentario aclaratorio en DROP/CREATE INDEX

## Code Map

- `src/infrastructure/database/supabase/migrations/018-candidate-contact-channel-schema.sql` — migración modificada; el único archivo cambiado
- `src/infrastructure/database/supabase/migrations/006-create-item-requests-and-degrade-job.sql` — fuente original del schema de `item_requests`; el recovery guard en 018 replica su DDL exactamente
- `scripts/migrate.ts` — runner que marca 006 como aplicada ante errores de pg_cron; causa raíz del estado inconsistente

## Tasks & Acceptance

**Execution:**
- [x] `src/infrastructure/database/supabase/migrations/018-candidate-contact-channel-schema.sql` — añadir `CREATE TABLE IF NOT EXISTS item_requests` + índices al inicio de la migración; añadir comentario en DROP/CREATE INDEX

**Acceptance Criteria:**
- Dado que `item_requests` no existe en producción, cuando se ejecuta `db:migrate:prod`, entonces la migración 018 se aplica exitosamente sin error
- Dado que `item_requests` ya existe (entorno normal), cuando se ejecuta `db:migrate:prod`, entonces el `CREATE TABLE IF NOT EXISTS` es un no-op y la migración se aplica sin error
- Dado que la migración se reintenta (ej. falla en `cron.schedule`), cuando el runner la vuelve a ejecutar, entonces no hay error `42P07` en el índice de purga

## Design Notes

La causa raíz probable: el runner de migraciones (`scripts/migrate.ts`) captura errores de pg_cron y marca la migración como aplicada incluso cuando sólo parte del SQL se ejecutó. Si `SELECT cron.schedule(...)` al final de 006 falló antes de que `CREATE TABLE` commiteara (o si la sesión fue abortada), la tabla nunca se creó pero 006 quedó registrada. Modificar 018 (no aplicada) es la solución de menor fricción: no requiere intervención manual en `schema_migrations` ni coordinación de un hotfix separado.

## Spec Change Log

_Sin loopbacks — one-shot directo._
