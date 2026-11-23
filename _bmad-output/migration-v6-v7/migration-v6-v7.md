---
type: migration
title: Migración v6 a v7 de backend
status: done
created: 2026-10-25
---

# Plan: initiative-backend

Migración «Move v6 planning and implementation artifacts into the v7 initiative layout», de la versión 6 a la 7. Los archivos ya se movieron el 2026-10-25.

## Respuestas

- Las carpetas de origen son las de abajo. No hay artefactos en otro sitio.
- El almacén se queda en este repositorio. No hay repositorio propio ni workspace.
- Las specs sin número de épica ni de historia pasan a `backlog/` como trabajo suelto.
- Ninguna historia del sprint está `in-progress` ni `review`. No hace falta cerrarlas en v6 antes de migrar. Las épicas que el sprint deja en `in-progress` conservan ese estado aunque sus historias estén `done`.
- Las historias sin empezar se pliegan en su entrada. Las historias numeradas están `done`, así que cada una conserva su plan. La spec `ready-for-dev` sí se pliega.

## Origen y copia

- `core.output_folder`: `_bmad-output`
- `modules.bmm.planning_artifacts`: `_bmad-output/planning-artifacts`
- `modules.bmm.implementation_artifacts`: `_bmad-output/implementation-artifacts`
- Esas dos claves se leyeron de `.v6-v7-migration-backup-20261025-0011/_bmad/config.toml`, porque el cleanup de v6 ya las quitó del config vivo.
- El backup ya contiene `_bmad/` y una copia completa de `_bmad-output`, con un `.gitignore` de `*`. No se commitea.
- Los archivos están bajo git. Cada movimiento posterior será `git mv`. No hay push. Los commits de cada paso quedan para después de aprobar este plan.

## Qué se mueve

`planning-artifacts/` pasa a ser `initiative-backend/`. El nombre sale de `core.project_name`.

| Origen | Destino |
|---|---|
| `planning-artifacts/epics.md` | `initiative-backend/archive-v6/epics.md` después de escribir el árbol |
| `implementation-artifacts/sprint-status.yaml` | `initiative-backend/archive-v6/sprint-status.yaml` |
| `planning-artifacts/sprint-change-proposal-2026-05-24-DLT-004.md` | `initiative-backend/sprint-change-proposal-2026-05-24-DLT-004.md` |
| `planning-artifacts/sprint-change-proposal-2026-05-24.md` | `initiative-backend/sprint-change-proposal-2026-05-24.md` |
| `planning-artifacts/sprint-change-proposal-2026-05-26-branded-emails.md` | `initiative-backend/sprint-change-proposal-2026-05-26-branded-emails.md` |
| `planning-artifacts/sprint-change-proposal-2026-05-26-email-verification.md` | `initiative-backend/sprint-change-proposal-2026-05-26-email-verification.md` |
| `planning-artifacts/sprint-change-proposal-2026-05-26.md` | `initiative-backend/sprint-change-proposal-2026-05-26.md` |
| `planning-artifacts/sprint-change-proposal-2026-05-29-item-digest-EVT014.md` | `initiative-backend/sprint-change-proposal-2026-05-29-item-digest-EVT014.md` |
| `planning-artifacts/sprint-change-proposal-2026-05-29-ranking-rfc-v1.md` | `initiative-backend/sprint-change-proposal-2026-05-29-ranking-rfc-v1.md` |
| `planning-artifacts/sprint-change-proposal-2026-05-31.md` | `initiative-backend/sprint-change-proposal-2026-05-31.md` |
| `planning-artifacts/sprint-change-proposal-2026-06-08-admin-panel.md` | `initiative-backend/sprint-change-proposal-2026-06-08-admin-panel.md` |
| `planning-artifacts/sprint-change-proposal-2026-06-09-reports.md` | `initiative-backend/sprint-change-proposal-2026-06-09-reports.md` |
| `planning-artifacts/ux-design-directions-email.html` | `initiative-backend/ux-design-specification/ux-design-directions-email.html (compañero del UX)` |
| `planning-artifacts/ux-design-specification.md` | `initiative-backend/ux-design-specification/ux-design-specification.md` |
| `implementation-artifacts/deferred-work.md` | `initiative-backend/deferred-work.md` |

## Árbol de tickets

Plantilla: `bmad-agent-po/assets/ticket-template.md`. Sobre: `initiative-backend/initiative-backend.md`. No hay PRD dentro del almacén. Description y Outcome salen de la visión de `epics.md`. `sources` apunta a los `inputDocuments` que ya cita; siguen en `docs/`, fuera del almacén.

Cada historia `done` conserva su archivo como `story-<slug>-plan.md` junto al `tickets.toml` de su épica, con tipo de build `feature` salvo que el archivo diga otra cosa, `status: done` y `ticket` igual al id. No se escriben archivos de historia de épica. `covers` de la épica son los FR de la fila. `covers` de la entrada son los FR que cita esa historia; si no cita ninguno, no hereda el bloque entero.

### Épica 1: Autenticación y Cuenta de Usuario

- Carpeta: `initiative-backend/tickets/epic-autenticacion-y-cuenta-de-usuario/`
- Estado de la épica: `done`
- FR: FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR35
- Retrospectiva en el sprint: `done`.

| id | título | estado | v6_key | plan |
|---|---|---|---|---|
| 1 | Inicialización del proyecto e infraestructura base | done | `1-1-inicializacion-del-proyecto-e-infraestructura-base` | `story-inicializacion-del-proyecto-e-infraestructura-base-plan.md` |
| 2 | Registro de usuario | done | `1-2-registro-de-usuario` | `story-registro-de-usuario-plan.md` |
| 3 | Login de usuario | done | `1-3-login-de-usuario` | `story-login-de-usuario-plan.md` |
| 4 | Middleware de autenticación con validación de jwt_version | done | `1-4-middleware-de-autenticacion-con-validacion-de-jwt-version` | `story-middleware-de-autenticacion-con-validacion-de-jwt-version-plan.md` |
| 5 | Recuperación y reset de contraseña | done | `1-5-recuperacion-y-reset-de-contrasena` | `story-recuperacion-y-reset-de-contrasena-plan.md` |

### Épica 2: Publicación y Gestión de Objetos

- Carpeta: `initiative-backend/tickets/epic-publicacion-y-gestion-de-objetos/`
- Estado de la épica: `done`
- FR: FR8, FR9, FR10, FR11 (base), FR13, FR14, FR24, FR25, FR34
- Retrospectiva en el sprint: `done`.

| id | título | estado | v6_key | plan |
|---|---|---|---|---|
| 1 | Publicar objeto con imágenes | done | `2-1-publicar-objeto-con-imagenes` | `story-publicar-objeto-con-imagenes-plan.md` |
| 2 | Listar objetos disponibles en radio geográfico | done | `2-2-listar-objetos-disponibles-en-radio-geografico` | `story-listar-objetos-disponibles-en-radio-geografico-plan.md` |
| 3 | Ver detalle de objeto | done | `2-3-ver-detalle-de-objeto` | `story-ver-detalle-de-objeto-plan.md` |
| 4 | Cancelar objeto (sin sesión activa) | done | `2-4-cancelar-objeto-sin-sesion-activa` | `story-cancelar-objeto-sin-sesion-activa-plan.md` |
| 5 | Pausar y reanudar solicitudes de un objeto | done | `2-5-pausar-y-reanudar-solicitudes-de-un-objeto` | `story-pausar-y-reanudar-solicitudes-de-un-objeto-plan.md` |
| 6 | Degradación automática de objetos inactivos | done | `2-6-degradacion-automatica-de-objetos-inactivos` | `story-degradacion-automatica-de-objetos-inactivos-plan.md` |
| 7 | Purga automática de imágenes y cola de borrado en Storage | done | `2-7-purga-automatica-de-imagenes-y-cola-de-borrado-en-storage` | `story-purga-automatica-de-imagenes-y-cola-de-borrado-en-storage-plan.md` |

### Épica 3: Solicitudes y Ranking de Candidatos

- Carpeta: `initiative-backend/tickets/epic-solicitudes-y-ranking-de-candidatos/`
- Estado de la épica: `done`
- FR: FR12, FR15, FR16, FR17, FR18, FR27
- Retrospectiva en el sprint: `done`.

| id | título | estado | v6_key | plan |
|---|---|---|---|---|
| 1 | Solicitar un objeto | done | `3-1-solicitar-un-objeto` | `story-solicitar-un-objeto-plan.md` |
| 2 | Ver candidatos rankeados para un objeto | done | `3-2-ver-candidatos-rankeados-para-un-objeto` | `story-ver-candidatos-rankeados-para-un-objeto-plan.md` |
| 3 | Incremento automático de cycles_at_limit | done | `3-3-incremento-automatico-de-cycles-at-limit` | `story-incremento-automatico-de-cycles-at-limit-plan.md` |

### Épica 4: Selección de Receptor y Sesión de Entrega

- Carpeta: `initiative-backend/tickets/epic-seleccion-de-receptor-y-sesion-de-entrega/`
- Estado de la épica: `done`
- FR: FR19, FR20, FR21, FR22, FR23, FR26, FR11 (extensión)
- Retrospectiva en el sprint: `done`.

| id | título | estado | v6_key | plan |
|---|---|---|---|---|
| 1 | Seleccionar receptor para un objeto | done | `4-1-seleccionar-receptor-para-un-objeto` | `story-seleccionar-receptor-para-un-objeto-plan.md` |
| 2 | Ver detalle de sesión de entrega | done | `4-2-ver-detalle-de-sesion-de-entrega` | `story-ver-detalle-de-sesion-de-entrega-plan.md` |
| 3 | Confirmar entrega completada | done | `4-3-confirmar-entrega-completada` | `story-confirmar-entrega-completada-plan.md` |
| 4 | Cancelar sesión de entrega y declarar no-show | done | `4-4-cancelar-sesion-de-entrega-y-declarar-no-show` | `story-cancelar-sesion-de-entrega-y-declarar-no-show-plan.md` |
| 5 | Cancelar objeto con sesión activa | done | `4-5-cancelar-objeto-con-sesion-activa` | `story-cancelar-objeto-con-sesion-activa-plan.md` |
| 6 | Expiración automática de sesiones y purga de canal de contacto | done | `4-6-expiracion-automatica-de-sesiones-y-purga-de-canal-de-contacto` | `story-expiracion-automatica-de-sesiones-y-purga-de-canal-de-contacto-plan.md` |

### Épica 5: Perfil y Actividad del Usuario

- Carpeta: `initiative-backend/tickets/epic-perfil-y-actividad-del-usuario/`
- Estado de la épica: `done`
- FR: FR28, FR29, FR30, FR31, FR32, FR33
- Retrospectiva en el sprint: `done`.

| id | título | estado | v6_key | plan |
|---|---|---|---|---|
| 1 | Ver perfil privado del usuario autenticado | done | `5-1-ver-perfil-privado-del-usuario-autenticado` | `story-ver-perfil-privado-del-usuario-autenticado-plan.md` |
| 2 | Ver historial de reputación | done | `5-2-ver-historial-de-reputacion` | `story-ver-historial-de-reputacion-plan.md` |
| 3 | Ver sesiones de entrega propias | done | `5-3-ver-sesiones-de-entrega-propias` | `story-ver-sesiones-de-entrega-propias-plan.md` |
| 4 | Ver objetos publicados propios | done | `5-4-ver-objetos-publicados-propios` | `story-ver-objetos-publicados-propios-plan.md` |
| 5 | Ver solicitudes realizadas propias | done | `5-5-ver-solicitudes-realizadas-propias` | `story-ver-solicitudes-realizadas-propias-plan.md` |
| 6 | Ver perfil público de un usuario | done | `5-6-ver-perfil-publico-de-un-usuario` | `story-ver-perfil-publico-de-un-usuario-plan.md` |

### Épica 6: Ampliación del Modelo de Usuario (DLT-003)

- Carpeta: `initiative-backend/tickets/epic-ampliacion-del-modelo-de-usuario-dlt-003/`
- Estado de la épica: `done`
- FR: FR36, FR37, FR38, FR39, FR40
- Retrospectiva en el sprint: `done`.

| id | título | estado | v6_key | plan |
|---|---|---|---|---|
| 1 | Migración SQL y entidad User (DLT-003) | done | `6-1-migracion-sql-y-entidad-user-dlt-003` | `story-migracion-sql-y-entidad-user-dlt-003-plan.md` |
| 2 | Registro, login y middleware is_active | done | `6-2-registro-login-y-middleware-is-active` | `story-registro-login-y-middleware-is-active-plan.md` |
| 3 | DTOs de perfil privado y público | done | `6-3-dtos-perfil-privado-y-publico` | `story-dtos-perfil-privado-y-publico-plan.md` |
| 4 | PATCH /users/me — actualización de perfil | done | `6-4-patch-users-me-actualizacion-perfil` | `story-patch-users-me-actualizacion-perfil-plan.md` |
| 5 | Emails con saludo personalizado firstName | done | `6-5-emails-saludo-personalizado-firstname` | `story-emails-saludo-personalizado-firstname-plan.md` |

### Épica 7: Analítica e Instrumentación (DLT-004)

- Carpeta: `initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/`
- Estado de la épica: `done`
- FR: FR41, FR42 (y extensión de FR8 en publicación)
- Retrospectiva en el sprint: `done`.

| id | título | estado | v6_key | plan |
|---|---|---|---|---|
| 1 | Migración SQL y dominio items (DLT-004) | done | `7-1-migracion-sql-y-dominio-items-dlt-004` | `story-migracion-sql-y-dominio-items-dlt-004-plan.md` |
| 2 | Loggers y analytics.service | done | `7-2-loggers-y-analytics-service` | `story-loggers-y-analytics-service-plan.md` |
| 3 | API publicar ítem — category y weightRange | done | `7-3-api-publicar-item-category-weight-range` | `story-api-publicar-item-category-weight-range-plan.md` |
| 4 | Instrumentación autenticación (AE-001, AE-002) | done | `7-4-instrumentacion-autenticacion-ae-001-ae-002` | `story-instrumentacion-autenticacion-ae-001-ae-002-plan.md` |
| 5 | Instrumentación objetos y solicitudes | done | `7-5-instrumentacion-objetos-y-solicitudes` | `story-instrumentacion-objetos-y-solicitudes-plan.md` |
| 6 | Instrumentación entrega y reputación | done | `7-6-instrumentacion-entrega-y-reputacion` | `story-instrumentacion-entrega-y-reputacion-plan.md` |
| 7 | Persistencia de eventos en Postgres (Correct Course 2026-05-26) | done | `7-7-persistencia-eventos-analytics-postgres` | `story-persistencia-eventos-analytics-postgres-plan.md` |

### Épica 8: Verificación de email

- Carpeta: `initiative-backend/tickets/epic-verificacion-de-email/`
- Estado de la épica: `done`
- FR: FR43, FR44, FR45, FR46 (y extensión de FR1, FR3, FR7, FR35)
- Retrospectiva en el sprint: `optional`.

| id | título | estado | v6_key | plan |
|---|---|---|---|---|
| 1 | Migración SQL y entidad User | done | `8-1-migracion-sql-verificacion-email` | `story-migracion-sql-verificacion-email-plan.md` |
| 2 | Registro con token y email EVT-014 | done | `8-2-registro-token-y-email-tpl-009` | `story-registro-token-y-email-tpl-009-plan.md` |
| 3 | Middleware emailVerified | done | `8-3-middleware-email-verified` | `story-middleware-email-verified-plan.md` |
| 4 | GET /auth/verify-email | done | `8-4-get-auth-verify-email` | `story-get-auth-verify-email-plan.md` |
| 5 | POST /auth/resend-verification | done | `8-5-post-auth-resend-verification` | `story-post-auth-resend-verification-plan.md` |
| 6 | Plantilla TPL-009 y email-flow v1.2 | done | `8-6-plantilla-tpl-009-y-email-flow` | `story-plantilla-tpl-009-y-email-flow-plan.md` |

### Épica 9: Emails transaccionales con marca

- Carpeta: `initiative-backend/tickets/epic-emails-transaccionales-con-marca/`
- Estado de la épica: `done`
- FR: extensión transversal de notificaciones por email (FR35, FR43 y demás EVT con TPL)
- Retrospectiva en el sprint: `optional`.

| id | título | estado | v6_key | plan |
|---|---|---|---|---|
| 1 | Layout shell y tokens de diseño | done | `9-1-layout-shell-y-tokens-email` | `story-layout-shell-y-tokens-email-plan.md` |
| 2 | Tier 1 — TPL-009, TPL-002, TPL-008 | done | `9-2-tier-1-tpl-009-002-008` | `story-tier-1-tpl-009-002-008-plan.md` |
| 3 | Tier 2 — TPL-003, TPL-004, TPL-005, TPL-006 | done | `9-3-tier-2-tpl-003-004-005-006` | `story-tier-2-tpl-003-004-005-006-plan.md` |
| 4 | Tier 3 — TPL-007 y catálogo TPL-001 | done | `9-4-tier-3-tpl-007-y-catalogo-001` | `story-tier-3-tpl-007-y-catalogo-001-plan.md` |
| 5 | Limpieza — no unstyled email in prod | done | `9-5-limpieza-no-unstyled-email` | `story-limpieza-no-unstyled-email-plan.md` |

### Épica 10: Digest de proximidad y jobs HTTP

- Carpeta: `initiative-backend/tickets/epic-digest-de-proximidad-y-jobs-http/`
- Estado de la épica: `done`
- FR: FR47
- Retrospectiva en el sprint: `optional`.

| id | título | estado | v6_key | plan |
|---|---|---|---|---|
| 1 | Digest horario — migración, use case, TPL-010 y endpoint cron | done | `10-1-digest-horario-objetos-cercanos-email` | `story-digest-horario-objetos-cercanos-email-plan.md` |

### Épica 11: Alineación ranking y reputación v1.0 (RFC-RANK)

- Carpeta: `initiative-backend/tickets/epic-alineacion-ranking-y-reputacion-v1-0-rfc-rank/`
- Estado de la épica: `done`
- FR: FR18, FR21, FR22 (definición v1.0), FR48
- Retrospectiva en el sprint: `optional`.

| id | título | estado | v6_key | plan |
|---|---|---|---|---|
| 1 | Migración `role` en `reputation_events` | done | `11-1-migracion-role-reputation-events` | `story-migracion-role-reputation-events-plan.md` |
| 2 | Reputación asimétrica en confirm y cancel | done | `11-2-reputacion-asimetrica-confirm-cancel` | `story-reputacion-asimetrica-confirm-cancel-plan.md` |
| 3 | SQL ranking Tier 1 / Tier 2 y requestCount | done | `11-3-ranking-tier-acaparador-sql` | `story-ranking-tier-acaparador-sql-plan.md` |
| 4 | Tests matriz QA ranking y reputación | done | `11-4-tests-ranking-reputacion-qa` | `story-tests-ranking-reputacion-qa-plan.md` |
| 5 | Sincronizar documentación ranking v1.0 | done | `11-5-sincronizar-documentacion-ranking` | `story-sincronizar-documentacion-ranking-plan.md` |

### Épica 12: Canal de contacto del candidato (Correct Course 2026-05-31)

- Carpeta: `initiative-backend/tickets/epic-canal-de-contacto-del-candidato-correct-course-2026-05-31/`
- Estado de la épica: `done`
- FR: FR49, FR50, FR51, FR52 (extiende FR12, FR19, FR20, FR26)
- Retrospectiva en el sprint: `optional`.

| id | título | estado | v6_key | plan |
|---|---|---|---|---|
| 1 | Schema y jobs de purga | done | `12-1-schema-y-jobs-purga-canal-candidato` | `story-schema-y-jobs-purga-canal-candidato-plan.md` |
| 2 | API postulación, selección y sesión | done | `12-2-api-postulacion-seleccion-sesion-candidato` | `story-api-postulacion-seleccion-sesion-candidato-plan.md` |
| 3 | Sincronizar documentación | done | `12-3-sincronizar-documentacion-canal-candidato` | `story-sincronizar-documentacion-canal-candidato-plan.md` |

### Épica 13: Panel Administrativo Backend (PRD-ADM-BE-01)

- Carpeta: `initiative-backend/tickets/epic-panel-administrativo-backend-prd-adm-be-01/`
- Estado de la épica: `in-progress`
- FR: FR53, FR54, FR55, FR56, FR58 (sin bloque reports), FR59, FR60
- Retrospectiva en el sprint: `optional`.

| id | título | estado | v6_key | plan |
|---|---|---|---|---|
| 1 | Modelo de datos del panel administrativo | done | `13-1-modelo-de-datos-panel-administrativo` | `story-modelo-de-datos-panel-administrativo-plan.md` |
| 2 | Autenticación de administrador | done | `13-2-autenticacion-de-administrador` | `story-autenticacion-de-administrador-plan.md` |
| 3 | Gestión de usuarios por el administrador | done | `13-3-gestion-de-usuarios-por-el-administrador` | `story-gestion-de-usuarios-por-el-administrador-plan.md` |
| 4 | Gestión de objetos por el administrador | done | `13-4-gestion-de-objetos-por-el-administrador` | `story-gestion-de-objetos-por-el-administrador-plan.md` |
| 5 | Gestión de sesiones de entrega por el administrador | done | `13-5-gestion-de-sesiones-de-entrega-por-el-administrador` | `story-gestion-de-sesiones-de-entrega-por-el-administrador-plan.md` |
| 6 | Métricas operativas y estado del sistema | done | `13-6-metricas-operativas-y-estado-del-sistema` | `story-metricas-operativas-y-estado-del-sistema-plan.md` |

### Épica 14: Sistema de Reportes (PRD-REP-BE-01) — Correct Course 2026-06-09

- Carpeta: `initiative-backend/tickets/epic-sistema-de-reportes-prd-rep-be-01-correct-course-2026-06-09/`
- Estado de la épica: `in-progress`
- FR: FR57, FR58 (bloque reports), FR61, FR62, FR63, FR64, FR65, FR66
- Retrospectiva en el sprint: `optional`.

| id | título | estado | v6_key | plan |
|---|---|---|---|---|
| 1 | Migración SQL — tabla `reports` | done | `14-1-migracion-sql-tabla-reports` | `story-migracion-sql-tabla-reports-plan.md` |
| 2 | Dominio y repositorio de reportes | done | `14-2-dominio-y-repositorio-de-reportes` | `story-dominio-y-repositorio-de-reportes-plan.md` |
| 3 | Endpoint público POST /api/reports | done | `14-3-endpoint-publico-post-api-reports` | `story-endpoint-publico-post-api-reports-plan.md` |
| 4 | Templates de email del módulo de reportes | done | `14-4-templates-email-modulo-reportes` | `story-templates-email-modulo-reportes-plan.md` |
| 5 | Cola de moderación admin (GET endpoints) | done | `14-5-cola-moderacion-admin-get-endpoints` | `story-cola-moderacion-admin-get-endpoints-plan.md` |
| 6 | Resolución de reportes admin (POST endpoint) | done | `14-6-resolucion-reportes-admin-post-endpoint` | `story-resolucion-reportes-admin-post-endpoint-plan.md` |
| 7 | Extensión de métricas, job de anonimización y analítica | done | `14-7-extension-metricas-anonimizacion-analitica` | `story-extension-metricas-anonimizacion-analitica-plan.md` |

### Épica 15: Descubrimiento Público y SEO

- Carpeta: `initiative-backend/tickets/epic-descubrimiento-publico-y-seo/`
- Estado de la épica: `in-progress`
- FR: no listados en el bloque de la lista
- Retrospectiva en el sprint: `optional`.

| id | título | estado | v6_key | plan |
|---|---|---|---|---|
| 1 | Infraestructura SEO y Endpoints Públicos | done | `15-1-infraestructura-seo-y-endpoints-publicos` | `story-infraestructura-seo-y-endpoints-publicos-plan.md` |

`13-1-infraestructura-seo-y-endpoints-publicos.md` es el registro de la historia 15.1. La clave del sprint es `15-1-infraestructura-seo-y-endpoints-publicos`. No es un segundo registro de la 13.1.

`13-2-code-review-diff.md` es un segundo registro de la historia 13.2. El plan vivo es el de la clave `13-2-autenticacion-de-administrador` si su commit es el más reciente; si no, lo es el diff. El otro pasa a `archive-v6/` y sus hallazgos quedan en `## Prior builds` del plan.

Informes de retrospectiva:

- `epic-7-retro-2026-05-25.md` se combina en `tickets/epic-analitica-e-instrumentacion-dlt-004/epic-analitica-e-instrumentacion-dlt-004-retrospective.md`. El sprint marca `epic-7-retrospective: done`, así que la épica 7 lleva una línea `Retrospective:` en Notes.

## Backlog

`done` e `in-review` (`review`) llevan plan al lado. `ready-for-dev` se pliega en la entrada y el archivo pasa a `archive-v6/` sin plan.

| archivo | estado v6 | destino |
|---|---|---|
| `spec-admin-system-health-expanded.md` | done | `backlog/story-admin-system-health-expanded.md` y `backlog/feature-admin-system-health-expanded-plan.md` (`status: done`) |
| `spec-backup-restore-db-supabase-bk.md` | review | `backlog/story-backup-restore-db-supabase-bk.md` y `backlog/feature-backup-restore-db-supabase-bk-plan.md` (`status: in-review`) |
| `spec-email-fixes-tpl-003-tpl-006.md` | done | `backlog/story-email-fixes-tpl-003-tpl-006.md` y `backlog/feature-email-fixes-tpl-003-tpl-006-plan.md` (`status: done`) |
| `spec-email-language-localization.md` | done | `backlog/story-email-language-localization.md` y `backlog/feature-email-language-localization-plan.md` (`status: done`) |
| `spec-fix-admin-system-health-jobname-column.md` | done | `backlog/story-fix-admin-system-health-jobname-column.md` y `backlog/bugfix-fix-admin-system-health-jobname-column-plan.md` (`status: done`) |
| `spec-fix-digest-remove-time-window.md` | done | `backlog/story-fix-digest-remove-time-window.md` y `backlog/bugfix-fix-digest-remove-time-window-plan.md` (`status: done`) |
| `spec-fix-email-button-routes.md` | done | `backlog/story-fix-email-button-routes.md` y `backlog/bugfix-fix-email-button-routes-plan.md` (`status: done`) |
| `spec-fix-email-condition-labels.md` | done | `backlog/story-fix-email-condition-labels.md` y `backlog/bugfix-fix-email-condition-labels-plan.md` (`status: done`) |
| `spec-fix-jobs-route-get-support.md` | done | `backlog/story-fix-jobs-route-get-support.md` y `backlog/bugfix-fix-jobs-route-get-support-plan.md` (`status: done`) |
| `spec-fix-migration-018-item-requests-prod.md` | done | `backlog/story-fix-migration-018-item-requests-prod.md` y `backlog/bugfix-fix-migration-018-item-requests-prod-plan.md` (`status: done`) |
| `spec-fix-reports-reason-check.md` | done | `backlog/story-fix-reports-reason-check.md` y `backlog/bugfix-fix-reports-reason-check-plan.md` (`status: done`) |
| `spec-integrate-email-i18n-reports-admin.md` | done | `backlog/story-integrate-email-i18n-reports-admin.md` y `backlog/feature-integrate-email-i18n-reports-admin-plan.md` (`status: done`) |
| `spec-nearby-items-hourly-digest-email.md` | ready-for-dev | `backlog/story-nearby-items-hourly-digest-email.md` (plegada, sin plan) y el archivo a `archive-v6/` |
| `spec-ranking-caso-qa-24.md` | done | `backlog/story-ranking-caso-qa-24.md` y `backlog/feature-ranking-caso-qa-24-plan.md` (`status: done`) |
| `spec-supabase-rls.md` | done | `backlog/story-supabase-rls.md` y `backlog/feature-supabase-rls-plan.md` (`status: done`) |
| `spec-validar-cache-endpoints.md` | done | `backlog/story-validar-cache-endpoints.md` y `backlog/feature-validar-cache-endpoints-plan.md` (`status: done`) |

`spec-nearby-items-hourly-digest-email.md` se solapa con la historia 10.1, ya `done` en la épica 10. Aun así va al backlog. Si al aprobar prefieres no duplicarla, se deja fuera.

## Se queda donde está

- `_bmad-output/project-context.md`: lo ofrece absorber `bmad-project-context`.
- `implementation-artifacts/cache-endpoint-matrix.md`: la migración no lo reconoce. Se queda; moverlo es decisión tuya.
- `implementation-artifacts/triage-findings.json`: la migración no lo reconoce. Se queda; moverlo es decisión tuya.
- No hay `party-mode/`, `brainstorming/`, `specs/` ni `forge/`.
- `backlog/` y `archive/` se crean. Si quedan vacíos, llevan `.gitkeep`.
- El sprint no tiene `action_items`.

## Rutas fuera del almacén

Estas referencias no se editan:

- `.claude/settings.local.json:23`
- `.claude/settings.local.json:25`
- `.claude/settings.local.json:27`
- `docs/email-template-design.md:91`
- `docs/email-template-design.md:143`
- `docs/ranking-system.md:466`
- `.cursor/agents/bmad-create-epic-stories.md:30`
- `.cursor/agents/bmad-create-epic-stories.md:31`
- `.cursor/agents/bmad-create-epic-stories.md:32`
- `.cursor/agents/bmad-create-epic-stories.md:43`
- `.cursor/agents/bmad-create-epic-stories.md:59`
- `.cursor/agents/bmad-create-epic-stories.md:60`
- `.cursor/agents/bmad-create-epic-stories.md:61`
- `.cursor/agents/bmad-sprint-orchestrator.md:20`
- `.cursor/agents/bmad-sprint-orchestrator.md:21`
- `.cursor/agents/bmad-sprint-orchestrator.md:22`
- `.cursor/agents/bmad-sprint-orchestrator.md:97`
- `.cursor/agents/bmad-sprint-orchestrator.md:98`
- `.cursor/agents/bmad-sprint-orchestrator.md:99`
- `.cursor/commands/bmad-next.md:7`

## Configuración

- `_bmad/custom/config.user.toml`: `active_initiative = "initiative-backend"` bajo `[core]`.
- No se cambia `output_folder`.
- No se reescriben `planning_artifacts` ni `implementation_artifacts`: el cleanup de v6 ya las quitó de `_bmad/config.toml`. `document_output_language = Spanish` también salió de ese archivo y sigue en el backup.

## Checklist

Resultado del 2026-10-25. `tickets.py status _bmad-output/initiative-backend` sale 0, sin `problems`, con 73 historias `done`. El backlog se cuenta aparte: 15 entradas, 14 con plan y `spec-nearby-items-hourly-digest-email` plegada.

1. Cumple. `planning-artifacts/` ya no existe. En `implementation-artifacts/` solo quedan `cache-endpoint-matrix.md` y `triage-findings.json`, a propósito. `project-context.md` sigue en la raíz del almacén.
2. Cumple. `ux-design-specification/` conserva el markdown y el HTML, con el markdown como archivo principal. Existen `initiative-backend/`, `backlog/` y `archive/`. `archive/` solo tiene `.gitkeep`.
3. Cumple. Las propuestas de sprint fechadas conservan su nombre. El segundo registro de la 13.2, `13-2-code-review-diff.md`, está en `archive-v6/` y sus hallazgos en `## Prior builds` de `story-autenticacion-de-administrador-plan.md`.
4. Cumple. 73 claves de historia del sprint, sin contar épicas ni retrospectivas, y 73 entradas. Backlog aparte, como arriba.
5. Cumple. Cada historia numerada es una entrada y un plan `story-<slug>-plan.md`. No hay archivos de historia de épica. `find _bmad-output/initiative-backend 1.3` devuelve `story-login-de-usuario-plan.md`. En backlog, `find` une por el stem; la spec plegada no tiene plan y el original está en `archive-v6/`.
6. Cumple. Los planes de historia son `type: feature` y `status: done`. Los `spec-fix-*` son `bugfix`, no `feature`: la tabla de arriba ya lo refleja. `spec-backup-restore-db-supabase-bk` queda `in-review`. Nada pasó a `built`. Solo tres planes de épica traían baseline y lo conservan: `story-cola-moderacion-admin-get-endpoints-plan.md`, `story-extension-metricas-anonimizacion-analitica-plan.md` y `story-resolucion-reportes-admin-post-endpoint-plan.md`. Los otros 70 archivos de historia no traían `baseline_commit` ni `baseline_revision`. Nueve planes del backlog sí. La retrospectiva de la épica 7 está en su carpeta, con la línea `Retrospective:` en Notes, sin tipo de ticket.
7. Cumple. 62 requisitos en el sobre. Cada `covers` de épica está en el sobre, cada `covers` de entrada está en su épica, y los 62 tienen al menos una entrada. No había PRD; la fuente es el mapa de cobertura de `epics.md`.
8. Cumple. No había carpetas `spec-<slug>/`. No quedan ids `CAP-` fuera de lo archivado.
9. Cumple. Las rutas vivas de `planning-artifacts/` e `implementation-artifacts/` apuntan al archivo en su sitio nuevo. `cache-endpoint-matrix.md` sigue citado en su ruta original porque el archivo se quedó. `archive-v6/`, el plan y `project-context.md` no se reescribieron. Las referencias fuera del almacén, listadas arriba, tampoco.
10. Cumple. `_bmad/custom/config.user.toml` tiene `active_initiative = "initiative-backend"`. `core.output_folder` sigue en `{project-root}/_bmad-output`. Ese archivo de usuario no se commitea.
11. Cumple. El almacén sigue en este repositorio y ningún archivo lo trackea otro. No hay workspace nuevo, así que no aplica un `bmad status` allí.
12. Cumple. La copia está en `.v6-v7-migration-backup-20261025-0011/`, con `_bmad/` y `_bmad-output/`, y un `.gitignore` de `*`. No entra en el commit.

La migración 2 no aplica: ningún `tickets.toml`, épica, hoja o plan quedó directamente en la carpeta de la iniciativa o de la épica.

