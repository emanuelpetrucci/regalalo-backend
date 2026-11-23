# Sprint Change Proposal — Persistencia de analítica en Postgres (Opción A)

**Fecha:** 2026-05-26  
**Proyecto:** backend (Regálalo)  
**Solicitante:** Emanuel  
**Estado:** Aprobado (opción A confirmada en conversación)  
**Alcance del cambio:** Moderado  

---

## 1. Resumen del issue

### Problema

La Épica 7 cerró la **instrumentación** de eventos (AE-001…AE-031) con destino MVP definido como **stdout → logs de Railway**. Eso no garantiza persistencia durable ni consultas SQL antes del lanzamiento del MVP.

### Contexto

- Descubierto en planificación pre-lanzamiento (no es un bug de implementación).
- Épica 7 (`7-1`…`7-6`) está `done`; `emitEvent` y catálogo AE funcionan.
- El usuario eligió **Opción A**: tabla Postgres `analytics_events` + mantener stdout como copia operativa.

### Evidencia

- `docs/prd-analytics.md` §8: MVP = solo Railway.
- `src/config/loggers.ts`: `analyticsLogger` solo stdout; `LOG_FILE` no aplica a analítica.
- SC-05 actual no exige filas en BD.

---

## 2. Análisis de impacto

### Épicas

| Épica | Impacto |
|-------|---------|
| **7** (Analítica) | Reabrir para historia **7-7** (persistencia). No revertir 7-1…7-6. |
| 1–6 | Sin impacto |
| Futuras | Sin nuevas épicas |

### Historias

| Historia | Acción |
|----------|--------|
| 7-1 … 7-6 | Sin cambios (completadas) |
| **7-7** | **Nueva** — migración + repositorio + dual-write desde `emitEvent` |

### Artefactos

| Artefacto | Cambio |
|-----------|--------|
| `docs/prd-analytics.md` | §2, §3, §3.1 (SC-05, SC-07), §4.2, §7, §8 |
| `docs/architecture.md` | §3.9, §4 índices, regla loggers, §12.9 |
| `_bmad-output/project-context.md` | Reglas DLT-004 persistencia |
| `_bmad-output/initiative-backend/archive-v6/epics.md` | Historia 7.7 |
| `sprint-status.yaml` | `epic-7: in-progress`, `7-7: backlog` |

### UI/UX

N/A — capa invisible.

### Técnico

- Migración `014-analytics-events.sql`
- `IAnalyticsEventRepository` + implementación Supabase/pg
- Extensión `emitEvent` / `safeEmitEvent`: log Pino + insert async fire-and-forget
- `ANALYTICS_PERSISTENCE` env (default `postgres` en prod; `stdout` opcional en tests)
- Tests unitarios + integración con mock de repositorio
- Sin cambios en use cases 7.4–7.6

---

## 3. Enfoque recomendado

**Opción elegida:** Direct Adjustment (historia 7-7 en Épica 7).

| Criterio | Valoración |
|----------|------------|
| Esfuerzo | Medio (~1–2 días) |
| Riesgo | Bajo (no toca flujos de negocio) |
| Rollback 7-2…7-6 | No necesario |

**Rationale:** Reutiliza Supabase/Postgres existente; consultas MVP inmediatas; alinea con arquitectura sin PostHog; stdout en Railway sigue como red operativa.

---

## 4. Propuestas de cambio detalladas

### 4.1 PRD analítica (`docs/prd-analytics.md`)

**§2 — Principio**

- OLD: «No se añade infraestructura externa en el MVP»
- NEW: «Persistencia en Postgres (misma instancia Supabase); sin herramientas analíticas externas en el MVP»

**§3 — Alcance incluido**

- Añadir: tabla `analytics_events` y dual-write post-commit.

**§3.1 — Criterios de éxito**

- **SC-05 (revisado):** Railway retención ≥30 días como copia operativa (stdout).
- **SC-07 (nuevo):** Cada `emitEvent` inserta fila en `analytics_events` tras commit; fallo de insert no revierte negocio.

**§8 — Retención**

| Fase | Destino |
|------|---------|
| MVP | **Postgres `analytics_events`** (primario) + stdout Railway (secundario) |
| Post-MVP | Export/archivo opcional a Storage; PostHog a evaluar |

### 4.2 Arquitectura

- Nueva tabla §3.9 `analytics_events`
- Índices en §4
- Regla loggers: dual-write
- §12.9: nota de persistencia

### 4.3 Historia 7-7

Ver `_bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-persistencia-eventos-analytics-postgres-plan.md`.

---

## 5. Handoff de implementación

| Rol | Responsabilidad |
|-----|-----------------|
| **Dev** (`bmad-dev-story` 7-7) | Migración, repositorio, `emitEvent`, tests, env |
| **Ops** | Aplicar migración en Supabase prod/staging |
| **PO** | Verificar SC-07 en checklist pre-lanzamiento |

### Criterios de éxito

1. Migración `014` aplicada en todos los entornos.
2. Smoke: login/register → fila en `analytics_events` + línea JSON stdout.
3. `npm test` y `npm run build` verdes.
4. SC-05 y SC-07 documentados y verificados.

### Siguiente paso

Ejecutar **`bmad-dev-story`** con la historia `7-7-persistencia-eventos-analytics-postgres.md` en ventana nueva.

---

## Checklist Correct Course (resumen)

| Sección | Estado |
|---------|--------|
| 1 Trigger | [x] Pre-lanzamiento MVP; opción A aprobada |
| 2 Epic impact | [x] Épica 7 reabierta con 7-7 |
| 3 Artifacts | [x] PRD, architecture, epics, sprint-status |
| 4 Path forward | [x] Direct Adjustment |
| 5 Proposal | [x] Este documento |
| 6 Approval | [x] Usuario confirmó «si, opción A» |
| 6.4 sprint-status | [x] Actualizado |
