---
title: "Gestión de sesiones de entrega por el administrador"
type: feature
ticket: 5
status: done
created: 2026-10-25
---

# Story 13.5: Gestión de sesiones de entrega por el administrador

**Status:** done

---

## Story

Como administrador autenticado,
quiero listar sesiones de entrega, ver su detalle (incluyendo canal de contacto con registro de auditoría) y forzar la expiración de sesiones activas atascadas,
para resolver problemas operativos en el flujo de entregas.

---

## Acceptance Criteria (BDD)

### AC1: Listar sesiones con filtros

**Dado** que envío `GET /api/admin/sessions` con autenticación admin válida
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ sessions: [...], pagination: { total, page, limit, totalPages } }`
**Y** cada sesión incluye: `id, status, deadlineAt, createdAt, completedAt, contactPurged, noShowDeclared, item: { id, title }, donor: { id, firstName, lastName, email }, receiver: { id, firstName, lastName, email }`

**Dado** que envío `GET /api/admin/sessions?status=active`
**Cuando** el servidor procesa la petición
**Entonces** solo se retornan sesiones con `status = 'active'`

**Dado** que envío `GET /api/admin/sessions?overdue=true`
**Cuando** el servidor procesa la petición
**Entonces** solo se retornan sesiones `active` con `deadline_at < NOW()`

**Dado** que envío `GET /api/admin/sessions?userId=<uuid>`
**Cuando** el servidor procesa la petición
**Entonces** solo se retornan sesiones donde `donor_id = <uuid> OR receiver_id = <uuid>`

**Dado** que envío `GET /api/admin/sessions?page=2&limit=20`
**Cuando** el servidor procesa la petición
**Entonces** responde la segunda página con hasta 20 resultados

**Dado** que envío `GET /api/admin/sessions?limit=200`
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request` (límite máximo 100)

### AC2: Detalle de sesión (con registro de auditoría si contact_channel visible)

**Dado** que envío `GET /api/admin/sessions/:id` con UUID válido y autenticación admin, sobre sesión con `contact_purged = FALSE`
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con detalle completo incluyendo:
- `id, status, deadlineAt, createdAt, completedAt, donorConfirmed, noShowDeclared`
- `contactChannel: "string"` (valor real, no purgado)
- `contactPurged: false`
- `item: { id, title, category }`
- `donor: { id, firstName, lastName, email }`
- `receiver: { id, firstName, lastName, email }`
**Y** se registra `data.contact_channel_accessed` en `admin_audit_log` con `entity_type = 'delivery_session'` y `entity_id = sessionId`

**Dado** que envío `GET /api/admin/sessions/:id` sobre sesión con `contact_purged = TRUE`
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `contactChannel: null`
**Y** no se registra entrada en `admin_audit_log` (dato ya purgado, no hay acceso nuevo)

**Dado** que envío `GET /api/admin/sessions/:id` con UUID que no existe
**Cuando** el servidor procesa la petición
**Entonces** responde `404 Not Found`

**Dado** que envío `GET /api/admin/sessions/:id` con parámetro que no es UUID v4
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request`

### AC3: Forzar expiración de sesión activa (transacción atómica)

**Dado** que envío `POST /api/admin/sessions/:id/force-expire` (payload vacío) sobre sesión con `status = 'active'`
**Cuando** el servidor procesa la petición en transacción atómica
**Entonces** responde `200` con `{ message: "Sesión expirada. Objeto devuelto a estado activo." }`
**Y** `delivery_sessions.status = 'expired'`, `completed_at = NOW()`
**Y** `items.status = 'active'`, `items.reserved_at = NULL` (para el `item_id` de la sesión)
**Y** se registra `session.force_expired` en `admin_audit_log` con `payload_snapshot` conteniendo `{ status, deadline_at }`
**Y** no se envía TPL-004 (la expiración forzada es una acción administrativa, no una expiración natural)

**Dado** que envío `POST /api/admin/sessions/:id/force-expire` sobre sesión no activa (`completed`, `cancelled`, `expired`)
**Cuando** el servidor procesa la petición
**Entonces** responde `409 Conflict`

**Dado** que envío `POST /api/admin/sessions/:id/force-expire` sobre sesión que no existe
**Cuando** el servidor procesa la petición
**Entonces** responde `404 Not Found`

### AC4: Autorización — middleware requireAdminAuth

**Dado** que envío cualquier petición a `/api/admin/sessions/*` sin token admin
**Cuando** el middleware `requireAdminAuth` procesa la petición
**Entonces** responde `401 Unauthorized`

**Dado** que envío cualquier petición con token de usuario regular (firmado con `JWT_SECRET`)
**Cuando** el middleware `requireAdminAuth` procesa la petición
**Entonces** responde `401 Unauthorized`

### AC5: Auditoría transversal

**Dado** que ejecuto cualquier acción de gestión de sesiones (detail con contact_channel visible, force-expire)
**Cuando** la acción se completa exitosamente
**Entonces** se registra una entrada en `admin_audit_log` con:
- `admin_user_id` del admin que ejecuta la acción
- `action` correspondiente (`data.contact_channel_accessed` | `session.force_expired`)
- `entity_type = 'delivery_session'`
- `entity_id` de la sesión afectada
- `payload_snapshot` (estado previo para force-expire)
- `ip_address` extraída de `req.ip`

---

## Tasks / Subtasks

### 1. DTOs

- [x] Crear `src/application/dtos/admin/admin-session-list.dto.ts`
  - `AdminSessionListItem`: id, status, deadlineAt (Date), createdAt (Date), completedAt (Date | null), contactPurged (boolean), noShowDeclared (boolean), item ({ id, title }), donor ({ id, firstName, lastName, email }), receiver ({ id, firstName, lastName, email })
  - `AdminSessionListResponse`: sessions (AdminSessionListItem[]), pagination ({ total, page, limit, totalPages })
  - `AdminSessionListQuery`: status? ('active'|'completed'|'cancelled'|'expired'), overdue? (boolean), userId? (string uuid), page (number, default 1), limit (number, default 20, max 100)

- [x] Crear `src/application/dtos/admin/admin-session-detail.dto.ts`
  - `AdminSessionDetailResponse`: id, status, deadlineAt, createdAt, completedAt, donorConfirmed (boolean), noShowDeclared (boolean), contactChannel (string | null), contactPurged (boolean), item ({ id, title, category }), donor ({ id, firstName, lastName, email }), receiver ({ id, firstName, lastName, email })
  - `AdminSessionDetailQuery`: result + auditLogged (boolean, indica si se registró audit log)

- [x] Reutilizar `src/application/dtos/admin/admin-item-action.dto.ts` (ya existe con `{ message: string }`) para la respuesta de force-expire

### 2. Use Cases

- [x] Crear `src/application/use-cases/admin/sessions/admin-list-sessions.use-case.ts`
  - `AdminListSessionsUseCase` con dependencia: `IDeliverySessionRepository`
  - `execute(query: AdminSessionListQuery): Promise<AdminSessionListResponse>`
  - Implementar filtros combinados: status, overdue (deadline_at < NOW() + status = 'active'), userId (donor_id OR receiver_id)
  - Paginación con page/limit, offset calculado
  - JOIN con items, users (donor), users (receiver) para datos completos

- [x] Crear `src/application/use-cases/admin/sessions/admin-get-session-detail.use-case.ts`
  - `AdminGetSessionDetailUseCase` con dependencias: `IDeliverySessionRepository`, `IAdminAuditLogRepository`
  - `execute(adminUserId: string, sessionId: string, ipAddress: string): Promise<AdminSessionDetailResponse>`
  - Buscar sesión por ID con datos de item, donor, receiver
  - Si `session.contactPurged === false`: registrar `data.contact_channel_accessed` en audit log
  - Si `session.contactPurged === true`: no registrar audit log
  - Lanza `NotFoundException` si no existe

- [x] Crear `src/application/use-cases/admin/sessions/admin-force-expire-session.use-case.ts`
  - `AdminForceExpireSessionUseCase` con dependencias: `IDeliverySessionRepository`, `IAdminAuditLogRepository`
  - `execute(adminUserId: string, sessionId: string, ipAddress: string): Promise<AdminItemActionResponse>`
  - Verifica sesión existe; lanza `NotFoundException` si no
  - Verifica `status = 'active'`; lanza `ConflictException` si no
  - Captura `payloadSnapshot = { status: 'active', deadline_at: session.deadlineAt }` ANTES de modificar
  - Ejecuta UPDATE atómico: `delivery_sessions.status = 'expired', completed_at = NOW()` + `items.status = 'active', reserved_at = NULL`
  - Inserta audit log con action=`session.force_expired`
  - **No** envía TPL-004
  - Retorna `{ message: "Sesión expirada. Objeto devuelto a estado activo." }`

### 3. Repositorio (nuevos métodos en IDeliverySessionRepository)

- [x] Extender `src/domain/repositories/delivery-session.repository.ts`:
  - `adminFindAll(query: AdminSessionListQuery): Promise<{ sessions: AdminSessionRecord[]; total: number }>`
  - `adminFindById(sessionId: string): Promise<AdminSessionDetailRecord | null>`
  - `adminForceExpireSession(sessionId: string): Promise<void>`

- [x] Definir tipos de registro admin en `delivery-session.repository.ts`:
  - `AdminSessionRecord`: id, status, deadlineAt, createdAt, completedAt, contactPurged, noShowDeclared, itemId, itemTitle, donorId, donorFirstName, donorLastName, donorEmail, receiverId, receiverFirstName, receiverLastName, receiverEmail
  - `AdminSessionDetailRecord`: extiende con contactChannel, donorConfirmed, itemCategory

- [x] Implementar en `PostgresDeliverySessionRepository`:
  - `adminFindAll`: JOIN con items, users (donor), users (receiver); filtros condicionales; ORDER BY created_at DESC; paginación con LIMIT/OFFSET
  - `adminFindById`: JOIN con items y users; query única
  - `adminForceExpireSession`: UPDATE delivery_sessions SET status='expired', completed_at=NOW() + UPDATE items SET status='active', reserved_at=NULL en transacción (BEGIN/COMMIT/ROLLBACK)

### 4. Controlador

- [x] Crear `src/interfaces/http/controllers/admin-sessions.controller.ts`
  - `AdminSessionsController` con métodos (mismo patrón que `AdminItemsController`):
    - `listSessions(req, res, next)` → `adminListSessionsUseCase.execute(req.query)`
    - `getSessionDetail(req, res, next)` → `adminGetSessionDetailUseCase.execute(req.adminUser.id, req.params.id, req.ip)`
    - `forceExpireSession(req, res, next)` → `adminForceExpireSessionUseCase.execute(req.adminUser.id, req.params.id, req.ip)`

### 5. Validadores

- [x] Crear `src/interfaces/validators/admin-list-sessions.validator.ts`
  - Zod schema: `status` (enum optional), `overdue` (coerce boolean optional), `userId` (string uuid optional), `page` (coerce to int, min 1, default 1), `limit` (coerce to int, min 1, max 100, default 20)
  - Middleware `validateAdminListSessions`

- [x] **Reutilizar** `src/interfaces/validators/admin-uuid-param.validator.ts` (ya creado en 13-3) para params `:id`

### 6. Rutas

- [x] Modificar `src/interfaces/http/routes/admin.routes.ts`:
  - Añadir imports para:
    - `PostgresDeliverySessionRepository` desde `../../../infrastructure/database/supabase/delivery-session.repository`
    - `AdminListSessionsUseCase`, `AdminGetSessionDetailUseCase`, `AdminForceExpireSessionUseCase` desde `../../../application/use-cases/admin/sessions/`
    - `AdminSessionsController` desde `../controllers/admin-sessions.controller`
    - `validateAdminListSessions` desde `../../validators/admin-list-sessions.validator`
    - `IDeliverySessionRepository` desde `../../../domain/repositories/delivery-session.repository`
  - Añadir `deliverySessionRepo?` a `AdminRouterDeps`
  - Resolver `PostgresDeliverySessionRepository` en el body de `createAdminRouter`
  - Crear use cases y controller de sesiones (después de la sección de items)
  - Añadir rutas bajo `router.use(requireAdminAuth)`:
    - `GET /sessions` → validateAdminListSessions → controller.listSessions
    - `GET /sessions/:id` → validateAdminUuidParam → controller.getSessionDetail
    - `POST /sessions/:id/force-expire` → validateAdminUuidParam → controller.forceExpireSession

### 7. OpenAPI schemas

- [x] Modificar `src/openapi/schemas/admin.schemas.ts`:
  - `adminSessionListResponseSchema` (sessions array + pagination)
  - `adminSessionDetailResponseSchema` (detalle completo con contactChannel condicional)
  - Reutilizar `adminItemActionResponseSchema` ya existente para force-expire

- [x] Modificar `src/openapi/register-paths.ts`:
  - Registrar todos los endpoints de gestión de sesiones con tag `[Admin-Sessions]`:
    - `GET /api/admin/sessions`
    - `GET /api/admin/sessions/{id}`
    - `POST /api/admin/sessions/{id}/force-expire`
  - Reutilizar `adminSecured` security y `adminErrorSchema` para errores
  - Incluir response 404 y 409 donde aplique

### 8. Tests

- [x] Crear `tests/admin-sessions.test.ts`:
  - Listar sesiones sin filtros → 200 con paginación (mock deliverySessionRepo.adminFindAll)
  - Listar sesiones con status filter → correcto
  - Listar sesiones con overdue=true → solo sesiones active vencidas
  - Listar sesiones con userId → sesiones donde el usuario participa
  - Listar sesiones con limit > 100 → 400
  - Detalle de sesión existente con contact_purged=false → 200 con contactChannel + audit log
  - Detalle de sesión existente con contact_purged=true → 200 con contactChannel=null, sin audit log
  - Detalle de sesión inexistente → 404
  - Detalle con ID no UUID → 400
  - Force-expire sesión activa → 200, status='expired', item vuelve a active, audit log
  - Force-expire sesión completada → 409
  - Force-expire sesión inexistente → 404
  - Sin token admin → 401 (todos los endpoints)
  - Con token de usuario regular → 401 (todos los endpoints)
  - Auditoría: verificar registro en admin_audit_log tras detail (contact_channel visible) y force-expire

---

## Dev Notes

### Story Context

Esta es la quinta historia de la **Épica 13 (Panel Administrativo Backend)**. Las historias previas implementaron:
- **13.1:** Migraciones SQL (admin_users, admin_otp_tokens, admin_audit_log, paused_by_admin)
- **13.2:** Autenticación admin con OTP, JWT independiente, middleware requireAdminAuth, CORS restrictivo
- **13.3:** Gestión de usuarios por admin
- **13.4:** Gestión de objetos por admin (listado, detalle, cancelar, reactivar) — **review**

### Architecture Compliance

**Estructura de capas (Clean Architecture):**

```
src/
  domain/
    entities/
      admin-audit-log.entity.ts                ← EXISTENTE (13-2)
    repositories/
      delivery-session.repository.ts           ← EXTENDER con adminFindAll, adminFindById, adminForceExpireSession
      admin-audit-log.repository.ts            ← EXISTENTE (13-2)
      item.repository.ts                       ← EXISTENTE (solo para acceso a items vía queries)
  application/
    use-cases/
      admin/
        sessions/
          admin-list-sessions.use-case.ts      ← NUEVO
          admin-get-session-detail.use-case.ts ← NUEVO
          admin-force-expire-session.use-case.ts ← NUEVO
    dtos/
      admin/
        admin-session-list.dto.ts              ← NUEVO
        admin-session-detail.dto.ts            ← NUEVO
        admin-item-action.dto.ts               ← REUTILIZAR (ya existe)
  infrastructure/
    database/
      supabase/
        delivery-session.repository.ts         ← EXTENDER con 3 métodos admin
        admin-audit-log.repository.ts          ← EXISTENTE
  interfaces/
    http/
      controllers/
        admin-sessions.controller.ts           ← NUEVO
      middlewares/
        require-admin-auth.middleware.ts       ← REUTILIZAR (13-2)
      routes/
        admin.routes.ts                        ← MODIFICAR (añadir rutas sessions)
    validators/
      admin-list-sessions.validator.ts         ← NUEVO
      admin-uuid-param.validator.ts            ← REUTILIZAR (13-3)
  openapi/
    schemas/
      admin.schemas.ts                         ← MODIFICAR (añadir schemas sessions)
    register-paths.ts                          ← MODIFICAR (registrar paths sessions)
```

### Critical Guardrails

1. **`session.force_expired` ya es un action válido** en la constraint CHECK de `admin_audit_log`. Ver migración `020-admin-panel-schema.sql`. También `data.contact_channel_accessed` está registrado.

2. **TPL-004 NO se envía en force-expire.** La expiración forzada por admin es una acción administrativa deliberada. El Job 5 (pg_cron) que expira sesiones naturalmente sí envía TPL-004.

3. **`contactChannel` solo se expone cuando `contactPurged = false`.** Si `contactPurged = true`, el DTO retorna `contactChannel: null`. El frontend debe mostrar "Dato purgado". La auditoría `data.contact_channel_accessed` solo se registra cuando el valor está visible.

4. **Transacciones atómicas para force-expire.** Usar `BEGIN`/`COMMIT`/`ROLLBACK` en PostgresRepo. Si falla el UPDATE de items, no debe quedar la sesión expirada sin actualizar el item.

5. **No reutilizar `ExpireDeliverySessionsUseCase`.** El use-case existente (`src/application/use-cases/delivery/expire-delivery-sessions.use-case.ts`) busca sesiones expiradas vía `findExpiredSessions()` y envía TPL-004. No realiza la expiración SQL (pg_cron la hace). El admin *force-expire* debe ejecutar la expiración SQL directamente + audit log. La referencia es la lógica del Job 5 pg_cron (UPDATE directo sobre delivery_sessions + items).

6. **UUID validation.** Todos los `:id` params deben validarse como UUID v4 en validator (reutilizar `admin-uuid-param.validator.ts` de 13-3).

7. **`req.adminUser`** ya está disponible vía `src/@types/express/index.d.ts` (type augmentation añadido en 13-2).

8. **`location` (GEOGRAPHY) NUNCA en DTOs.** No aplica directamente a sessions (no tiene location), pero mantener la práctica.

9. **ADMIN_JWT_SECRET es SEPARADO de JWT_SECRET.** El middleware `requireAdminAuth` usa `AdminJwtService`. No reutilizar `JwtService` ni `env.JWT_SECRET`.

### Existing Patterns

| Categoría | Archivo de referencia | Notas |
|-----------|----------------------|-------|
| Use case (list + detail) | `src/application/use-cases/admin/items/admin-list-items.use-case.ts` | Patrón DTO, paginación, filtros combinados |
| Use case (action con audit) | `src/application/use-cases/admin/items/admin-cancel-item.use-case.ts` | payload_snapshot pre-cambio, audit log post-acción |
| Controller | `src/interfaces/http/controllers/admin-items.controller.ts` | Constructor recibe use cases, métodos (req, res, next), usa req.adminUser |
| Route factory | `src/interfaces/http/routes/admin.routes.ts` | `createAdminRouter(deps)` con DI |
| Validator | `src/interfaces/validators/admin-list-items.validator.ts` | Zod schema + middleware export |
| Repo interfaz types | `src/domain/repositories/delivery-session.repository.ts` | DeliverySessionDetail, ExpiredSessionForEmail (extender con AdminSessionRecord) |
| Postgres repo | `src/infrastructure/database/supabase/delivery-session.repository.ts` | findById ya implementado (línea 512) — usar como base |
| Postgres tx pattern | `src/infrastructure/database/supabase/delivery-session.repository.ts` cancelDelivery (línea 228) | BEGIN/COMMIT/ROLLBACK con SELECT FOR UPDATE |
| Audit log entity | `src/domain/entities/admin-audit-log.entity.ts` | Fields: adminUserId, action, entityType, entityId, payloadSnapshot, ipAddress |
| OpenAPI schemas | `src/openapi/schemas/admin.schemas.ts` | Schema factory con `.openapi()` |
| OpenAPI paths | `src/openapi/register-paths.ts` | Patrón de registro con tags, adminSecured |

### Reutilización de lógica de expiración

El Job 5 de pg_cron ejecuta:
```sql
UPDATE delivery_sessions SET status = 'expired'
WHERE status = 'active' AND deadline_at < NOW();

UPDATE items SET status = 'active', reserved_at = NULL
WHERE id IN (SELECT item_id FROM delivery_sessions WHERE status = 'expired' AND completed_at IS NULL);
```

El admin force-expire DEBE hacer lo mismo pero:
- Para UNA sesión específica (no todas las vencidas)
- Verificando que la sesión existe y está activa
- Con audit log
- Sin enviar TPL-004
- Con payload_snapshot capturado pre-cambio

**NO duplicar `ExpireDeliverySessionsUseCase`.** Tampoco usar `findExpiredSessions()` (solo busca sesiones ya expiradas para enviar emails). Implementar lógica SQL directa en el nuevo método del repositorio.

### Dependencies

- **Story 13.1** ✅ COMPLETADA: migración `020-admin-panel-schema.sql` aplicada (incluye actions `session.force_expired` y `data.contact_channel_accessed` en CHECK constraint)
- **Story 13.2** ✅ COMPLETADA: `AdminJwtService`, `requireAdminAuth`, `IAdminAuditLogRepository`, `PostgresAdminAuditLogRepository`, admin rate limit, Express type augmentation (`req.adminUser`)
- **Story 13.3** ✅ COMPLETADA: `admin-uuid-param.validator.ts` disponible
- **Story 13.4** ✅ COMPLETADA (review): patrones de controller, use cases con audit log, OpenAPI admin schemas
- **Infraestructura existente:** `IDeliverySessionRepository` con `findById`, `PostgresDeliverySessionRepository`, `IAdminAuditLogRepository`, `PostgresAdminAuditLogRepository`

### What this story must NOT break

- Las sesiones existentes de usuarios regulares (no admin) deben seguir funcionando exactamente igual
- `POST /api/admin/sessions/:id/force-expire` **no debe enviar** TPL-004 (el ExpireDeliverySessionsUseCase existente que corre vía pg_cron sí lo hace para expiraciones naturales)
- El contacto purgado (`contact_purged = true`) debe respetarse: no exponer `contactChannel` ni registrar auditoría
- La funcionalidad de selectReceiver, confirmDelivery, cancelDelivery para usuarios no-admin debe permanecer intacta

### Implementation Order

1. Tipos de registro admin en `delivery-session.repository.ts` (AdminSessionRecord, AdminSessionDetailRecord)
2. DTOs de respuesta y request
3. Extender `IDeliverySessionRepository` con `adminFindAll`, `adminFindById`, `adminForceExpireSession`
4. Implementar los 3 nuevos métodos en `PostgresDeliverySessionRepository`
5. Use cases (en orden: list, detail, force-expire)
6. Validator `admin-list-sessions.validator.ts`
7. Controller
8. Modificar rutas `admin.routes.ts` (añadir imports, dependencias, rutas)
9. OpenAPI schemas y paths
10. Tests

### References

| Source | Section | Content |
|--------|---------|---------|
| `docs/prd-backend-admin.md` | §6.4 | Contratos de API del módulo de sesiones (GET /admin/sessions, GET /admin/sessions/:id, POST /admin/sessions/:id/force-expire) |
| `docs/prd-backend-admin.md` | §6.4 GET /admin/sessions | Query params status, overdue, userId, page, limit |
| `docs/prd-backend-admin.md` | §6.4 GET /admin/sessions/:id | Comportamiento especial con contactChannel y audit log |
| `docs/prd-backend-admin.md` | §6.4 POST /admin/sessions/:id/force-expire | payload vacío, transacción atómica, no TPL-004 |
| `docs/prd-backend-admin.md` | §7.1 | Auditoría — actions `session.force_expired` y `data.contact_channel_accessed` |
| `docs/prd-backend-admin.md` | §10 | AC-ADM-BE-09 (detalle sesión) |
| `docs/architecture.md` | §2 | Clean Architecture, DTOs explícitos (SEC-008), validación UUID (SEC-007) |
| `docs/architecture.md` | §12 | Reglas de autorización (BOLA no aplica a admin) |
| `_bmad-output/project-context.md` | Technology Stack | Versiones exactas de librerías |
| `_bmad-output/project-context.md` | Framework Rules | Clean Architecture, DTOs |
| `_bmad-output/initiative-backend/sprint-change-proposal-2026-06-08-admin-panel.md` | §4.1.D | Definición de historia 13.5 con BDD |
| `src/domain/repositories/delivery-session.repository.ts` | — | Interfaz IDeliverySessionRepository existente (extender) |
| `src/infrastructure/database/supabase/delivery-session.repository.ts` | findById method | Query patrón existente (JOIN con items y users) |
| `src/infrastructure/database/supabase/delivery-session.repository.ts` | cancelDelivery method | Patrón transaccional BEGIN/COMMIT/ROLLBACK |
| `src/domain/repositories/admin-audit-log.repository.ts` | — | Interfaz IAdminAuditLogRepository con create() |
| `src/application/use-cases/admin/items/admin-cancel-item.use-case.ts` | — | Patrón use case admin con audit log (más cercano a force-expire) |
| `src/interfaces/http/controllers/admin-items.controller.ts` | — | Patrón controller admin con req.adminUser |
| `src/interfaces/http/routes/admin.routes.ts` | — | Factory pattern con DI, requireAdminAuth middleware, sección items |
| `src/interfaces/validators/admin-list-items.validator.ts` | — | Patrón validator con Zod + coerce + middleware |
| `src/interfaces/validators/admin-uuid-param.validator.ts` | — | Validator UUID reutilizable |
| `src/openapi/schemas/admin.schemas.ts` | — | Schemas OpenAPI existentes (adminItemActionResponseSchema reutilizable) |
| `src/openapi/register-paths.ts` | — | Patrón de registro con tags y adminSecured |
| `_bmad-output/initiative-backend/tickets/epic-panel-administrativo-backend-prd-adm-be-01/tickets/story-gestion-de-objetos-por-el-administrador-plan.md` | Dev Notes | Estructura de capas, patrones, guardrails detallados |
| `src/infrastructure/database/supabase/migrations/011-setup-expire-sessions-and-purge-contact-channel-jobs.sql` | Job 5 pg_cron | Lógica SQL de expiración que el admin force-expire debe emular |
| `src/application/use-cases/delivery/expire-delivery-sessions.use-case.ts` | — | NO reutilizar; solo envía TPL-004 para sesiones expiradas por pg_cron |

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

Implementación completa de la historia 13.5. Se siguió exactamente el orden de implementación indicado en Dev Notes:
1. Tipos `AdminSessionRecord`, `AdminSessionDetailRecord`, `AdminSessionListQuery` añadidos a la interfaz del dominio.
2. DTOs creados: `admin-session-list.dto.ts` (re-exporta `AdminSessionListQuery` desde el dominio), `admin-session-detail.dto.ts` (incluye `auditLogged: boolean`).
3. Interfaz `IDeliverySessionRepository` extendida con `adminFindAll`, `adminFindById`, `adminForceExpireSession`.
4. Implementación SQL en `PostgresDeliverySessionRepository`: queries parametrizadas con filtros condicionales, JOINs con items y users (donor y receiver por separado), transacción atómica con BEGIN/COMMIT/ROLLBACK en `adminForceExpireSession`.
5. Use cases: `AdminListSessionsUseCase`, `AdminGetSessionDetailUseCase` (audit log solo si `contactPurged=false`), `AdminForceExpireSessionUseCase` (captura payloadSnapshot pre-cambio, no envía TPL-004).
6. Validator Zod con coerción para `overdue` y tipos de paginación, límite máximo 100.
7. Controller siguiendo el patrón de `AdminItemsController` con `assertAdminUser`.
8. Rutas añadidas a `createAdminRouter` con DI de `PostgresDeliverySessionRepository`.
9. Schemas OpenAPI (`AdminSessionListResponse`, `AdminSessionDetailResponse`) y 3 paths registrados con tag `Admin-Sessions`.
10. Tests: 24 tests cubriendo todos los ACs, sin regresiones en los 643 tests existentes.

### File List

- `src/application/dtos/admin/admin-session-list.dto.ts` (nuevo)
- `src/application/dtos/admin/admin-session-detail.dto.ts` (nuevo)
- `src/application/use-cases/admin/sessions/admin-list-sessions.use-case.ts` (nuevo)
- `src/application/use-cases/admin/sessions/admin-get-session-detail.use-case.ts` (nuevo)
- `src/application/use-cases/admin/sessions/admin-force-expire-session.use-case.ts` (nuevo)
- `src/domain/repositories/delivery-session.repository.ts` (modificado — tipos admin + 3 métodos nuevos en interfaz)
- `src/infrastructure/database/supabase/delivery-session.repository.ts` (modificado — implementación de 3 métodos admin)
- `src/interfaces/http/controllers/admin-sessions.controller.ts` (nuevo)
- `src/interfaces/validators/admin-list-sessions.validator.ts` (nuevo)
- `src/interfaces/http/routes/admin.routes.ts` (modificado — deliverySessionRepo dep + 3 rutas sessions)
- `src/openapi/schemas/admin.schemas.ts` (modificado — 2 schemas sessions)
- `src/openapi/register-paths.ts` (modificado — 3 paths Admin-Sessions)
- `openapi/openapi.json` (regenerado)
- `tests/admin-sessions.test.ts` (nuevo)
- `_bmad-output/initiative-backend/archive-v6/sprint-status.yaml` (modificado)

### Change Log

- 2026-06-09: Implementación completa de historia 13.5 — GET /admin/sessions (listado con filtros/paginación), GET /admin/sessions/:id (detalle con contactChannel condicional y audit log), POST /admin/sessions/:id/force-expire (expiración atómica sin TPL-004). 24 tests HTTP, 0 regresiones. OpenAPI regenerado.

---

### Review Findings

#### patch

- [x] [Review][Patch] **`payloadSnapshot` debe incluir estado previo del item** [`src/application/use-cases/admin/sessions/admin-force-expire-session.use-case.ts`] — Agregar `item: { status, reserved_at }` al snapshot.
- [x] [Review][Patch] **`item_requests` deben resetearse a `pending` en force-expire** — Seguir el patrón de `cancelDelivery`: resetear requests no-`rejected` a `pending` cuando el item vuelve a `active`.

- [x] [Review][Patch] **TOCTOU race + UPDATE sin `WHERE status='active'`** [`src/infrastructure/database/supabase/delivery-session.repository.ts:743`] — La UPDATE de `adminForceExpireSession` no verifica `status = 'active'`. Dos admins concurrentes pueden pasar el pre-check del use case. Además, si la UPDATE afecta 0 filas, retorna void silenciosamente mientras el use case registra audit log fantasma.
- [x] [Review][Patch] **Filtros `overdue` + `status` producen WHERE imposible** [`src/infrastructure/database/supabase/delivery-session.repository.ts:575`] — `overdue=true` añade `ds.status = 'active' AND ds.deadline_at < NOW()`. Si también se pasa `status=expired`, el WHERE combinado siempre retorna 0 resultados sin informar al usuario.
- [x] [Review][Patch] **`contact_channel` SELECTeado aunque esté purgado** [`src/infrastructure/database/supabase/delivery-session.repository.ts:549`] — Datos PII viajan de BD a app aunque `contact_purged = true`. Usar `CASE WHEN contact_purged THEN NULL ELSE contact_channel END` en SQL.
- [x] [Review][Patch] **`adjustedPage` retorna page>totalPages cuando total=0** [`src/application/use-cases/admin/sessions/admin-list-sessions.use-case.ts:38`] — `totalPages > 0 ? Math.min(query.page, totalPages) : query.page` retorna el page solicitado aunque no existan resultados. Debería retornar 1.
- [x] [Review][Patch] **Query param `overdue` con string vacío** [`src/interfaces/validators/admin-list-sessions.validator.ts:6`] — `?overdue` sin valor (p.ej. `?overdue&status=active`) produce 400 por `z.coerce.boolean()`. Agregar `z.preprocess` para tratar string vacío como `true`.
- [x] [Review][Patch] **`?overdue=false` y `?overdue=0` activan el filtro en lugar de desactivarlo** [`src/interfaces/validators/admin-list-sessions.validator.ts:6`] — `z.coerce.boolean()` convierte cualquier string no vacío a `true`. Misma solución que el hallazgo anterior: `z.preprocess` con manejo explícito de `'false'`/`'0'`.

#### defer

- [x] [Review][Defer] **`completed_at` seteado en force-expire** [`src/infrastructure/database/supabase/delivery-session.repository.ts:598`] — Deferred, pre-existing: AC3 especifica explícitamente `completed_at = NOW()`.
- [x] [Review][Defer] **INNER JOIN oculta sesiones huérfanas** [`src/infrastructure/database/supabase/delivery-session.repository.ts:543-546`] — Deferred, pre-existing: no causado por este cambio.
- [x] [Review][Defer] **Sin parámetros de ordenamiento — `ORDER BY created_at DESC` hardcodeado** [`src/infrastructure/database/supabase/delivery-session.repository.ts:631`] — Deferred, pre-existing: limitación de diseño fuera del alcance de esta historia.
