---
title: "PRD Backend — Sistema de Reportes"
code: PRD-REP-BE-01
version: "1.0"
date: "2026-06-09"
status: approved
priority: P0
bloque: "Bloque 1 — Operabilidad mínima"
proyecto: Regálalo (regalalo.org)
dependencias:
  - PRD-ADM-BE-01 (extiende §6.5; requiere tablas admin_users y admin_audit_log)
  - INIT-REP-01 (iniciativa de origen)
plataforma_backend: Render
---

# PRD-REP-BE-01 — Backend del Sistema de Reportes

> Documento de requisitos de backend para el sistema de reportes de Regálalo.
> Cubre modelo de datos, contratos de API pública y administrativa, emails, analítica,
> seguridad y criterios de aceptación.
> Completa el módulo de reportes pendiente en PRD-ADM-BE-01 §6.5.
> Listo para handoff a agente de desarrollo backend.

---

## 1. Alcance

### 1.1 Incluido en esta iteración

- Tabla `reports` con modelo de datos completo
- Endpoint público `POST /api/reports` (usuario autenticado con email verificado)
- Completar módulo de reportes del panel admin (GET listado, GET detalle, POST resolución)
- Tres flujos de email: confirmación al denunciante, resolución al denunciante, advertencia al denunciado
- Notificación por email al operador en cada nuevo reporte (mejora M-01)
- Prevención de reportes duplicados activos sobre la misma entidad (mejora M-02)
- Snapshot del contenido reportado en el momento del reporte (mejora M-03)
- Vista SQL agregada para detección de patrones (mejora M-04)
- Email genérico de resolución al denunciante (mejora M-05)
- Dos eventos de analítica: `report.submitted` y `report.resolved`
- Job mensual de anonimización de `reporter_id` tras período de retención (RGPD)
- Extensión del endpoint `GET /api/admin/metrics` con contadores de reportes
- RLS sobre tabla `reports`

### 1.2 Fuera de alcance (esta iteración)

- Notificaciones automáticas por umbral de reportes (acciones automáticas diferidas a v2)
- Sistema de apelaciones
- Reportes sobre sesiones de entrega (solo objetos y usuarios en v1)
- Reportes anónimos (requiere autenticación)
- Panel de moderación extendido (métricas históricas, exportes)
- Eliminación física de reportes (solo anonimización de `reporter_id`)

---

## 2. Decisiones de diseño registradas

| ID | Decisión | Resolución |
|---|---|---|
| D-REP-01 | Entidades reportables en v1 | Objetos (`items`) y perfiles de usuario (`users`). Sesiones fuera de alcance |
| D-REP-02 | Categorías de motivo | 8 valores: `contenido_inadecuado`, `fraude_o_enganio`, `spam`, `objeto_ilegal`, `objeto_peligroso`, `información_falsa`, `comportamiento_abusivo`, `otro` |
| D-REP-03 | Acciones automáticas | Sin acciones automáticas en v1. Moderación 100% manual |
| D-REP-04 | Límite anti-spam | 3 reportes sobre la misma entidad en 24h por usuario + 10 reportes totales en 7 días por usuario. Validado en use case |
| D-REP-05 | Notificación al denunciante | Confirmación inmediata al enviar (TPL-011) + notificación genérica al resolver (TPL-012) |
| D-REP-06 | Visibilidad al denunciado | No notificado de la existencia del reporte. Solo notificado si la acción es `warn_user` (TPL-013), sin mención al reporte ni al denunciante |
| D-REP-07 | Retención | 2 años. Anonimización de `reporter_id` pasado ese período via pg_cron |
| D-REP-08 | Asociación polimórfica | `reported_entity_type` + `reported_entity_id` sin FK (imposible hacia dos tablas). Integridad garantizada por validación en use case |
| D-REP-09 | Estados reportables (objetos) | `active`, `reserved`, `completed`: reportables. `cancelled`: no reportable |
| D-REP-10 | Acciones de resolución canónicas | `archive`, `warn_user`, `cancel_item`, `suspend_user`. Ver §4.4 |
| D-REP-11 | Estado al archivar | `status = 'archived'`. Estado al resolver con acción: `status = 'resolved'` |
| D-REP-12 | Reutilización de use cases admin | `AdminResolveReportUseCase` inyecta y orquesta `AdminCancelItemUseCase` y `AdminSuspendUserUseCase` para las acciones correspondientes |
| D-REP-13 | Auto-reporte | Prohibido: el `reporter_id` no puede coincidir con el `donor_id` del objeto ni con el `reported_entity_id` cuando la entidad es un usuario |

---

## 3. Cambios en el modelo de datos

### 3.1 Nueva tabla `reports`

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

- `reporter_id`: `ON DELETE SET NULL` — si la cuenta del denunciante es eliminada, el reporte permanece en el sistema con `reporter_id = NULL`. Esto es también el mecanismo usado por el job de anonimización (§3.3).
- `reported_entity_id`: sin FK explícita por diseño (asociación polimórfica — D-REP-08). La existencia de la entidad se verifica en el use case antes del INSERT.
- `entity_snapshot`: captura el estado relevante de la entidad en el momento del reporte. Contenido según tipo:
  - **Para `item`:** `{ "entityType": "item", "title": string, "status": string, "category": string, "description": string (max 300 chars) }`
  - **Para `user`:** `{ "entityType": "user", "firstName": string, "lastName": string, "reputationScore": integer }`
- `resolution_action`: `NULL` cuando `status = 'pending'`. Obligatorio al resolver o archivar.
- `resolution_note`: texto libre obligatorio al resolver o archivar. Queda en el registro como documentación interna del admin.
- `resolved_by`: FK a `admin_users.id`. `NULL` mientras `status = 'pending'`.
- Máquina de estados: `pending → resolved` (acciones `warn_user`, `cancel_item`, `suspend_user`) o `pending → archived` (acción `archive`). Ninguna transición desde `resolved` o `archived` (los reportes cerrados son inmutables).

**Índices:**

```sql
-- Consultas de la cola admin (filtro por estado + orden cronológico)
CREATE INDEX idx_reports_status_created
  ON reports(status, created_at ASC);

-- Consultas de contexto por entidad (detección de patrones, M-04)
CREATE INDEX idx_reports_entity
  ON reports(reported_entity_type, reported_entity_id);

-- Validación de duplicados y límites (D-REP-04)
CREATE INDEX idx_reports_reporter_created
  ON reports(reporter_id, created_at DESC)
  WHERE reporter_id IS NOT NULL;

-- Lookup por denunciante (historial en detalle de reporte admin)
CREATE INDEX idx_reports_reporter_id
  ON reports(reporter_id)
  WHERE reporter_id IS NOT NULL;
```

---

### 3.2 Vista `reports_summary_by_entity` (mejora M-04)

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

**Propósito:** el campo `pendingCountForEntity` en `GET /api/admin/reports` (§4.2) se resuelve con un JOIN sobre esta vista, permitiendo al admin detectar de un vistazo entidades con múltiples reportes pendientes sin lógica de aplicación adicional.

---

### 3.3 Job de anonimización (retención RGPD — D-REP-07)

**Frecuencia:** mensual (primer día del mes, 03:00 UTC).

**Lógica:**

```sql
-- pg_cron job: anonimizar reporter_id en reportes cerrados con más de 2 años de antigüedad
UPDATE reports
SET reporter_id = NULL
WHERE status IN ('resolved', 'archived')
  AND created_at < NOW() - INTERVAL '2 years'
  AND reporter_id IS NOT NULL;
```

**Registro:** el job debe escribir en `appLogger` el número de filas anonimizadas. No genera entrada en `admin_audit_log` (es un job de sistema, no una acción de admin).

**Nota:** los reportes en estado `pending` con más de 2 años de antigüedad son un estado anómalo. El job no los anonimiza; deben ser revisados y cerrados por el operador antes de que se aplique la retención.

---

### 3.4 RLS sobre tabla `reports`

```sql
-- Habilitar RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- El denunciante puede ver sus propios reportes
CREATE POLICY reports_select_own
  ON reports FOR SELECT
  USING (reporter_id = auth.uid());

-- Ningún usuario puede INSERT, UPDATE ni DELETE directamente (solo vía API)
-- Las operaciones del backend usan el service role de Supabase (bypasses RLS)
```

**Implicaciones:**
- El usuario reportado no tiene política de SELECT sobre los reportes que le conciernen. Esta ausencia es deliberada (D-REP-06): el denunciado no puede enumerar los reportes en su contra.
- Todas las operaciones de escritura (`INSERT`, `UPDATE`) se ejecutan con el service role del backend, que bypasea RLS. El control de acceso reside en los use cases y el middleware de autenticación.

---

### 3.5 Extensión de `GET /api/admin/metrics` (PRD-ADM-BE-01 §6.6)

El objeto de respuesta existente se amplía con el bloque `reports`:

```json
{
  "users": { ... },
  "items": { ... },
  "sessions": { ... },
  "reports": {
    "pending": "integer",
    "resolvedLast30Days": "integer",
    "archivedLast30Days": "integer"
  }
}
```

**Query adicional:**

```sql
-- pending
SELECT COUNT(*) FROM reports WHERE status = 'pending';

-- resolvedLast30Days
SELECT COUNT(*) FROM reports
WHERE status = 'resolved' AND resolved_at >= NOW() - INTERVAL '30 days';

-- archivedLast30Days
SELECT COUNT(*) FROM reports
WHERE status = 'archived' AND resolved_at >= NOW() - INTERVAL '30 days';
```

---

## 4. Contratos de API

> **Nota transversal:** `POST /api/reports` requiere middleware `requireAuth` + `requireEmailVerified`.
> Los endpoints `/api/admin/reports/*` requieren middleware `requireAdminAuth` (definido en PRD-ADM-BE-01 §4.3).
> Todas las acciones admin sobre reportes generan entrada en `admin_audit_log` con `action = 'report.resolved'`.

---

### 4.1 POST /api/reports

**Descripción:** crea un nuevo reporte sobre un objeto o un perfil de usuario.

**Autenticación:** `requireAuth` + `requireEmailVerified`.

**Rate limiting HTTP:** 20 req / 15 minutos por IP (instancia de `express-rate-limit` específica para esta ruta).

**Payload:**

```json
{
  "reportedEntityType": "item" | "user",
  "reportedEntityId": "string (UUID v4)",
  "reason": "string (valor del CHECK constraint)",
  "description": "string (opcional, máx. 500 caracteres)",
  "recaptchaToken": "string"
}
```

**Flujo del use case `CreateReportUseCase` (secuencia ordenada):**

```
1. Validar UUID de reportedEntityId (SEC-007)
2. Validar reCAPTCHA V3: score ≥ 0.5 → si falla: 400 RECAPTCHA_FAILED
3. Verificar que el reporter_id (del JWT) no coincide con:
   a. Si type = 'item': item.donor_id → 422 SELF_REPORT_FORBIDDEN
   b. Si type = 'user': reported_entity_id → 422 SELF_REPORT_FORBIDDEN
4. Verificar que la entidad existe y es reportable:
   a. Si type = 'item': SELECT id, status, title, category, description, donor_id FROM items WHERE id = :entityId
      → si no existe: 404 ENTITY_NOT_FOUND
      → si status = 'cancelled': 422 ENTITY_NOT_REPORTABLE
   b. Si type = 'user': SELECT id, first_name, last_name, reputation_score FROM users WHERE id = :entityId AND is_active = TRUE
      → si no existe o is_active = FALSE: 404 ENTITY_NOT_FOUND
5. Verificar duplicado activo (M-02):
   SELECT COUNT(*) FROM reports
   WHERE reporter_id = :reporterId
     AND reported_entity_id = :entityId
     AND status = 'pending'
   → si COUNT ≥ 1: 409 REPORT_ALREADY_PENDING
6. Verificar límite 1 — misma entidad en 24h (D-REP-04):
   SELECT COUNT(*) FROM reports
   WHERE reporter_id = :reporterId
     AND reported_entity_id = :entityId
     AND created_at > NOW() - INTERVAL '24 hours'
   → si COUNT ≥ 3: 429 RATE_LIMIT_ENTITY_EXCEEDED
7. Verificar límite 2 — total en 7 días (D-REP-04):
   SELECT COUNT(*) FROM reports
   WHERE reporter_id = :reporterId
     AND created_at > NOW() - INTERVAL '7 days'
   → si COUNT ≥ 10: 429 RATE_LIMIT_TOTAL_EXCEEDED
8. Construir entity_snapshot según tipo de entidad (paso 4 ya tiene los datos necesarios)
9. INSERT en reports
10. [Post-commit, fire-and-forget]:
    a. Enviar TPL-011 al denunciante (EVT-016)
    b. Enviar TPL-ADM-002 al operador (EVT-019) — M-01
    c. emitEvent('report.submitted', reporterId, { entityType, reason }) — AE-032
```

**Respuesta (201):**

```json
{
  "id": "uuid",
  "message": "Reporte enviado correctamente. Lo revisaremos lo antes posible."
}
```

**Errores:**

| Código HTTP | Código interno | Motivo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Payload inválido o UUID malformado |
| 400 | `RECAPTCHA_FAILED` | Score reCAPTCHA < 0.5 o token inválido |
| 404 | `ENTITY_NOT_FOUND` | Entidad no existe o no está activa |
| 409 | `REPORT_ALREADY_PENDING` | Ya existe un reporte pendiente del mismo usuario sobre esta entidad |
| 422 | `SELF_REPORT_FORBIDDEN` | El usuario intenta reportar su propio objeto o su propio perfil |
| 422 | `ENTITY_NOT_REPORTABLE` | Objeto en estado `cancelled` |
| 429 | `RATE_LIMIT_ENTITY_EXCEEDED` | ≥ 3 reportes sobre esta entidad en las últimas 24h |
| 429 | `RATE_LIMIT_TOTAL_EXCEEDED` | ≥ 10 reportes totales en los últimos 7 días |

---

### 4.2 GET /api/admin/reports

**Descripción:** listado paginado de reportes para la cola de moderación.

**Query params:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `status` | string | `pending` \| `resolved` \| `archived`. Default: `pending` |
| `reportedEntityType` | string | `item` \| `user` |
| `reason` | string | Filtro por categoría de motivo |
| `dateFrom` | ISO8601 | Filtro de fecha de creación (desde) |
| `dateTo` | ISO8601 | Filtro de fecha de creación (hasta) |
| `page` | integer | Default: 1 |
| `limit` | integer | Default: 20, máx: 100 |

**Orden:** `created_at ASC` (cola FIFO; los reportes más antiguos se atienden primero).

**Respuesta (200):**

```json
{
  "reports": [
    {
      "id": "uuid",
      "reportedEntityType": "item" | "user",
      "reportedEntityId": "uuid",
      "reason": "string",
      "status": "string",
      "createdAt": "ISO8601",
      "resolvedAt": "ISO8601 | null",
      "entitySnapshot": {
        "entityType": "string",
        "title": "string (items) | null",
        "firstName": "string (users) | null",
        "lastName": "string (users) | null",
        "status": "string (items) | null",
        "category": "string (items) | null"
      },
      "reporter": {
        "id": "uuid | null",
        "firstName": "string | null",
        "lastName": "string | null"
      },
      "pendingCountForEntity": "integer"
    }
  ],
  "pagination": {
    "total": "integer",
    "page": "integer",
    "limit": "integer",
    "totalPages": "integer"
  }
}
```

**Notas:**
- `reporter` puede ser `null` en todos sus campos si el `reporter_id` ha sido anonimizado (retención RGPD).
- `pendingCountForEntity`: número de reportes en estado `pending` sobre la misma entidad. Se obtiene via JOIN con la vista `reports_summary_by_entity`. Incluye el reporte actual si está `pending`.
- `entitySnapshot` se devuelve tal como fue capturado en el momento del reporte.

---

### 4.3 GET /api/admin/reports/:id

**Descripción:** detalle completo de un reporte con contexto de moderación.

**Comportamiento especial:** registra entrada en `admin_audit_log` con `action = 'report.viewed'`, `entity_type = 'report'`, `entity_id = reportId`. Esto deja trazabilidad de quién accedió al reporte y cuándo.

**Actualización del catálogo de `admin_audit_log.action`** (adición a PRD-ADM-BE-01 §3.3):

| Valor | Descripción |
|---|---|
| `report.viewed` | Admin accedió al detalle de un reporte |
| `report.resolved` | Admin resolvió o archivó un reporte |

**Respuesta (200):**

```json
{
  "id": "uuid",
  "reportedEntityType": "item" | "user",
  "reportedEntityId": "uuid",
  "reason": "string",
  "description": "string | null",
  "entitySnapshot": {},
  "status": "string",
  "createdAt": "ISO8601",
  "resolvedAt": "ISO8601 | null",
  "resolvedBy": "uuid | null",
  "resolutionAction": "string | null",
  "resolutionNote": "string | null",
  "reporter": {
    "id": "uuid | null",
    "email": "string | null",
    "firstName": "string | null",
    "lastName": "string | null",
    "reputationScore": "integer | null",
    "isActive": "boolean | null",
    "totalReportsSubmitted": "integer",
    "totalReportsPending": "integer"
  },
  "reportedEntity": {
    "type": "item" | "user",
    "currentState": {
      // Para 'item': estructura idéntica a GET /api/admin/items/:id
      // Para 'user': estructura idéntica a GET /api/admin/users/:id
      // Si la entidad fue eliminada: null con nota "entidad eliminada"
    }
  }
}
```

**Notas:**
- `reporter.*` puede ser `null` en todos sus campos si el `reporter_id` ha sido anonimizado.
- `totalReportsSubmitted`: total de reportes emitidos por este usuario (no anonimizados). `SELECT COUNT(*) FROM reports WHERE reporter_id = :reporterId`.
- `totalReportsPending`: reportes emitidos por este usuario actualmente en estado `pending`. Permite detectar denunciantes seriales.
- `reportedEntity.currentState`: refleja el estado **actual** de la entidad en la base de datos, no el snapshot. Permite al admin ver si la situación ha cambiado desde el reporte. Si la entidad fue eliminada entre el reporte y la revisión, devuelve `null`.

**Errores:**

| Código HTTP | Motivo |
|---|---|
| 400 | ID no es UUID válido |
| 404 | Reporte no encontrado |

---

### 4.4 POST /api/admin/reports/:id/resolve

**Descripción:** cierra un reporte con una acción de resolución y nota obligatoria.

**Payload:**

```json
{
  "action": "archive" | "warn_user" | "cancel_item" | "suspend_user",
  "resolutionNote": "string (obligatorio, 1–1000 caracteres)"
}
```

**Definición de acciones:**

| Acción | Efecto sobre el reporte | Efecto sobre la entidad | Emails enviados |
|---|---|---|---|
| `archive` | `status = 'archived'` | Ninguno | TPL-012 al denunciante |
| `warn_user` | `status = 'resolved'` | Ninguno en BD. Email de advertencia al denunciado | TPL-012 al denunciante + TPL-013 al denunciado |
| `cancel_item` | `status = 'resolved'` | Invoca `AdminCancelItemUseCase` (misma cascada que §6.3 de PRD-ADM-BE-01) | TPL-012 al denunciante + TPL-005 al receptor si había sesión activa |
| `suspend_user` | `status = 'resolved'` | Invoca `AdminSuspendUserUseCase` (misma cascada que §6.2 de PRD-ADM-BE-01) | TPL-012 al denunciante |

**Flujo del use case `AdminResolveReportUseCase` (transacción atómica):**

```
1. Verificar que el reporte existe → 404 si no
2. Verificar que status = 'pending' → 409 REPORT_ALREADY_CLOSED si no
3. Validar payload (action + resolutionNote no vacío)
4. Capturar payload_snapshot para admin_audit_log: { status: 'pending', reason, reported_entity_type, reported_entity_id }
5. BEGIN TRANSACTION:
   a. Determinar nuevo status:
      - action = 'archive' → status = 'archived'
      - action IN ('warn_user', 'cancel_item', 'suspend_user') → status = 'resolved'
   b. UPDATE reports SET
        status = :newStatus,
        resolved_at = NOW(),
        resolved_by = :adminUserId,
        resolution_action = :action,
        resolution_note = :resolutionNote
      WHERE id = :reportId
   c. Según acción:
      - 'cancel_item':
          Verificar que reported_entity_type = 'item' → 422 si no
          Invocar AdminCancelItemUseCase.execute(reported_entity_id, adminUserId)
          → Si devuelve 409 (objeto ya cancelado/completado): ROLLBACK + 409 ENTITY_STATE_CONFLICT
      - 'suspend_user':
          Verificar que reported_entity_type = 'user' → 422 si no
          Invocar AdminSuspendUserUseCase.execute(reported_entity_id, adminUserId)
          → Si devuelve 409 (usuario ya suspendido): ROLLBACK + 409 ENTITY_STATE_CONFLICT
      - 'warn_user':
          Verificar que reported_entity_type = 'user' → 422 si no
          No modifica BD del denunciado; el email se envía post-commit
      - 'archive': sin acción adicional
   d. INSERT en admin_audit_log:
        action = 'report.resolved',
        entity_type = 'report',
        entity_id = reportId,
        payload_snapshot = { ...capturado en paso 4, action, resolutionNote },
        admin_user_id = :adminUserId,
        ip_address = :ip
6. COMMIT
7. [Post-commit, fire-and-forget]:
   a. Si reporter_id IS NOT NULL: enviar TPL-012 al denunciante (EVT-017)
   b. Si action = 'warn_user': obtener email del denunciado y enviar TPL-013 (EVT-018)
   c. emitEvent('report.resolved', adminUserId, { action, reportId, entityType }) — AE-033
```

**Respuesta (200):**

```json
{
  "message": "Reporte cerrado",
  "action": "string",
  "reportId": "uuid"
}
```

**Errores:**

| Código HTTP | Código interno | Motivo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Payload inválido o `resolutionNote` vacío |
| 404 | — | Reporte no encontrado |
| 409 | `REPORT_ALREADY_CLOSED` | El reporte ya está en estado `resolved` o `archived` |
| 409 | `ENTITY_STATE_CONFLICT` | La entidad ya está en el estado que la acción intentaría aplicar (ej: objeto ya cancelado, usuario ya suspendido). El reporte **no** se cierra; el admin debe elegir otra acción |
| 422 | `ACTION_ENTITY_MISMATCH` | La acción no es compatible con el tipo de entidad reportada (ej: `cancel_item` sobre un reporte de usuario) |

---

## 5. Catálogo de emails nuevos

### 5.1 EVT-016 / TPL-011 — Confirmación al denunciante

| Campo | Valor |
|---|---|
| Código | TPL-011 |
| Evento | EVT-016 |
| Trigger | `POST /api/reports` exitoso |
| Destinatario | Usuario que envió el reporte (`reporter_id`) |
| Asunto | `Hemos recibido tu reporte — Regálalo` |
| Prioridad | Media |
| Variables | `recipientEmail`, `firstName`, `reportedEntityType` (`"objeto"` / `"usuario"`), `reason` (label legible) |
| Layout | `renderEmailLayout()` |

**Contenido mínimo:**
- Confirmación de recepción del reporte.
- Descripción genérica del motivo reportado (label legible, no el valor interno del enum).
- Aviso de que el equipo lo revisará; sin promesa de plazo.
- Sin mención al denunciado ni al contenido específico.

---

### 5.2 EVT-017 / TPL-012 — Resolución al denunciante

| Campo | Valor |
|---|---|
| Código | TPL-012 |
| Evento | EVT-017 |
| Trigger | `POST /api/admin/reports/:id/resolve` (cualquier acción) |
| Destinatario | Usuario que envió el reporte, solo si `reporter_id IS NOT NULL` |
| Asunto | `Hemos revisado tu reporte — Regálalo` |
| Prioridad | Baja |
| Variables | `recipientEmail`, `firstName`, `reportedEntityType` (`"objeto"` / `"usuario"`) |
| Layout | `renderEmailLayout()` |

**Contenido mínimo:**
- Confirmación de que el reporte ha sido revisado.
- Frase genérica: "Hemos tomado las medidas que consideramos oportunas".
- Sin revelar la acción concreta ni datos del denunciado.
- Sin mención al motivo específico del reporte.

---

### 5.3 EVT-018 / TPL-013 — Advertencia al denunciado

| Campo | Valor |
|---|---|
| Código | TPL-013 |
| Evento | EVT-018 |
| Trigger | `POST /api/admin/reports/:id/resolve` con `action = 'warn_user'` |
| Destinatario | Usuario cuyo perfil fue reportado (`reported_entity_id`) |
| Asunto | `Aviso sobre tu actividad en Regálalo` |
| Prioridad | Alta |
| Variables | `recipientEmail`, `firstName` |
| Layout | `renderEmailLayout()` |

**Contenido mínimo:**
- Aviso de que se ha revisado su actividad en la plataforma.
- Indicación de que algún contenido o comportamiento no cumple las normas de la comunidad.
- Enlace a las normas de la plataforma (URL de política).
- **Sin mención** al reporte, al denunciante ni al contenido específico que motivó la revisión.

---

### 5.4 EVT-019 / TPL-ADM-002 — Notificación al operador (M-01)

| Campo | Valor |
|---|---|
| Código | TPL-ADM-002 |
| Evento | EVT-019 |
| Trigger | `POST /api/reports` exitoso |
| Destinatario | Variable de entorno `ADMIN_EMAIL` |
| Asunto | `[Regálalo] Nuevo reporte — ${reason_label} — ${entity_type}` |
| Prioridad | Alta |
| Variables | `reportId`, `reportedEntityType`, `reason` (label legible), `entitySnapshotTitle`, `reporterFirstName`, `createdAt` |
| Layout | `renderEmailLayout()` (coherente con TPL-ADM-001) |

**Contenido mínimo:**
- ID del reporte (con enlace directo al panel: `https://admin.regalalo.org/reportes/:id`).
- Tipo de entidad y motivo.
- Título del objeto o nombre del usuario reportado (del `entity_snapshot`).
- Nombre del denunciante (primer nombre únicamente).
- Timestamp del reporte.

**Nota:** este template vive en el namespace de admin, junto con TPL-ADM-001. No sigue la numeración TPL-0XX del frontend público.

---

## 6. Eventos de analítica nuevos

Los eventos siguen el esquema canónico definido en `docs/prd-analytics.md` y se emiten vía `emitEvent` en `application/services/analytics.service.ts`. Se invocan **solo tras commit** exitoso, fire-and-forget.

### 6.1 AE-032 — `report.submitted`

| Campo | Valor |
|---|---|
| ID | AE-032 |
| Evento | `report.submitted` |
| Origen | `CreateReportUseCase` |
| `userId` | SHA-256 del `reporter_id` |
| `properties` | `{ entityType: 'item'|'user', reason: string }` |

**Restricción de privacidad:** `properties` no incluye `reported_entity_id`, `description` ni `reporter_id` en crudo.

### 6.2 AE-033 — `report.resolved`

| Campo | Valor |
|---|---|
| ID | AE-033 |
| Evento | `report.resolved` |
| Origen | `AdminResolveReportUseCase` |
| `userId` | SHA-256 del `admin_user_id` |
| `properties` | `{ action: string, entityType: 'item'|'user', resolutionTimeHours: integer }` |

**`resolutionTimeHours`:** diferencia en horas entre `reports.created_at` y `NOW()` al resolver. Permite medir el tiempo medio de atención de la cola.

---

## 7. Rate limiting

| Ruta | Límite HTTP | Ventana | Instancia |
|---|---|---|---|
| `POST /api/reports` | 20 req | 15 minutos por IP | Nueva instancia `reportRateLimit` |
| `GET /api/admin/reports` | Heredado del límite general de `/api/admin/*` (200 req / 15 min) | — | Instancia admin existente |
| `GET /api/admin/reports/:id` | Heredado del límite general | — | Instancia admin existente |
| `POST /api/admin/reports/:id/resolve` | Heredado del límite general | — | Instancia admin existente |

**Límites de negocio (validados en use case, no en middleware HTTP):**
- 3 reportes sobre la misma entidad en 24h por usuario (D-REP-04).
- 10 reportes totales en 7 días por usuario (D-REP-04).

Estos límites son independientes del rate limiting HTTP y devuelven códigos `429` específicos con body diferenciado.

---

## 8. Arquitectura de código (Clean Architecture)

Siguiendo la estructura existente del proyecto (`src/`):

```
src/
  domain/
    entities/
      Report.ts                          (nueva entidad)
    repositories/
      IReportRepository.ts               (nuevo contrato)

  application/
    use-cases/
      reports/
        CreateReportUseCase.ts           (endpoint público)
        AdminGetReportsUseCase.ts        (cola admin)
        AdminGetReportByIdUseCase.ts     (detalle admin)
        AdminResolveReportUseCase.ts     (resolución admin — orquesta AdminCancelItemUseCase
                                          y AdminSuspendUserUseCase vía inyección)
    dtos/
      report/
        CreateReportDto.ts
        ReportListDto.ts
        ReportDetailDto.ts
        ResolveReportDto.ts

  infrastructure/
    database/
      supabase/
        report.repository.ts             (implementación IReportRepository)

  interfaces/
    http/
      controllers/
        ReportController.ts              (POST /api/reports)
        AdminReportController.ts         (GET + POST /api/admin/reports/*)
      routes/
        reports.routes.ts                (rutas públicas)
        admin.routes.ts                  (extender con rutas de reportes admin)
      validators/
        report.validators.ts             (schemas Zod + OpenAPI)
```

**Nota sobre orquestación en `AdminResolveReportUseCase`:**
El use case inyecta `AdminCancelItemUseCase` y `AdminSuspendUserUseCase` para las acciones `cancel_item` y `suspend_user` respectivamente. Esto es valid en Clean Architecture cuando ambos use cases pertenecen a la capa `application/`. La duplicación de lógica que implicaría usar repositorios directamente se evita deliberadamente. Si en v2 esta orquestación crece, se refactorizará en domain services compartidos.

**Nota sobre `IReportRepository`:**
Los métodos mínimos del contrato:
- `create(data): Promise<Report>`
- `findAllAdmin(filters, pagination): Promise<{ reports, total }>`
- `findByIdAdmin(id): Promise<ReportDetailDto | null>`
- `update(id, data): Promise<Report>`
- `countByReporterAndEntity(reporterId, entityId, since): Promise<number>`
- `countByReporterSince(reporterId, since): Promise<number>`
- `hasPendingByReporterAndEntity(reporterId, entityId): Promise<boolean>`

---

## 9. Criterios de aceptación

| ID | Criterio | Verificación |
|---|---|---|
| AC-REP-BE-01 | `POST /api/reports` rechaza requests sin JWT válido | Test: request sin `Authorization` → 401 |
| AC-REP-BE-02 | `POST /api/reports` rechaza usuarios con `email_verified = FALSE` | Test: JWT con `email_verified = false` → 403 `EMAIL_NOT_VERIFIED` |
| AC-REP-BE-03 | reCAPTCHA V3 es obligatorio; score < 0.5 devuelve 400 | Test con token mockeado de score 0.3 → 400 `RECAPTCHA_FAILED` |
| AC-REP-BE-04 | Un usuario no puede reportar su propio objeto | Test: reporter_id = donor_id → 422 `SELF_REPORT_FORBIDDEN` |
| AC-REP-BE-05 | Un usuario no puede reportar su propio perfil | Test: reporter_id = reported_entity_id (type user) → 422 `SELF_REPORT_FORBIDDEN` |
| AC-REP-BE-06 | Objetos en estado `cancelled` no son reportables | Test: reportar ítem con `status = 'cancelled'` → 422 `ENTITY_NOT_REPORTABLE` |
| AC-REP-BE-07 | Objetos en estado `active`, `reserved`, `completed` son reportables | Tests para cada estado → 201 |
| AC-REP-BE-08 | Reporte duplicado sobre misma entidad con `pending` activo devuelve 409 | Test: crear reporte A, crear reporte B sobre misma entidad → 409 `REPORT_ALREADY_PENDING` |
| AC-REP-BE-09 | Límite de 3 reportes sobre la misma entidad en 24h se aplica | Test: 3 reportes sobre entidad X → ok; 4.º → 429 `RATE_LIMIT_ENTITY_EXCEEDED` |
| AC-REP-BE-10 | Límite de 10 reportes totales en 7 días se aplica | Test: 10 reportes sobre entidades distintas → ok; 11.º → 429 `RATE_LIMIT_TOTAL_EXCEEDED` |
| AC-REP-BE-11 | `entity_snapshot` se captura en el INSERT con datos del momento | Verificar fila en BD: snapshot contiene título/nombre del momento del reporte, no el estado actual |
| AC-REP-BE-12 | TPL-011 enviado al denunciante tras reporte exitoso | Test de integración: verificar llamada a `IMailService.send(TPL-011)` post-commit |
| AC-REP-BE-13 | TPL-ADM-002 enviado al operador tras reporte exitoso (M-01) | Test de integración: verificar llamada a `IMailService.send(TPL-ADM-002)` con destinatario `ADMIN_EMAIL` |
| AC-REP-BE-14 | `POST /api/admin/reports/:id/resolve` solo acepta reportes en estado `pending` | Test: intentar resolver reporte ya `resolved` → 409 `REPORT_ALREADY_CLOSED` |
| AC-REP-BE-15 | Acción `cancel_item` sobre reporte de usuario devuelve 422 | Test: resolve con `action = 'cancel_item'` y `reported_entity_type = 'user'` → 422 `ACTION_ENTITY_MISMATCH` |
| AC-REP-BE-16 | Acción `cancel_item` invoca cascada de cancelación del objeto | Test: resolver con `cancel_item` → `items.status = 'cancelled'` en BD; receptor notificado si había sesión |
| AC-REP-BE-17 | Acción `suspend_user` invoca cascada de suspensión | Test: resolver con `suspend_user` → `users.is_active = FALSE`, `jwt_version` incrementado, objetos pausados con `paused_by_admin = TRUE` |
| AC-REP-BE-18 | TPL-013 enviado al denunciado solo con acción `warn_user` | Test: resolve `warn_user` → email a reported user. Resolve `archive` → sin email al reported user |
| AC-REP-BE-19 | TPL-012 enviado al denunciante en cualquier resolución si `reporter_id IS NOT NULL` | Test: resolve cualquier acción → email a reporter |
| AC-REP-BE-20 | `admin_audit_log` recibe entrada con `action = 'report.resolved'` en toda resolución | Test: ejecutar cada acción → verificar fila en `admin_audit_log` |
| AC-REP-BE-21 | `admin_audit_log` recibe entrada con `action = 'report.viewed'` al acceder al detalle | Test: GET `/api/admin/reports/:id` → verificar fila en `admin_audit_log` |
| AC-REP-BE-22 | AE-032 emitido tras creación exitosa de reporte | Test: verificar llamada a `emitEvent('report.submitted', ...)` post-commit |
| AC-REP-BE-23 | AE-033 emitido tras resolución exitosa | Test: verificar llamada a `emitEvent('report.resolved', ...)` post-commit |
| AC-REP-BE-24 | RLS: el usuario reportado no puede leer reportes sobre su perfil | Test con Supabase client autenticado como reported user → 0 filas |
| AC-REP-BE-25 | `reporter_id` aceptado como NULL en tabla (para anonimización futura) | Verificar schema: columna nullable. INSERT manual con NULL → ok |
| AC-REP-BE-26 | `GET /api/admin/metrics` incluye bloque `reports` con contadores correctos | Test: crear N reportes y verificar contadores en respuesta |
| AC-REP-BE-27 | `resolutionNote` vacío en payload de resolución devuelve 400 | Test: `resolutionNote: ""` → 400 `VALIDATION_ERROR` |
| AC-REP-BE-28 | `ENTITY_STATE_CONFLICT` no cierra el reporte si la acción falla | Test: resolver con `cancel_item` sobre objeto ya cancelado → 409; report sigue en `pending` |

---

## 10. Dependencias y orden de implementación

| Fase | Contenido | Prerequisito |
|---|---|---|
| 1 | Migración: tabla `reports` + índices + RLS + vista `reports_summary_by_entity` | PRD-ADM-BE-01 Fase 1 completada (tabla `admin_users` y `admin_audit_log` deben existir) |
| 2 | `IReportRepository` + `ReportRepository` + entidad `Report` + DTOs | Fase 1 |
| 3 | `CreateReportUseCase` + `ReportController` + rutas públicas + validators | Fase 2 |
| 4 | Templates TPL-011 y TPL-ADM-002 en `ResendMailProvider` | Fase 3 |
| 5 | Templates TPL-012 y TPL-013 en `ResendMailProvider` | Fase 4 |
| 6 | `AdminGetReportsUseCase` + `AdminGetReportByIdUseCase` + `AdminReportController` (GET) | Fases 2 + PRD-ADM-BE-01 Fase 3 completada |
| 7 | `AdminResolveReportUseCase` + endpoint POST resolve (orquestación de use cases admin) | Fases 5 + 6 + PRD-ADM-BE-01 Fases 3 y 4 completadas |
| 8 | Extensión `GET /api/admin/metrics` con bloque `reports` | Fase 1 |
| 9 | Job mensual de anonimización (pg_cron) | Fase 1 |
| 10 | Instrumentación analítica AE-032 y AE-033 | Fases 3 y 7 |

---

## 11. Variables de entorno

No se añaden variables nuevas. Las siguientes variables existentes son consumidas por este módulo:

| Variable | Uso en este módulo |
|---|---|
| `ADMIN_EMAIL` | Destinatario de TPL-ADM-002 (EVT-019) |
| `RECAPTCHA_SECRET_KEY` | Verificación del token en `CreateReportUseCase` |
| `SUPABASE_SERVICE_ROLE_KEY` | Operaciones de BD en el backend (bypasea RLS) |
| `RESEND_API_KEY` | Envío de TPL-011, TPL-012, TPL-013, TPL-ADM-002 |
| `APP_PUBLIC_URL` | Construcción de enlaces en emails |
| `ADMIN_PANEL_URL` | Construcción del enlace directo en TPL-ADM-002 (ej: `https://admin.regalalo.org`) |

`ADMIN_PANEL_URL` puede no existir actualmente. Debe añadirse al entorno de Render.

---

## 12. Actualización del catálogo de emails (email-flow-mapping.md)

Las siguientes filas deben añadirse a la tabla de mapeo del documento `docs/email-flow-mapping.md`:

| ID_Evento | Trigger | Origen | Destinatario | Template_Ref | Condicionales |
|---|---|---|---|---|---|
| EVT-016 | Usuario envía un reporte | Use Case: `CreateReportUseCase` | Denunciante (`reporter_id`) | `TPL-011` | POST `/api/reports` exitoso (201) |
| EVT-017 | Admin resuelve o archiva un reporte | Use Case: `AdminResolveReportUseCase` | Denunciante (`reporter_id`) | `TPL-012` | `reporter_id IS NOT NULL` al momento de la resolución |
| EVT-018 | Admin resuelve reporte con acción `warn_user` | Use Case: `AdminResolveReportUseCase` | Usuario denunciado (`reported_entity_id`) | `TPL-013` | `action = 'warn_user'` + `reported_entity_type = 'user'` + usuario activo |
| EVT-019 | Usuario envía un reporte | Use Case: `CreateReportUseCase` | Operador (`ADMIN_EMAIL`) | `TPL-ADM-002` | POST `/api/reports` exitoso (201). Siempre se envía, sin condición sobre tipo ni motivo |
