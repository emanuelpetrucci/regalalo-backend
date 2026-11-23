---
title: "Plantilla TPL-009 y email-flow v1.2"
type: feature
ticket: 6
status: done
created: 2026-10-25
---

# Historia 8.6: Plantilla TPL-009 y email-flow v1.2

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como operador del sistema,
quiero la plantilla Resend, documentación y contrato OpenAPI alineados con EVT-014,
para envíos consistentes en registro y reenvío y un flujo de verificación verificable de punta a punta.

## Criterios de aceptación

1. **Dado** `docs/email-flow-mapping.md` v1.2, **cuando** se revisa el repo, **entonces** EVT-014 y TPL-009 están documentados con variables `recipientEmail`, `firstName`, `verificationLink`, `expiresInHours` (prioridad Alta) y valores fijos: `expiresInHours: 24`, `verificationLink: {APP_PUBLIC_URL}/verificar-email?token={token_raw}`.

2. **Dado** `src/infrastructure/email/resend.provider.ts`, **cuando** se inspecciona, **entonces** existe entrada `TPL-009` con subject en español, saludo `firstName` vía `greetingHtml`, enlace clickeable `verificationLink` y texto de expiración con `expiresInHours` — mismo estilo inline HTML que TPL-001–TPL-008.

3. **Dado** OpenAPI regenerado (`npm run openapi:generate`), **cuando** se inspecciona `openapi/openapi.json`, **entonces** incluye:
   - `GET /auth/verify-email` (público, query `token`, respuesta 200 `MessageResponse`, errores 400)
   - `POST /auth/resend-verification` (Bearer JWT, respuesta 200 `MessageResponse`, errores 401, 409, 429 con descripción de `Retry-After`)

4. **Dado** rutas protegidas documentadas en OpenAPI que requieren auth, **cuando** aplica verificación de email (post-8.3), **entonces** las respuestas 403 relevantes documentan el código de error `EMAIL_NOT_VERIFIED` donde el handler lo emite (mínimo en paths de ejemplo: `GET /users/me`).

5. **Dado** tests de integración auth del flujo de verificación, **cuando** se ejecuta `npm test`, **entonces** cubren:
   - Registro exitoso → `mailService.send` ×2 (TPL-001 luego TPL-009 con variables correctas)
   - `GET /auth/verify-email` token válido → 200 + limpieza de token
   - `GET /auth/verify-email` token inválido/expirado → 400
   - `POST /auth/resend-verification` con cooldown activo → 429 + header `Retry-After`
   - `POST /auth/resend-verification` con email ya verificado → 409
   - Middleware: usuario autenticado con `emailVerified: false` en ruta protegida → 403 + `code: EMAIL_NOT_VERIFIED`

6. **Dado** la suite completa, **cuando** se ejecuta `npm run build`, **entonces** compila sin errores (OpenAPI incluido en build).

## Alcance explícito (IN / OUT)

| IN (8.6) | OUT (otras historias) |
|---|---|
| Verificar/completar `TPL-009` en `resend.provider.ts` si 8.2 dejó huecos | Migración SQL / métodos repo (8.1) |
| Auditar y corregir gaps en `docs/email-flow-mapping.md` v1.2 | Lógica de `RegisterUserUseCase` token (8.2) |
| OpenAPI: schemas + paths verify/resend en `register-paths.ts` y `auth.schemas.ts` | Implementación `VerifyEmailUseCase` (8.4) |
| Regenerar `openapi/openapi.json` | Implementación `ResendVerificationUseCase` (8.5) |
| Test transversal `tests/auth-email-verification-flow.test.ts` (o ampliación coordinada de tests existentes) | Middleware `EmailNotVerifiedException` (8.3) |
| Documentar 403 `EMAIL_NOT_VERIFIED` en OpenAPI donde aplique | Frontend Angular `/verificar-email` |
| `npm run build` + `npm test` | Plantilla Resend dashboard externa (MVP usa HTML local) |
| | Marcar épica 8 como `done` |

**Prerrequisitos bloqueantes:** Historias **8.1–8.5** implementadas y mergeadas (o en la misma rama de trabajo). Esta historia **no** introduce use cases ni rutas nuevas: consolida plantilla, contrato API, documentación e integración transversal.

**Nota de coordinación:** El enlace del email apunta a la SPA `{APP_PUBLIC_URL}/verificar-email?token=…`; la API es `GET /api/auth/verify-email?token=…`. No confundir rutas en docs ni tests.

## Tareas / Subtareas

- [x] **Task 1 — Prerrequisitos 8.1–8.5** (AC: #5)
  - [x] Confirmar en código: migración 015, TPL-009 en registro/reenvío, middleware 403, endpoints verify/resend
  - [x] Si alguna historia previa falta, **detener** y completarla antes — no reimplementar lógica de negocio en 8.6

- [x] **Task 2 — Plantilla TPL-009** (AC: #2)
  - [x] Verificar en `resend.provider.ts` entrada `'TPL-009'` (8.2 debería haberla añadido):
    ```typescript
    'TPL-009': {
      subject: 'Verifica tu email — Regálalo',
      html: (v) =>
        greetingHtml(v) +
        `<p>Confirma tu dirección de email haciendo clic en el enlace:</p>` +
        `<p><a href="${v.verificationLink}">${v.verificationLink}</a></p>` +
        `<p>El enlace expira en ${v.expiresInHours} horas.</p>`,
    },
    ```
  - [x] Si falta, añadirla; si existe, validar variables usadas coinciden con EVT-014
  - [x] **No** crear TPL-010 ni duplicar envíos en use cases

- [x] **Task 3 — Documentación email-flow v1.2** (AC: #1)
  - [x] Revisar `docs/email-flow-mapping.md` (debe estar en v1.2):
    - Tabla §1: fila EVT-014 con triggers RegisterUser / ResendVerification
    - Tabla §2: variables incluyen **`firstName`** (alineado a 6.5 y architecture §10)
    - §3 diagrama: RegisterUser → TPL-001 + TPL-009; ResendVerification → TPL-009
    - §5 nota EVT-014 token/cooldown
  - [x] Si `docs/delta-email-flow-verification.md` difiere (p. ej. omite `firstName` en §2), **no** editar el delta — el source of truth es `email-flow-mapping.md` v1.2
  - [x] Corregir solo gaps reales en `email-flow-mapping.md` (typo, variable faltante, URL incorrecta)

- [x] **Task 4 — OpenAPI schemas** (AC: #3, #4)
  - [x] En `src/openapi/schemas/auth.schemas.ts` añadir:
    ```typescript
    export const verifyEmailQuerySchema = z
      .object({ token: z.string().min(1).max(256) })
      .openapi('VerifyEmailQuery');

    export const resendVerificationResponseSchema = messageResponseSchema; // reutilizar
    ```
  - [x] Reutilizar `messageResponseSchema` para respuestas 200 de verify y resend
  - [x] Opcional: schema de error con `code` para 403:
    ```typescript
    export const emailNotVerifiedErrorSchema = z
      .object({ message: z.string(), code: z.literal('EMAIL_NOT_VERIFIED') })
      .openapi('EmailNotVerifiedError');
    ```

- [x] **Task 5 — OpenAPI paths** (AC: #3, #4)
  - [x] En `src/openapi/register-paths.ts`, **después** de `reset-password`, registrar:
    ```typescript
    registry.registerPath({
      method: 'get',
      path: '/auth/verify-email',
      tags: ['Auth'],
      summary: 'Verificar email con token',
      request: { query: verifyEmailQuerySchema },
      responses: {
        200: json(messageResponseSchema, 'Email verificado'),
        400: err400,
        500: err500,
      },
    });

    registry.registerPath({
      method: 'post',
      path: '/auth/resend-verification',
      tags: ['Auth'],
      summary: 'Reenviar email de verificación',
      security: [...secured],
      responses: {
        200: json(messageResponseSchema, 'Email de verificación reenviado'),
        401: err401,
        409: err409,
        429: json(errorSchema, 'Cooldown activo — incluir header Retry-After'),
        500: err500,
      },
    });
    ```
  - [x] Añadir 403 con `emailNotVerifiedErrorSchema` en `GET /users/me` (y opcionalmente otros paths protegidos principales)
  - [x] Ejecutar `npm run openapi:generate` y commitear `openapi/openapi.json` actualizado

- [x] **Task 6 — Tests de integración del flujo** (AC: #5)
  - [x] Crear `tests/auth-email-verification-flow.test.ts` **o** extender tests existentes sin duplicar asserts:
    - Reutilizar helpers `buildTestApp` de `auth-register.test.ts`, `auth-verify-email.test.ts`, `auth-middleware.test.ts`
    - **Registro dual-email:** assert orden TPL-001 → TPL-009 y variables TPL-009 (`recipientEmail`, `firstName`, `verificationLink` contiene `/verificar-email?token=`, `expiresInHours: 24`)
    - **Verify:** token válido 200; inválido/expirado 400
    - **Resend:** 429 con `Retry-After` si cooldown; 409 si `emailVerified: true`
    - **Middleware:** ruta protegida mock con `emailVerified: false` → 403 `{ code: 'EMAIL_NOT_VERIFIED' }`
  - [x] Fixtures `mockUser` deben incluir campos de verificación post-8.1:
    ```typescript
    verificationTokenHash: 'abc…',
    verificationTokenExpiresAt: futureDate,
    verificationResendAt: pastDate, // o future según caso cooldown
    emailVerified: false,
    ```
  - [x] Ejecutar `npm test` y `npm run build`

---

## Notas para el Dev Agent

### Contexto de épica 8

**8.6** es la historia **cierre transversal** de la épica: no añade endpoints ni use cases (eso es 8.2–8.5), sino que garantiza que plantilla, documentación, contrato OpenAPI y tests cubren el flujo EVT-014/TPL-009 de punta a punta.

**Orden:** `8.1` → `8.2` → `8.3` → `8.4` + `8.5` → **`8.6`**. Ejecutar dev-story de 8.6 solo cuando 8.1–8.5 estén implementados.

### Estado actual del código (leer antes de editar)

**`resend.provider.ts`** — templates `TPL-001`…`TPL-008` únicamente; **`TPL-009` ausente** hasta que 8.2 se implemente. 8.6 verifica/completa si 8.2 ya corrió.

**`register-paths.ts`** — auth paths: register, login, forgot-password, reset-password. **Faltan** `GET /auth/verify-email` y `POST /auth/resend-verification`.

**`openapi/openapi.json`** — sin paths verify/resend (`grep` sin coincidencias).

**`docs/email-flow-mapping.md`** — ya en **v1.2** con EVT-014, TPL-009 y variables incluyendo `firstName`. AC #1 es principalmente **auditoría**; corregir solo inconsistencias.

**Tests existentes (por historia):**
| Archivo | Cubre |
|---|---|
| `tests/auth-register.test.ts` | Registro; ampliar/assert dual-email si 8.2 no lo hizo |
| `tests/auth-verify-email.test.ts` | Verify endpoint (8.4) |
| `tests/auth-middleware.test.ts` | 403 EMAIL_NOT_VERIFIED (8.3) |
| `tests/auth-resend-verification.test.ts` | Reenvío cooldown (8.5) — crear si 8.5 lo añadió |

8.6 puede **consolidar** en un solo archivo de smoke transversal o referenciar tests unitarios existentes — evitar triplicar los mismos asserts; el AC exige que la **suite completa** cubra los escenarios, no necesariamente un solo archivo monolítico.

### OpenAPI — patrones del proyecto

- Schemas Zod en `src/openapi/schemas/*.schemas.ts` con `.openapi('Name')`
- Paths en `register-paths.ts`; build ejecuta `openapi:generate` antes de `tsc`
- Mensajes de éxito exactos (architecture §8.6):
  - Verify: `"Email verificado correctamente"`
  - Resend: `"Email de verificación reenviado"`
- 429 resend: documentar que el handler setea `Retry-After` en segundos restantes del cooldown de 30 s

### EVT-014 / TPL-009 — contrato de variables

| Variable | Origen | Valor |
|---|---|---|
| `recipientEmail` | `user.email` | Email del destinatario |
| `firstName` | `user.firstName` | Obligatorio desde 6.5 |
| `verificationLink` | use case | `{APP_PUBLIC_URL}/verificar-email?token={rawToken}` |
| `expiresInHours` | fijo | `24` (número, no string) |

Disparadores: `RegisterUserUseCase` (tras TPL-001) y `ResendVerificationUseCase` (8.5).

### Flujo end-to-end (referencia para tests)

```
POST /auth/register → INSERT + TPL-001 + TPL-009
  → JWT emitido, emailVerified=false
  → GET /users/me → 403 EMAIL_NOT_VERIFIED (8.3)

Email enlace → SPA /verificar-email?token=RAW
  → GET /api/auth/verify-email?token=RAW → 200
  → emailVerified=true, tokens NULL

POST /auth/resend-verification (JWT, skipEmailVerification)
  → cooldown OK → nuevo token + TPL-009
  → cooldown activo → 429 Retry-After
  → ya verificado → 409
```

### Anti-patrones (no hacer en 8.6)

- No reimplementar `VerifyEmailUseCase`, `ResendVerificationUseCase` ni middleware (8.3–8.5).
- No modificar migración 015 ni métodos repo salvo fix trivial de compilación en tests.
- No cambiar contrato HTTP de register/login existente.
- No crear plantilla Resend en dashboard externo como requisito MVP.
- No editar `no-lo-vendo` frontend ni regenerar cliente Angular (repo separado).
- No marcar `epic-8: done` — eso es manual post-retrospectiva.

### Cumplimiento de arquitectura

- **Clean Architecture:** cambios limitados a `infrastructure/email/resend.provider.ts` (verificación), `openapi/*`, `docs/email-flow-mapping.md` (auditoría), `tests/*`, `openapi/openapi.json`.
- **Referencias:** `docs/architecture.md` §8.6 (endpoints), §10 (TPL-009), §12 (middleware transversal).
- **NFR:** OpenAPI debe reflejar códigos reales del error-handler; no inventar responses no implementados.

### Cross-story context

| Historia | Relación con 8.6 |
|---|---|
| 8.1 | Schema token — prerrequisito |
| 8.2 | Implementa TPL-009 en provider + envío registro — 8.6 audita |
| 8.3 | Middleware 403 — 8.6 documenta en OpenAPI + test |
| 8.4 | GET verify-email — 8.6 documenta OpenAPI |
| 8.5 | POST resend — 8.6 documenta OpenAPI + test cooldown |
| Frontend | Consumirá OpenAPI regenerado vía `npm run api:generate` en repo Angular |

### Inteligencia de historias anteriores

- **8.2** deja OpenAPI verify/resend explícitamente fuera — **8.6 es el único lugar** para `register-paths.ts` de esos endpoints.
- **8.4** deja OpenAPI fuera — misma regla.
- **8.3** deja OpenAPI 403 fuera — 8.6 añade documentación mínima en paths protegidos.
- **6.5** exige `firstName` en todos los templates — TPL-009 debe usar `greetingHtml`.
- **email-flow-mapping v1.2** ya mergeado en Correct Course — AC #1 es verificación, no rewrite desde cero.

### Git / estado del repo

- Commits recientes (analytics, items) no tocaron verificación de email — épica 8 es greenfield sobre auth.
- Email verification aún no en `main` al redactar esta story — asumir implementación en rama de épica 8.

### Verificación

```bash
npm run openapi:generate   # regenera openapi/openapi.json
npm run build
npm test
# Manual opcional: inspeccionar openapi.json paths /auth/verify-email y /auth/resend-verification
# Manual: revisar docs/email-flow-mapping.md §1–§2 EVT-014
```

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

(ningún bloqueo — todos los prerrequisitos ya estaban implementados)

### Completion Notes List

- **Task 1**: Sprint status confirmó 8.1–8.5 en estado `done`. TPL-009 presente en `resend.provider.ts`, middleware 403 activo, endpoints verify/resend implementados.
- **Task 2**: TPL-009 ya existía con estructura correcta: `greetingHtml`, `verificationLink`, `expiresInHours`. Sin cambios necesarios.
- **Task 3**: `docs/email-flow-mapping.md` ya en v1.2 con EVT-014, todas las variables (`recipientEmail`, `firstName`, `verificationLink`, `expiresInHours`) y valores fijos documentados. Sin gaps reales.
- **Task 4**: Añadidos `verifyEmailQuerySchema` y `emailNotVerifiedErrorSchema` a `src/openapi/schemas/auth.schemas.ts`.
- **Task 5**: Añadidos `GET /auth/verify-email` y `POST /auth/resend-verification` en `register-paths.ts`. Añadido 403 `EMAIL_NOT_VERIFIED` en `GET /users/me`. Ejecutado `npm run openapi:generate` — spec actualizada correctamente.
- **Task 6**: Creado `tests/auth-email-verification-flow.test.ts` con 6 smoke tests transversales (8.6.1–8.6.6) cubriendo el flujo EVT-014 completo sin duplicar asserts de tests existentes. 307/307 tests pasan.

### File List

- `src/openapi/schemas/auth.schemas.ts` — añadidos `verifyEmailQuerySchema` y `emailNotVerifiedErrorSchema`
- `src/openapi/register-paths.ts` — añadidos paths `GET /auth/verify-email`, `POST /auth/resend-verification`; 403 en `GET /users/me`
- `openapi/openapi.json` — regenerado con nuevos paths y schemas
- `tests/auth-email-verification-flow.test.ts` — nuevo archivo de smoke tests transversales (6 tests)

---

## Change Log

- 2026-05-26: Historia 8.6 implementada — OpenAPI verify/resend añadido, schemas VerifyEmailQuery y EmailNotVerifiedError registrados, smoke tests transversales EVT-014 creados. Build y suite completa pasan sin regresiones.

---

### Review Findings

- [x] [Review][Decision] AC#4 scope — Documentar 403 `EMAIL_NOT_VERIFIED` en rutas protegidas adicionales más allá de `GET /users/me` — Resuelto: opción 3 (todos los paths protegidos). Añadido 403 `emailNotVerifiedErrorSchema` a 9 endpoints adicionales en `register-paths.ts`.

- [x] [Review][Patch] Test 8.6.4: `vi.clearAllMocks()` sin re-mock de `markEmailVerified` — agregado `.mockResolvedValue(undefined)` tras `clearAllMocks` [tests/auth-email-verification-flow.test.ts]
- [x] [Review][Patch] `FUTURE` y `verificationResendAt` calculadas en tiempo de carga de módulo — reemplazado por `makeMockUser()` factory con fechas calculadas por llamada [tests/auth-email-verification-flow.test.ts]
- [x] [Review][Patch] Test 8.6.1 asume orden posicional de `mailService.send` — reemplazado por `find` por `templateId` [tests/auth-email-verification-flow.test.ts]
- [x] [Review][Patch] Sin test para token no encontrado en DB (`findByVerificationTokenHash` → null → 400) — añadido test 8.6.7 [tests/auth-email-verification-flow.test.ts]
- [x] [Review][Patch] Sin test para `POST /auth/resend-verification` sin cabecera `Authorization` (→ 401) — añadido test 8.6.8 [tests/auth-email-verification-flow.test.ts]
- [x] [Review][Patch] Sin test para `findById` null en `ResendVerificationUseCase` — añadido test 8.6.9 [tests/auth-email-verification-flow.test.ts]
- [x] [Review][Patch] Sin test para `GET /auth/verify-email` sin parámetro `token` — añadido test 8.6.10 [tests/auth-email-verification-flow.test.ts]
- [x] [Review][Patch] Test 8.6.1 no verifica `APP_PUBLIC_URL` como prefijo de `verificationLink` — añadida aserción con `appPublicUrl` [tests/auth-email-verification-flow.test.ts]
- [x] [Review][Patch] Test 8.6.4 no verifica limpieza del token tras verificación exitosa — añadida aserción `updateVerificationToken` not called [tests/auth-email-verification-flow.test.ts]
- [x] [Review][Patch] Test 8.6.5 no verifica el valor exacto del `Retry-After` — añadida cota superior `<= 30` [tests/auth-email-verification-flow.test.ts]

- [x] [Review][Defer] GET token en query string expuesto en logs de proxy/CDN — diseño establecido en 8.4, pre-existing [src/interfaces/http/routes/auth.routes.ts] — deferred, pre-existing
- [x] [Review][Defer] `verifyEmailQuerySchema` sin validación de formato/charset — no requerido por spec ni AC [src/openapi/schemas/auth.schemas.ts:50] — deferred, pre-existing
- [x] [Review][Defer] `GET /auth/verify-email` sin respuesta 404 en OpenAPI — spec requiere solo 400; implementación usa 400 para todos los errores de token [src/openapi/register-paths.ts] — deferred, pre-existing
- [x] [Review][Defer] `mailService.send` failure en resend (fire-and-forget) sin test — comportamiento intencional, no requerido en AC#5 [tests] — deferred, pre-existing
- [x] [Review][Defer] Race condition doble-clic en verify-email sin test — no requerido por AC#5 [tests] — deferred, pre-existing
- [x] [Review][Defer] Usuario ya verificado indistinguible de token inválido (ambos 400) — diseño de 8.4 [src/application/use-cases/user/verify-email.use-case.ts] — deferred, pre-existing
- [x] [Review][Defer] Sin rate-limiting en `GET /auth/verify-email` — preocupación arquitectónica pre-existente [src] — deferred, pre-existing
- [x] [Review][Defer] Header `Retry-After` no declarado en campo `headers` del schema OpenAPI del 429 — no requerido por spec [src/openapi/register-paths.ts] — deferred, pre-existing
- [x] [Review][Defer] Cooldown constant no compartida entre implementación y tests — concern de mantenibilidad [tests/auth-email-verification-flow.test.ts:165] — deferred, pre-existing

---

## Referencias

- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Épica 8, Historia 8.6]
- [Source: docs/architecture.md — §8.6 verify/resend, §10 TPL-009]
- [Source: docs/email-flow-mapping.md — v1.2 EVT-014 / TPL-009]
- [Source: docs/delta-email-flow-verification.md — delta incorporado]
- [Source: docs/delta-backend-email-verification.md — contratos endpoints]
- [Source: _bmad-output/initiative-backend/tickets/epic-verificacion-de-email/tickets/story-registro-token-y-email-tpl-009-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-verificacion-de-email/tickets/story-middleware-email-verified-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-verificacion-de-email/tickets/story-get-auth-verify-email-plan.md]
- [Source: src/openapi/register-paths.ts]
- [Source: src/openapi/schemas/auth.schemas.ts]
- [Source: src/infrastructure/email/resend.provider.ts]
- [Source: openapi/openapi.json]

---

Ultimate context engine analysis completed — comprehensive developer guide created.
