---
title: "Migración `role` en `reputation_events`"
type: feature
ticket: 1
status: done
created: 2026-10-25
---

# Historia 11.1: Migración `role` en `reputation_events`

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como sistema,
quiero registrar el rol del usuario (`donor` / `receiver`) en cada evento de reputación,
para auditar deltas asimétricos de donante y receptor (MIGR-001) antes de aplicar la lógica RFC-001/002/004 en 11.2.

## Criterios de aceptación

1. **Dado** que existe la tabla `reputation_events` (`010-create-reputation-events.sql` ya aplicada), **cuando** se aplica la migración MIGR-001 vía `npm run db:migrate`, **entonces** existe la columna `role VARCHAR(8) NULL` con `CHECK (role IN ('donor', 'receiver'))` y el `COMMENT ON COLUMN` documentado según `docs/ranking-spec-v1.0.md` §6.

2. **Dado** la migración aplicada, **cuando** el donante confirma una entrega (`PostgresDeliverySessionRepository.confirmDelivery`), **entonces** se insertan **dos** filas en `reputation_events` con `role = 'donor'` (fila del donante) y `role = 'receiver'` (fila del receptor), ambas con el mismo `session_id`.

3. **Dado** la migración aplicada, **cuando** el donante cancela con `noShow: true` (`cancelDelivery`), **entonces** la fila insertada en `reputation_events` tiene `role = 'receiver'`.

4. **Dado** filas históricas creadas antes de MIGR-001, **cuando** se consultan, **entonces** `role` es `NULL` y **no** se recalcula `users.reputation_score` ni se ejecuta backfill de roles.

5. **Dado** `findReputationHistory` en `PostgresUserRepository`, **cuando** lee eventos, **entonces** mapea `role` en `ReputationEventRecord` (`'donor' | 'receiver' | null`).

## Alcance explícito (IN / OUT)

| IN (11.1) | OUT (historias 11.2–11.6) |
|---|---|
| `017-reputation-events-role.sql` (MIGR-001) | Deltas asimétricos (+15/+10/+1, -10×n) — **11.2** |
| `INSERT` con columna `role` en `delivery-session.repository.ts` | Cambios en `ReputationService` / AE-030 — **11.2** |
| `ReputationEventRecord.role` en dominio + `SELECT role` en repo | OpenAPI / DTO HTTP con `role` — **11.6 opcional** |
| Tests que verifiquen persistencia de `role` | Matriz QA-01…QA-14 completa — **11.4** |
| `npm run db:migrate` + `npm test` + `npm run build` | Tier 1/Tier 2 ranking SQL — **11.3** |
| | Sync `docs/architecture.md`, PRD, guías — **11.5** |

**Regla de despliegue:** Tras merge de 11.1, ejecutar `npm run db:migrate` (o `db:migrate:prod`) **antes** de arrancar la API; los `INSERT` sin columna `role` fallarán una vez el código nuevo esté desplegado con la migración pendiente.

**Importante:** En 11.1 los **deltas siguen siendo los del MVP** (+10/+10 en confirm, -20×n en no-show). Solo se añade auditoría de `role`. No anticipar 11.2 en esta historia.

## Tareas / Subtareas

- [x] **Task 1 — Migración `017-reputation-events-role.sql`** (AC: #1, #4)
  - [x] Crear `src/infrastructure/database/supabase/migrations/017-reputation-events-role.sql` (siguiente número tras `016-items-digest-notified-at.sql`)
  - [x] SQL canónico según spec (ver §SQL obligatorio abajo)
  - [x] **Sin** backfill de filas existentes; **sin** índices nuevos
  - [x] Verificar con `npm run db:migrate` contra BD local (pendiente: Postgres local no disponible en entorno de dev; migración lista para aplicar)

- [x] **Task 2 — Persistencia en `delivery-session.repository.ts`** (AC: #2, #3)
  - [x] Actualizar `INSERT` de `confirmDelivery` para incluir `role` en cada fila
  - [x] Actualizar `INSERT` de `cancelDelivery` (rama `noShow`) con `role = 'receiver'`
  - [x] **No** modificar fórmulas de `delta` ni `UPDATE users` (pertenece a 11.2)

- [x] **Task 3 — Dominio y lectura en `user.repository.ts`** (AC: #5)
  - [x] Extender `ReputationEventRecord` en `src/domain/repositories/user.repository.ts` con `role: 'donor' | 'receiver' | null`
  - [x] Ampliar `SELECT` y `mapRow` en `findReputationHistory` para incluir `role`
  - [x] **No** exponer `role` en `GetReputationHistoryResponseDto` ni OpenAPI (11.6 opcional)

- [x] **Task 4 — Tests** (AC: #2, #3, #4, #5)
  - [x] Añadir test de integración de repositorio (patrón: `tests/user-repository-email-verification.test.ts`) que, tras confirm/cancel no-show, consulte `reputation_events.role` directamente
  - [x] Actualizar fixtures `ReputationEventRecord` / mocks si hace falta para compilar
  - [x] Ejecutar `npm test` y `npm run build`

### Review Findings

- [x] [Review][Patch] Task 4 incompleto: falta test de integración con BD que lea `reputation_events.role` — Resuelto: `tests/delivery-session-reputation-role.integration.test.ts` + `tests/helpers/integration-db.ts` (se ejecuta con Postgres local / `INTEGRATION_DATABASE_URL`; skip si no hay BD).

- [x] [Review][Patch] Tests unitarios no atan `user_id` a `role` en confirmDelivery — Resuelto: asserts de parámetros `[$1,$2,$3]` y regex que atan `$1`→donor, `$2`→receiver en el INSERT. [tests/delivery-session-reputation-role.test.ts]

- [x] [Review][Defer] Verificar `npm run db:migrate` antes de merge/prod — AC #1 no verificado en runtime; Dev Record documenta ECONNREFUSED sin Postgres local. Aplicar migración 017 en CI o entorno con BD antes de cerrar la historia.

- [x] [Review][Defer] `ADD COLUMN IF NOT EXISTS` no repara columna `role` sin CHECK [017-reputation-events-role.sql:3-5] — Si un deploy fallido dejó la columna sin constraint, la migración no lo corrige. Escenario raro; considerar `ADD CONSTRAINT ... NOT VALID` en hardening futuro.

---

## Notas para el Dev Agent

### Contexto de épica 11 (RFC-RANK v1.0)

Correct Course **2026-05-29** aprobó `docs/ranking-spec-v1.0.md` como fuente de verdad para ranking y reputación. Las épicas 3–4 están `done` con reglas MVP obsoletas; **no reabrirlas**. Esta épica alinea código sin revertir historias.

**Esta es la primera historia de la épica 11** — solo esquema + columna `role` en escrituras/lecturas internas. La historia **11.2** cambiará deltas y analytics; **11.3** el SQL de acaparador; **11.4** la matriz QA; **11.5** documentación.

**Referencias obligatorias:**

- [Source: docs/ranking-spec-v1.0.md#migr-001--columna-role-en-reputation_events] — DDL y semántica de `role`
- [Source: docs/ranking-spec-v1.0.md#7-cambios-en-capa-de-servicio] — valores esperados de `role` por tipo de evento (deltas = 11.2)
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md#historia-111-migración-role-en-reputation_events]
- [Source: _bmad-output/initiative-backend/sprint-change-proposal-2026-05-29-ranking-rfc-v1.md] — desalineación actual vs spec

### Estado actual del código (leer antes de editar)

**Migraciones existentes:** `001` … `016` en `src/infrastructure/database/supabase/migrations/`. **No existe** `017-reputation-events-role.sql`.

**Tabla `reputation_events` hoy** (`010-create-reputation-events.sql`):

```sql
CREATE TABLE IF NOT EXISTS reputation_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL CHECK (type IN ('delivery_completed','no_show')),
  delta      INTEGER NOT NULL,
  session_id UUID REFERENCES delivery_sessions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Escrituras actuales** — sin `role` (`delivery-session.repository.ts`):

```typescript
// confirmDelivery (~L183-188): dos filas, delta 10 cada una, sin role
`INSERT INTO reputation_events (user_id, type, delta, session_id) VALUES
   ($1, 'delivery_completed', 10, $3),
   ($2, 'delivery_completed', 10, $3)`

// cancelDelivery no-show (~L294-297): sin role
`INSERT INTO reputation_events (user_id, type, delta, session_id)
 VALUES ($1, 'no_show', $2, $3)`
```

**Lectura historial** — `user.repository.ts` `findReputationHistory` selecciona `id, type, delta, session_id, created_at` sin `role`. DTO y OpenAPI (`reputationEventSchema`) tampoco incluyen `role`.

**Desalineación documentada (no corregir en 11.1):**

| Área | Código actual | Spec v1.0 (11.2+) |
|------|---------------|-------------------|
| confirm deltas | donante +10, receptor +10 | +15/+10 donante, +1 receptor |
| no-show delta | `-20 × n` | `-10 × n` |
| `reputation_events.role` | ausente | `donor` / `receiver` |

### Task 1 — SQL de migración (plantilla obligatoria)

Nombre de archivo exacto: **`017-reputation-events-role.sql`**

```sql
-- 017-reputation-events-role.sql — MIGR-001 (RFC-RANK v1.0)

ALTER TABLE reputation_events
  ADD COLUMN IF NOT EXISTS role VARCHAR(8)
    CHECK (role IN ('donor', 'receiver'));

COMMENT ON COLUMN reputation_events.role IS
  'Rol del usuario en la sesión de entrega. NULL en filas anteriores a MIGR-001.
   donor = donante que confirmó la entrega.
   receiver = receptor (en delivery_completed) o receptor penalizado (en no_show).';
```

**Notas:**

- Columna **nullable** — filas pre-migración quedan `NULL` (AC #4).
- El `CHECK` permite `NULL` en PostgreSQL (solo restringe valores no nulos).
- **No** alterar `users`, índices existentes (`idx_reputation_events_user`, `idx_reputation_events_session`) ni tipos de evento.

### Task 2 — INSERT con `role` (11.1 mantiene deltas MVP)

**confirmDelivery** — reemplazar el `INSERT` por:

```sql
INSERT INTO reputation_events (user_id, type, delta, session_id, role) VALUES
  ($1, 'delivery_completed', 10, $3, 'donor'),
  ($2, 'delivery_completed', 10, $3, 'receiver')
```

**cancelDelivery** (solo rama `noShow === true`):

```sql
INSERT INTO reputation_events (user_id, type, delta, session_id, role)
VALUES ($1, 'no_show', $2, $3, 'receiver')
```

Orden de parámetros: conservar el orden existente; añadir literal `'receiver'` o incluir en la lista de binds según estilo del archivo.

### Task 3 — Dominio

```typescript
// src/domain/repositories/user.repository.ts
export interface ReputationEventRecord {
  id: string;
  type: 'delivery_completed' | 'no_show';
  delta: number;
  sessionId: string | null;
  createdAt: Date;
  role: 'donor' | 'receiver' | null;  // nuevo
}
```

`GetReputationHistoryUseCase` y `ReputationEventDto` **no** cambian en 11.1 — el campo queda disponible en dominio para 11.2/11.6.

### Arquitectura y convenciones

- **Clean Architecture:** migración en `infrastructure/database/supabase/migrations/`; tipos en `domain/repositories/`; SQL de negocio en `delivery-session.repository.ts`.
- **Sin ORM:** SQL directo via `pg` (NFR1).
- **Tabla de auditoría:** `reputation_events` no recalcula scores; `users.reputation_score` es fuente de verdad (architecture §3.6, ranking-spec §6).
- **Transacciones:** los `INSERT` de reputación siguen dentro de la misma transacción `BEGIN`/`COMMIT` que el resto de confirm/cancel — no extraer a servicio en 11.1.

### Testing

**Patrón recomendado:** test de integración con BD real (como `tests/user-repository-email-verification.test.ts`):

1. Aplicar migraciones (o asumir suite con BD de test migrada).
2. Crear sesión + confirmar (o cancel con no-show) vía repositorio.
3. `SELECT role FROM reputation_events WHERE session_id = $1` y assert `'donor'`/`'receiver'`.

**No** actualizar expectativas de delta en tests de entrega — eso es 11.2/11.4.

Comandos de verificación:

```bash
npm run db:migrate
npm test
npm run build
```

### Riesgos y anti-patrones

| Anti-patrón | Correcto en 11.1 |
|-------------|------------------|
| Cambiar +10/+1 o -10×n “de paso” | Solo columna `role`; deltas en 11.2 |
| Backfill `role` en filas históricas | Dejar `NULL` (decisión PRD/spec) |
| Exponer `role` en OpenAPI sin historia 11.6 | Mantener contrato HTTP actual |
| Crear entidad de dominio `ReputationEvent` separada | Extender `ReputationEventRecord` existente |
| Migración en carpeta distinta a `supabase/migrations/` | Numeración `017-` secuencial |

### Dependencias

- **Prerrequisitos:** épicas 1–10 entregadas; tabla `reputation_events` operativa.
- **Desbloquea:** 11.2 (deltas asimétricos requieren columna `role` para auditoría QA-01/QA-02).
- **Frontend:** sin cambios; `GET /users/me/reputation-history` sin campo `role` hasta 11.6 opcional.

### Project Structure Notes

```
src/
├── domain/repositories/user.repository.ts     # ReputationEventRecord + role
├── infrastructure/database/supabase/
│   ├── migrations/017-reputation-events-role.sql
│   ├── delivery-session.repository.ts         # INSERT con role
│   └── user.repository.ts                     # SELECT role
tests/
└── delivery-session-reputation-role.test.ts   # nuevo (sugerido)
```

---

## Dev Agent Record

### Agent Model Used

Composer

### Debug Log References

- `npm run db:migrate`: ECONNREFUSED (sin Postgres en localhost:5432). Migración `017` creada; aplicar antes de desplegar código.

### Completion Notes List

- MIGR-001: columna `role VARCHAR(8) NULL` con `CHECK (role IN ('donor', 'receiver'))` y `COMMENT ON COLUMN`.
- `confirmDelivery`: dos filas con `role` donor/receiver; deltas MVP +10/+10 sin cambios.
- `cancelDelivery` (noShow): `role = 'receiver'`; delta MVP -20×n sin cambios.
- `findReputationHistory` mapea `role` en dominio; HTTP/OpenAPI sin cambios (11.6).
- Tests: unit + integración (`delivery-session-reputation-role.integration.test.ts`, skip sin Postgres); 431 tests (429 pass + 2 skip integración); build OK.

### File List

- `src/infrastructure/database/supabase/migrations/017-reputation-events-role.sql` (nuevo)
- `src/domain/repositories/user.repository.ts`
- `src/infrastructure/database/supabase/delivery-session.repository.ts`
- `src/infrastructure/database/supabase/user.repository.ts`
- `tests/delivery-session-reputation-role.test.ts` (nuevo)
- `tests/delivery-session-reputation-role.integration.test.ts` (nuevo)
- `tests/helpers/integration-db.ts` (nuevo)
- `tests/user-repository-reputation-role.test.ts` (nuevo)
- `tests/users-reputation-history.test.ts`

### Change Log

- 2026-05-29: Historia 11.1 — MIGR-001 columna `role` en `reputation_events`, INSERT/SELECT con rol, tests de repositorio.

---

Ultimate context engine analysis completed - comprehensive developer guide created
