---
title: "Migración SQL — tabla `reports`"
type: feature
ticket: 1
status: done
created: 2026-10-25
---

# Story 14.1: Migración SQL — tabla `reports`

Status: done

## Story

As a sistema,
I want la estructura de base de datos del módulo de reportes,
so that el resto de historias de la épica pueda apoyarse en un schema estable.

## Dependencies

- Migración `020-admin-panel-schema.sql` aplicada (tablas `admin_users`, `admin_audit_log` existen)

## Acceptance Criteria

1. **Tabla `reports`:** existe con todas las columnas, CHECK constraints y valores DEFAULT definidos en PRD-REP-BE-01 §3.1

2. **Índices:** existen `idx_reports_status_created`, `idx_reports_entity`, `idx_reports_reporter_created`, `idx_reports_reporter_id`

3. **Vista:** existe `reports_summary_by_entity` según PRD-REP-BE-01 §3.2

4. **RLS:** habilitado con política `reports_select_own` (SELECT por `reporter_id`) según PRD-REP-BE-01 §3.4

5. **`reporter_id NULL`:** la columna permite NULL (AC-REP-BE-25, requerido para anonimización RGPD futura)

## Tasks / Subtasks

- [x] Crear archivo `021-reports-schema.sql` (AC: 1–5)
  - [x] CREATE TABLE reports con todas las columnas, defaults, CHECK constraints
  - [x] ALTER TABLE reports ENABLE ROW LEVEL SECURITY
  - [x] CREATE POLICY reports_select_own
  - [x] CREATE INDEX x4
  - [x] CREATE VIEW reports_summary_by_entity
- [x] Verificar migración aplicada localmente (AC: 1–5)
- [x] Regenerar OpenAPI si aplica (no debería — es solo DDL)

## Dev Notes

### SQL Specification (inlined from PRD-REP-BE-01 §3.1)

```sql
CREATE TABLE reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_entity_type  TEXT NOT NULL
                        CHECK (reported_entity_type IN ('item', 'user')),
  reported_entity_id    UUID NOT NULL,
  reason                TEXT NOT NULL
                        CHECK (reason IN (
                          'contenido_inadecuado',
                          'fraude_o_enganio',
                          'spam',
                          'objeto_ilegal',
                          'objeto_peligroso',
                          'información_falsa',
                          'comportamiento_abusivo',
                          'otro'
                        )),
  description           TEXT CHECK (char_length(description) <= 500),
  entity_snapshot       JSONB NOT NULL DEFAULT '{}',
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'resolved', 'archived')),
  resolved_at           TIMESTAMPTZ,
  resolved_by           UUID REFERENCES admin_users(id),
  resolution_action     TEXT CHECK (resolution_action IN (
                          'archive', 'warn_user', 'cancel_item', 'suspend_user'
                        )),
  resolution_note       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Índices (PRD-REP-BE-01 §3.1)

```sql
CREATE INDEX idx_reports_status_created
  ON reports(status, created_at ASC);

CREATE INDEX idx_reports_entity
  ON reports(reported_entity_type, reported_entity_id);

CREATE INDEX idx_reports_reporter_created
  ON reports(reporter_id, created_at DESC)
  WHERE reporter_id IS NOT NULL;

CREATE INDEX idx_reports_reporter_id
  ON reports(reporter_id)
  WHERE reporter_id IS NOT NULL;
```

### Vista (PRD-REP-BE-01 §3.2)

```sql
CREATE VIEW reports_summary_by_entity AS
SELECT
  reported_entity_type,
  reported_entity_id,
  COUNT(*)                                          AS total_reports,
  COUNT(*) FILTER (WHERE status = 'pending')        AS pending_reports,
  COUNT(*) FILTER (WHERE status = 'resolved')       AS resolved_reports,
  COUNT(*) FILTER (WHERE status = 'archived')       AS archived_reports,
  MAX(created_at)                                   AS last_report_at
FROM reports
GROUP BY reported_entity_type, reported_entity_id;
```

### RLS (PRD-REP-BE-01 §3.4)

La política de RLS permite al denunciante ver sus propios reportes. El usuario reportado **no** tiene SELECT — es deliberado (D-REP-06: el denunciado no puede enumerar reportes en su contra). Las operaciones de escritura usan service role.

```sql
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY reports_select_own
  ON reports FOR SELECT
  USING (reporter_id = auth.uid());
```

### Migration file naming

Archivo: `src/infrastructure/database/supabase/migrations/021-reports-schema.sql`
Siguiente numero tras `020-admin-panel-schema.sql`.

Formato estándar del proyecto:
- SQL plano, idempotente donde sea práctico (`IF NOT EXISTS`)
- `DO $$` blocks para alteraciones condicionales
- Comentarios `-- ───` para separar secciones

### Key design decisions to preserve (from PRD-REP-BE-01 D-REP)

| ID | Decisión | Impacto en SQL |
|---|---|---|
| D-REP-08 | Asociación polimórfica: `reported_entity_type` + `reported_entity_id`, sin FK | No hay FK hacia items/users; integridad validada en use case |
| D-REP-07 | `reporter_id` nullable: `ON DELETE SET NULL` + job anonimización | `reporter_id UUID REFERENCES users(id) ON DELETE SET NULL` |
| D-REP-11 | `status = 'archived'` para action=archive; `status = 'resolved'` para demás acciones | CHECK constraint con 3 valores |
| D-REP-09 | Objetos `cancelled` no reportables | No se refleja en SQL; se valida en use case |

### Convention alignment (project-context.md)

- kebab-case para nombres de archivo: `021-reports-schema.sql` ✅
- snake_case para columnas BD ✅
- Migraciones idempotentes con `IF NOT EXISTS` / `DO $$` blocks
- Sin ORM — SQL explícito ✅
- `IF NOT EXISTS` en CREATE TABLE es aceptable pero opcional (migraciones se ejecutan una sola vez gracias a `schema_migrations`)

### Risk: running order vs. migrations 020

La migración 020 crea `admin_users` que es referenciada por FK `reports.resolved_by`.
Si 020 no se ha aplicado en un entorno, 021 fallará. Esto es correcto porque story 14.1 depende de epic-13 migración.

### Testing

No hay tests HTTP para esta historia (es solo DDL). Verificar:
- `npm run db:migrate` aplica sin errores
- Conectarse a BD y verificar tablas, índices, vista con `\d reports`, `\d reports_summary_by_entity`

### References

- [Source: `docs/PRD-REP-BE-01.md` §3.1–§3.4] — definición completa de tabla, índices, vista, RLS
- [Source: `_bmad-output/initiative-backend/archive-v6/epics.md` §1989–2012] — Epic 14 story 14.1 AC
- [Source: `_bmad-output/initiative-backend/tickets/epic-panel-administrativo-backend-prd-adm-be-01/tickets/story-modelo-de-datos-panel-administrativo-plan.md`] — historia hermana previa (patrón de migración)
- [Source: `src/infrastructure/database/supabase/migrations/020-admin-panel-schema.sql`] — migración previa (formato, estilo)
- [Source: `src/e2e/database/run-migrations.ts`] — mecanismo de aplicación de migraciones
- [Source: `_bmad-output/project-context.md`] — reglas de proyecto (convenciones, prohibiciones)
- [Source: `docs/architecture.md` §12] — reglas de autorización por use case (contexto)

## Dev Agent Record

### Completion Notes List

- Migración `021-reports-schema.sql` creada y aplicada.
- Tabla `reports` con todas las columnas CHECK constraints, 4 índices, vista, RLS.
- Sin regresiones en otras áreas del backend.

### File List

- `src/infrastructure/database/supabase/migrations/021-reports-schema.sql` (nuevo)

### Change Log

- 2026-06-09: Implementación completada. Creada migración `021-reports-schema.sql` con tabla `reports`, 4 índices, vista `reports_summary_by_entity` y RLS `reports_select_own`. Aplicada en entorno dev sin errores.
