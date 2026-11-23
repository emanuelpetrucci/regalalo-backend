---
title: "Instrumentación autenticación (AE-001, AE-002)"
type: feature
ticket: 4
status: done
created: 2026-10-25
---

# Historia 7.4: Instrumentación autenticación (AE-001, AE-002)

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como responsable de producto,
quiero eventos de registro y login en el stream de analítica,
para medir adquisición y retención sin exponer PII en los logs.

## Criterios de aceptación

1. **Dado** un registro exitoso (`POST /auth/register` → 201), **cuando** `userRepo.create` ha persistido el usuario, **entonces** se emite AE-001 `user.registered` vía `emitEvent` con `properties: { postalCode: user.postalCode }` — sin coordenadas, sin email, sin nombre — fire-and-forget post-commit, sin alterar la respuesta HTTP si el logger falla.

2. **Dado** un login exitoso (`POST /auth/login` → 200), **cuando** la contraseña es válida y el JWT se ha generado, **entonces** se emite AE-002 `user.login` vía `emitEvent` con `properties: {}` — fire-and-forget, sin alterar la respuesta HTTP.

3. **Dado** un intento de registro o login fallido (409, 400, 422, 401), **cuando** el use case lanza excepción o responde error, **entonces** `emitEvent` **no** se invoca.

4. **Dado** tests de integración auth existentes, **cuando** se ejecutan flujos register/login, **entonces** verifican llamada a `emitEvent` (mock/spy) con payload correcto en éxito y ausencia en fallos — cumpliendo SC-02 (sin PII prohibida en `properties`) y delegando SC-03 (hash SHA-256) a tests de `analytics.service` en 7.2.

5. **Dado** `RegisterUserUseCase` y `LoginUserUseCase`, **cuando** se inspecciona el código, **entonces** importan `emitEvent` desde `../../services/analytics.service`, la invocación es síncrona (sin `await`), no está envuelta en try/catch que cambie status HTTP, y ocurre **después** de la persistencia/validación exitosa — **antes** del `return` del DTO.

## Alcance explícito (IN / OUT)

| IN (7.4) | OUT (historias 7.5–7.6 / otras) |
|---|---|
| `register-user.use-case.ts` — AE-001 post-create | `forgot-password` / `reset-password` (sin eventos AE en catálogo) |
| `login-user.use-case.ts` — AE-002 post-auth | AE-010 en publicación (7.3) |
| Tests `auth-register.test.ts` y `auth-login.test.ts` ampliados | AE-011…AE-031 objetos/sesiones/reputación (7.5, 7.6) |
| Mock `emitEvent` en tests HTTP auth | Crear `analytics.service` / `config/loggers.ts` (7.2) |
| Verificación SC-02 en properties de auth | Regenerar OpenAPI |
| | Instrumentar middleware auth |
| | Cambiar contratos HTTP auth (DTOs, status codes) |

**Prerrequisitos:**

| Story | Requisito |
|---|---|
| **7.2** | `analytics.service.ts` + `emitEvent` + `analyticsLogger` — **obligatorio** |
| 7.1, 7.3 | Independientes — no bloquean 7.4 |

**Orden recomendado:** `7.2` → **7.4** (puede paralelizarse con 7.3 tras 7.2). 7.5/7.6 reutilizan el mismo patrón `emitEvent` post-commit.

## Tareas / Subtareas

- [x] **Task 1 — `RegisterUserUseCase` AE-001** (AC: #1, #3, #5)
  - [x] Importar `emitEvent` desde `../../services/analytics.service`
  - [x] Tras `await this.userRepo.create(...)` exitoso y **antes** del `return`:
    ```typescript
    emitEvent('user.registered', user.id, {
      postalCode: user.postalCode,
    });
    ```
  - [x] Usar `user.postalCode` del objeto persistido (no `dto.postalCode` directamente, aunque coinciden)
  - [x] Mantener email fire-and-forget existente (`mailService.send().catch(...)`) — no reordenar ni await
  - [x] **No** emitir si falla reCAPTCHA, email duplicado, geocoding o create

- [x] **Task 2 — `LoginUserUseCase` AE-002** (AC: #2, #3, #5)
  - [x] Importar `emitEvent` desde `../../services/analytics.service`
  - [x] Tras validación de contraseña exitosa y `jwtService.sign(...)`, **antes** del `return`:
    ```typescript
    emitEvent('user.login', user.id, {});
    ```
  - [x] **No** emitir en: email desconocido, passwordHash null, contraseña inválida, reCAPTCHA fallido

- [x] **Task 3 — Tests register** (AC: #3, #4)
  - [x] Añadir mock global en `tests/auth-register.test.ts`:
    ```typescript
    vi.mock('../src/application/services/analytics.service', () => ({
      emitEvent: vi.fn(),
    }));
    ```
  - [x] Importar `emitEvent` y `beforeEach(() => vi.mocked(emitEvent).mockClear())`
  - [x] Caso `10.13` — registro exitoso (10.1): `emitEvent` llamado una vez con `('user.registered', mockUser.id, { postalCode: '28001' })`
  - [x] Caso `10.14` — email duplicado 409: `emitEvent` **no** llamado
  - [x] Caso `10.15` — geocode falla 400: `emitEvent` **no** llamado
  - [x] Caso `10.16` — reCAPTCHA 422: `emitEvent` **no** llamado
  - [x] Assert SC-02: `properties` no contiene `email`, `firstName`, `lastName`, `lat`, `lon`, `password`

- [x] **Task 4 — Tests login** (AC: #3, #4)
  - [x] Mismo mock de `analytics.service` en `tests/auth-login.test.ts`
  - [x] Caso `6.12` — login exitoso (6.1): `emitEvent` llamado una vez con `('user.login', mockUser.id, {})`
  - [x] Caso `6.13` — contraseña incorrecta 401: `emitEvent` **no** llamado
  - [x] Caso `6.14` — email no registrado 401: `emitEvent` **no** llamado
  - [x] Caso `6.15` — reCAPTCHA 422: `emitEvent` **no** llamado
  - [x] Assert: `properties` es objeto vacío `{}` (no incluir email ni reputationScore)

- [x] **Task 5 — Verificación** (AC: todos)
  - [x] `npm run build`
  - [x] `npm test`
  - [x] Confirmar que tests 7.2 (`analytics-service.test.ts`) siguen pasando si existen en la rama

---

## Notas para el Dev Agent

### Contexto de épica 7 (DLT-004)

Correct Course (2026-05-24) añadió **architecture v1.4**, `docs/prd-analytics.md` y la Épica 7. **7.2** entrega la infraestructura (`emitEvent`, hash SHA-256, `analyticsLogger`). **7.4** es la **primera instrumentación de use cases** — Fase 3 del roadmap en `prd-analytics.md` §8 — y establece el patrón que 7.3 (AE-010), 7.5 y 7.6 deben replicar.

**Referencias obligatorias:**

- [Source: docs/delta-backend-DLT-004.md — §D RegisterUser AE-001, LoginUser AE-002]
- [Source: docs/prd-analytics.md — §6.1 AE-001/002, §7.4 regla post-commit, SC-02/SC-03]
- [Source: docs/architecture.md — §12.9 catálogo AE]
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Historia 7.4]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-loggers-y-analytics-service-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-api-publicar-item-category-weight-range-plan.md — patrón emitEvent]
- [Source: _bmad-output/project-context.md — Analítica DLT-004, Testing Rules]

### Estado actual del código (leer antes de editar)

**RegisterUserUseCase hoy** — sin analítica:

```typescript
// src/application/use-cases/user/register-user.use-case.ts
const user = await this.userRepo.create({ ... });

const token = this.jwtService.sign({ sub: user.id, jwtVersion: user.jwtVersion });

this.mailService.send({ ... }).catch((err) => logger.error(...));

return { token, user: { ... } };
// ← insertar emitEvent aquí, después de create, antes de return
```

**LoginUserUseCase hoy** — sin analítica:

```typescript
// src/application/use-cases/user/login-user.use-case.ts
const valid = await this.hashService.verify(user.passwordHash, dto.password);
if (!valid) { ... throw UnauthorizedException(); }

const token = this.jwtService.sign({ sub: user.id, jwtVersion: user.jwtVersion });

return { token, user: { ... } };
// ← insertar emitEvent aquí, después de sign, antes de return
```

**Persistencia register:** `PostgresUserRepository.create` ejecuta un `INSERT ... RETURNING` sin transacción explícita — cuando `create` resuelve, el commit ya ocurrió. Cumple regla post-commit de DLT-004 §7.4.

**analytics.service:** creado en **7.2** — **no reimplementar** logging analítico ni hasheo en los use cases. Pasar `user.id` UUID crudo; `emitEvent` hashea internamente.

**No tocar:**

- `forgot-password.use-case.ts`, `reset-password.use-case.ts` — no hay AE en catálogo para password reset
- `auth.controller.ts`, `auth.routes.ts`, validadores, DTOs — contrato HTTP sin cambios
- OpenAPI — sin nuevos campos ni endpoints

### Task 1 — AE-001: payload y timing

Catálogo (prd-analytics §6.1 / delta §D):

| Campo | Valor |
|---|---|
| Evento | `user.registered` |
| userId arg | `user.id` (UUID crudo → hash en `emitEvent`) |
| properties | `{ postalCode: user.postalCode }` |
| sessionId | omitido → `null` en log |

**Permitido en properties:** `postalCode` (código postal alfanumérico, no coordenadas).

**Prohibido en properties (SC-02):** `email`, `firstName`, `lastName`, `phone`, `lat`/`lon`/`location`, UUID crudo, contraseña.

**Timing recomendado:**

```typescript
const user = await this.userRepo.create({ ... });
const token = this.jwtService.sign({ sub: user.id, jwtVersion: user.jwtVersion });

emitEvent('user.registered', user.id, { postalCode: user.postalCode });

this.mailService.send({ ... }).catch(...);

return { token, user: { ... } };
```

El email welcome es side-effect fire-and-forget independiente — `emitEvent` no debe depender de que el email se envíe.

### Task 2 — AE-002: payload y timing

| Campo | Valor |
|---|---|
| Evento | `user.login` |
| userId arg | `user.id` |
| properties | `{}` (objeto vacío explícito) |

**No incluir** en properties: `email`, `reputationScore`, `jwtVersion`, `firstName`, etc. El catálogo indica properties vacías para login.

```typescript
const token = this.jwtService.sign({ sub: user.id, jwtVersion: user.jwtVersion });

emitEvent('user.login', user.id, {});

return { token, user: { ... } };
```

**Anti-enumeración:** los paths de error (email desconocido con dummy hash, password inválida) **no** deben emitir eventos — evitar filtrar intentos fallidos al stream analítico como si fueran logins.

### Task 3/4 — Estrategia de tests

Patrón existente: `tests/auth-register.test.ts` y `tests/auth-login.test.ts` con supertest + mocks de deps inyectadas vía `createAuthRouter`.

Mock (mismo que 7.3):

```typescript
import { emitEvent } from '../src/application/services/analytics.service';

vi.mock('../src/application/services/analytics.service', () => ({
  emitEvent: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(emitEvent).mockClear();
});
```

**Importante:** el mock debe declararse **antes** de imports que carguen los use cases (patrón vitest hoisting — colocar `vi.mock` al inicio del archivo, como en `items-publish.test.ts` post-7.3).

Casos mínimos nuevos:

| Test ID | Escenario | Assert emitEvent |
|---|---|---|
| 10.13 | Register 201 | 1× `user.registered`, postalCode en properties |
| 10.14 | Register 409 duplicate | 0 llamadas |
| 10.15 | Register 400 geocode | 0 llamadas |
| 10.16 | Register 422 recaptcha | 0 llamadas |
| 6.12 | Login 200 | 1× `user.login`, `{}` |
| 6.13 | Login 401 wrong pwd | 0 llamadas |
| 6.14 | Login 401 unknown email | 0 llamadas |
| 6.15 | Login 422 recaptcha | 0 llamadas |

**SC-03 (hash SHA-256):** no re-testear en auth tests — cubierto por `tests/analytics-service.test.ts` (7.2). En auth tests basta verificar que se pasa `mockUser.id` crudo como segundo argumento.

**SC-02 (PII):** en test 10.13, inspeccionar tercer argumento:

```typescript
expect(emitEvent).toHaveBeenCalledWith(
  'user.registered',
  mockUser.id,
  expect.objectContaining({ postalCode: '28001' }),
);
const props = vi.mocked(emitEvent).mock.calls[0][2];
expect(props).not.toHaveProperty('email');
expect(props).not.toHaveProperty('firstName');
```

### Anti-patrones (no hacer en 7.4)

- No usar `await emitEvent(...)` — no es async.
- No envolver `emitEvent` en try/catch que altere 201/200.
- No emitir dentro de `userRepo.create` ni en el repositorio.
- No pasar `userId` pre-hasheado — responsabilidad de `analytics.service`.
- No incluir email, nombres ni coordenadas en `properties`.
- No emitir en login fallido (incluido dummy hash path).
- No emitir `user.registered` si `create` no completó (p. ej. geocode falló antes).
- No loguear eventos analíticos con `appLogger.info` manual.
- No modificar OpenAPI, DTOs auth ni flujos forgot/reset password.
- No crear `analytics.service` ni `loggers.ts` aquí (7.2).

### Cumplimiento de arquitectura

- **Clean Architecture:** instrumentación en capa `application/use-cases/`; import solo de `analytics.service` (application service).
- **Capas:** use cases **no** importan `analyticsLogger` directamente — siempre vía `emitEvent`.
- **Regresión cero:** mismos status codes, mismos DTOs de respuesta, mismo comportamiento de email y reCAPTCHA.
- **NFR17:** pino vía `analyticsLogger` (7.2) — sin PostHog ni transports externos.

### Verificación

```bash
npm run build
npm test
```

Smoke opcional (requiere 7.2 merged + servidor):

```bash
npm run dev
# POST /auth/register válido → buscar línea JSON con "service":"analytics", "event":"user.registered"
```

### Inteligencia de historias previas

**7.2 (loggers/analytics.service) — CRÍTICO:**

- `emitEvent(event, userId, properties, sessionId?)` — firma exacta; hash SHA-256 interno con `createHash('sha256')`.
- Fire-and-forget post-commit — **patrón obligatorio** para 7.4.
- `analyticsLogger.info({ event, timestamp, userId, sessionId, properties })` — no mezclar con `appLogger`.
- Si 7.2 no está en la rama: implementar 7.2 primero o traer `analytics.service.ts` + `config/loggers.ts` antes de 7.4.

**7.3 (publicar ítem AE-010) — patrón de referencia:**

- Misma estructura: mock `emitEvent` en tests HTTP, assert post-201, no emit en fallos previos al repo.
- 7.4 es **más simple** — solo 2 use cases, sin validadores ni OpenAPI.

**7.1:** independiente — columnas items no afectan auth.

**Épica 6 (auth DLT-003):** register/login ya incluyen `firstName`/`lastName` en DTO respuesta — **no** incluirlos en eventos analíticos.

### Contexto cross-story épica 7

| Story | Relación con 7.4 |
|---|---|
| 7.2 analytics.service | **Prerrequisito** |
| 7.3 AE-010 publish | Paralelo posible tras 7.2; mismo patrón |
| 7.5 Objetos/solicitudes AE | Sigue patrón 7.4 |
| 7.6 Entrega/reputación AE | Sigue patrón 7.4 |

### Git reciente

- `9416bf1` — 6.5 emails firstName (épica 6 done).
- `11ba3f4` — docs DLT-004 (architecture v1.4, prd-analytics, epics 7.x).
- Use cases auth sin cambios analíticos desde 6.2; instrumentación pendiente explícita en delta §D Fase 3.

---

### Review Findings

- [x] [Review][Patch] `objectContaining` en test 10.13 permite propiedades extra no-PII [tests/auth-register.test.ts:260] — **aplicado**: cambiado a `{ postalCode: '28001' }` (igualdad estricta)
- [x] [Review][Patch] Test 6.11 no asertaba `emitEvent` no llamado en caso `passwordHash null` [tests/auth-login.test.ts:163] — **aplicado**: añadido `expect(emitEvent).not.toHaveBeenCalled()`
- [x] [Review][Defer] Test 10.3 pre-existente no aserta ausencia de `emitEvent` en geocode rejection [tests/auth-register.test.ts] — deferred, pre-existing
- [x] [Review][Defer] `emitEvent` en analytics.service.ts no tiene try/catch interno — pino podría propagar excepción al HTTP handler [src/application/services/analytics.service.ts] — deferred, pre-existing (scope 7.2)

## Dev Agent Record

### Agent Model Used

Composer (dev-story)

### Debug Log References

(none)

### Completion Notes List

- AE-001 `user.registered` en `RegisterUserUseCase` post-create, pre-return; properties `{ postalCode }` sin PII.
- AE-002 `user.login` en `LoginUserUseCase` post-sign, pre-return; properties `{}`.
- Mock `emitEvent` en auth-register (10.13–10.16) y auth-login (6.12–6.15); SC-02 verificado en properties.
- `npm run build` OK; 258 tests pasando (incl. analytics-service.test.ts 7.2).

### File List

- `src/application/use-cases/user/register-user.use-case.ts` (modified)
- `src/application/use-cases/user/login-user.use-case.ts` (modified)
- `tests/auth-register.test.ts` (modified)
- `tests/auth-login.test.ts` (modified)

### Change Log

- 2026-05-25: Instrumentación AE-001/AE-002 en register/login use cases + tests de integración auth.

---

## Referencias

- [Source: docs/delta-backend-DLT-004.md — §D AE-001, AE-002]
- [Source: docs/prd-analytics.md — §6.1, §7.4, SC-02, SC-03]
- [Source: docs/architecture.md — §12.9]
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Historia 7.4]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-loggers-y-analytics-service-plan.md]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-api-publicar-item-category-weight-range-plan.md]
- [Source: _bmad-output/project-context.md]
- [Source: src/application/use-cases/user/register-user.use-case.ts]
- [Source: src/application/use-cases/user/login-user.use-case.ts]
- [Source: src/infrastructure/database/supabase/user.repository.ts]
- [Source: tests/auth-register.test.ts]
- [Source: tests/auth-login.test.ts]

---

Ultimate context engine analysis completed — comprehensive developer guide created.
