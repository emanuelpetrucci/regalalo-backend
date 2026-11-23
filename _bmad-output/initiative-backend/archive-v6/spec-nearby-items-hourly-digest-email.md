---
title: 'Digest horario por email de objetos nuevos cercanos (50 km)'
type: 'feature'
created: '2026-05-29'
status: 'ready-for-dev'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/docs/email-template-design.md'
  - '{project-root}/_bmad-output/implementation-artifacts/2-2-listar-objetos-disponibles-en-radio-geografico.md'
  - '{project-root}/_bmad-output/implementation-artifacts/9-1-layout-shell-y-tokens-email.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Cuando se publican objetos, los usuarios cercanos no reciben aviso proactivo; el feed solo se descubre entrando a la app. En hosting serverless no hay crons internos fiables, y un email por cada publicación saturaría bandejas de entrada.

**Approach:** Exponer un endpoint HTTP protegido por secreto, invocable desde un cron externo cada hora. El job agrupa todos los objetos `active` publicados en la última hora y envía **un solo email por destinatario** con la lista de objetos a ≤50 km de su ubicación (misma regla geográfica que el feed), excluyendo sus propios objetos.

## Boundaries & Constraints

**Always:**
- Clean Architecture: use-case en `application/`, SQL en `infrastructure/database/supabase/`, ruta sin lógica de negocio.
- Radio **50 km** (`RADIUS_METERS = 50000`) y PostGIS `ST_DWithin`, alineado con `findActiveInRadius`.
- Ventana temporal: `items.created_at >= NOW() - INTERVAL '1 hour'`.
- Un email por usuario destinatario por ejecución del job (digest), no un email por objeto.
- Plantilla nueva **TPL-010** vía `renderEmailLayout()` y `emailTemplateRegistry` (patrón TPL-006/007).
- Autenticación del job: header `X-Cron-Secret` = env `CRON_SECRET`, **sin JWT de usuario**. Respuesta 401 si falta o no coincide.
- Evento / plantilla: **EVT-015** / **TPL-010** (no reutilizar EVT-014 / TPL-009 de verificación de email).
- No exponer `location` en DTOs ni en el email; solo título, categoría opcional y enlace a explorar.
- Envío con `IMailService` / Resend; fallo de un destinatario no aborta el resto (log + continuar).
- Registrar en OpenAPI la ruta (aunque sea operacional).
- Tests Vitest + supertest del endpoint y del use-case (mocks de repo/mail).

**Idempotencia (Correct Course 2026-05-29):** columna `digest_notified_at` en `items`; marcar **antes** del envío. Ver `docs/delta-backend-EVT015.md`.

**Ask First:**
- Si el digest debe incluir objetos con `degraded_at IS NOT NULL` publicados en la última hora (por defecto: **sí**, igual que pueden aparecer en el feed).

**Never:**
- Disparar emails en `PublishItemUseCase` (síncrono al publicar).
- `setInterval` en `main.ts` para este flujo (serverless).
- `SELECT *` en respuestas API del job.
- Enviar a usuarios sin `email_verified` o con `is_active = FALSE` (por defecto excluidos).
- Enviar digest vacío (si no hay objetos recientes o ningún par usuario–objeto, responder 200 con contadores en cero y **cero** emails).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cron válido, hay objetos y destinatarios | `POST /api/jobs/nearby-items-digest` + header secreto correcto; ≥1 item en última hora; usuarios con `location` a ≤50 km | `200` `{ itemsInWindow, recipientsNotified, emailsSent, emailsFailed }`; un email por destinatario con lista de objetos | Fallos Resend por usuario: incrementar `emailsFailed`, log error, seguir |
| Cron válido, sin objetos recientes | Misma petición; ningún item en ventana 1 h | `200` con contadores en ero; ningún email | N/A |
| Cron válido, objetos pero sin destinatarios | Items recientes; ningún usuario calificado en radio | `200` `recipientsNotified: 0` | N/A |
| Secreto ausente o incorrecto | Sin header o valor distinto de `CRON_SECRET` | `401` mensaje genérico | No filtrar si el secreto existe |
| Usuario sin ubicación | `location IS NULL` | Excluido del digest | N/A |
| Usuario es donante del objeto | `donor_id = user.id` | Ese objeto no entra en su digest | N/A |
| Item no active o fuera de ventana | `status != 'active'` o `created_at` antiguo | Ignorado | N/A |
| Rate limit global | Muchas peticiones al endpoint | Aplica `globalRateLimit` existente | 429 estándar |

</frozen-after-approval>

## Code Map

- `src/infrastructure/database/supabase/item.repository.ts` — `RADIUS_METERS`, patrón `ST_DWithin` de `findActiveInRadius`; referencia para nueva consulta de digest.
- `src/domain/repositories/item.repository.ts` — añadir tipos + método `findRecentItemsNearbyUsers()` (nombre final al implementar).
- `src/application/use-cases/item/send-nearby-items-digest.use-case.ts` — orquestación: consulta agrupada, loop `mailService.send`, métricas de resultado.
- `src/application/dtos/nearby-items-digest.dto.ts` — DTO de respuesta del job.
- `src/infrastructure/email/templates/tpl-010-nearby-items-digest.ts` — HTML del listado (títulos + CTA «Explorar objetos» → `APP_PUBLIC_URL`).
- `src/infrastructure/email/templates/registry.ts` — registrar `TPL-010`.
- `src/interfaces/http/middlewares/cron-auth.middleware.ts` — validar header `X-Cron-Secret`.
- `src/interfaces/http/routes/jobs.routes.ts` — router `POST /jobs/nearby-items-digest`.
- `src/interfaces/http/routes/index.ts` — montar `/jobs` **sin** `authMiddleware` de usuario.
- `src/interfaces/http/controllers/jobs.controller.ts` — delegar al use-case.
- `src/config/env.ts` + `.env*.example` — `CRON_SECRET` requerido en prod (opcional en test con valor de vitest).
- `src/openapi/register-paths.ts` + schemas — documentar endpoint operacional.
- `tests/nearby-items-digest.test.ts` — casos de la matriz I/O.
- `docs/email-template-design.md` — añadir TPL-010 en tabla §4 (tier P2/P3).

## Tasks & Acceptance

**Execution:**
- [ ] `src/config/env.ts` — añadir `CRON_SECRET` (`requiredSecret` en production; en `test` usar valor de `vitest.config.ts`) — proteger el endpoint.
- [ ] `src/domain/repositories/item.repository.ts` — interfaces `NearbyDigestRecipient` (userId, email, firstName, items: `{ id, title, distanceMeters }[]`) y método de repositorio — contrato del digest.
- [ ] `src/infrastructure/database/supabase/item.repository.ts` — SQL agrupado: items última hora + join usuarios elegibles + `ST_DWithin` + `donor_id != user` + filtros `email_verified`/`is_active` — una query, agrupar en TS si hace falta.
- [ ] `src/application/dtos/nearby-items-digest.dto.ts` — `NearbyItemsDigestResultDto` — respuesta HTTP.
- [ ] `src/application/use-cases/item/send-nearby-items-digest.use-case.ts` — ejecutar digest, enviar TPL-010, tolerancia a fallos por destinatario — lógica de negocio.
- [ ] `src/infrastructure/email/templates/tpl-010-nearby-items-digest.ts` — plantilla con lista HTML escapada (`escape-html`) — UX del digest.
- [ ] `src/infrastructure/email/templates/registry.ts` — registrar TPL-010 — integración Resend.
- [ ] `src/interfaces/http/middlewares/cron-auth.middleware.ts` — validación de secreto — seguridad.
- [ ] `src/interfaces/http/controllers/jobs.controller.ts` + `routes/jobs.routes.ts` + `routes/index.ts` — `POST /api/jobs/nearby-items-digest` — superficie HTTP para cron externo.
- [ ] `src/openapi/register-paths.ts` — path documentado con security scheme `cronSecret` — contrato API.
- [ ] `tests/nearby-items-digest.test.ts` — 401, 200 vacío, 200 con envíos mockeados — regresión.
- [ ] `.env.example`, `.env.dev.example`, `.env.prod.example` — documentar `CRON_SECRET` — operaciones.
- [ ] `docs/email-template-design.md` — fila TPL-010 — documentación de plantillas.

**Acceptance Criteria:**
- Given un cron externo con el secreto correcto, when `POST /api/jobs/nearby-items-digest`, then responde 200 con contadores y envía como máximo un email por usuario elegible.
- Given dos objetos publicados en la última hora a ≤50 km del mismo usuario (y no son suyos), when se ejecuta el job, then ese usuario recibe un único email que menciona ambos objetos.
- Given un objeto publicado hace más de 1 hora, when se ejecuta el job, then ese objeto no aparece en ningún digest.
- Given petición sin secreto válido, when se invoca el endpoint, then responde 401 y no se envía ningún email.

## Design Notes

Consulta SQL orientativa (ajustar nombres de columnas al esquema real):

```sql
-- Items recientes + usuarios en radio, excluyendo donante
SELECT u.id, u.email, u.first_name,
       i.id AS item_id, i.title,
       ROUND(ST_Distance(u.location, i.location))::int AS distance_meters
FROM items i
JOIN users u ON u.location IS NOT NULL
  AND u.email_verified = TRUE
  AND u.is_active = TRUE
  AND i.donor_id != u.id
  AND ST_DWithin(u.location, i.location, 50000)
WHERE i.status = 'active'
  AND i.created_at >= NOW() - INTERVAL '1 hour'
ORDER BY u.id, i.created_at DESC;
```

Agrupar filas por `u.id` en el repositorio o use-case antes de enviar.

Variables TPL-010 sugeridas: `firstName`, `itemCount`, `itemsListHtml` (fragmento `<ul>` con títulos escapados), CTA `APP_PUBLIC_URL` (ruta explorar del front).

**Cron externo:** programar cada hora (`0 * * * *`) en cron-job.org contra `POST https://<api>/api/jobs/nearby-items-digest` con header `X-Cron-Secret: $CRON_SECRET`.

## Verification

**Commands:**
- `npm run build` — expected: sin errores TS + OpenAPI regenerado.
- `npx vitest run tests/nearby-items-digest.test.ts` — expected: todos los casos verdes.
- `npx vitest run` — expected: suite completa sin regresiones.

**Manual checks:**
- Con DB de desarrollo y Resend de prueba: publicar 2 objetos, invocar endpoint, verificar un solo email con ambos títulos.
- Invocar dos veces seguidas: objetos con `digest_notified_at` ya establecido no se reenvían.
