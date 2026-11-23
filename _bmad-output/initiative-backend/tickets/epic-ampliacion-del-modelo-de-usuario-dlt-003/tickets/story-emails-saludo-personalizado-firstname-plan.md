---
title: "Emails con saludo personalizado firstName"
type: feature
ticket: 5
status: done
created: 2026-10-25
---

# Historia 6.5: Emails con saludo personalizado firstName

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como usuario que recibe notificaciones por email,
quiero que los mensajes me saluden por mi nombre (`firstName`),
para mejorar la experiencia de comunicación (DLT-003; architecture §10; FR implícito en épica 6).

## Criterios de aceptación

1. **Dado** cualquier envío **TPL-001** a **TPL-008**, **cuando** el Use Case invoca `IMailService.send`, **entonces** el objeto `variables` incluye `firstName` del destinatario (string no vacío salvo usuarios legacy con backfill de migración 6.1).

2. **Dado** la tabla de variables en `docs/email-flow-mapping.md` §2, **cuando** se completa esta historia, **entonces** cada evento EVT-001…EVT-013 lista `firstName` como variable requerida y el código la envía en el `send` correspondiente (incluir `recipientEmail` donde el doc ya lo exige).

3. **Dado** `src/infrastructure/email/resend.provider.ts`, **cuando** se renderiza HTML de TPL-001…TPL-008, **entonces** el cuerpo incluye saludo de apertura con `firstName` (p. ej. `Hola {firstName},`) antes del contenido específico del template.

4. **Dado** jobs de infraestructura EVT-004 y EVT-012, **cuando** consultan datos para el email, **entonces** obtienen `donorFirstName` en la misma query que `donorEmail` (sin `findById` adicional por sesión/objeto).

5. **Regresión:** el envío sigue siendo fire-and-forget (`.catch` / try-catch); un fallo de Resend no revierte la operación HTTP ni el job; códigos de estado HTTP de los endpoints no cambian.

6. **OpenAPI:** no existen schemas de templates de email en OpenAPI — **no** inventar paths nuevos. Ejecutar `npm run openapi:generate` solo si otro cambio del branch lo requiere; verificar que `openapi/openapi.json` no necesita diff por esta historia.

## Alcance explícito (IN / OUT)

| IN (6.5) | OUT (otras historias / repos) |
|---|---|
| Pasar `firstName` (+ `recipientEmail` según mapping) en los 8 use cases que llaman `mailService.send` | `PATCH /users/me` (6.4) |
| Saludo en HTML de `resend.provider.ts` (TPL-001…008) | Plantillas Resend Dashboard externas (MVP usa HTML inline en código) |
| Ampliar `ExpiredSessionForEmail` + SQL `findExpiredSessions` | Cliente Angular / `npm run api:generate` en `no-lo-vendo` |
| Ampliar `NewlyDegradedItem` + SQL `findNewlyDegradedItems` | Cambiar asuntos de email salvo copy del saludo |
| Actualizar tests que assertean `mailService.send` | Nuevos eventos EVT / TPL-009+ |
| Verificar alineación `docs/email-flow-mapping.md` (ya v1.1 con `firstName`) | Exponer `firstName` en respuestas HTTP nuevas |

**Prerrequisitos bloqueantes:**

- **6-1:** columna `first_name` y entidad `User.firstName` mapeada en `user.repository.ts`.
- **6-2 (recomendado bloqueante para TPL-001):** registro persiste `firstName` real; sin 6.2, TPL-001 solo puede enviar el backfill `'Usuario'` de la migración.

**Orden sugerido en épica 6:** 6.1 → 6.2 → (6.3, 6.4 en paralelo si se desea) → **6.5**. 6.5 no depende de 6.3 ni 6.4.

## Tareas / Subtareas

- [x] **Task 0 — Verificar prerrequisitos** (bloqueante)
  - [x] `User` incluye `firstName`; `findById` / `findByEmail` devuelven `firstName`
  - [x] Tras 6.2: `RegisterUserUseCase` persiste nombres del payload (no placeholders)

- [x] **Task 1 — Helper de saludo en provider (AC #3)**
  - [x] En `resend.provider.ts`, añadir función local p. ej. `greetingHtml(v)` → `<p>Hola ${v.firstName},</p>`
  - [x] Prefijar el `html` de **cada** TPL-001…008 con `greetingHtml(v)` + contenido existente
  - [x] TPL-002: mantener `resetLink`; añadir `expiresInMinutes: 60` en variables desde use case (ya documentado en mapping)

- [x] **Task 2 — Use cases HTTP con `User` ya cargado (AC #1, #2)**

  | Archivo | Template | Destinatario | `firstName` desde |
  |---|---|---|---|
  | `register-user.use-case.ts` | TPL-001 | `user` post-`create` | `user.firstName` |
  | `forgot-password.use-case.ts` | TPL-002 | `user` de `findByEmail` | `user.firstName` |
  | `select-receiver.use-case.ts` | TPL-003 | `receiver` de `findById` | `receiver.firstName` |
  | `cancel-item.use-case.ts` | TPL-005 | `receiver` de `findById` | `receiver.firstName` |
  | `request-item.use-case.ts` | TPL-006 | `donor` de `findById` | `donor.firstName` |
  | `reset-password.use-case.ts` | TPL-008 | `user` de `findById` | `user.firstName` |

  - [x] Incluir en `variables` al menos: `firstName`, `recipientEmail: destinatario.email` (convención §2 email-flow-mapping)
  - [x] TPL-001: reemplazar solo `{ recipientEmail }` por `{ recipientEmail, firstName }`
  - [x] TPL-002: `{ recipientEmail, firstName, resetLink, expiresInMinutes: 60 }`
  - [x] TPL-003: añadir `firstName` y `recipientEmail` a las variables ya existentes (`itemTitle`, …)
  - [x] TPL-005: `{ recipientEmail, firstName, itemTitle }`
  - [x] TPL-006: `{ recipientEmail, firstName }` (opcional `itemTitle` si se añade al template copy; mapping lo lista — valorar incluir `item.title` desde `item` ya cargado en use case)
  - [x] TPL-008: `{ recipientEmail, firstName }`

- [x] **Task 3 — Jobs: ampliar DTOs de repositorio + SQL (AC #4)**

  - [x] `ExpiredSessionForEmail` en `delivery-session.repository.ts` (domain): añadir `donorFirstName: string`
  - [x] SQL `findExpiredSessions`: `u.first_name AS donor_first_name` en el `SELECT`
  - [x] `expire-delivery-sessions.use-case.ts`: `variables: { recipientEmail: session.donorEmail, firstName: session.donorFirstName, itemTitle, itemId }`

  - [x] `NewlyDegradedItem` en `item.repository.ts` (domain): añadir `donorFirstName: string`
  - [x] SQL `findNewlyDegradedItems`: `u.first_name AS donor_first_name`
  - [x] `degrade-inactive-items.use-case.ts`: pasar `firstName`, `recipientEmail`, `itemTitle`, `itemId` (mapping EVT-012; decisión CR 1B)

- [x] **Task 4 — Documentación (AC #2, #6)**
  - [x] Releer `docs/email-flow-mapping.md` — si falta nota de implementación, añadir línea en §2: «`firstName` obligatorio en código desde v1.3 / historia 6.5»
  - [x] Confirmar `docs/architecture.md` §10 ya describe `{{firstName}}` — sin cambio salvo discrepancia

- [x] **Task 5 — Tests (AC #1, #4, #5)**
  - [x] Actualizar asserts de `variables` en:
    - `tests/expire-delivery-sessions.test.ts` (fixture `donorFirstName`)
    - `tests/degrade-inactive-items.test.ts`
    - `tests/auth-register.test.ts` — assert `mailService.send` incluye `firstName` tras registro (cuando 6.2 esté aplicado)
    - `tests/auth-password-reset.test.ts` (TPL-002, TPL-008)
    - `tests/items-select.test.ts` (TPL-003)
    - `tests/items-cancel-with-session.test.ts` (TPL-005)
    - `tests/items-request.test.ts` (TPL-006)
  - [x] Patrón assert recomendado:
    ```typescript
    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ firstName: 'María' }),
      }),
    );
    ```
  - [x] `npm test` + `npm run build`

---

## Notas para el Dev Agent

### Mapa de envíos actuales (pre-6.5)

Todos los `mailService.send` actuales **omiten** `firstName`:

```typescript
// register-user.use-case.ts — TPL-001
variables: { recipientEmail: user.email }

// forgot-password.use-case.ts — TPL-002
variables: { resetLink }

// select-receiver.use-case.ts — TPL-003
variables: { itemTitle, itemCondition, donorReputationScore, sessionDeadlineAt }

// expire-delivery-sessions.use-case.ts — TPL-004
variables: { itemTitle, itemId }

// cancel-item.use-case.ts — TPL-005
variables: { itemTitle }

// request-item.use-case.ts — TPL-006
variables: {}

// degrade-inactive-items.use-case.ts — TPL-007
variables: {}

// reset-password.use-case.ts — TPL-008
variables: {}
```

**Objetivo 6.5:** cada fila añade `firstName` (y `recipientEmail` donde aplique según mapping).

### Plantilla HTML (resend.provider.ts)

Estado actual: ningún template usa `firstName` en el HTML (p. ej. TPL-001 es solo «Tu cuenta ha sido creada…»).

Implementación mínima acordada con architecture §10:

```typescript
const greetingHtml = (v: Record<string, string | number>) =>
  `<p>Hola ${String(v.firstName)},</p>`;

// Ejemplo TPL-001
html: (v) => greetingHtml(v) + `<p>Tu cuenta ha sido creada correctamente.</p>`,
```

**Seguridad:** `firstName` viene de BD tras validación 2–50 en registro (6.2); no interpolar HTML arbitrario del cliente en otros flujos. Escapar no es requisito MVP si el regex de nombres excluye `<>` (confirmar regex 6.2).

### Jobs — SQL exacto a ampliar

**`findExpiredSessions`** (`delivery-session.repository.ts` ~L292):

```sql
SELECT ds.id AS session_id,
       u.email AS donor_email,
       u.first_name AS donor_first_name,
       i.id AS item_id,
       i.title AS item_title
FROM delivery_sessions ds
...
```

**`findNewlyDegradedItems`** (`item.repository.ts` ~L334):

```sql
SELECT i.id AS item_id,
       u.email AS donor_email,
       u.first_name AS donor_first_name
FROM items i
JOIN users u ON u.id = i.donor_id
...
```

Architecture: «no se requiere consulta adicional» — cumplir con JOIN, no N+1 `findById` en el loop del job.

### TPL-006 y `itemTitle`

`email-flow-mapping.md` lista `itemTitle` para EVT-006. El use case ya tiene `item` con título vía `findItemOwnership` — incluir `itemTitle: item.title` en variables si el copy de TPL-006 se amplía; como mínimo **obligatorio** por AC de épica: `firstName`.

### Usuarios legacy (migración 6.1)

Backfill `first_name = 'Usuario'` → emails dirán «Hola Usuario,» hasta PATCH de perfil (6.4). Comportamiento aceptado; no añadir lógica especial.

### Dependencia explícita de 6.2 (TPL-001)

Story **6-2** dejó explícito: *«No cambiar contrato del email TPL-001 (sigue sin firstName hasta 6.5)»*. En 6.5, tras 6.2, usar `user.firstName` del usuario recién creado, no `dto.firstName` suelto (deben coincidir).

### Anti-patrones (no hacer en 6.5)

- No crear segundo `IMailService` ni enviar emails desde controladores.
- No añadir consultas `findById` por email en jobs si el JOIN basta.
- No cambiar `templateId` ni IDs de evento EVT-*.
- No modificar DTOs HTTP de auth/perfil (6.2, 6.3).
- No exigir diff en OpenAPI si no hay schemas de email.

### Inteligencia de historias 6-1 a 6-4

| Story | Relevancia para 6.5 |
|---|---|
| **6-1** | Provee `first_name` en BD y `User.firstName`. Jobs deben leer columna en SQL. |
| **6-2** | Registro con nombres reales → TPL-001 útil. Sin 6.2, solo backfill. |
| **6-3** | Sin impacto directo en emails. |
| **6-4** | Permite que usuarios legacy cambien nombre; fuera de scope 6.5. |

### Cumplimiento de arquitectura

- **Clean Architecture:** cambios en `application/use-cases/*`, `domain/repositories/*` (tipos), `infrastructure/email`, `infrastructure/database/supabase/*`, tests.
- **§10 architecture v1.3:** saludo `{{firstName}}` en TPL-001…008.
- **email-flow-mapping v1.1:** variables ya documentadas; código debe alinearse.

### Verificación

```bash
npm test -- expire-delivery-sessions degrade-inactive-items auth-register auth-password-reset items-select items-cancel-with-session items-request
npm run build
```

### Git reciente (épica 6)

- Stories 6-1…6-3 en `ready-for-dev` / `review`; emails sin `firstName` en `main`/working tree.
- Documentación DLT-003 ya exige `firstName` en mapping; implementación de código es la brecha.

---

## Dev Agent Record

### Agent Model Used

Composer (dev-story runner)

### Debug Log References

- Prerrequisitos 6-1/6-2 verificados: `User.firstName` en entidad y repos; registro persiste `dto.firstName`.
- `FindItemOwnershipResult` ampliado con `title` para TPL-006 sin query adicional.

### Completion Notes List

- `greetingHtml()` prefija TPL-001…008 con «Hola {firstName},».
- Los 8 use cases pasan `firstName` + `recipientEmail` (y variables existentes) en `mailService.send`.
- Jobs EVT-004/EVT-012 obtienen `donorFirstName` vía JOIN SQL (sin N+1).
- TPL-006 incluye `itemTitle` desde `findItemOwnership.title`.
- Nota de implementación añadida en `docs/email-flow-mapping.md` §2.
- 238 tests pasan; build OK; OpenAPI sin cambios de contrato por emails.

### File List

- src/infrastructure/email/resend.provider.ts
- src/application/use-cases/user/register-user.use-case.ts
- src/application/use-cases/user/forgot-password.use-case.ts
- src/application/use-cases/user/reset-password.use-case.ts
- src/application/use-cases/item/select-receiver.use-case.ts
- src/application/use-cases/item/cancel-item.use-case.ts
- src/application/use-cases/item/request-item.use-case.ts
- src/application/use-cases/delivery/expire-delivery-sessions.use-case.ts
- src/application/use-cases/item/degrade-inactive-items.use-case.ts
- src/domain/repositories/delivery-session.repository.ts
- src/domain/repositories/item.repository.ts
- src/infrastructure/database/supabase/delivery-session.repository.ts
- src/infrastructure/database/supabase/item.repository.ts
- docs/email-flow-mapping.md
- tests/expire-delivery-sessions.test.ts
- tests/degrade-inactive-items.test.ts
- tests/auth-register.test.ts
- tests/auth-password-reset.test.ts
- tests/items-select.test.ts
- tests/items-cancel-with-session.test.ts
- tests/items-request.test.ts

### Change Log

- 2026-05-24: Historia 6.5 — saludo personalizado `firstName` en TPL-001…008, variables alineadas con email-flow-mapping, SQL jobs ampliado, tests actualizados.

---

### Review Findings

- [x] [Review][Decision] EVT-012 itemTitle — **Opción B (usuario):** `itemTitle` en `NewlyDegradedItem`, SQL `findNewlyDegradedItems`, `DegradeInactiveItemsUseCase`, TPL-007 HTML y tests.
- [x] [Review][Patch] request-item.use-case.ts — email TPL-006 fire-and-forget con `.catch()` (sin bloquear respuesta HTTP).
- [x] [Review][Defer] XSS en greetingHtml(): `firstName` interpolado sin HTML escaping — mitigado por validación regex de 6.2 (solo letras Unicode, 2–50 chars, sin `<>`); aceptado en MVP [src/infrastructure/email/resend.provider.ts:13] — deferred, pre-existing risk accepted in story spec

#### CR-2 (segunda pasada — 2026-05-25)

- [x] [Review][Patch] `findById` expuesto fuera de cadena fire-and-forget en `request-item.use-case.ts:28` — fallo de BD post-create → 500 en lugar de 201 (regresión AC #5). **Fix aplicado:** encadenado en promise con `.then()/.catch()` único. [src/application/use-cases/item/request-item.use-case.ts]
- [x] [Review][Patch] Test EVT-006 sin assert de `itemTitle` en variables — gap de cobertura frente a email-flow-mapping §2. **Fix aplicado.** [tests/items-request.test.ts]
- [x] [Review][Defer] `expiresInMinutes: 60` enviado en variables EVT-002 pero no interpolado en HTML de TPL-002 (hardcoded "1 hora"). No viola AC; variable disponible para future template. [src/infrastructure/email/resend.provider.ts] — deferred, not required by story AC

---

## Referencias

- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Épica 6, Historia 6.5]
- [Source: docs/architecture.md — §10 Notificaciones por Email]
- [Source: docs/email-flow-mapping.md — §1–§2]
- [Source: docs/delta-backend-DLT-003.md — templates TPL-001…008]
- [Source: _bmad-output/initiative-backend/tickets/epic-ampliacion-del-modelo-de-usuario-dlt-003/tickets/story-migracion-sql-y-entidad-user-dlt-003-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-ampliacion-del-modelo-de-usuario-dlt-003/tickets/story-registro-login-y-middleware-is-active-plan.md]
- [Source: src/domain/services/mail.service.ts]
- [Source: src/infrastructure/email/resend.provider.ts]
- [Source: src/application/use-cases/user/register-user.use-case.ts]
- [Source: src/application/use-cases/user/forgot-password.use-case.ts]
- [Source: src/application/use-cases/user/reset-password.use-case.ts]
- [Source: src/application/use-cases/item/select-receiver.use-case.ts]
- [Source: src/application/use-cases/item/cancel-item.use-case.ts]
- [Source: src/application/use-cases/item/request-item.use-case.ts]
- [Source: src/application/use-cases/delivery/expire-delivery-sessions.use-case.ts]
- [Source: src/application/use-cases/item/degrade-inactive-items.use-case.ts]
- [Source: tests/expire-delivery-sessions.test.ts]
- [Source: tests/degrade-inactive-items.test.ts]

---

Ultimate context engine analysis completed — comprehensive developer guide created.
