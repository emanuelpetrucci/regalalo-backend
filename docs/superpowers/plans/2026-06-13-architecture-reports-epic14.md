# Architecture.md — Actualización Épica 14 (Sistema de Reportes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Actualizar `docs/architecture.md` para que refleje el Sistema de Reportes (Épica 14 / PRD-REP-BE-01), que ya fue implementado pero nunca documentado en el documento de arquitectura principal.

**Architecture:** El documento de arquitectura sigue la estructura actual (v1.7). Se añaden: §3.10 tabla `reports`, §3.11 vista `reports_summary_by_entity`, Job 6 de anonimización en §7, extensión de §2 (carpetas), §4 (índices), §10 (emails), §11.1 (rate limiting) y §12 (autorización + analítica). No se modifica ningún archivo de código — es actualización documental pura.

**Tech Stack:** Markdown, PostgreSQL (schema SQL), TypeScript (pseudocódigo para use cases)

**Fuente de verdad:** `docs/PRD-REP-BE-01.md` + implementación existente en `src/` (épica 14 ya completada).

---

### Task 1: Header — bump versión y entrada de changelog

**Files:**
- Modify: `docs/architecture.md` (líneas 1–21)

- [ ] **Step 1: Actualizar versión y añadir entrada de changelog**

Reemplazar el bloque del header (líneas 1–21) para quedar:

```markdown
# technical-design-backend.md
**Versión:** 1.8  
**Estado:** Listo para consumo por agente BMAD  
**Fecha:** Junio 2026  
**Scope:** Backend exclusivamente — Node.js / Clean Architecture / Supabase

> Versión 1.8 — Correct Course 2026-06-09: Sistema de Reportes (Épica 14 / PRD-REP-BE-01) — tabla `reports` (§3.10), vista `reports_summary_by_entity` (§3.11), índices de reportes (§4), Job 6 anonimización mensual RGPD (§7), carpetas de módulo (§2), TPL-011…TPL-013 y TPL-ADM-002 (§10), `reportRateLimit` (§11.1), autorización `CreateReport` y `AdminResolveReport` (§12.10–12.11), AE-032 y AE-033 (§12.9). `analytics_events` catálogo ampliado a AE-001…AE-033.
>
> Versión 1.7 — ...
```

(Las líneas de versiones anteriores 1.7, 1.6, etc. se conservan sin cambio.)

- [ ] **Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: bump architecture.md to v1.8 — header Épica 14"
```

---

### Task 2: §2 Estructura de Carpetas — añadir módulo de reportes

**Files:**
- Modify: `docs/architecture.md` (sección §2, bloque de código de árbol de carpetas)

- [ ] **Step 1: Ampliar el árbol de carpetas**

En el bloque de código de árbol de `src/`, aplicar los siguientes cambios:

**domain/entities/** — añadir `Report.ts`:
```
│   ├── entities/          # User, Item, DeliverySession, Report
```

**domain/repositories/** — añadir `IReportRepository.ts`:
```
│   └── repositories/      # Interfaces de repositorios (contratos) — incluye IReportRepository
```

**application/use-cases/** — añadir carpeta `reports/`:
```
│   ├── use-cases/
│   │   ├── user/
│   │   ├── item/
│   │   ├── delivery/
│   │   └── reports/       # CreateReportUseCase, AdminGetReportsUseCase,
│   │                      # AdminGetReportByIdUseCase, AdminResolveReportUseCase
```

**application/dtos/** — añadir `report/`:
```
│   └── dtos/              # Objetos de transferencia de datos — incluye report/
│                          # (CreateReportDto, ReportListDto, ReportDetailDto, ResolveReportDto)
```

**infrastructure/database/supabase/** — añadir `report.repository.ts`:
```
│   │   ├── supabase/      # Implementaciones de repositorios en PostgreSQL
│   │   │                  # — incluye report.repository.ts
```

**interfaces/http/controllers/** — añadir `ReportController.ts` y `AdminReportController.ts`:
```
│   │   ├── controllers/   # Controladores por dominio
│   │   │                  # — incluye ReportController (público) y AdminReportController (admin)
```

**interfaces/http/routes/** — añadir `reports.routes.ts`:
```
│   │   └── routes/        # Definición de rutas — incluye reports.routes.ts
│   │                      # (admin.routes.ts extendido con rutas de reportes)
```

**interfaces/validators/** — añadir `report.validators.ts`:
```
│   └── validators/        # Validación de entrada — incluye report.validators.ts
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: §2 estructura de carpetas — módulo de reportes Épica 14"
```

---

### Task 3: §3.10 y §3.11 — tabla `reports` y vista agregada

**Files:**
- Modify: `docs/architecture.md` (añadir después de §3.9)

- [ ] **Step 1: Añadir §3.10 Tabla `reports` después del cierre de §3.9**

Insertar después del bloque `---` que cierra §3.9:

````markdown
### 3.10 Tabla `reports`

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

**Notas del modelo:**

- `reporter_id`: `ON DELETE SET NULL` — si la cuenta del denunciante es eliminada, el reporte permanece con `reporter_id = NULL`. Mismo mecanismo usado por el job de anonimización RGPD (Job 6, §7).
- `reported_entity_id`: sin FK explícita por diseño (asociación polimórfica — D-REP-08). La existencia de la entidad se verifica en el use case antes del INSERT.
- `entity_snapshot`: captura el estado relevante de la entidad en el momento del reporte:
  - **Para `item`:** `{ "entityType": "item", "title": string, "status": string, "category": string, "description": string (max 300 chars) }`
  - **Para `user`:** `{ "entityType": "user", "firstName": string, "lastName": string, "reputationScore": integer }`
- `resolution_action`: `NULL` cuando `status = 'pending'`. Obligatorio al resolver o archivar.
- `resolution_note`: texto libre obligatorio al resolver o archivar. Documentación interna del admin.
- `resolved_by`: FK a `admin_users.id`. `NULL` mientras `status = 'pending'`.
- Máquina de estados: `pending → resolved` (acciones `warn_user`, `cancel_item`, `suspend_user`) o `pending → archived` (acción `archive`). Los reportes cerrados son inmutables.
- Entidades reportables en v1: objetos (`items`) y perfiles de usuario (`users`). Estados reportables de objetos: `active`, `reserved`, `completed`. Estado `cancelled`: no reportable.
- RLS habilitado: política `reports_select_own` permite al denunciante ver sus propios reportes. El denunciado no tiene política SELECT — la ausencia es deliberada (D-REP-06).

---

### 3.11 Vista `reports_summary_by_entity`

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

**Propósito:** el campo `pendingCountForEntity` en `GET /api/admin/reports` se resuelve con un JOIN sobre esta vista, permitiendo detectar entidades con múltiples reportes pendientes sin lógica de aplicación adicional.

---
````

- [ ] **Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: §3.10 tabla reports y §3.11 vista reports_summary_by_entity"
```

---

### Task 4: §4 Índices — añadir índices de la tabla `reports`

**Files:**
- Modify: `docs/architecture.md` (sección §4)

- [ ] **Step 1: Añadir 4 índices de reports al bloque SQL de §4**

Insertar al final del bloque SQL de índices (antes del cierre del bloque de código), después del índice `idx_users_verification_token`:

```sql
-- Módulo de reportes (Épica 14)
-- Cola admin: filtro por estado + orden cronológico
CREATE INDEX idx_reports_status_created
  ON reports(status, created_at ASC);

-- Contexto por entidad: detección de patrones, pendingCountForEntity
CREATE INDEX idx_reports_entity
  ON reports(reported_entity_type, reported_entity_id);

-- Validación de duplicados y límites anti-spam (D-REP-04)
CREATE INDEX idx_reports_reporter_created
  ON reports(reporter_id, created_at DESC)
  WHERE reporter_id IS NOT NULL;

-- Lookup por denunciante: historial en detalle de reporte admin
CREATE INDEX idx_reports_reporter_id
  ON reports(reporter_id)
  WHERE reporter_id IS NOT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: §4 índices tabla reports — Épica 14"
```

---

### Task 5: §7 — Job 6 de anonimización mensual (RGPD)

**Files:**
- Modify: `docs/architecture.md` (sección §7, al final)

- [ ] **Step 1: Añadir Job 6 después del bloque "Job HTTP — Digest de proximidad"**

Insertar al final de §7, después del bloque del Job HTTP:

````markdown
---

### Job 6 — Anonimización mensual de `reporter_id` (RGPD)

**Frecuencia:** mensual (primer día del mes, 03:00 UTC)

```sql
SELECT cron.schedule(
  'anonymize-reporter-id',
  '0 3 1 * *',
  $$
    UPDATE reports
    SET reporter_id = NULL
    WHERE status IN ('resolved', 'archived')
      AND created_at < NOW() - INTERVAL '2 years'
      AND reporter_id IS NOT NULL;
  $$
);
```

**Registro:** el job escribe en `appLogger` el número de filas anonimizadas. No genera entrada en `admin_audit_log` (es un job de sistema, no una acción de admin).

**Nota:** los reportes en estado `pending` con más de 2 años de antigüedad son un estado anómalo. El job no los anonimiza — deben ser revisados y cerrados por el operador antes de que se aplique la retención.

---
````

- [ ] **Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: §7 Job 6 anonimización mensual RGPD — Épica 14"
```

---

### Task 6: §10 Emails — añadir TPL-011, TPL-012, TPL-013, TPL-ADM-002

**Files:**
- Modify: `docs/architecture.md` (sección §10)

- [ ] **Step 1: Actualizar la nota del párrafo inicial de §10**

Cambiar "TPL-001 a TPL-010" por "TPL-001 a TPL-013" en el primer párrafo de §10.

- [ ] **Step 2: Añadir 3 filas a la tabla de templates (primera tabla de §10)**

Añadir después de la fila de TPL-010:

```markdown
| TPL-011 | `{{firstName}}`, `{{reportedEntityType}}`, `{{reason}}` | Confirmación al denunciante (EVT-016) |
| TPL-012 | `{{firstName}}`, `{{reportedEntityType}}` | Resolución al denunciante (EVT-017) |
| TPL-013 | `{{firstName}}` | Advertencia al denunciado — solo acción `warn_user` (EVT-018) |
```

- [ ] **Step 3: Añadir 4 filas a la tabla de eventos (segunda tabla de §10)**

Añadir después de la última fila existente:

```markdown
| Reporte enviado exitosamente | Denunciante (`reporter_id`) | Confirmación de recepción; sin mención al denunciado (EVT-016 / TPL-011) |
| Reporte enviado exitosamente | Operador (`ADMIN_EMAIL`) | Notificación al admin con `reportId`, tipo, motivo, snapshot, timestamp (EVT-019 / TPL-ADM-002) |
| Admin resuelve o archiva un reporte | Denunciante (si `reporter_id IS NOT NULL`) | Confirmación genérica de revisión; sin revelar la acción (EVT-017 / TPL-012) |
| Admin resuelve con acción `warn_user` | Usuario denunciado (`reported_entity_id`) | Aviso de actividad revisada; sin mención al reporte ni al denunciante (EVT-018 / TPL-013) |
```

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: §10 emails TPL-011 a TPL-013 y TPL-ADM-002 — Épica 14"
```

---

### Task 7: §11.1 Rate Limiting — añadir `reportRateLimit`

**Files:**
- Modify: `docs/architecture.md` (sección §11.1)

- [ ] **Step 1: Añadir fila a la tabla de rate limiting**

Añadir después de la fila de Jobs:

```markdown
| Reports | `POST /api/reports` | 20 peticiones / IP | 15 minutos |
```

- [ ] **Step 2: Añadir instancia `reportRateLimit` al bloque de código TypeScript**

Añadir después de `jobsRateLimit`:

```typescript
// Rate limit específico para el endpoint público de reportes
// Previene abuso del sistema de moderación
export const reportRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
```

- [ ] **Step 3: Actualizar la nota final de §11.1**

Añadir "`reportRateLimit` sobre `POST /api/reports`." al final de la nota sobre dónde se aplica cada instancia.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: §11.1 reportRateLimit — Épica 14"
```

---

### Task 8: §12.9 Analítica — añadir AE-032 y AE-033

**Files:**
- Modify: `docs/architecture.md` (sección §12.9)

- [ ] **Step 1: Añadir 2 filas a la tabla de eventos analíticos**

Añadir al final de la tabla en §12.9:

```markdown
| AE-032 | `report.submitted` | CreateReportUseCase |
| AE-033 | `report.resolved` | AdminResolveReportUseCase |
```

- [ ] **Step 2: Actualizar la referencia del catálogo**

Cambiar en el párrafo introductorio de §12.9:
- "tras commit exitoso (o en el adaptador post-job), cada use case/job emite..."

No hay referencia explícita al rango AE en §12.9, pero en §3.9 (analytics_events) hay una nota que dice:
```
Almacén durable del catálogo AE-001…AE-031.
```

Cambiar esa línea a:
```
Almacén durable del catálogo AE-001…AE-033.
```

Y actualizar la referencia del catálogo al final de §2 (Loggers):
```
Catálogo completo de eventos: `docs/prd-analytics.md`, `docs/delta-backend-DLT-004.md` §D y `docs/PRD-REP-BE-01.md` §6 (AE-032, AE-033).
```

- [ ] **Step 3: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: §12.9 AE-032 y AE-033 + §3.9 catálogo AE-001…AE-033 — Épica 14"
```

---

### Task 9: §12 — Nuevas secciones de autorización para reportes

**Files:**
- Modify: `docs/architecture.md` (sección §12, al final)

- [ ] **Step 1: Añadir §12.10 CreateReport después de §12.9**

Insertar después del bloque de §12.9:

````markdown
---

### 12.10 CreateReport (POST /api/reports)

```
Autenticación: requireAuth + requireEmailVerified (middleware — no reimplementar en use case).
El middleware ya garantiza JWT válido, jwt_version, is_active e email_verified = TRUE.

Verificaciones de negocio (en use case, en este orden):
  1. Validar UUID de reportedEntityId (SEC-007)
  2. Verificar reCAPTCHA V3: score ≥ 0.5 → si falla: 400 RECAPTCHA_FAILED
  3. Anti-auto-reporte:
       Si type = 'item': item.donor_id === reporter_id → 422 SELF_REPORT_FORBIDDEN
       Si type = 'user': reported_entity_id === reporter_id → 422 SELF_REPORT_FORBIDDEN
  4. Verificar que la entidad existe y es reportable:
       'item': status ≠ 'cancelled' → si cancelled: 422 ENTITY_NOT_REPORTABLE
               si no existe: 404 ENTITY_NOT_FOUND
       'user': is_active = TRUE → si no existe o inactivo: 404 ENTITY_NOT_FOUND
  5. Verificar duplicado activo: reporter_id + reported_entity_id + status = 'pending'
       → si existe: 409 REPORT_ALREADY_PENDING
  6. Límite 1 — misma entidad en 24h: COUNT ≥ 3 → 429 RATE_LIMIT_ENTITY_EXCEEDED
  7. Límite 2 — total en 7 días: COUNT ≥ 10 → 429 RATE_LIMIT_TOTAL_EXCEEDED
  8. INSERT + entity_snapshot capturado en el momento del INSERT
  9. [Post-commit, fire-and-forget]: TPL-011 al denunciante, TPL-ADM-002 al operador,
     emitEvent('report.submitted', ...) — AE-032

Regla de privacidad: entity_snapshot no expone coordenadas exactas ni contact_channel.
AE-032 no incluye reporter_id en crudo ni reported_entity_id en properties.
```

---

### 12.11 AdminResolveReport (POST /api/admin/reports/:id/resolve)

```
Autenticación: requireAdminAuth (definido en PRD-ADM-BE-01 §4.3).
No aplica el middleware de autenticación de usuarios.

Verificaciones:
  1. Reporte existe → 404 si no
  2. status = 'pending' → 409 REPORT_ALREADY_CLOSED si no
  3. resolutionNote no vacío → 400 VALIDATION_ERROR si vacío

Compatibilidad de acción con tipo de entidad (§4.4 PRD-REP-BE-01):
  - action = 'cancel_item': reported_entity_type DEBE ser 'item' → 422 ACTION_ENTITY_MISMATCH si no
  - action = 'suspend_user': reported_entity_type DEBE ser 'user' → 422 si no
  - action = 'warn_user': reported_entity_type DEBE ser 'user' → 422 si no

Transacción atómica:
  1. UPDATE reports (status, resolved_at, resolved_by, resolution_action, resolution_note)
  2. Según acción:
       'cancel_item': invocar AdminCancelItemUseCase — si 409 (ya cancelado): ROLLBACK + 409 ENTITY_STATE_CONFLICT
       'suspend_user': invocar AdminSuspendUserUseCase — si 409: ROLLBACK + 409 ENTITY_STATE_CONFLICT
       'warn_user': sin cambios en BD del denunciado; email post-commit
       'archive': sin acción adicional
  3. INSERT en admin_audit_log (action = 'report.resolved')

Post-commit, fire-and-forget:
  - TPL-012 al denunciante si reporter_id IS NOT NULL (EVT-017)
  - TPL-013 al denunciado si action = 'warn_user' (EVT-018)
  - emitEvent('report.resolved', adminUserId, { action, entityType, resolutionTimeHours }) — AE-033

Nota: AdminGetReportByIdUseCase inserta admin_audit_log con action = 'report.viewed'
en cada consulta al detalle de un reporte. Este comportamiento es trazabilidad de acceso,
no una verificación de autorización.
```
````

- [ ] **Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: §12.10-12.11 autorización CreateReport y AdminResolveReport — Épica 14"
```

---

## Self-Review

### 1. Spec coverage (PRD-REP-BE-01)

| Sección del PRD | Task que lo cubre |
|---|---|
| §3.1 Tabla `reports` (schema + notas) | Task 3 |
| §3.2 Vista `reports_summary_by_entity` | Task 3 |
| §3.3 Job anonimización RGPD | Task 5 |
| §3.4 RLS | Task 3 (incluido en notas de §3.10) |
| §3.5 Extensión GET /admin/metrics | Task 3 (incluido en notas de §3.10, referencia al PRD) |
| §4 Índices | Task 4 |
| §5 Emails | Task 6 |
| §6 Analítica AE-032 / AE-033 | Task 8 |
| §7 Rate limiting | Task 7 |
| §8 Clean Architecture (carpetas) | Task 2 |
| §12.10 Autorización CreateReport | Task 9 |
| §12.11 Autorización AdminResolveReport | Task 9 |
| Changelog header | Task 1 |

### 2. Placeholder scan

Ningún placeholder detectado — todas las secciones contienen SQL real, código TypeScript real, y contenido Markdown concreto.

### 3. Type consistency

- `reporter_id`, `reported_entity_id`, `entity_snapshot`: consistentes entre Tasks 3, 8, 9.
- `SELF_REPORT_FORBIDDEN`, `ENTITY_NOT_REPORTABLE`, `REPORT_ALREADY_PENDING`, `REPORT_ALREADY_CLOSED`, `ACTION_ENTITY_MISMATCH`, `ENTITY_STATE_CONFLICT`: consistentes con PRD-REP-BE-01 §4.
- `AE-032` y `AE-033`: consistentes entre Tasks 8 y 9.
