---
title: "Gestión de usuarios por el administrador"
type: feature
ticket: 3
status: done
created: 2026-10-25
---

# Story 13.3: Gestión de usuarios por el administrador

**Status:** done

---

## Story

Como administrador autenticado,
quiero buscar usuarios, ver su perfil completo y ejecutar acciones operativas sobre ellos,
para mantener la integridad del ecosistema.

---

## Acceptance Criteria (BDD)

### AC1: Listar usuarios con filtros
**Dado** que envío `GET /api/admin/users` con autenticación admin válida
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ users: [...], pagination: { total, page, limit, totalPages } }`
**Y** cada usuario en la lista incluye: `id, email, firstName, lastName, isActive, emailVerified, reputationScore, totalDonated, totalReceived, consecutiveNoShows, cyclesAtLimit, createdAt, lastActiveAt, isPassive, isHoarder`
**Y** el campo `location` nunca aparece en la respuesta

**Dado** que envío `GET /api/admin/users?search=john`
**Cuando** el servidor procesa la petición
**Entonces** los resultados filtran por `email ILIKE '%john%' OR first_name ILIKE '%john%' OR last_name ILIKE '%john%'`

**Dado** que envío `GET /api/admin/users?status=suspended`
**Cuando** el servidor procesa la petición
**Entonces** solo se retornan usuarios con `is_active = FALSE`

**Dado** que envío `GET /api/admin/users?status=active`
**Cuando** el servidor procesa la petición
**Entonces** solo se retornan usuarios con `is_active = TRUE`

**Dado** que envío `GET /api/admin/users?emailVerified=true`
**Cuando** el servidor procesa la petición
**Entonces** solo se retornan usuarios con `email_verified = TRUE`

**Dado** que envío `GET /api/admin/users?page=2&limit=20`
**Cuando** el servidor procesa la petición
**Entonces** responde la segunda página con hasta 20 resultados

**Dado** que envío `GET /api/admin/users?limit=200`
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request` (límite máximo 100)

### AC2: Detalle de usuario
**Dado** que envío `GET /api/admin/users/:id` con UUID válido y autenticación admin
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con el perfil completo del usuario incluyendo:
- `id, email, firstName, lastName, avatarUrl, phone, postalCode, preferredLanguage`
- `isActive, emailVerified, reputationScore, totalDonated, totalReceived, consecutiveNoShows, cyclesAtLimit`
- `isPassive, isHoarder, createdAt, lastActiveAt`
- `reputationHistory: [{ id, type, delta, sessionId, createdAt }]`
- `activeItems: integer, completedItems: integer`
**Y** `reputationHistory` incluye eventos de tipo `delivery_completed`, `no_show` y `admin_correction`
**Y** `location` nunca aparece en la respuesta

**Dado** que envío `GET /api/admin/users/:id` con UUID que no existe
**Cuando** el servidor procesa la petición
**Entonces** responde `404 Not Found`

**Dado** que envío `GET /api/admin/users/:id` con parámetro que no es UUID v4
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request`

### AC3: Suspender usuario (cascada atómica)
**Dado** que envío `POST /api/admin/users/:id/suspend` (payload vacío) sobre un usuario activo
**Cuando** el servidor procesa la petición en transacción atómica
**Entonces** responde `200` con `{ message: "Usuario suspendido", itemsPaused: N }`
**Y** `users.is_active = FALSE` para ese usuario
**Y** `users.jwt_version` se incrementa en 1
**Y** todos los objetos del usuario con `status = 'active' AND requests_paused = FALSE` quedan con `requests_paused = TRUE, paused_by_admin = TRUE`
**Y** objetos ya pausados por el donante (`requests_paused = TRUE` con `paused_by_admin = FALSE`) NO son modificados
**Y** se registra `user.suspended` en `admin_audit_log` con `payload_snapshot` conteniendo `{ is_active, jwt_version }` antes del cambio
**Y** `itemsPaused` refleja el número exacto de objetos pausados por esta acción

**Dado** que envío `POST /api/admin/users/:id/suspend` sobre un usuario ya suspendido
**Cuando** el servidor procesa la petición
**Entonces** responde `409 Conflict`

**Dado** que envío `POST /api/admin/users/:id/suspend` sobre un usuario que no existe
**Cuando** el servidor procesa la petición
**Entonces** responde `404 Not Found`

### AC4: Reactivar usuario
**Dado** que envío `POST /api/admin/users/:id/reactivate` (payload vacío) sobre un usuario suspendido
**Cuando** el servidor procesa la petición en transacción atómica
**Entonces** responde `200` con `{ message: "Usuario reactivado", itemsUnpaused: N }`
**Y** `users.is_active = TRUE`
**Y** solo los objetos con `paused_by_admin = TRUE` quedan con `requests_paused = FALSE, paused_by_admin = FALSE`
**Y** objetos pausados manualmente por el donante (`paused_by_admin = FALSE`) permanecen pausados
**Y** se registra `user.reactivated` en `admin_audit_log` con `payload_snapshot`

**Dado** que envío `POST /api/admin/users/:id/reactivate` sobre un usuario ya activo
**Cuando** el servidor procesa la petición
**Entonces** responde `409 Conflict`

### AC5: Forzar verificación de email
**Dado** que envío `POST /api/admin/users/:id/force-verification` (payload vacío) sobre usuario con `email_verified = FALSE`
**Cuando** el servidor procesa la petición
**Entonces** responde `200` con `{ message: "Email de verificación enviado" }`
**Y** se genera un nuevo token (`crypto.randomBytes(32)`)
**Y** se actualiza `verification_token_hash = SHA-256(token)`
**Y** `verification_token_expires_at = NOW() + 24h`
**Y** `verification_resend_at = NOW()` (NO se aplica cooldown de 30s en acciones admin)
**Y** se envía email TPL-009 con el nuevo enlace de verificación
**Y** se registra `user.verification_forced` en `admin_audit_log`

**Dado** que envío `POST /api/admin/users/:id/force-verification` sobre usuario con `email_verified = TRUE`
**Cuando** el servidor procesa la petición
**Entonces** responde `409 Conflict`

### AC6: Corregir reputación
**Dado** que envío `POST /api/admin/users/:id/correct-reputation` con `{ delta: 10, reason: "Compensación por error del sistema" }`
**Cuando** el servidor procesa la petición en transacción atómica
**Entonces** responde `200` con `{ newReputationScore: integer, delta: 10 }`
**Y** se inserta en `reputation_events` con `type = 'admin_correction'`, `delta = 10`, `session_id = NULL`, `role = NULL`
**Y** `users.reputation_score` se actualiza sumando el delta
**Y** se registra `user.reputation_corrected` en `admin_audit_log` con `reason` en `payload_snapshot`

**Dado** que envío `POST /api/admin/users/:id/correct-reputation` con `delta: -5`
**Cuando** el servidor procesa la petición
**Entonces** `reputation_score` se reduce en 5

**Dado** que envío `POST /api/admin/users/:id/correct-reputation` con `delta: 0`
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request`

**Dado** que envío `POST /api/admin/users/:id/correct-reputation` con `reason` de más de 500 caracteres
**Cuando** el servidor procesa la petición
**Entonces** responde `400 Bad Request`

### AC7: Resetear contador de no-shows
**Dado** que envío `POST /api/admin/users/:id/reset-no-shows` (payload vacío) sobre usuario con `consecutive_no_shows > 0`
**Cuando** el servidor procesa la petición en transacción atómica
**Entonces** responde `200` con `{ message: "Contador de no-shows reseteado", previousValue: N }`
**Y** `users.consecutive_no_shows = 0`
**Y** se registra `user.no_shows_reset` en `admin_audit_log` con `payload_snapshot` conteniendo `consecutive_no_shows` previo

**Dado** que envío `POST /api/admin/users/:id/reset-no-shows` sobre usuario con `consecutive_no_shows = 0`
**Cuando** el servidor procesa la petición
**Entonces** responde `409 Conflict`

### AC8: Autorización — middleware requireAdminAuth
**Dado** que envío cualquier petición a `/api/admin/users/*` sin token admin
**Cuando** el middleware `requireAdminAuth` procesa la petición
**Entonces** responde `401 Unauthorized`

**Dado** que envío cualquier petición con token de usuario regular (firmado con `JWT_SECRET`)
**Cuando** el middleware `requireAdminAuth` procesa la petición
**Entonces** responde `401 Unauthorized`

### AC9: Auditoría transversal
**Dado** que ejecuto cualquier acción de gestión de usuarios (suspend, reactivate, force-verification, correct-reputation, reset-no-shows)
**Cuando** la acción se completa exitosamente
**Entonces** se registra una entrada en `admin_audit_log` con:
- `admin_user_id` del admin que ejecuta la acción
- `action` correspondiente
- `entity_type = 'user'`
- `entity_id` del usuario afectado
- `payload_snapshot` con estado previo
- `ip_address` extraída de `req.ip`

### AC10: Ubicación nunca expuesta
**Dado** que cualquier DTO de respuesta admin incluye datos de usuario
**Cuando** se genera la respuesta
**Entonces** el campo `location` (GEOGRAPHY POINT) nunca aparece en ningún DTO de salida

---

## Tasks / Subtasks

### 1. DTOs
- [x] Crear `src/application/dtos/admin/admin-user-list.dto.ts`
  - `AdminUserListItem`: id, email, firstName, lastName, isActive, emailVerified, reputationScore, totalDonated, totalReceived, consecutiveNoShows, cyclesAtLimit, createdAt, lastActiveAt, isPassive, isHoarder
  - `AdminUserListResponse`: users (AdminUserListItem[]), pagination ({ total, page, limit, totalPages })
  - `AdminUserListQuery`: search?, status? ('active' | 'suspended'), emailVerified?, page (default 1), limit (default 20, max 100)
- [x] Crear `src/application/dtos/admin/admin-user-detail.dto.ts`
  - `AdminUserDetailResponse`: todos los campos de AdminUserListItem + avatarUrl, phone, postalCode, preferredLanguage, reputationHistory (AdminReputationEvent[]), activeItems, completedItems
- [x] Crear `src/application/dtos/admin/admin-action.dto.ts`
  - `AdminActionResponse`: message (string)
  - `AdminSuspendResponse`: message, itemsPaused (number)
  - `AdminReactivateResponse`: message, itemsUnpaused (number)
  - `AdminCorrectReputationRequest`: delta (integer, non-zero), reason (string, max 500)
  - `AdminCorrectReputationResponse`: newReputationScore, delta
  - `AdminResetNoShowsResponse`: message, previousValue
  - `AdminForceVerificationResponse`: message

### 2. Use Cases
- [x] Crear `src/application/use-cases/admin/users/admin-list-users.use-case.ts`
  - `AdminListUsersUseCase` con dependencias: `IUserRepository`
  - `execute(query: AdminUserListQuery): Promise<AdminUserListResponse>`
  - `isPassive` SQL: `total_donated = 0 AND total_received > 0 AND last_active_at < NOW() - 60 days`
  - `isHoarder` SQL: `cycles_at_limit >= 3 AND total_received > 5 * total_donated`
  - Paginación con `page`/`limit`, offset calculado
  - Ubicación (GEOGRAPHY) excluida del SELECT

- [x] Crear `src/application/use-cases/admin/users/admin-get-user-detail.use-case.ts`
  - `AdminGetUserDetailUseCase` con dependencias: `IUserRepository`
  - `execute(userId: string): Promise<AdminUserDetailResponse>`
  - Busca usuario por ID; lanza `NotFoundException` si no existe
  - Incluye `reputationHistory` (eventos de tipo delivery_completed, no_show, admin_correction)
  - Incluye `activeItems` (COUNT WHERE status IN ('active', 'reserved'))
  - Incluye `completedItems` (COUNT WHERE status = 'completed')

- [x] Crear `src/application/use-cases/admin/users/admin-suspend-user.use-case.ts`
  - `AdminSuspendUserUseCase` con dependencias: `IUserRepository`, `IAdminAuditLogRepository`
  - `execute(adminUserId: string, userId: string, ipAddress: string): Promise<AdminSuspendResponse>`
  - Verificar usuario existe; lanza `NotFoundException` si no
  - Verificar `is_active = TRUE`; lanza `ConflictException` si no
  - Capturar `payloadSnapshot = { is_active, jwt_version }` ANTES de modificar
  - Transacción atómica: (1) UPDATE users SET is_active=FALSE, jwt_version=jwt_version+1 WHERE id=:id; (2) UPDATE items SET requests_paused=TRUE, paused_by_admin=TRUE WHERE donor_id=:id AND status='active' AND requests_paused=FALSE
  - Retornar itemsPaused = número de filas afectadas por (2)
  - Insertar audit log con action='user.suspended'

- [x] Crear `src/application/use-cases/admin/users/admin-reactivate-user.use-case.ts`
  - `AdminReactivateUserUseCase` con dependencias: `IUserRepository`, `IAdminAuditLogRepository`
  - `execute(adminUserId: string, userId: string, ipAddress: string): Promise<AdminReactivateResponse>`
  - Verificar `is_active = FALSE`; lanza `ConflictException` si no
  - Transacción atómica: (1) UPDATE users SET is_active=TRUE; (2) UPDATE items SET requests_paused=FALSE, paused_by_admin=FALSE WHERE donor_id=:id AND paused_by_admin=TRUE
  - Insertar audit log

- [x] Crear `src/application/use-cases/admin/users/admin-force-verification.use-case.ts`
  - `AdminForceVerificationUseCase` con dependencias: `IUserRepository`, `IAdminAuditLogRepository`, `IMailService`
  - `execute(adminUserId: string, userId: string, ipAddress: string): Promise<AdminActionResponse>`
  - Verificar usuario existe y `email_verified = FALSE`; lanza `ConflictException` si ya verificado
  - Generar token con `crypto.randomBytes(32)`, hash SHA-256
  - Actualizar `verification_token_hash`, `verification_token_expires_at = NOW() + 24h`, `verification_resend_at = NOW()`
  - Enviar TPL-009 con nuevo enlace (NO respetar cooldown de 30s)
  - Insertar audit log

- [x] Crear `src/application/use-cases/admin/users/admin-correct-reputation.use-case.ts`
  - `AdminCorrectReputationUseCase` con dependencias: `IUserRepository`, `IAdminAuditLogRepository`
  - `execute(adminUserId: string, userId: string, delta: number, reason: string, ipAddress: string): Promise<AdminCorrectReputationResponse>`
  - Verificar usuario existe
  - Validar delta ≠ 0 en use case (además de validación en validator)
  - Transacción atómica: (1) INSERT INTO reputation_events (user_id, type='admin_correction', delta, session_id=NULL); (2) UPDATE users SET reputation_score = reputation_score + delta
  - Insertar audit log con `reason` en `payload_snapshot`

- [x] Crear `src/application/use-cases/admin/users/admin-reset-no-shows.use-case.ts`
  - `AdminResetNoShowsUseCase` con dependencias: `IUserRepository`, `IAdminAuditLogRepository`
  - `execute(adminUserId: string, userId: string, ipAddress: string): Promise<AdminResetNoShowsResponse>`
  - Verificar usuario existe y `consecutive_no_shows > 0`; lanza `ConflictException` si ya es 0
  - UPDATE users SET consecutive_no_shows = 0
  - Insertar audit log

### 3. Repositorio (nuevos métodos en IUserRepository)
- [x] Extender `src/domain/repositories/user.repository.ts`:
  - `adminFindAll(query: AdminUserListQuery): Promise<{ users: AdminUserRecord[]; total: number }>`
  - `adminFindById(id: string): Promise<AdminUserDetailRecord | null>`
  - `adminSuspend(userId: string): Promise<number>` — retorna itemsPaused
  - `adminReactivate(userId: string): Promise<number>` — retorna itemsUnpaused
  - `adminForceVerification(userId: string, tokenHash: string, expiresAt: Date): Promise<void>`
  - `adminCorrectReputation(userId: string, delta: number): Promise<number>` — retorna nuevo reputationScore
  - `adminResetNoShows(userId: string): Promise<void>`

- [x] Definir interfaces de registro admin:
  - `AdminUserRecord`: todos los campos del listado incluyendo isPassive, isHoarder
  - `AdminUserDetailRecord`: todos los campos del detalle + reputationHistory

### 4. Controlador
- [x] Crear `src/interfaces/http/controllers/admin-users.controller.ts`
  - `AdminUsersController` con métodos:
    - `listUsers(req, res, next)` → `adminListUsersUseCase.execute(req.query)` 
    - `getUserDetail(req, res, next)` → `adminGetUserDetailUseCase.execute(req.params.id)`
    - `suspendUser(req, res, next)` → `adminSuspendUserUseCase.execute(req.adminUser.id, req.params.id, req.ip)`
    - `reactivateUser(req, res, next)` → `adminReactivateUserUseCase.execute(req.adminUser.id, req.params.id, req.ip)`
    - `forceVerification(req, res, next)` → `adminForceVerificationUseCase.execute(req.adminUser.id, req.params.id, req.ip)`
    - `correctReputation(req, res, next)` → `adminCorrectReputationUseCase.execute(req.adminUser.id, req.params.id, req.body.delta, req.body.reason, req.ip)`
    - `resetNoShows(req, res, next)` → `adminResetNoShowsUseCase.execute(req.adminUser.id, req.params.id, req.ip)`
  - Sigue el patrón de `AuthController` y `UserController` existentes

### 5. Validadores
- [x] Crear `src/interfaces/validators/admin-list-users.validator.ts`
  - Zod schema: `search` (string optional), `status` (enum 'active' | 'suspended' optional), `emailVerified` (boolean optional), `page` (coerce to int, min 1, default 1), `limit` (coerce to int, min 1, max 100, default 20)
  - Middleware `validateAdminListUsers`

- [x] Crear `src/interfaces/validators/admin-uuid-param.validator.ts`
  - Zod schema para UUID v4 params: `id` (string, uuid)
  - Middleware `validateAdminUuidParam`

- [x] Crear `src/interfaces/validators/admin-correct-reputation.validator.ts`
  - Zod schema: `delta` (number, integer, non-zero), `reason` (string, min 1, max 500)
  - Middleware `validateAdminCorrectReputation`

### 6. Rutas
- [x] Modificar `src/interfaces/http/routes/admin.routes.ts` (ya creada en 13-2):
  - Añadir sección de rutas de usuarios bajo `/users`:
    - `GET /users` → validateAdminListUsers → controller.listUsers
    - `GET /users/:id` → validateAdminUuidParam → controller.getUserDetail
    - `POST /users/:id/suspend` → validateAdminUuidParam → controller.suspendUser
    - `POST /users/:id/reactivate` → validateAdminUuidParam → controller.reactivateUser
    - `POST /users/:id/force-verification` → validateAdminUuidParam → controller.forceVerification
    - `POST /users/:id/correct-reputation` → validateAdminUuidParam → validateAdminCorrectReputation → controller.correctReputation
    - `POST /users/:id/reset-no-shows` → validateAdminUuidParam → controller.resetNoShows
  - Todas las rutas protegidas con `requireAdminAuth` (el router `/admin` ya lo tiene desde 13-2)

### 7. OpenAPI schemas
- [x] Añadir schemas a `src/openapi/schemas/admin.schemas.ts` (creado en 13-2):
  - `adminUserListItem`, `adminUserListResponse`, `adminUserDetailResponse`
  - `adminSuspendResponse`, `adminReactivateResponse`, `adminForceVerificationResponse`
  - `adminCorrectReputationRequest`, `adminCorrectReputationResponse`
  - `adminResetNoShowsResponse`
- [x] Modificar `src/openapi/register-paths.ts`:
  - Registrar todos los endpoints de gestión de usuarios con tag `[Admin-Users]`

### 8. Tests
- [x] Crear `tests/admin-users.test.ts`:
  - Listar usuarios sin filtros → 200 con paginación
  - Listar usuarios con search → filtra correctamente
  - Listar usuarios con status filter → correcto
  - Listar usuarios con limit > 100 → 400
  - Detalle de usuario existente → 200 con reputation history
  - Detalle de usuario inexistente → 404
  - Detalle con ID no UUID → 400
  - Suspender usuario activo → 200, is_active=FALSE, jwt_version++
  - Suspender usuario ya suspendido → 409
  - Suspender usuario inexistente → 404
  - Reactivar usuario suspendido → 200, is_active=TRUE
  - Reactivar usuario activo → 409
  - Forzar verificación sobre no verificado → 200, email enviado
  - Forzar verificación sobre ya verificado → 409
  - Corregir reputación con delta válido → 200, score actualizado
  - Corregir reputación con delta=0 → 400
  - Resetear no-shows con valor > 0 → 200
  - Resetear no-shows con valor = 0 → 409
  - Sin token admin → 401 (todos los endpoints)
  - Con token de usuario regular → 401 (todos los endpoints)
  - Auditoría: verificar registro en admin_audit_log tras cada acción
  - `location` nunca en DTOs de respuesta

---

## Dev Notes

### Story Context
Esta es la tercera historia de la Épica 13. La historia 13.1 creó las tablas admin (`admin_users`, `admin_otp_tokens`, `admin_audit_log`) y los campos necesarios en tablas existentes. La historia 13.2 implementó la autenticación admin con OTP, JWT y el middleware `requireAdminAuth`.

Esta historia implementa TODO el módulo de gestión de usuarios del panel admin: 7 endpoints de consulta y acciones operativas.

### Architecture Compliance

**Estructura de capas (Clean Architecture — mismo patrón que el proyecto existente):**

```
src/
  domain/
    entities/
      admin-user.entity.ts        ← CREADO en 13-2
      admin-otp-token.entity.ts   ← CREADO en 13-2
      admin-audit-log.entity.ts   ← CREADO en 13-2
    repositories/
      admin-user.repository.ts    ← CREADO en 13-2 (IAdminUserRepository)
      admin-otp-token.repository.ts ← CREADO en 13-2
      admin-audit-log.repository.ts ← CREADO en 13-2
      user.repository.ts          ← Extender con métodos adminFindAll, adminFindById, etc.
  application/
    use-cases/
      admin/
        users/
          AdminListUsersUseCase.ts         ← NUEVO
          AdminGetUserDetailUseCase.ts     ← NUEVO
          AdminSuspendUserUseCase.ts       ← NUEVO
          AdminReactivateUserUseCase.ts    ← NUEVO
          AdminForceVerificationUseCase.ts ← NUEVO
          AdminCorrectReputationUseCase.ts ← NUEVO
          AdminResetNoShowsUseCase.ts      ← NUEVO
    dtos/
      admin/
        admin-user-list.dto.ts            ← NUEVO
        admin-user-detail.dto.ts          ← NUEVO
        admin-action.dto.ts               ← NUEVO
  infrastructure/
    database/
      supabase/
        admin-user.repository.ts          ← CREADO en 13-2 (PostgresAdminUserRepository)
        (UserRepository extiende con métodos admin)
    security/
      AdminJwtService.ts                  ← CREADO en 13-2
  interfaces/
    http/
      controllers/
        AdminUsersController.ts           ← NUEVO
      middlewares/
        require-admin-auth.middleware.ts  ← CREADO en 13-2
        admin-rate-limit.ts               ← CREADO en 13-2
      routes/
        admin.routes.ts                   ← MODIFICAR (añadir rutas users)
    validators/
      admin-list-users.validator.ts       ← NUEVO
      admin-uuid-param.validator.ts       ← NUEVO (reutilizable para 13-4 y 13-5)
      admin-correct-reputation.validator.ts ← NUEVO
  openapi/
    schemas/
      admin.schemas.ts                    ← MODIFICAR (añadir schemas users)
```

### Critical Guardrails

1. **ADMIN_JWT_SECRET es SEPARADO de JWT_SECRET.** El middleware `requireAdminAuth` (creado en 13-2) usa `AdminJwtService` con `ADMIN_JWT_SECRET`. No reutilizar `JwtService` ni `env.JWT_SECRET`.

2. **Middleware requireAdminAuth.** Ya creado en 13-2. Opera sobre `admin_users` (NO sobre `users`). NO verifica `email_verified` ni `is_active` de `users`. Inyecta `req.adminUser`.

3. **`location` (GEOGRAPHY) NUNCA en DTOs de respuesta.** Especialmente crítico en los endpoints de listado y detalle de usuarios donde el repositorio podría devolver el campo `location` de `users`. Excluirlo explícitamente del SELECT SQL.

4. **Suspensión con cascada atómica.** Las dos operaciones (desactivar usuario + pausar objetos) deben ejecutarse en una SOLA transacción. Si falla una, ninguna se aplica.

5. **payload_snapshot en audit log.** Capturar el valor de los campos ANTES de modificarlos. No leer después del UPDATE.

6. **Distinguir pausas admin vs donante.** En reactivación, solo revertir `paused_by_admin = TRUE`. No tocar objetos con `requests_paused = TRUE` pero `paused_by_admin = FALSE` (pausa manual del donante).

7. **Forzar verificación SIN cooldown.** La acción admin de force-verification NO respeta el cooldown de 30 segundos del endpoint público. Establecer `verification_resend_at = NOW()` sin restricción.

8. **Respuesta 401 idéntica para auth.** Aunque este story no toca auth, mantener la regla de no distinguir "email no existe" de "contraseña incorrecta" en los endpoints de login ya implementados en 13-2.

9. **UUID validation.** Todos los `:id` params deben validarse como UUID v4 en validator antes de llegar al use case. Reutilizar patrón existente.

10. **Rate limiting.** Las rutas admin heredan el rate limit de 200 req / 15 min configurado en 13-2. No crear rate limiters específicos para users.

### Existing Patterns

| Categoría | Archivo de referencia | Notas |
|-----------|----------------------|-------|
| Controller class | `auth.controller.ts` | Constructor recibe use cases, métodos (req, res, next) |
| Route factory | `auth.routes.ts` | Factory function con DI, `createAdminRouter(deps)` |
| Use case (get) | `get-private-profile.use-case.ts` | Sin transacción, busca y mapea a DTO |
| Use case (write) | `register-user.use-case.ts` | Con transacción, múltiples steps |
| Validator | `login.validator.ts` | Zod schema + middleware export |
| Repository interfaz | `user.repository.ts` | Input/output types definidos en mismo archivo |
| JWT service | `jwt.service.ts` | `sign()` y `verify()` — NO REUTILIZAR para admin |
| Express augmentation | `@types/express/index.d.ts` | Añadir `req.adminUser` (ya hecho en 13-2) |
| Audit log entity | `admin-audit-log.entity.ts` (creado en 13-1) | Campos: adminUserId, action, entityType, entityId, payloadSnapshot, ipAddress |

### Dependencies

- **Story 13.1** ✅ COMPLETADA: migración `020-admin-panel-schema.sql` aplicada
- **Story 13.2** ✅ COMPLETADA (ready-for-dev): `AdminJwtService`, `requireAdminAuth` middleware, IAdminUserRepository, IAdminOtpTokenRepository, IAdminAuditLogRepository, PostgresAdminUserRepository, TPL-ADM-001, admin routes base, CORS config, admin rate limit
- **Infraestructura existente:** `IUserRepository` con implementación SQL, `IMailService` con `ResendMailProvider`, `IHashService`
- **Express augmentation:** `req.adminUser` debe estar disponible (añadido en 13-2)

### Naming Conventions

| Tipo | Convención | Ejemplo |
|------|------------|---------|
| Admin use case | `Admin{Accion}{Entidad}UseCase` | `AdminListUsersUseCase` |
| Admin DTO | `Admin{Entidad}{Tipo}` | `AdminUserListItem` |
| Admin validator | kebab-case + `.validator.ts` | `admin-list-users.validator.ts` |
| Admin controller | `Admin{Entidad}Controller` | `AdminUsersController` |
| Repo método admin | `admin{Prefijo}` | `adminFindAll`, `adminSuspend` |

### Implementation Order

1. DTOs de respuesta y request
2. Extender `IUserRepository` con nuevos métodos y tipos
3. Implementar los nuevos métodos en `PostgresUserRepository` (infraestructura)
4. Use cases (en orden: list, detail, suspend, reactivate, force-verification, correct-reputation, reset-no-shows)
5. Validators
6. Controller
7. Modificar rutas `admin.routes.ts`
8. OpenAPI schemas y paths
9. Tests

### References

| Source | Section | Content |
|--------|---------|---------|
| `docs/prd-backend-admin.md` | §6.2 | Contratos de API del módulo de usuarios |
| `docs/prd-backend-admin.md` | §3.4 | Campo `paused_by_admin` en items |
| `docs/prd-backend-admin.md` | §3.5 | Constraint `reputation_events.type` (admin_correction) |
| `docs/prd-backend-admin.md` | §9 | Arquitectura (orientativa — usar estructura real del proyecto) |
| `docs/prd-backend-admin.md` | §10 | AC-ADM-BE-04 a AC-ADM-BE-08, AC-ADM-BE-10 |
| `_bmad-output/project-context.md` | Technology Stack | Versiones exactas de librerías |
| `_bmad-output/project-context.md` | Framework Rules | Clean Architecture, autorización BOLA, DTOs |
| `_bmad-output/project-context.md` | Critical Don't-Miss | Prohibiciones para agentes |
| `_bmad-output/initiative-backend/tickets/epic-panel-administrativo-backend-prd-adm-be-01/tickets/story-autenticacion-de-administrador-plan.md` | — | Guardrails de auth admin (JWT separado, middleware) |
| `_bmad-output/initiative-backend/sprint-change-proposal-2026-06-08-admin-panel.md` | §4.1.D | Definición de historia 13.3 con BDD |
| `src/application/use-cases/user/get-private-profile.use-case.ts` | — | Patrón use case simple |
| `src/interfaces/http/controllers/auth.controller.ts` | — | Patrón controller |
| `src/interfaces/http/middlewares/auth.middleware.ts` | — | Factory pattern para middleware |
| `src/domain/repositories/user.repository.ts` | — | Interfaz IUserRepository existente (extender) |
| `_bmad-output/initiative-backend/tickets/epic-panel-administrativo-backend-prd-adm-be-01/tickets/story-autenticacion-de-administrador-plan.md` | Architecture Compliance | Estructura de capas del módulo admin |

---

## Dev Agent Record

### Completion Notes
Implementados los 7 endpoints del módulo de gestión de usuarios del panel admin (AC1-AC10):
- GET /admin/users: listado paginado con filtros (search, status, emailVerified)
- GET /admin/users/:id: detalle completo incluyendo reputationHistory (3 tipos), activeItems, completedItems
- POST /admin/users/:id/suspend: suspensión atómica (desactivar usuario + pausar items activos, jwt_version++)
- POST /admin/users/:id/reactivate: reactivación atómica (reactivar usuario + despausar solo items admin-paused)
- POST /admin/users/:id/force-verification: forzar verificación de email sin cooldown, envía TPL-009
- POST /admin/users/:id/correct-reputation: insertar reputation_event admin_correction + actualizar score (transacción)
- POST /admin/users/:id/reset-no-shows: resetear consecutive_no_shows a 0
- Todos los endpoints registran en admin_audit_log con payloadSnapshot del estado previo
- location (GEOGRAPHY) nunca expuesto en ningún DTO de respuesta
- 48 tests nuevos, 0 fallos en nuevos tests, 0 regresiones introducidas
- Build TypeScript sin errores, OpenAPI generado correctamente

### File List
- src/application/dtos/admin/admin-user-list.dto.ts (nuevo)
- src/application/dtos/admin/admin-user-detail.dto.ts (nuevo)
- src/application/dtos/admin/admin-action.dto.ts (nuevo)
- src/application/use-cases/admin/users/admin-list-users.use-case.ts (nuevo)
- src/application/use-cases/admin/users/admin-get-user-detail.use-case.ts (nuevo)
- src/application/use-cases/admin/users/admin-suspend-user.use-case.ts (nuevo)
- src/application/use-cases/admin/users/admin-reactivate-user.use-case.ts (nuevo)
- src/application/use-cases/admin/users/admin-force-verification.use-case.ts (nuevo)
- src/application/use-cases/admin/users/admin-correct-reputation.use-case.ts (nuevo)
- src/application/use-cases/admin/users/admin-reset-no-shows.use-case.ts (nuevo)
- src/domain/repositories/user.repository.ts (modificado — interfaces AdminUserRecord, AdminUserDetailRecord, AdminReputationEventRecord + métodos admin)
- src/infrastructure/database/supabase/user.repository.ts (modificado — implementación de 7 métodos admin)
- src/interfaces/http/controllers/admin-users.controller.ts (nuevo)
- src/interfaces/validators/admin-list-users.validator.ts (nuevo)
- src/interfaces/validators/admin-uuid-param.validator.ts (nuevo)
- src/interfaces/validators/admin-correct-reputation.validator.ts (nuevo)
- src/interfaces/http/routes/admin.routes.ts (modificado — añadir 7 rutas users + deps)
- src/openapi/schemas/admin.schemas.ts (modificado — 8 nuevos schemas)
- src/openapi/register-paths.ts (modificado — 7 nuevos paths Admin-Users)
- tests/admin-users.test.ts (nuevo — 48 tests)
- openapi/openapi.json (regenerado)

### Change Log
- 2026-06-08: Story creada con análisis completo de PRD, sprint change proposal, story 13-2 y patrones del proyecto.
- 2026-06-08: Implementación completa de historia 13.3 — gestión de usuarios por el administrador (7 endpoints, 7 use cases, repositorio extendido, validadores, controller, rutas, OpenAPI, 48 tests).

### Review Findings

- [x] [Review][Decision] **Admin puede suspenderse a sí mismo sin restricción** — aceptado, se permite auto-suspensión — El use case no compara adminUserId con userId. Un admin puede POST /users/:id/suspend con su propio ID, incrementando jwt_version y bloqueándose sin posibilidad de recuperación. [src/application/use-cases/admin/users/admin-suspend-user.use-case.ts:13-17]

- [x] [Review][Patch] **TOCTOU race condition: suspend/reactivate/reset-noshows/force-verification pueden mentir 200** — Los use cases leen el usuario con findById(), verifican estado, luego ejecutan el UPDATE. Los SQL carecen de WHERE guard (e.g. `WHERE is_active = TRUE`) y no verifican rowCount. Afecta: adminSuspendUseCase, adminReactivateUseCase, adminResetNoShowsUseCase, adminForceVerificationUseCase. [src/infrastructure/database/supabase/user.repository.ts (adminSuspend, adminReactivate, adminResetNoShows, adminForceVerification)]

- [x] [Review][Patch] **Integer overflow en reputation_score sin cota superior en adminCorrectReputation** — delta puede ser cualquier entero no-zero. Un delta muy grande causa overflow PostgreSQL → error 500. Solo se exige `v !== 0`. [src/interfaces/validators/admin-correct-reputation.validator.ts:5-8]

- [x] [Review][Patch] **Transform de emailVerified solo acepta 'true' literal, 'TRUE'/'1'/'yes' producen false silencioso** — Debería ser case-insensitive o usar z.enum(['true', 'false']). [src/interfaces/validators/admin-list-users.validator.ts:7-13]

- [x] [Review][Patch] **Search sin cota de longitud máxima** — z.string().optional() sin .max(). Atacante puede enviar megabytes en search. [src/interfaces/validators/admin-list-users.validator.ts:5]

- [x] [Review][Patch] **adminUuidParam retorna error genérico sin detalles, inconsistente con otros validators** — Retorna solo `{ message: 'Invalid request' }` sin array `errors`. [src/interfaces/validators/admin-uuid-param.validator.ts:11]

- [x] [Review][Patch] **Search con whitespace-only pasa validación y produce ILIKE que no matchea nada** — Falta trim(). [src/interfaces/validators/admin-list-users.validator.ts:5]

- [x] [Review][Patch] **Empty ipAddress cuando req.ip es undefined** — Controller usa `req.ip ?? ''`. Sin trust proxy, detrás de proxy inverso, IP queda vacía en audit log. [src/interfaces/http/controllers/admin-users.controller.ts:47]

- [x] [Review][Patch] **adminCorrectReputation crash si usuario se elimina entre findById y UPDATE** — result.rows[0] sería undefined → TypeError → 500. [src/infrastructure/database/supabase/user.repository.ts:821-827]

- [x] [Review][Defer] **Fire-and-forget email retorna 200 antes de confirmar envío** — Consistente con patrón fire-and-forget del proyecto (emitEvent). [src/application/use-cases/admin/users/admin-force-verification.use-case.ts:36-47] — deferred, pre-existing

- [x] [Review][Defer] **Audit log fuera de transacción DB** — Patrón existente del proyecto: mutación DB dentro de transacción, audit log fuera. [src/application/use-cases/admin/users/admin-suspend-user.use-case.ts:26-33] — deferred, pre-existing

- [x] [Review][Defer] **N+1 query en adminFindById** — Dos queries separadas (user + reputation_events). Podría optimizarse con LATERAL JOIN. [src/infrastructure/database/supabase/user.repository.ts:adminFindById] — deferred, pre-existing

- [x] [Review][Defer] **buildTestApp().deps.userRepo crea app Express innecesaria en tests** — 19 usos del patrón que genera app no utilizada. [tests/admin-users.test.ts:271] — deferred, pre-existing
