---
title: "Schema y jobs de purga"
type: feature
ticket: 1
status: done
created: 2026-10-25
---

# Historia 12.1: Schema y jobs de purga

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como sistema,
quiero persistir el canal del candidato en `item_requests` y el canal copiado en `delivery_sessions`, con purga programada de ambos canales de sesión,
para soportar contacto simétrico y privacidad acorde al delta aprobado.

## Criterios de aceptación

1. **Dado** que se aplica la migración vía `npm run db:migrate`, **cuando** inspecciono el schema, **entonces** `item_requests` incluye `contact_channel TEXT` nullable y `delivery_sessions` incluye `receiver_contact_channel TEXT` nullable y `receiver_contact_purged BOOLEAN NOT NULL DEFAULT FALSE`.

2. **Dado** el índice `idx_sessions_contact_purge`, **cuando** se redefine según delta §2.3, **entonces** el índice parcial cubre filas con `contact_purged = FALSE` **o** `receiver_contact_purged = FALSE` (condición OR en el `WHERE` del índice).

3. **Dado** sesiones con `status IN ('completed','cancelled','expired')`, al menos uno de los flags de purga en `FALSE`, y `completed_at < NOW() - INTERVAL '7 days'`, **cuando** se ejecuta el job pg_cron `purge-contact-channel` (03:30 UTC), **entonces** `contact_channel` y `receiver_contact_channel` pasan a `NULL` y `contact_purged = TRUE` y `receiver_contact_purged = TRUE`.

4. **Dado** solicitudes `pending` existentes antes del deploy, **cuando** no hay backfill, **entonces** la política queda documentada en Dev Notes: nuevas solicitudes requerirán canal (12-2); solicitudes legacy sin canal se gestionan en 12-2 al postular de nuevo o al seleccionar.

5. **Dado** el cierre de la historia, **cuando** se ejecuta `npm test` y `npm run build`, **entonces** pasan sin regresiones y existen tests de smoke del SQL de migración (contenido canónico del job e índice).

## Alcance explícito (IN / OUT)

| IN (12.1) | OUT (12.2 / 12.3) |
|---|---|
| Migración `018-*.sql` (columnas + índice + reschedule Job 3) | `RequestItem`, `SelectReceiver`, `GetDeliverySession` — **12.2** |
| Reschedule `purge-contact-channel` con purga dual | Repositorios TypeScript, entidades, DTOs — **12.2** |
| Tests smoke del archivo SQL (patrón `expire-delivery-sessions.test.ts`) | Validators Zod, OpenAPI, tests HTTP — **12.2** |
| `npm run db:migrate` + `npm test` + `npm run build` | Sync `docs/prd.md`, `docs/architecture.md`, `epics.md` — **12.3** |
| Comentarios SQL (`COMMENT ON COLUMN`) opcionales pero recomendados | Frontend Angular / cliente generado |

**Regla de despliegue:** Tras merge de 12.1, ejecutar `npm run db:migrate` (o `db:migrate:prod`) **antes** de desplegar 12-2. La migración es aditiva y compatible con el código actual (columnas nuevas nullable / defaults).

**Importante:** Esta historia **no** modifica código TypeScript de aplicación. Solo SQL + tests del SQL. La lógica de copia/purga en `SelectReceiver` y el body obligatorio en `POST /items/:id/requests` pertenecen estrictamente a **12-2**.

## Tareas / Subtareas

- [x] **Task 1 — Migración `018-candidate-contact-channel-schema.sql`** (AC: #1, #2, #3)
  - [x] Crear `src/infrastructure/database/supabase/migrations/018-candidate-contact-channel-schema.sql` (siguiente número tras `017-reputation-events-role.sql`)
  - [x] `ALTER TABLE item_requests ADD COLUMN IF NOT EXISTS contact_channel TEXT;`
  - [x] `ALTER TABLE delivery_sessions ADD COLUMN IF NOT EXISTS receiver_contact_channel TEXT;`
  - [x] `ALTER TABLE delivery_sessions ADD COLUMN IF NOT EXISTS receiver_contact_purged BOOLEAN NOT NULL DEFAULT FALSE;`
  - [x] `DROP INDEX IF EXISTS idx_sessions_contact_purge;` + recrear con `WHERE contact_purged = FALSE OR receiver_contact_purged = FALSE`
  - [x] Reschedule Job 3 con SQL canónico del delta (ver §SQL obligatorio)
  - [x] Patrón `DO $$ BEGIN PERFORM cron.unschedule('purge-contact-channel'); EXCEPTION WHEN OTHERS THEN NULL; END $$;` antes de `cron.schedule` (igual que migración `011`)
  - [x] **No** tocar job `expire-delivery-sessions` en esta migración
  - [x] **Sin** backfill de `contact_channel` en filas `pending` existentes
  - [x] Verificar con `npm run db:migrate` contra BD local/remota

- [x] **Task 2 — Tests smoke del SQL** (AC: #3, #5)
  - [x] Crear `tests/candidate-contact-channel-migration.test.ts` (o ampliar suite existente de jobs)
  - [x] Leer el archivo `018-*.sql` con `readFileSync` y assertear subcadenas obligatorias:
    - `receiver_contact_channel`, `receiver_contact_purged`, `item_requests` + `contact_channel`
    - `DROP INDEX IF EXISTS idx_sessions_contact_purge`
    - `receiver_contact_purged = FALSE` en el `WHERE` del índice (OR con `contact_purged`)
    - Job: `SET receiver_contact_channel = NULL`, `receiver_contact_purged = TRUE`
    - Job WHERE: `(contact_purged = FALSE OR receiver_contact_purged = FALSE)`
  - [x] **No** requiere Postgres en CI si solo valida contenido del archivo (patrón `CASO-11` en `expire-delivery-sessions.test.ts`)
  - [x] Ejecutar `npm test` y `npm run build`

- [x] **Task 3 — Documentar política legacy en Dev Record** (AC: #4)
  - [x] Anotar en Completion Notes: solicitudes `pending` pre-deploy no tienen `contact_channel`; 12-2 validará obligatoriedad en API

---

## Notas para el Dev Agent

### Contexto de épica 12 (Correct Course 2026-05-31)

Correct Course aprobó `docs/delta-candidato-contacto.md` v1.0 (decisiones 1A · 2B · 3C · 4A · 5A). Las épicas 3–4 están `done`; **no reabrirlas**. Esta épica extiende el modelo simétrico donante↔candidato en tres historias backend.

**Esta es la primera historia de la épica 12** — solo esquema + job pg_cron. **12.2** implementará use cases, repos, OpenAPI y tests HTTP. **12.3** sincronizará PRD, architecture y epics.

**Referencias obligatorias:**

- [Source: docs/delta-candidato-contacto.md#2-cambios-en-el-modelo-de-datos] — DDL columnas e índice
- [Source: docs/delta-candidato-contacto.md#5-cambios-en-jobs-de-pg_cron] — Job 3 ampliado
- [Source: _bmad-output/initiative-backend/sprint-change-proposal-2026-05-31.md#4-historias-de-implementación-criterios-resumidos] — alcance 12-1
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md#historia-121-schema-y-jobs-de-purga]

### Estado actual del código (leer antes de editar)

**Migraciones existentes:** `001` … `017` en `src/infrastructure/database/supabase/migrations/`. **No existe** `018-*.sql`.

**Tabla `item_requests` hoy** (`006-create-item-requests-and-degrade-job.sql`):

```sql
CREATE TABLE IF NOT EXISTS item_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES items(id),
  requester_id UUID NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','selected','rejected','cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, requester_id)
);
```

**Tabla `delivery_sessions` hoy** (`009-create-delivery-sessions.sql`):

```sql
-- contact_channel TEXT, contact_purged BOOLEAN NOT NULL DEFAULT FALSE
-- SIN receiver_contact_channel ni receiver_contact_purged
CREATE INDEX IF NOT EXISTS idx_sessions_contact_purge
  ON delivery_sessions(status, completed_at)
  WHERE contact_purged = FALSE;
```

**Job 3 actual** (`011-setup-expire-sessions-and-purge-contact-channel-jobs.sql`):

```sql
UPDATE delivery_sessions
SET contact_channel = NULL,
    contact_purged  = TRUE
WHERE contact_purged = FALSE
  AND status IN ('completed', 'cancelled', 'expired')
  AND completed_at < NOW() - INTERVAL '7 days';
```

**Qué preservar (no romper en 12.1):**

- Schedule `'30 3 * * *'` del job `purge-contact-channel`
- Filtro `status IN ('completed', 'cancelled', 'expired')` y ventana `completed_at < NOW() - 7 days`
- Job `expire-delivery-sessions` en la misma migración 011 — **no modificar** en 12-1
- Código TypeScript actual sigue funcionando: columnas nuevas son nullable/default; repos ignoran campos hasta 12-2

### SQL obligatorio (canónico — delta §2 y §5)

```sql
-- Columnas
ALTER TABLE item_requests
  ADD COLUMN IF NOT EXISTS contact_channel TEXT;

ALTER TABLE delivery_sessions
  ADD COLUMN IF NOT EXISTS receiver_contact_channel TEXT;

ALTER TABLE delivery_sessions
  ADD COLUMN IF NOT EXISTS receiver_contact_purged BOOLEAN NOT NULL DEFAULT FALSE;

-- Índice (reemplazo completo)
DROP INDEX IF EXISTS idx_sessions_contact_purge;

CREATE INDEX idx_sessions_contact_purge
  ON delivery_sessions(status, completed_at)
  WHERE contact_purged = FALSE
     OR receiver_contact_purged = FALSE;

-- Job 3 (reschedule)
DO $$
BEGIN
  PERFORM cron.unschedule('purge-contact-channel');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;

SELECT cron.schedule(
  'purge-contact-channel',
  '30 3 * * *',
  $$
    UPDATE delivery_sessions
    SET contact_channel          = NULL,
        contact_purged           = TRUE,
        receiver_contact_channel = NULL,
        receiver_contact_purged  = TRUE
    WHERE (contact_purged = FALSE OR receiver_contact_purged = FALSE)
      AND status IN ('completed', 'cancelled', 'expired')
      AND completed_at < NOW() - INTERVAL '7 days';
  $$
);
```

**Purga en `item_requests`:** ocurre en transacción de `SelectReceiver` (12-2), **no** en job pg_cron. No añadir job adicional.

### Deuda conocida — NO corregir en 12.1 salvo instrucción explícita

`_bmad-output/initiative-backend/deferred-work.md` documenta que sesiones `expired` con `completed_at IS NULL` **nunca** entran en el filtro del Job 3. Esto es deuda preexistente (historia 4.6, explícitamente diferida). El delta §5 replica el mismo `WHERE`; **mantener paridad** con architecture §7 Job 3. Un fix requeriría Correct Course aparte.

### Política datos legacy (AC #4)

| Escenario | Comportamiento post-12.1 | Responsable |
|---|---|---|
| `item_requests` `pending` sin `contact_channel` | Columna `NULL`; API actual no exige body | 12-2 validará 400 al postular sin canal |
| Sesiones `active` existentes | `receiver_contact_channel = NULL`, `receiver_contact_purged = FALSE` | Normal; 12-2 copia al seleccionar |
| Sesiones cerradas antiguas | Job 3 purga ambos canales cuando aplique ventana 7d | Esta historia |

### Requisitos técnicos

- Usar `ADD COLUMN IF NOT EXISTS` para idempotencia en re-deploys fallidos (patrón `017-reputation-events-role.sql`).
- `receiver_contact_purged` debe ser `NOT NULL DEFAULT FALSE` — filas existentes reciben `FALSE` automáticamente.
- El `DROP INDEX` + `CREATE INDEX` es necesario: `CREATE INDEX IF NOT EXISTS` **no** cambia la definición del índice parcial existente.
- Migraciones en `src/infrastructure/database/supabase/migrations/` — **no editar** migraciones `001`–`017` ya aplicadas.
- Ejecutar `npm run db:migrate` / `db:migrate:dev` según entorno (`APP_ENV=dev` para remoto local).

### Cumplimiento arquitectónico

- Jobs pg_cron solo en SQL/migraciones — no duplicar purga en Node (`project-context.md`).
- Schema cerrado: esta historia **es** la migración aprobada para contacto candidato.
- Índice alineado con `docs/architecture.md` §4 (pendiente sync literal en 12-3).
- SEC-002 / SEC-002b **sin cambio** en 12.1; SEC-002c se implementa en 12-2.

### Estructura de archivos

| Acción | Ruta |
|---|---|
| **NEW** | `src/infrastructure/database/supabase/migrations/018-candidate-contact-channel-schema.sql` |
| **NEW** | `tests/candidate-contact-channel-migration.test.ts` |
| **NO TOCAR** | `src/application/**`, `src/domain/**`, `src/infrastructure/database/supabase/*.repository.ts`, `openapi/**` |

### Requisitos de testing

- Tests smoke del SQL: sin BD, asserts sobre contenido del archivo (rápidos, CI-friendly).
- Opcional: test de integración con Postgres local verificando `\d item_requests` / columnas — solo si `INTEGRATION_DATABASE_URL` disponible (patrón `tests/helpers/integration-db.ts` de 11-1).
- `npm test` completo sin regresiones.
- `npm run build` (incluye OpenAPI) debe pasar — 12.1 no cambia OpenAPI, pero valida que el repo compila.

### Inteligencia de historias relacionadas (MVP contacto donante)

**Historia 4.6** (`4-6-expiracion-automatica-de-sesiones-y-purga-de-canal-de-contacto.md`):

- Job 3 introducido en migración `011`; patrón `cron.unschedule` + `cron.schedule`.
- Purga es **solo pg_cron** — sin use case Node.
- Deuda `completed_at NULL` en `expired` documentada y diferida.

**Historia 4.1** (`4-1-seleccionar-receptor-para-un-objeto.md`):

- Creó `delivery_sessions` con `contact_channel` / `contact_purged`.
- Índice `idx_sessions_contact_purge` original — **reemplazar**, no duplicar.

**Historia 11.1** (patrón migración reciente):

- Numeración secuencial `018` tras `017`.
- `ADD COLUMN IF NOT EXISTS`, sin backfill histórico.
- Tests + build obligatorios antes de cerrar.

### Git intelligence (commits recientes)

Trabajo reciente en infra/CORS (`4bb32e8`, `344933f`) — sin conflicto con migraciones SQL. Épica 11 (ranking) en `review`; 12-1 es independiente y puede implementarse en paralelo tras merge de esta story file.

### Información técnica (pg_cron / PostgreSQL)

- `pg_cron` ya habilitado en entornos con migraciones `006`–`011`; reschedule idempotente vía `unschedule` + `schedule`.
- Índices parciales con `OR` en `WHERE` son válidos en PostgreSQL ≥12 (Supabase/Railway/Render).
- `BOOLEAN NOT NULL DEFAULT FALSE` en columna nueva: migración online-safe en tablas pequeñas/medias.

### Referencia project-context

- [Source: _bmad-output/project-context.md] — SQL explícito, jobs en migraciones, no ORM, no editar openapi a mano.
- Tras 12-2 (no esta historia): regenerar OpenAPI y avisar frontend `npm run api:generate`.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

(sin incidencias — implementación directa según SQL canónico del delta)

### Completion Notes List

- ✅ Migración `018-candidate-contact-channel-schema.sql` creada con columnas `item_requests.contact_channel`, `delivery_sessions.receiver_contact_channel` y `delivery_sessions.receiver_contact_purged BOOLEAN NOT NULL DEFAULT FALSE`.
- ✅ Índice `idx_sessions_contact_purge` reemplazado: condición `WHERE contact_purged = FALSE OR receiver_contact_purged = FALSE` (cobertura dual).
- ✅ Job `purge-contact-channel` rescheduleado con purga dual (ambos canales) usando patrón `unschedule`+`schedule` idempotente (igual que migración 011).
- ✅ 15 tests smoke verifican subcadenas canónicas del SQL sin requerir Postgres en CI.
- ✅ Suite completa: 487 tests pasan, 0 regresiones. `npm run build` limpio.
- ✅ **Política legacy (AC #4):** solicitudes `pending` pre-deploy tendrán `contact_channel = NULL`. La historia 12-2 validará el campo obligatorio en `POST /items/:id/requests` y lo copiará en `SelectReceiver`. Las sesiones activas existentes tienen `receiver_contact_channel = NULL` y `receiver_contact_purged = FALSE` — comportamiento normal, 12-2 gestiona la copia al seleccionar receptor.

### File List

- `src/infrastructure/database/supabase/migrations/018-candidate-contact-channel-schema.sql` (NEW)
- `tests/candidate-contact-channel-migration.test.ts` (NEW)

---

## Change Log

- 2026-05-31: Historia 12-1 implementada — migración 018 (columnas + índice + reschedule Job 3) + 15 tests smoke SQL. Sin cambios TypeScript ni OpenAPI (scope 12-2).

---

### Review Findings

- [x] [Review][Patch] Añadir CHECK de longitud a columnas de canal — `CHECK (contact_channel IS NULL OR char_length(contact_channel) <= 500)` en `item_requests` y equivalente para `receiver_contact_channel` en `delivery_sessions`; el campo es texto libre por diseño (delta §1) pero sin cota máxima queda expuesto a abuse de storage. [src/infrastructure/database/supabase/migrations/018-candidate-contact-channel-schema.sql]

- [x] [Review][Patch] `readFileSync` ejecutado fuera de `beforeAll` — si el archivo SQL no existe, el error lanza en recolección de tests (no en un `it`), abortando la suite entera sin mensaje claro. Mover a `beforeAll(() => { sql = readFileSync(MIGRATION_PATH, 'utf8'); })`. [tests/candidate-contact-channel-migration.test.ts]

- [x] [Review][Patch] Aserción frágil por doble espacio — `toContain('receiver_contact_purged  = TRUE')` depende de la alineación de columnas del SQL; reemplazado con `toMatch(/receiver_contact_purged\s+=\s+TRUE/)` para desacoplar del formateo. [tests/candidate-contact-channel-migration.test.ts:44]

- [x] [Review][Patch] Aserción de idempotencia imprecisa — `toBeGreaterThanOrEqual(3)` no detecta regresión si se elimina un `IF NOT EXISTS`. Cambiado a `toBe(3)`. [tests/candidate-contact-channel-migration.test.ts]

- [x] [Review][Patch] Test de frontera near-duplicate — el nuevo test `'Tier 1 CASE boundary'` repite las mismas dos aserciones del test anterior sin cobertura diferencial real. Fusionado: aserción única (`not.toContain('u.cycles_at_limit >= 2 THEN')`) incorporada al test existente; test duplicado eliminado. [tests/ranked-candidate-filters.test.ts]

- [x] [Review][Defer] `completed_at IS NULL` no filtrado en job de purga — sesiones `expired` con `completed_at NULL` nunca entran en el WHERE; deuda de historia 4.6 explícitamente diferida y replicada por paridad. [src/infrastructure/database/supabase/migrations/018-candidate-contact-channel-schema.sql] — deferred, pre-existing

- [x] [Review][Defer] DROP/CREATE INDEX sin CONCURRENTLY — toma lock exclusivo en `delivery_sessions`; puede bloquear lecturas brevemente en prod con tráfico. Evaluar ventana de mantenimiento antes de ejecutar. [src/infrastructure/database/supabase/migrations/018-candidate-contact-channel-schema.sql] — deferred, pre-existing

- [x] [Review][Defer] Migración sin wrapper transaccional explícito — si `cron.schedule` falla, los DDL ya aplicados no se revertirán si el migration runner no usa transacción. Patrón pre-existente en migraciones 001–017. [src/infrastructure/database/supabase/migrations/018-candidate-contact-channel-schema.sql] — deferred, pre-existing
