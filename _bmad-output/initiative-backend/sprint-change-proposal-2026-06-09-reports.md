---
title: "Sprint Change Proposal — Sistema de Reportes (PRD-REP-BE-01)"
date: "2026-06-09"
scope: Moderate
status: pending-approval
author: Correct Course workflow
artifacts_modified:
  - _bmad-output/initiative-backend/archive-v6/epics.md
  - _bmad-output/initiative-backend/archive-v6/sprint-status.yaml
  - docs/email-flow-mapping.md
  - docs/prd-analytics.md
  - _bmad-output/project-context.md
---

# Sprint Change Proposal — Sistema de Reportes (PRD-REP-BE-01)

---

## 1. Resumen del detonador

**Situación:** El `PRD-REP-BE-01.md` (Sistema de Reportes, P0, Bloque 1) fue aprobado el 2026-06-09. Este documento completa el módulo de reportes que estaba definido como dependencia de `PRD-ADM-BE-01` y cuya implementación había sido diferida explícitamente en `epic-13` mediante la historia placeholder `13-7-cola-de-reportes-bloqueado-init-rep-01`.

**Tipo de cambio:** Nuevo requisito aprobado — incorporación al backlog de planificación existente.

**Evidencia:**
- `docs/PRD-REP-BE-01.md` — PRD aprobado, status: approved, 28 criterios de aceptación, 10 fases de implementación, 4 endpoints, 4 templates de email, 2 eventos analíticos.
- `sprint-status.yaml` línea 160 — `13-7-cola-de-reportes-bloqueado-init-rep-01: backlog` con nota de bloqueo.
- `epic-13` en estado `in-progress`; `13-6-metricas-operativas-y-estado-del-sistema` en `ready-for-dev`.

---

## 2. Análisis de impacto

### 2.1 Impacto sobre épicas

| Épica | Estado actual | Impacto |
|---|---|---|
| epic-13 (Panel Admin) | in-progress | Historia 13-7 (placeholder bloqueado) queda obsoleta — se elimina. Story 13-6 (métricas) se implementa **sin** el bloque `reports` para no bloquearse en la migración de reportes; el bloque se añade en 14.7. |
| epic-14 (Reportes) | no existe | **Crear nueva épica** con 7 historias que cubren las 10 fases del PRD-REP-BE-01. |
| epic-1 a epic-12 | done | Sin impacto. |

### 2.2 Conflictos de artefactos

| Artefacto | Tipo de cambio | Sección afectada |
|---|---|---|
| `epics.md` | Adición (Épica 14) + edición (Épica 13) | Resumen de épicas + detalle Épica 13 + nuevo bloque Épica 14 |
| `sprint-status.yaml` | Eliminación (13-7) + adición (epic-14 con 7 historias) | Bloque epic-13 y nuevo bloque epic-14 |
| `email-flow-mapping.md` | Adición de 4 eventos (EVT-016…019) + 4 templates (TPL-011…013, TPL-ADM-002) | Tablas §1, §2, §3, notas §5 |
| `prd-analytics.md` | Adición de 2 eventos (AE-032, AE-033) | Tabla de catálogo §8, criterio SC-01 §7 |
| `project-context.md` | Actualización de referencia de catálogo AE | Línea analítica de catálogo |

### 2.3 Impacto técnico

- **Dependencia de migración:** La historia 14.1 (migración SQL) debe estar completa antes de que `13-6` se implemente con el bloque `reports` en métricas. Sin embargo, per la decisión de implementar 13-6 sin ese bloque, el bloqueo desaparece.
- **Orquestación de use cases:** `AdminResolveReportUseCase` (14.6) inyecta `AdminCancelItemUseCase` y `AdminSuspendUserUseCase` — estos ya existen desde Épica 13.
- **reCAPTCHA:** `CreateReportUseCase` reutiliza el adaptador de reCAPTCHA V3 existente.
- **Auditoría:** Dos nuevos valores de `admin_audit_log.action`: `report.viewed` y `report.resolved` — no requieren migración de schema, solo uso en código.
- **Variables de entorno:** `ADMIN_PANEL_URL` puede no existir. Debe añadirse a Render.

---

## 3. Enfoque recomendado

**Opción seleccionada: Direct Adjustment — nueva Épica 14**

Las 10 fases del PRD-REP-BE-01 §10 se agrupan en 7 historias bajo una nueva Épica 14. No se reabren épicas previas ni se revierten historias completadas.

**Justificación:**
- El PRD está completo y aprobado — sin ambigüedad en alcance.
- Las dependencias de código (AdminCancelItemUseCase, AdminSuspendUserUseCase, ResendMailProvider, reCAPTCHA) ya existen.
- La Épica 13 sigue su curso; solo se elimina el placeholder 13-7 y se aclara que 13-6 no incluirá el bloque `reports` (que va en 14.7).
- Esfuerzo estimado: **Medio** (infraestructura existente reutilizable).
- Riesgo: **Bajo** (módulo autónomo, sin cambios disruptivos en código existente).

**Secuencia de implementación sugerida (no bloquea epic-13):**
```
epic-13: 13-6 → done → epic-13 done
epic-14: 14.1 → 14.2 → 14.3 → 14.4 → 14.5 → 14.6 → 14.7
```

---

## 4. Propuestas de cambio detalladas

### Propuesta A — `epics.md`: Actualizar Épica 13 y añadir Épica 14

#### A.1 — Épica 13: actualizar resumen y eliminar historia 13-7

**ANTES (sección Lista de Épicas — resumen de Épica 13):**
```
### Épica 13: Panel Administrativo Backend (PRD-ADM-BE-01)
Implementa el backend completo del panel administrativo: autenticación de admin con 2FA por email,
gestión de usuarios, objetos y sesiones de entrega, cola de reportes (dependiente de INIT-REP-01),
métricas operativas y estado del sistema.
```

**DESPUÉS:**
```
### Épica 13: Panel Administrativo Backend (PRD-ADM-BE-01)
Implementa el backend completo del panel administrativo: autenticación de admin con 2FA por email,
gestión de usuarios, objetos y sesiones de entrega, métricas operativas y estado del sistema.
La cola de reportes se implementa en Épica 14 (PRD-REP-BE-01), una vez aprobado ese PRD.
```

**Rationale:** La historia 13-7 era un placeholder de bloqueo. El módulo de reportes tiene ahora su propio PRD y su propia épica.

---

#### A.2 — Épica 13: eliminar Historia 13.7 del detalle

En el detalle de Épica 13 (sección completa), eliminar la historia 13.7 y su descripción completa de "Cola de reportes (bloqueado — INIT-REP-01)".

---

#### A.3 — Épica 14 completa (bloque nuevo al final de `epics.md`)

Añadir al final del archivo, después del bloque de Épica 13:

```markdown
---

### Épica 14: Sistema de Reportes (PRD-REP-BE-01)

Los usuarios autenticados con email verificado pueden reportar objetos o perfiles de usuario.
El panel administrativo recibe una cola de moderación, herramientas de resolución con acciones
de cascada y notificaciones automáticas. El sistema incluye prevención de duplicados, snapshots
del contenido reportado, tres flujos de email y dos eventos analíticos.

**PRD de referencia:** `docs/PRD-REP-BE-01.md`
**FRs cubiertos:** Módulo autónomo definido en PRD-REP-BE-01. Extiende Épica 13 en métricas admin.

---

## Épica 14: Sistema de Reportes (PRD-REP-BE-01)

### Historia 14.1: Migración SQL — tabla `reports`

Como sistema,
quiero la estructura de base de datos del módulo de reportes,
para que el resto de historias de la épica pueda apoyarse en un schema estable.

**Criterios de Aceptación:**

**Dado** que se ejecuta la migración
**Cuando** se inspecciona la base de datos
**Entonces** existe la tabla `reports` con todas las columnas, CHECK constraints y valores DEFAULT
definidos en PRD-REP-BE-01 §3.1

**Y** existen los 4 índices: `idx_reports_status_created`, `idx_reports_entity`,
`idx_reports_reporter_created`, `idx_reports_reporter_id`

**Y** existe la vista `reports_summary_by_entity` según §3.2

**Y** RLS está habilitado en `reports` con la política `reports_select_own` (SELECT por `reporter_id`)
según §3.4

**Y** el schema permite `reporter_id = NULL` (AC-REP-BE-25)

---

### Historia 14.2: Dominio y repositorio de reportes

Como desarrollador,
quiero las capas de dominio e infraestructura del módulo de reportes,
para que los use cases puedan persistir y consultar reportes sin conocer los detalles de Supabase.

**Criterios de Aceptación:**

**Dado** que el módulo está implementado
**Cuando** se examina la estructura de código
**Entonces** existe `src/domain/entities/Report.ts` con todos los campos de la tabla

**Y** existe `src/domain/repositories/IReportRepository.ts` con los métodos:
`create`, `findAllAdmin`, `findByIdAdmin`, `update`,
`countByReporterAndEntity`, `countByReporterSince`, `hasPendingByReporterAndEntity`

**Y** existe `src/infrastructure/database/supabase/report.repository.ts` implementando `IReportRepository`

**Y** existen los DTOs en `src/application/dtos/report/`:
`CreateReportDto`, `ReportListDto`, `ReportDetailDto`, `ResolveReportDto`

**Y** ningún DTO expone la columna `reporter_id` en crudo en contextos públicos

---

### Historia 14.3: Endpoint público POST /api/reports

Como usuario autenticado con email verificado,
quiero poder reportar un objeto o un perfil de usuario,
para que el equipo de moderación pueda revisar contenido inapropiado.

**Criterios de Aceptación:**

**Dado** que envío `POST /api/reports` con payload válido, JWT con email verificado y token reCAPTCHA con score ≥ 0.5
**Cuando** el servidor procesa la petición
**Entonces** responde `201` con `{ id: uuid, message: "Reporte enviado correctamente. Lo revisaremos lo antes posible." }`
**Y** el reporte queda en BD con `entity_snapshot` capturado en el momento del INSERT

**Dado** que el usuario intenta reportar su propio objeto (donor_id = reporter_id)
**Cuando** el servidor procesa la petición
**Entonces** responde `422 SELF_REPORT_FORBIDDEN` (AC-REP-BE-04)

**Dado** que el usuario intenta reportar su propio perfil (type=user, reported_entity_id = reporter_id)
**Cuando** el servidor procesa la petición
**Entonces** responde `422 SELF_REPORT_FORBIDDEN` (AC-REP-BE-05)

**Dado** que el objeto reportado está en estado `cancelled`
**Cuando** el servidor procesa la petición
**Entonces** responde `422 ENTITY_NOT_REPORTABLE` (AC-REP-BE-06)

**Dado** que el usuario ya tiene un reporte pendiente sobre la misma entidad
**Cuando** envía otro reporte sobre la misma entidad
**Entonces** responde `409 REPORT_ALREADY_PENDING` (AC-REP-BE-08)

**Dado** que el usuario ha enviado 3 reportes sobre la misma entidad en las últimas 24h
**Cuando** intenta enviar el cuarto
**Entonces** responde `429 RATE_LIMIT_ENTITY_EXCEEDED` (AC-REP-BE-09)

**Dado** que el usuario ha enviado 10 reportes totales en los últimos 7 días
**Cuando** intenta enviar el undécimo
**Entonces** responde `429 RATE_LIMIT_TOTAL_EXCEEDED` (AC-REP-BE-10)

**Dado** que el reporte es creado exitosamente
**Cuando** se completa el commit
**Entonces** se envían TPL-011 al denunciante y TPL-ADM-002 al operador (fire-and-forget)

**Dado** que llegan más de 20 requests en 15 minutos desde la misma IP a esta ruta
**Cuando** llega la petición 21
**Entonces** responde `429 Too Many Requests` (rate limit HTTP)

**Dado** que el usuario no tiene JWT
**Cuando** hace la petición
**Entonces** responde `401`

**Dado** que el usuario tiene JWT pero `email_verified = FALSE`
**Cuando** hace la petición
**Entonces** responde `403 EMAIL_NOT_VERIFIED` (AC-REP-BE-02)

---

### Historia 14.4: Templates de email del módulo de reportes

Como sistema,
quiero los cuatro templates de email del módulo de reportes implementados en `ResendMailProvider`,
para que los use cases de reportes puedan notificar a denunciantes, denunciados y al operador.

**Criterios de Aceptación:**

**Dado** que `CreateReportUseCase` dispara el post-commit
**Cuando** se llama a `IMailService.send(TPL-011, ...)`
**Entonces** el denunciante recibe un email de confirmación de recepción sin mención al denunciado
(AC-REP-BE-12)

**Dado** que `CreateReportUseCase` dispara el post-commit
**Cuando** se llama a `IMailService.send(TPL-ADM-002, ...)`
**Entonces** el operador (`ADMIN_EMAIL`) recibe notificación con `reportId`, tipo de entidad, motivo legible,
título del snapshot, nombre del denunciante y timestamp (AC-REP-BE-13)

**Dado** que `AdminResolveReportUseCase` completa el commit con cualquier acción
**Cuando** `reporter_id IS NOT NULL`
**Entonces** el denunciante recibe TPL-012 con mensaje genérico de resolución sin revelar la acción
(AC-REP-BE-19)

**Dado** que `AdminResolveReportUseCase` completa el commit con `action = 'warn_user'`
**Cuando** se procesa el post-commit
**Entonces** el usuario denunciado recibe TPL-013 con aviso genérico, sin mención al reporte ni al
denunciante (AC-REP-BE-18)

**Y** todos los templates usan `renderEmailLayout()` coherente con los templates existentes (TPL-001…010)

---

### Historia 14.5: Cola de moderación admin (GET endpoints)

Como administrador,
quiero ver el listado paginado de reportes y el detalle de cada uno,
para poder revisar la cola de moderación y obtener el contexto necesario para tomar decisiones.

**Criterios de Aceptación:**

**Dado** que hago `GET /api/admin/reports` con `status=pending`
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con lista FIFO (`created_at ASC`), paginada, con `pendingCountForEntity`
calculado via JOIN a `reports_summary_by_entity`

**Dado** que aplico filtros `reportedEntityType`, `reason`, `dateFrom`, `dateTo`
**Cuando** el servidor procesa la petición
**Entonces** los resultados respetan los filtros combinados

**Dado** que hago `GET /api/admin/reports/:id`
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con detalle completo incluyendo `reporter` con estadísticas y
`reportedEntity.currentState` con el estado actual de la entidad en BD

**Y** se genera una entrada en `admin_audit_log` con `action = 'report.viewed'` (AC-REP-BE-21)

**Dado** que el `reporter_id` ha sido anonimizado (NULL)
**Cuando** se consulta el detalle
**Entonces** los campos de `reporter` son `null` sin errores

**Dado** que el ID del reporte no es UUID válido
**Cuando** se llama al endpoint
**Entonces** responde `400`

**Dado** que el reporte no existe
**Cuando** se llama al endpoint
**Entonces** responde `404`

---

### Historia 14.6: Resolución de reportes admin (POST endpoint)

Como administrador,
quiero poder cerrar un reporte con una acción de resolución y nota obligatoria,
para dejar trazabilidad de cada decisión de moderación y ejecutar las consecuencias correspondientes.

**Criterios de Aceptación:**

**Dado** que envío `POST /api/admin/reports/:id/resolve` con `action='archive'` y `resolutionNote` no vacío
**Cuando** el servidor procesa la petición
**Entonces** el reporte pasa a `status='archived'`, `resolved_at` y `resolved_by` quedan registrados
**Y** se inserta entrada en `admin_audit_log` con `action='report.resolved'` (AC-REP-BE-20)
**Y** se envía TPL-012 al denunciante si `reporter_id IS NOT NULL`

**Dado** que envío `action='warn_user'` sobre un reporte de tipo `user`
**Cuando** el servidor procesa la petición
**Entonces** el reporte pasa a `status='resolved'`
**Y** se envía TPL-013 al denunciado (sin mención al reporte ni al denunciante)

**Dado** que envío `action='cancel_item'` sobre un reporte de tipo `item`
**Cuando** el servidor procesa la petición
**Entonces** se invoca `AdminCancelItemUseCase` dentro de la misma transacción atómica (AC-REP-BE-16)

**Dado** que envío `action='suspend_user'` sobre un reporte de tipo `user`
**Cuando** el servidor procesa la petición
**Entonces** se invoca `AdminSuspendUserUseCase` dentro de la misma transacción atómica (AC-REP-BE-17)

**Dado** que el reporte ya está en estado `resolved` o `archived`
**Cuando** intento resolverlo
**Entonces** responde `409 REPORT_ALREADY_CLOSED` y el reporte no se modifica (AC-REP-BE-14)

**Dado** que envío `action='cancel_item'` sobre un reporte de tipo `user`
**Cuando** el servidor procesa la petición
**Entonces** responde `422 ACTION_ENTITY_MISMATCH` (AC-REP-BE-15)

**Dado** que envío `action='cancel_item'` sobre un objeto ya cancelado
**Cuando** el servidor procesa la petición
**Entonces** responde `409 ENTITY_STATE_CONFLICT` y el reporte permanece en `pending` (AC-REP-BE-28)

**Dado** que `resolutionNote` está vacío
**Cuando** envío el payload
**Entonces** responde `400 VALIDATION_ERROR` (AC-REP-BE-27)

---

### Historia 14.7: Extensión de métricas, job de anonimización y analítica

Como sistema,
quiero completar el módulo de reportes con la extensión del dashboard de métricas, el job mensual
de anonimización RGPD y la instrumentación analítica,
para que el operador tenga visibilidad sobre el estado de la cola y los datos cumplan con la retención.

**Criterios de Aceptación:**

**Dado** que llamo a `GET /api/admin/metrics`
**Cuando** el servidor procesa la petición
**Entonces** la respuesta incluye el bloque `reports` con `pending`, `resolvedLast30Days` y `archivedLast30Days`
(AC-REP-BE-26)

**Dado** que el job mensual de anonimización se ejecuta (primer día del mes, 03:00 UTC)
**Cuando** existen reportes `resolved` o `archived` con `created_at < NOW() - 2 años` y `reporter_id IS NOT NULL`
**Entonces** esos registros quedan con `reporter_id = NULL`
**Y** `appLogger` registra el número de filas anonimizadas
**Y** no se genera entrada en `admin_audit_log` (es job de sistema)

**Dado** que `CreateReportUseCase` completa el commit exitosamente
**Cuando** se procesa el post-commit
**Entonces** se emite `emitEvent('report.submitted', reporterIdHash, { entityType, reason })` (AE-032)
**Y** `properties` no incluye `reporter_id` en crudo ni `reported_entity_id` (AC-REP-BE-22)

**Dado** que `AdminResolveReportUseCase` completa el commit exitosamente
**Cuando** se procesa el post-commit
**Entonces** se emite `emitEvent('report.resolved', adminUserIdHash, { action, entityType, resolutionTimeHours })` (AE-033)
(AC-REP-BE-23)
```

---

### Propuesta B — `sprint-status.yaml`: Eliminar 13-7 y añadir epic-14

#### B.1 — Eliminar historia 13-7

**ANTES:**
```yaml
  13-7-cola-de-reportes-bloqueado-init-rep-01: backlog
```

**DESPUÉS:** *(línea eliminada)*

**Rationale:** Era un placeholder de bloqueo. El módulo se implementa en Épica 14.

---

#### B.2 — Actualizar comentario y estado de epic-13

**ANTES:**
```yaml
  # ─── Épica 13: Panel Administrativo Backend (PRD-ADM-BE-01) ───
  epic-13: in-progress
  ...
  13-6-metricas-operativas-y-estado-del-sistema: ready-for-dev
  13-7-cola-de-reportes-bloqueado-init-rep-01: backlog
  epic-13-retrospective: optional
```

**DESPUÉS:**
```yaml
  # ─── Épica 13: Panel Administrativo Backend (PRD-ADM-BE-01) ───
  # Nota: métricas admin (13-6) implementa sin bloque 'reports'; ese bloque se añade en 14-7.
  epic-13: in-progress
  ...
  13-6-metricas-operativas-y-estado-del-sistema: ready-for-dev
  epic-13-retrospective: optional
```

---

#### B.3 — Añadir bloque epic-14

Añadir al final del archivo:

```yaml
  # ─── Épica 14: Sistema de Reportes (PRD-REP-BE-01) ───
  epic-14: backlog
  14-1-migracion-sql-tabla-reports: backlog
  14-2-dominio-y-repositorio-de-reportes: backlog
  14-3-endpoint-publico-post-api-reports: backlog
  14-4-templates-email-modulo-reportes: backlog
  14-5-cola-moderacion-admin-get-endpoints: backlog
  14-6-resolucion-reportes-admin-post-endpoint: backlog
  14-7-extension-metricas-anonimizacion-analitica: backlog
  epic-14-retrospective: optional
```

---

### Propuesta C — `email-flow-mapping.md`: Añadir EVT-016…EVT-019

#### C.1 — Tabla §1: añadir 4 filas

Añadir al final de la tabla §1:

| ID_Evento | Trigger | Capa / Origen | Destinatario | Template_Ref | Condicionales |
|---|---|---|---|---|---|
| EVT-016 | Usuario envía un reporte | Use Case: `CreateReportUseCase` | Denunciante (`reporter_id`) | `TPL-011` | POST `/api/reports` exitoso (201) |
| EVT-017 | Admin resuelve o archiva un reporte | Use Case: `AdminResolveReportUseCase` | Denunciante (`reporter_id`) | `TPL-012` | `reporter_id IS NOT NULL` al momento de la resolución |
| EVT-018 | Admin resuelve reporte con acción `warn_user` | Use Case: `AdminResolveReportUseCase` | Usuario denunciado (`reported_entity_id`) | `TPL-013` | `action = 'warn_user'` + `reported_entity_type = 'user'` + usuario activo |
| EVT-019 | Usuario envía un reporte | Use Case: `CreateReportUseCase` | Operador (`ADMIN_EMAIL`) | `TPL-ADM-002` | POST `/api/reports` exitoso (201). Siempre se envía, sin condición sobre tipo ni motivo |

#### C.2 — Tabla §2: añadir 4 filas de definición de datos

| ID_Evento | Template_Ref | Variables_Requeridas | Prioridad |
|---|---|---|---|
| EVT-016 | `TPL-011` | `recipientEmail`, `firstName`, `reportedEntityType` (`"objeto"`/`"usuario"`), `reason` (label legible) | Media |
| EVT-017 | `TPL-012` | `recipientEmail`, `firstName`, `reportedEntityType` (`"objeto"`/`"usuario"`) | Baja |
| EVT-018 | `TPL-013` | `recipientEmail`, `firstName` | Alta |
| EVT-019 | `TPL-ADM-002` | `reportId`, `reportedEntityType`, `reason` (label legible), `entitySnapshotTitle`, `reporterFirstName`, `createdAt` | Alta |

#### C.3 — Diagrama §3: añadir bloque de reportes

Añadir al diagrama de flujo:

```
┌─────────────────────────────────────────────────────────┐
│             APPLICATION / USE CASES (Reportes)          │
│                                                         │
│  CreateReportUseCase    → IMailService.send(TPL-011)    │
│                         → IMailService.send(TPL-ADM-002)│
│  AdminResolveReportUseCase → IMailService.send(TPL-012) │
│                            → IMailService.send(TPL-013) │
│                              (solo si action=warn_user) │
└─────────────────────────────────────────────────────────┘
```

#### C.4 — Encabezado del documento: actualizar versión

**ANTES:**
```
**Versión:** 1.4
**Fecha:** Mayo 2026
**Cambios respecto a v1.3:** ...
```

**DESPUÉS:**
```
**Versión:** 1.5
**Fecha:** Junio 2026
**Cambios respecto a v1.4:** Correct Course 2026-06-09 — Sistema de Reportes (PRD-REP-BE-01):
EVT-016…EVT-019 y TPL-011, TPL-012, TPL-013, TPL-ADM-002.
```

#### C.5 — Notas §5: añadir nota de EVT-016/017

Añadir al final de §5:

**EVT-016/017 — Información revelada al denunciante:**
El email de confirmación (TPL-011) no menciona al denunciado ni al contenido específico.
El email de resolución (TPL-012) solo confirma que el reporte fue revisado con frase genérica;
no revela la acción tomada por el administrador.

**EVT-018 — Confidencialidad del reporte:**
El email de advertencia (TPL-013) no menciona el reporte, al denunciante ni al motivo específico.
Decisión de diseño D-REP-06 del PRD-REP-BE-01.

**EVT-019 — Namespace admin:**
TPL-ADM-002 vive en el namespace de admin, junto con TPL-ADM-001 (OTP). No sigue la numeración
TPL-0XX del sistema público.

---

### Propuesta D — `prd-analytics.md`: Añadir AE-032 y AE-033

#### D.1 — Tabla de catálogo §8: añadir 2 filas

Añadir al final de la tabla de catálogo de eventos (tras AE-031):

| ID | Evento | Trigger | Properties relevantes |
|---|---|---|---|
| AE-032 | `report.submitted` | Use Case: `CreateReportUseCase` | `entityType` (`'item'`/`'user'`), `reason` |
| AE-033 | `report.resolved` | Use Case: `AdminResolveReportUseCase` | `action`, `entityType`, `resolutionTimeHours` |

**Restricciones de privacidad AE-032:** `properties` no incluye `reported_entity_id`, `description` ni `reporter_id` en crudo.

**`resolutionTimeHours` (AE-033):** diferencia en horas entre `reports.created_at` y `NOW()` al resolver.

#### D.2 — Criterio SC-01 §7: actualizar rango del catálogo

**ANTES:**
```
| SC-01 | Los 15 eventos del catálogo (AE-001…AE-031) emiten log tras commit exitoso en su use case o job | Tests de integración o revisión de cobertura en PR |
```

**DESPUÉS:**
```
| SC-01 | Los eventos del catálogo (AE-001…AE-033) emiten log tras commit exitoso en su use case o job | Tests de integración o revisión de cobertura en PR |
```

#### D.3 — Propósito de tabla §8 (si referencia AE-031): actualizar

**ANTES:**
```
| Propósito | Almacén durable de eventos AE-001…AE-031 |
```

**DESPUÉS:**
```
| Propósito | Almacén durable de eventos AE-001…AE-033 |
```

---

### Propuesta E — `project-context.md`: Actualizar referencia del catálogo

#### E.1 — Línea de catálogo AE

**ANTES (línea ~83):**
```
- Catálogo AE-001…AE-031: `docs/architecture.md` §12.9.
```

**DESPUÉS:**
```
- Catálogo AE-001…AE-033: `docs/architecture.md` §12.9 + `docs/PRD-REP-BE-01.md` §6 (AE-032, AE-033).
```

---

## 5. Handoff de implementación

**Clasificación de alcance: Moderate**

El cambio introduce una nueva épica con 7 historias, actualiza 5 artefactos de planificación
y no modifica épicas completadas. Requiere actualización coordinada de backlog antes de iniciar
implementación.

**Responsabilidades:**

| Rol | Tarea |
|---|---|
| Developer (ahora, pre-implementación) | Aplicar Propuestas A, B, C, D, E a los archivos de artefactos |
| Developer (historia 13-6) | Implementar métricas admin **sin** bloque `reports`; dejar extensión para 14.7 |
| Developer (Épica 14) | Implementar historias 14.1 → 14.7 en secuencia; no iniciar 14.5+ sin 14.1 aplicada en BD |
| Operador (Render) | Añadir variable de entorno `ADMIN_PANEL_URL` antes de 14.3 |

**Criterios de éxito:**
- Los 28 criterios de aceptación de PRD-REP-BE-01 (AC-REP-BE-01…AC-REP-BE-28) pasan.
- `epic-14` en `sprint-status.yaml` avanza story a story hasta `done`.
- `email-flow-mapping.md` versión 1.5 con EVT-016…019 documentados.
- `prd-analytics.md` con AE-032, AE-033 en catálogo.
- `GET /api/admin/metrics` incluye bloque `reports` al final de 14.7.

---

## Checklist de verificación pre-aprobación

- [x] 1.1 Detonador identificado — PRD-REP-BE-01.md aprobado 2026-06-09
- [x] 1.2 Tipo de cambio — nuevo requisito aprobado
- [x] 1.3 Evidencia — PRD completo + sprint-status con placeholder bloqueado
- [x] 2.1 epic-13 puede completarse (13-6 se implementa sin bloque reports)
- [x] 2.2 Epic-14 nueva definida con 7 historias
- [x] 2.3 Epic-1 a epic-12 sin impacto
- [x] 2.4 No hay épicas invalidadas; placeholder 13-7 obsoleto
- [x] 2.5 Prioridad de epic-14 posterior a epic-13 (no bloquea)
- [x] 3.1 PRD existente no conflicta con el nuevo PRD
- [x] 3.2 Arquitectura: Clean Architecture respetada (PRD §8 define estructura de carpetas)
- [x] 3.3 UX: N/A — backend
- [x] 3.4 email-flow-mapping.md + prd-analytics.md + project-context.md identificados
- [x] 4.4 Opción seleccionada: Direct Adjustment (nueva Épica 14)
- [x] 5.1…5.5 Componentes del proposal completos
