# email-flow-mapping.md
**Versión:** 1.5
**Fecha:** Junio 2026
**Scope:** Identificación y mapeo de todos los eventos de notificación por email — Backend Node.js / Clean Architecture
**Cambios respecto a v1.4:** Correct Course 2026-06-09 — Sistema de Reportes (PRD-REP-BE-01): EVT-016…EVT-019 y templates TPL-011, TPL-012, TPL-013, TPL-ADM-002.
**Cambios respecto a v1.3:** Correct Course 2026-05-29 — EVT-015 / TPL-010 digest horario de objetos cercanos (`POST /api/jobs/nearby-items-digest`). EVT-014 / TPL-009 sin cambios (verificación de email).
**Cambios respecto a v1.2:** Correct Course 2026-05-26 — registro envía solo TPL-009 (EVT-014); EVT-001/TPL-001 reservado en catálogo, no en RegisterUser. Presentación visual: `docs/email-template-design.md`.

---

## 1. Tabla de Mapeo de Emails

| ID_Evento | Trigger | Capa / Origen | Destinatario | Template_Ref | Condicionales |
|---|---|---|---|---|---|
| EVT-001 | *(Reservado — no usado en registro MVP)* | — | — | `TPL-001` | Catálogo legacy; bienvenida integrada en TPL-009 |
| EVT-002 | Usuario solicita recuperación de contraseña | Use Case: `RequestPasswordReset` | Usuario solicitante | `TPL-002` | Respuesta HTTP siempre 200. El envío solo se ejecuta si el email existe en base de datos. |
| EVT-003 | Donante selecciona receptor para un objeto | Use Case: `SelectReceiver` | Receptor seleccionado | `TPL-003` | La solicitud del receptor existe en estado `pending`. El objeto está en estado `active`. |
| EVT-004 | Sesión de entrega expira sin confirmación del donante | Infrastructure Job: `expire-delivery-sessions` (pg_cron, cada hora) | Donante | `TPL-004` | `delivery_sessions.status` pasa a `expired`. `deadline_at < NOW()`. `donor_confirmed = FALSE`. |
| EVT-005 | Donante cancela un objeto con sesión activa | Use Case: `CancelItem` | Receptor seleccionado | `TPL-005` | Existe una `delivery_session` en estado `active` asociada al objeto en el momento de la cancelación. |
| EVT-006 | Receptor solicita un objeto | Use Case: `RequestItem` | Donante del objeto | `TPL-006` | El objeto existe en estado `active`. La solicitud supera la validación de límite (ventana deslizante 720h). El solicitante no es el propio donante. |
| EVT-012 | Objeto pasa a estado degradado por inactividad | Infrastructure Job: `degrade-inactive-items` (pg_cron, cada hora) | Donante del objeto | `TPL-007` | `items.degraded_at` se establece por primera vez (transición de `NULL` a valor). `items.status = 'active'`. |
| EVT-013 | Usuario completa el reset de contraseña exitosamente | Use Case: `ResetPassword` | Usuario que ejecutó el reset | `TPL-008` | Token válido, no expirado y no utilizado previamente (`used = FALSE`). Contraseña actualizada correctamente. |
| EVT-014 | Registro completado o reenvío solicitado por el usuario | Use Case: `RegisterUser` / Use Case: `ResendVerification` | Usuario registrado pendiente de verificación | `TPL-009` | Registro: reCAPTCHA score ≥ 0.5, email único, código postal geocodificable. Reenvío: JWT válido, `email_verified = FALSE`, cooldown de 30 segundos superado. Incluye saludo de bienvenida breve en registro. |
| EVT-015 | Cron externo (cron-job.org) invoca `POST /api/jobs/nearby-items-digest` cada hora | Use Case: `SendNearbyItemsDigestUseCase` | Usuarios `is_active = TRUE`, `email_verified = TRUE`, con `location` dentro de 50 km de al menos un objeto publicado en la última hora; excluye al donante de cada objeto | `TPL-010` | ≥1 objeto con `digest_notified_at IS NULL`, `status = 'active'` y `created_at >= NOW() - INTERVAL '1 hour'`. Un email por usuario con todos los objetos agrupados (orden `distanceKm ASC`). |
| EVT-016 | Usuario envía un reporte | Use Case: `CreateReportUseCase` | Denunciante (`reporter_id`) | `TPL-011` | POST `/api/reports` exitoso (201) |
| EVT-017 | Admin resuelve o archiva un reporte | Use Case: `AdminResolveReportUseCase` | Denunciante (`reporter_id`) | `TPL-012` | `reporter_id IS NOT NULL` al momento de la resolución |
| EVT-018 | Admin resuelve reporte con acción `warn_user` | Use Case: `AdminResolveReportUseCase` | Usuario denunciado (`reported_entity_id`) | `TPL-013` | `action = 'warn_user'` + `reported_entity_type = 'user'` + usuario activo |
| EVT-019 | Usuario envía un reporte | Use Case: `CreateReportUseCase` | Operador (`ADMIN_EMAIL`) | `TPL-ADM-002` | POST `/api/reports` exitoso (201). Siempre se envía, sin condición sobre tipo ni motivo |

---

## 2. Tabla de Definición de Datos por Evento

| ID_Evento | Template_Ref | Variables_Requeridas | Prioridad |
|---|---|---|---|
| EVT-001 | `TPL-001` | `recipientEmail`, `firstName` | Media (catálogo) |
| EVT-002 | `TPL-002` | `recipientEmail`, `firstName`, `resetLink`, `expiresInMinutes` | Alta |
| EVT-003 | `TPL-003` | `recipientEmail`, `firstName`, `itemTitle`, `itemCondition`, `donorReputationScore`, `sessionDeadlineAt` | Alta |
| EVT-004 | `TPL-004` | `recipientEmail`, `firstName`, `itemTitle`, `itemId` | Media |
| EVT-005 | `TPL-005` | `recipientEmail`, `firstName`, `itemTitle` | Alta |
| EVT-006 | `TPL-006` | `recipientEmail`, `firstName`, `itemTitle` | Media |
| EVT-012 | `TPL-007` | `recipientEmail`, `firstName`, `itemTitle`, `itemId` | Media |
| EVT-013 | `TPL-008` | `recipientEmail`, `firstName` | Alta |
| EVT-014 | `TPL-009` | `recipientEmail`, `firstName`, `verificationLink`, `expiresInHours` | Alta |
| EVT-015 | `TPL-010` | `recipientEmail`, `firstName`, `items[]`, `appUrl` | Media |
| EVT-016 | `TPL-011` | `recipientEmail`, `firstName`, `reportedEntityType` (`"objeto"`/`"usuario"`), `reason` (label legible) | Media |
| EVT-017 | `TPL-012` | `recipientEmail`, `firstName`, `reportedEntityType` (`"objeto"`/`"usuario"`) | Baja |
| EVT-018 | `TPL-013` | `recipientEmail`, `firstName` | Alta |
| EVT-019 | `TPL-ADM-002` | `reportId`, `reportedEntityType`, `reason` (label legible), `entitySnapshotTitle`, `reporterFirstName`, `createdAt` | Alta |

**Estructura `items[]` (EVT-015 / TPL-010):** `itemId`, `title`, `condition`, `distanceKm` (entero); `imageUrl` opcional (primera imagen en Supabase Storage).

**Valores fijos EVT-014:**
- `expiresInHours`: `24`
- `verificationLink`: `{APP_PUBLIC_URL}/verificar-email?token={token_raw}`

> **Nota de implementación (historia 6.5):** `firstName` es obligatorio en código desde v1.3; todos los `IMailService.send` correspondientes deben incluirlo en `variables`.

> **Presentación visual (Épica 9):** todos los TPL activos deben renderizarse con `renderEmailLayout()` — ver `docs/email-template-design.md`.

---

## 3. Diagrama de Flujo por Capa

```
┌─────────────────────────────────────────────────────────┐
│                    INTERFACES / HTTP                    │
│          Controller recibe petición HTTP                │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                 APPLICATION / USE CASES                 │
│                                                         │
│  RegisterUser          → IMailService.send(TPL-009)     │
│  ResendVerification    → IMailService.send(TPL-009)     │
│  RequestPasswordReset  → IMailService.send(TPL-002)     │
│  SelectReceiver        → IMailService.send(TPL-003)     │
│  CancelItem            → IMailService.send(TPL-005)     │
│  RequestItem           → IMailService.send(TPL-006)     │
│  ResetPassword         → IMailService.send(TPL-008)     │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              INFRASTRUCTURE / EMAIL                     │
│                                                         │
│  ResendMailProvider implements IMailService             │
│  → Registry TPL-xxx → renderEmailLayout() + contenido   │
│  → Llamada a API de Resend                              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│           INFRASTRUCTURE / JOBS (pg_cron)               │
│                                                         │
│  expire-delivery-sessions                               │
│  → ExpireDeliverySessionsUseCase → TPL-004              │
│                                                         │
│  degrade-inactive-items                                 │
│  → DegradeInactiveItemsUseCase → TPL-007                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                EXTERNAL CRON (cron-job.org)             │
│  POST /api/jobs/nearby-items-digest — cada hora         │
│           Header: X-Cron-Secret: <CRON_SECRET>          │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              INTERFACES / HTTP                          │
│   cronAuthMiddleware → JobsController.nearbyItemsDigest │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│             APPLICATION / USE CASES                     │
│   SendNearbyItemsDigestUseCase → IMailService (TPL-010)   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│       APPLICATION / USE CASES (Módulo Reportes)         │
│                                                         │
│  CreateReportUseCase      → IMailService.send(TPL-011)  │
│                           → IMailService.send(TPL-ADM-002)│
│  AdminResolveReportUseCase→ IMailService.send(TPL-012)  │
│                           → IMailService.send(TPL-013)  │
│                             (solo si action=warn_user)  │
└─────────────────────────────────────────────────────────┘
```

**Nota:** `RegisterUser` dispara **un único** email tras la inserción del usuario: TPL-009 (bienvenida breve + verificación). No se envía TPL-001 en el flujo de registro.

---

## 4. Eventos Evaluados y Descartados para el MVP

| ID | Evento evaluado | Motivo de descarte |
|---|---|---|
| EVT-007 | Notificación a candidatos rechazados al seleccionar receptor | Descartado por decisión de producto. Sin email. |
| EVT-008 | Recordatorio de expiración de sesión de entrega | Descartado por decisión de producto. Sin recordatorios. |
| EVT-009 | Notificación al receptor penalizado por no-show | Descartado por decisión de producto. El sistema actúa en silencio. |
| EVT-010 | Confirmación de entrega completada al donante y/o receptor | Descartado por decisión de producto. Sin email de confirmación. |
| EVT-011 | Notificación al receptor cuando el objeto se reactiva tras expiración | Descartado por decisión de producto. Sin notificación. |

---

## 5. Notas de Diseño

**EVT-002 — Enumeración de usuarios:**
El Use Case `RequestPasswordReset` devuelve siempre HTTP 200 al controlador. El envío del email a Resend solo se ejecuta si el email existe en base de datos. Esta lógica reside íntegramente en el Use Case.

**EVT-003 — contactChannel:**
El canal de contacto del donante no se transmite por email. El receptor lo obtiene exclusivamente accediendo a la sesión activa a través de la API autenticada (`GET /delivery-sessions/:id`). El email de selección notifica al receptor que ha sido elegido e indica que acceda a la plataforma para ver el canal de contacto.

**EVT-005 — Condicional de receptor activo:**
El envío de TPL-005 solo procede si existe un receptor en estado `selected` en el momento de la cancelación. Si el objeto nunca tuvo receptor seleccionado, no se genera ningún email.

**EVT-006 — Frecuencia por objeto:**
Se envía un email por cada solicitud individual recibida. No se agrupan en resúmenes. El Use Case `RequestItem` dispara el envío tras validar y persistir la solicitud.

**EVT-012 — Activación única:**
El email se envía en el momento en que `degraded_at` se establece por primera vez. El job `degrade-inactive-items` solo actualiza objetos con `degraded_at IS NULL`, por lo que la transición es única por objeto. No existe riesgo de envíos duplicados.

**EVT-014 — Token de verificación y reenvíos:**
El token de verificación se genera con `crypto.randomBytes(32)` y se almacena en base de datos únicamente como hash SHA-256. El token en texto plano solo existe en el enlace del email. Cada reenvío genera un nuevo token e invalida el anterior, ya que `verification_token_hash` se sobrescribe. El cooldown de 30 segundos entre reenvíos se controla mediante el campo `verification_resend_at` en la tabla `users`. El Use Case `ResendVerification` comprueba este campo antes de emitir un nuevo token.

**Jobs de pg_cron — desacoplamiento:**
Ningún job invoca Resend directamente. Cada job invoca el Use Case correspondiente (`ExpireDeliverySessionsUseCase`, `DegradeInactiveItemsUseCase`) a través de inyección de dependencias. El Use Case es responsable de la lógica de negocio y del envío via `IMailService`.

**EVT-015 — Idempotencia y ventana temporal:**
Los objetos se marcan con `digest_notified_at = NOW()` **antes** del envío de emails. El envío es best-effort: fallo de Resend para un usuario queda en log (`warn`) sin revertir el marcado. Sin opt-out de digest en MVP.

**EVT-015 — Agrupación:** un usuario recibe un único email con todos los objetos de la hora en su radio, ordenados por `distanceKm ASC`. El digest **no** actualiza `last_active_at`.

**EVT-016/017 — Información revelada al denunciante:**
El email de confirmación (TPL-011) no menciona al denunciado ni al contenido específico del reporte.
El email de resolución (TPL-012) solo confirma que el reporte fue revisado con frase genérica ("Hemos tomado las medidas que consideramos oportunas"); no revela la acción tomada por el administrador.

**EVT-018 — Confidencialidad del reporte:**
El email de advertencia (TPL-013) no menciona el reporte, al denunciante ni al motivo específico.
Decisión de diseño D-REP-06 del PRD-REP-BE-01: el denunciado no puede inferir la existencia ni el origen del reporte.

**EVT-019 — Namespace admin:**
TPL-ADM-002 vive en el namespace de admin junto con TPL-ADM-001 (OTP). No sigue la numeración TPL-0XX del sistema público. Destinatario siempre `ADMIN_EMAIL` (variable de entorno).

---

## 6. Puntos Pendientes de Resolución

| ID | Descripción | Estado |
|---|---|---|
| PND-001 | Contenido de onboarding en TPL-001 | ✅ Cerrado — bienvenida en TPL-009; TPL-001 en catálogo |
| PND-002 | Notificación al donante por nueva solicitud | ✅ Cerrado — incorporado como EVT-006 / TPL-006. |
| PND-003 | Idioma objetivo de las plantillas | ✅ Cerrado — español único. |
| PND-004 | Layout de marca en todos los TPL | 🔄 Épica 9 — `docs/email-template-design.md` |
