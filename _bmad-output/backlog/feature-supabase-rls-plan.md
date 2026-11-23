---
title: 'Habilitar RLS en PostgreSQL (Supabase)'
type: feature
created: 2026-10-25
status: done
baseline_commit: 'fe596deeaa1ede7d1952e12610fc8e89f6f25572'
context:
  - '{project-root}/docs/architecture.md'
  - '{project-root}/_bmad-output/project-context.md'
ticket: "story-supabase-rls"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** En el proyecto Supabase remoto, las tablas del esquema `public` están expuestas a PostgREST con RLS desactivado. Los roles `anon` y `authenticated` tienen `GRANT` completos (SELECT/INSERT/UPDATE/DELETE). El advisor de seguridad de Supabase reporta errores `rls_disabled_in_public` y `sensitive_columns_exposed` en tablas como `users`, `items`, `password_reset_tokens` y `analytics_events`. Cualquier cliente con la clave publishable podría leer o mutar datos sin pasar por el backend Express.

**Approach:** Activar Row Level Security en todas las tablas de aplicación (y en las que exige el linter de Supabase en `public`) **sin** políticas para `anon`/`authenticated`, de modo que el acceso vía Data API quede denegado por defecto. El backend sigue usando `DATABASE_URL` (rol `postgres`) y `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS), donde ya vive la autorización BOLA en use-cases. No se migra a Supabase Auth ni se duplican reglas de negocio en políticas SQL.

## Boundaries & Constraints

**Always:**
- Una sola migración SQL numerada (`019-…`) en `src/infrastructure/database/supabase/migrations/`.
- Habilitar RLS en: `users`, `password_reset_tokens`, `items`, `item_images`, `item_requests`, `storage_deletion_queue`, `delivery_sessions`, `reputation_events`, `analytics_events`, más `schema_migrations` y `spatial_ref_sys` (requerido por linter).
- No crear políticas `TO authenticated` / `TO anon` salvo deny-by-default implícito (cero políticas).
- Tras aplicar en remoto, ejecutar `get_advisors` (security) y confirmar que desaparecen los lint `rls_disabled_in_public` de tablas de aplicación.
- Documentar en `CHANGELOG.md` el cambio de postura de seguridad en BD.

**Ask First:**
- Revocar explícitamente `GRANT` de `anon`/`authenticated` además de RLS (recomendado pero más invasivo si en el futuro se expone PostgREST con JWT custom).
- Políticas RLS por usuario alineadas con JWT custom (requeriría integrar claims en Supabase Auth).
- Mover extensión PostGIS fuera de `public` (lint `extension_in_public`, fuera de alcance RLS).
- Corregir `search_path` en `fn_queue_storage_deletion` (lint separado).

**Never:**
- Cambiar lógica de use-cases, middleware JWT ni contratos OpenAPI.
- Exponer `password_hash`, `contact_channel` ni PII vía políticas permisivas.
- Usar `auth.uid()` / Supabase Auth como fuente de identidad (el producto usa JWT custom en `users`).
- Añadir `SECURITY DEFINER` para “arreglar” permisos.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| PostgREST anon | `GET /rest/v1/users` con anon key | 0 filas o error de permiso; sin datos de `password_hash` | RLS sin políticas → deny |
| PostgREST authenticated | Misma petición con JWT Supabase genérico | Sin acceso a filas de aplicación | Idem |
| Backend Express | `DATABASE_URL` (pool `pg`) tras migración | Tests e integración existentes siguen pasando | Rol con bypass RLS |
| Storage adapter | `SUPABASE_SERVICE_ROLE_KEY` | Upload/delete Storage sin cambios | service_role bypass RLS |
| pg_cron jobs | Jobs SQL existentes (degrade, purge, etc.) | Siguen ejecutando UPDATE/DELETE | Ejecutan como rol privilegiado |
| Migración local | `npm test` sin Supabase real | Sin regresión (tests mockean BD) | N/A |

</frozen-after-approval>

## Code Map

- `src/infrastructure/database/supabase/migrations/019-enable-rls-lockdown-public.sql` — migración nueva: `ALTER TABLE … ENABLE ROW LEVEL SECURITY` por tabla.
- `src/infrastructure/database/supabase/migrations/*.sql` — inventario de tablas creadas en 001–018.
- `src/infrastructure/database/supabase/db.ts` — pool con `DATABASE_URL` (no usa PostgREST para queries).
- `src/infrastructure/storage/supabase-storage.adapter.ts` — cliente con service role (no afectado por RLS de tablas).
- `docs/architecture.md` — §1 stack, §12 BOLA en aplicación; añadir nota breve de RLS deny-by-default en BD.
- `CHANGELOG.md` — entrada de seguridad.

## Tasks & Acceptance

**Execution:**
- [x] `src/infrastructure/database/supabase/migrations/019-enable-rls-lockdown-public.sql` — `ENABLE ROW LEVEL SECURITY` en las 11 tablas listadas en Intent; comentario de cabecera explicando modelo backend-only.
- [x] Aplicar migración en Supabase remoto (`apply_migration` MCP o CLI) y verificar con SQL: `relrowsecurity = true` en tablas de aplicación.
- [x] Ejecutar advisor security Supabase; capturar que `rls_disabled_in_public` ya no aplica a tablas de negocio.
- [x] `CHANGELOG.md` — nota bajo [Unreleased] o versión patch: RLS habilitado, acceso Data API bloqueado por defecto.
- [x] `docs/architecture.md` — párrafo corto en §3 o nota de seguridad: RLS + autorización en use-cases.

**Acceptance Criteria:**
- Given el proyecto Supabase conectado, when se consulta `pg_class` para tablas `users` e `items`, then `relrowsecurity` es `true`.
- Given un cliente PostgREST con rol `anon`, when intenta `SELECT` en `users`, then no devuelve filas de aplicación (RLS deny).
- Given el backend en tests (`npm test`), when se ejecuta la suite, then todos los tests pasan sin cambios en repositorios.
- Given la migración aplicada, when se ejecuta el security advisor, then no hay errores `rls_disabled_in_public` en tablas de negocio (`users`, `items`, `item_requests`, `delivery_sessions`, `password_reset_tokens`, `analytics_events`, etc.).

## Spec Change Log

## Design Notes

Patrón recomendado para backend-only con JWT custom (sin Supabase Auth):

```sql
-- Deny-by-default para API pública
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- Sin CREATE POLICY → anon/authenticated no ven filas
-- postgres / service_role (backend) siguen con bypass RLS
```

Opcional en migración futura (Ask First):

```sql
REVOKE ALL ON TABLE public.users FROM anon, authenticated;
```

`spatial_ref_sys` es tabla de catálogo PostGIS; habilitar RLS sin políticas satisface el linter sin uso desde la app.

## Verification

**Commands:**
- `npm test` — expected: suite verde (sin depender de RLS en mocks).
- Supabase MCP `get_advisors` type `security` — expected: sin `rls_disabled_in_public` en tablas de negocio.
- SQL: `SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND relkind = 'r' AND relname IN ('users','items');` — expected: `relrowsecurity = t`.

**Manual checks (if no CLI):**
- Dashboard Supabase → Database → Linter: comprobar desaparición de alertas RLS en tablas de aplicación.

## Suggested Review Order

**RLS lockdown (deny-by-default PostgREST)**

- Migración única: habilita RLS sin políticas en tablas de app
  [`019-enable-rls-lockdown-public.sql:5`](../../src/infrastructure/database/supabase/migrations/019-enable-rls-lockdown-public.sql#L5)

- `spatial_ref_sys` omitido si el rol migrador no es owner (PostGIS)
  [`019-enable-rls-lockdown-public.sql:19`](../../src/infrastructure/database/supabase/migrations/019-enable-rls-lockdown-public.sql#L19)

**Documentación**

- Nota de seguridad en changelog [Unreleased]
  [`CHANGELOG.md:10`](../../CHANGELOG.md#L10)

- Modelo dual: RLS en BD + BOLA en use-cases
  [`architecture.md:102`](../../docs/architecture.md#L102)
