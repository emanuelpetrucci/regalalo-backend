---
title: "Loggers y analytics.service"
type: feature
ticket: 2
status: done
created: 2026-10-25
---

# Historia 7.2: Loggers y analytics.service

Status: done

<!-- Nota: Validación opcional con validate-create-story antes de dev-story. -->

## Historia

Como operador del sistema,
quiero streams de log separados para aplicación y analítica con un servicio centralizado de emisión de eventos,
para filtrar eventos de negocio sin mezclarlos con errores de infraestructura y habilitar instrumentación AE en historias 7.4–7.6.

## Criterios de aceptación

1. **Dado** `src/config/loggers.ts`, **cuando** se inspecciona la configuración, **entonces** `appLogger` usa `base: { service: 'app' }` y `analyticsLogger` usa `base: { service: 'analytics' }`, ambos respetando `env.LOG_LEVEL` (validado en `env.ts`).

2. **Dado** `emitEvent` en `analytics.service.ts` (`event`, `userId`, `properties`, `sessionId?`), **cuando** se emite un evento, **entonces** el log incluye `{ event, timestamp, userId, sessionId, properties }` con `userId` = SHA-256 hex del UUID (nunca UUID en crudo) y `sessionId` = valor pasado o `null`.

3. **Dado** la regla de implementación DLT-004, **cuando** un use case invoque `emitEvent` en historias futuras, **entonces** debe ser **después** del commit y fire-and-forget (sin await ni captura que revierta negocio). En **7.2** solo se implementa el servicio; **no** se añaden llamadas en use cases.

4. **Dado** `pinoHttp` en `app.ts` y el arranque en `main.ts`, **cuando** el servidor inicia, **entonces** ambos usan **la misma instancia** `appLogger` (cierra deuda «Dos instancias pino independientes» de `deferred-work.md`).

5. **Dado** `LOG_FILE` definido en entorno, **cuando** `appLogger` escribe, **entonces** mantiene el comportamiento actual: multistream stdout + fichero (regresión cero respecto a `infrastructure/logging/logger.ts`).

6. **Dado** tests unitarios de `emitEvent`, **cuando** se ejecutan, **entonces** verifican hasheo SHA-256 de `userId`, forma del payload y que `analyticsLogger` (mock/spy) recibe el evento — cumpliendo SC-03 de `docs/prd-analytics.md`.

## Alcance explícito (IN / OUT)

| IN (7.2) | OUT (historias 7.3–7.6) |
|---|---|
| `src/config/loggers.ts` (`appLogger`, `analyticsLogger`) | Migración SQL `category`/`weight_range` (7.1) |
| `src/application/services/analytics.service.ts` (`emitEvent`) | Validadores Zod y `POST /items` con category (7.3) |
| Refactor: `app.ts`, `main.ts` → `appLogger` | Llamadas `emitEvent` en use cases auth (7.4) |
| Unificar singleton de app logging (re-export o migración de imports) | AE en objetos/solicitudes (7.5) |
| Tests unitarios `analytics.service` / loggers | AE en entrega/reputación/jobs (7.6) |
| Preservar `LOG_LEVEL` + `LOG_FILE` para stream app | Regenerar OpenAPI |
| | Instrumentar `ReputationService` (7.6) |

**Orden de épica:** `7.1` y `7.2` pueden avanzar en paralelo. **7.3+** dependen de 7.1 para columnas NOT NULL; **7.4–7.6** dependen de **7.2** para `emitEvent`.

## Tareas / Subtareas

- [x] **Task 1 — `src/config/loggers.ts`** (AC: #1, #5)
  - [x] Crear factory compartida que respete `env.LOG_LEVEL` y multistream opcional `env.LOG_FILE`
  - [x] Exportar `appLogger` con `base: { service: 'app' }`
  - [x] Exportar `analyticsLogger` con `base: { service: 'analytics' }` (mismo nivel; sin duplicar lógica de fichero innecesariamente — ambos streams a stdout; si `LOG_FILE` aplica a analítica también, documentar decisión en código)
  - [x] **No** instanciar `pino()` sueltos en otros módulos

- [x] **Task 2 — `analytics.service.ts`** (AC: #2, #3)
  - [x] Crear `src/application/services/analytics.service.ts` con `emitEvent` según delta DLT-004 §C
  - [x] `hashUserId` privado con `createHash('sha256')` de Node `crypto`
  - [x] `timestamp`: `new Date().toISOString()` en momento de emisión
  - [x] Llamada síncrona a `analyticsLogger.info(...)` — fire-and-forget (no Promise, no throw hacia caller)
  - [x] JSDoc breve: prohibido PII en `properties` (email, coords, contact_channel, UUID crudo)

- [x] **Task 3 — Unificar logger de aplicación** (AC: #4, #5)
  - [x] Actualizar `src/app.ts`: `pinoHttp({ logger: appLogger })`
  - [x] Actualizar `src/main.ts`: importar `appLogger` desde `config/loggers.ts`
  - [x] Refactorizar `src/infrastructure/logging/logger.ts` para **re-exportar** `appLogger` como `logger` (compatibilidad con ~15 importaciones existentes) **o** migrar todos los imports a `appLogger` — preferir re-export para diff mínimo
  - [x] Verificar que ya no existen dos factories `createLogger()` independientes

- [x] **Task 4 — Tests unitarios** (AC: #6)
  - [x] Crear `tests/analytics-service.test.ts` con `vi.spyOn` / mock de `analyticsLogger`
  - [x] Assert: UUID fijo → `userId` = SHA-256 esperado (64 hex chars)
  - [x] Assert: payload incluye `event`, `timestamp`, `sessionId`, `properties`
  - [x] Assert: `sessionId` omitido → `null` en log
  - [x] Opcional: test de smoke que `appLogger`/`analyticsLogger` tienen `bindings().service` correcto (si API pino lo permite) o inspección de `base` en factory

- [x] **Task 5 — Verificación** (AC: todos)
  - [x] `npm run build`
  - [x] `npm test`
  - [ ] Smoke manual opcional: arrancar `npm run dev`, confirmar JSON con `"service":"app"` en requests HTTP

### Review Findings

- [x] [Review][Defer] `vi.restoreAllMocks()` en `afterEach` redundante para mocks hoisted [tests/analytics-service.test.ts:23-25] — deferred, pre-existing pattern en el proyecto; no afecta resultados (243/243 OK)

---

## Notas para el Dev Agent

### Contexto de épica 7 (DLT-004)

Correct Course (2026-05-24) añadió **architecture v1.4**, `docs/prd-analytics.md` y la Épica 7. Historia **7.1** cubre SQL/dominio items; **7.2** es la **infraestructura transversal** de observabilidad que desbloquea 7.4–7.6. Commit `11ba3f4` solo documentó DLT-004; **cero** código de `loggers.ts` / `analytics.service` en `src/` hoy.

**Referencias obligatorias:**

- [Source: docs/architecture.md — §2 Estructura, regla loggers DLT-004]
- [Source: docs/delta-backend-DLT-004.md — §B loggers, §C analytics.service]
- [Source: docs/prd-analytics.md — §5 Esquema canónico, §7 Implementación, SC-03/SC-04]
- [Source: docs/logging.md — LOG_LEVEL, LOG_FILE, arquitectura actual]
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Historia 7.2]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-migracion-sql-y-dominio-items-dlt-004-plan.md — paralelo, no bloqueante]
- [Source: _bmad-output/project-context.md — Analítica DLT-004, Testing Rules]

### Estado actual del código (leer antes de editar)

**Logger hoy** — singleton en `src/infrastructure/logging/logger.ts`:

```typescript
function createLogger(): pino.Logger {
  const options: pino.LoggerOptions = { level: env.LOG_LEVEL };
  if (env.LOG_FILE) {
    return pino(options, pino.multistream([
      { stream: process.stdout },
      { stream: pino.destination({ dest: env.LOG_FILE, mkdir: true, sync: false }) },
    ]));
  }
  return pino(options);
}
export const logger = createLogger();
```

**Consumidores de `logger`** (mantener funcionando vía re-export o migración):

- `src/app.ts` — `pinoHttp({ logger })`
- `src/main.ts` — arranque/fatal
- `src/interfaces/http/middlewares/error-handler.ts`
- `src/infrastructure/database/supabase/db.ts`
- `src/infrastructure/scheduler/*.ts` (3 schedulers)
- `src/infrastructure/storage/*-storage.adapter.ts`
- `src/infrastructure/security/recaptcha.service.ts`
- `src/infrastructure/database/supabase/user.repository.ts`
- Use cases auth/items/delivery (warn/error en emails y side-effects)

**No existe:**

- `src/config/loggers.ts`
- `src/application/services/analytics.service.ts`

**Servicios existentes en `application/services/`:** `geocoding.service.ts`, `jwt.service.ts`, `recaptcha.service.ts`, `recaptcha-policy.ts` — seguir patrón de **función exportada** o módulo simple (no clase DI pesada).

### Task 1 — Diseño `config/loggers.ts`

Objetivo: cumplir AC de `service` **sin** perder features de `docs/logging.md`.

Plantilla mínima (architecture/delta — **extender** con env):

```typescript
import pino from 'pino';
import { env } from './env';

function createPinoLogger(service: 'app' | 'analytics'): pino.Logger {
  const options: pino.LoggerOptions = {
    level: env.LOG_LEVEL,
    base: { service },
  };
  // Para appLogger: reutilizar multistream LOG_FILE existente
  // Para analyticsLogger: stdout (MVP); mismo level
  ...
}

export const appLogger = createPinoLogger('app');
export const analyticsLogger = createPinoLogger('analytics');
```

**Decisión recomendada LOG_FILE:** solo `appLogger` escribe al fichero; `analyticsLogger` va a stdout. En Railway ambos streams se distinguen por `"service"` en JSON (SC-04). Evita mezclar analítica en `logs/app.log` salvo requisito explícito.

### Task 2 — `analytics.service` objetivo

Implementación canónica (delta §C / prd-analytics §7.2):

```typescript
import { createHash } from 'crypto';
import { analyticsLogger } from '../../config/loggers';

function hashUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex');
}

export function emitEvent(
  event: string,
  userId: string,
  properties: Record<string, unknown>,
  sessionId?: string,
): void {
  analyticsLogger.info({
    event,
    timestamp: new Date().toISOString(),
    userId: hashUserId(userId),
    sessionId: sessionId ?? null,
    properties,
  });
}
```

**Reglas para consumidores (documentar en JSDoc, implementar en 7.4+):**

| Regla | Detalle |
|---|---|
| Post-commit | Invocar solo cuando la transacción BD ya commitió |
| Fire-and-forget | Sin `await`, sin `try/catch` que altere respuesta HTTP |
| PII prohibida | No email, coords, `contact_channel`, UUID crudo en `properties` |
| Separación | Errores de negocio/infra → `appLogger`; eventos AE → `emitEvent` |

**Ejemplo verificación hash en test:**

```typescript
import { createHash } from 'crypto';
const uuid = '550e8400-e29b-41d4-a716-446655440000';
const expected = createHash('sha256').update(uuid).digest('hex');
// emitEvent('user.login', uuid, {}) → log.userId === expected
```

### Task 3 — Migración sin regresión

1. Implementar `config/loggers.ts`.
2. Cambiar `infrastructure/logging/logger.ts` a:

```typescript
export { appLogger as logger } from '../../config/loggers';
```

3. Actualizar `app.ts` y `main.ts` para importar `appLogger` directamente (AC explícito).
4. **No** cambiar imports en los 15 use cases/infra en 7.2 si el re-export funciona — reduce riesgo.

**Deuda cerrada:** `deferred-work.md` línea «Dos instancias pino independientes» — tras 7.2, `pinoHttp` y `main.ts` comparten `appLogger` con el resto vía re-export.

### Task 4 — Tests

Patrón: `tests/recaptcha.service.test.ts` (vitest, mocks).

Estrategia mock de logger:

```typescript
vi.mock('../src/config/loggers', () => ({
  analyticsLogger: { info: vi.fn() },
  appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
```

Casos mínimos:

- `emitEvent` llama `analyticsLogger.info` una vez
- `userId` en payload ≠ UUID de entrada
- `userId` = SHA-256 determinístico
- `sessionId` undefined → `null`
- `sessionId` provisto → mismo valor en payload

**No** añadir tests de integración HTTP de analítica en 7.2 (pertenecen a 7.4+).

### Anti-patrones (no hacer en 7.2)

- No llamar `emitEvent` desde use cases, jobs ni `ReputationService` (7.4–7.6).
- No mezclar eventos analíticos en `appLogger.info` manual.
- No pasar `userId` sin hashear al logger (el hash es responsabilidad de `emitEvent`, no del caller).
- No usar `await emitEvent(...)` — no es async.
- No modificar OpenAPI, migraciones SQL, DTOs de items ni validadores de publicación.
- No eliminar `infrastructure/logging/logger.ts` sin re-export (rompería imports).
- No instanciar `pino()` en módulos nuevos.

### Cumplimiento de arquitectura

- **Clean Architecture:** `config/` = infra transversal; `application/services/` = servicio de aplicación sin dependencias HTTP.
- **Capas:** `analytics.service` importa solo `config/loggers` y `crypto` — **no** importar repos ni Express.
- **NFR17:** pino ^9.5.0 (ya en package.json) — no añadir PostHog ni transports externos.

### Verificación

```bash
npm run build
npm test
```

Opcional smoke:

```bash
npm run dev
# GET /health → buscar "service":"app" en línea de pino-http
```

### Inteligencia de historia previa (7.1)

- **7.1** define columnas analíticas en items; **7.2 no depende** de que 7.1 esté merged, pero 7.5/7.6 usarán `item.category` en `properties` de `emitEvent`.
- **Patrón épica 6:** historias pequeñas con alcance IN/OUT explícito; tests antes de review.
- **7.1 AC #4:** confirma que analytics.service **no** se implementa en 7.1 — es responsabilidad exclusiva de 7.2.

### Contexto cross-story épica 7

| Story | Depende de 7.2 |
|---|---|
| 7.1 SQL/dominio items | No |
| 7.3 API publicar category | No |
| 7.4 Auth AE-001/002 | **Sí** — `emitEvent` |
| 7.5 Objetos/solicitudes AE | **Sí** |
| 7.6 Entrega/reputación AE | **Sí** |

### Git reciente

- `9416bf1` — 6.5 emails firstName (épica 6 done).
- `11ba3f4` — docs DLT-004 (architecture v1.4, prd-analytics, epics 7.x).
- Logger actual sin cambios desde 1.1; deuda double-instance documentada en deferred-work.

---

## Dev Agent Record

### Agent Model Used

Composer (dev-story 7-2)

### Debug Log References

(n/a)

### Completion Notes List

- Creado `src/config/loggers.ts` con factory compartida: `appLogger` (multistream stdout + LOG_FILE) y `analyticsLogger` (solo stdout), ambos con `base.service` y `env.LOG_LEVEL`.
- Implementado `emitEvent` en `analytics.service.ts`: SHA-256 de userId, payload canónico, fire-and-forget vía `analyticsLogger.info`.
- Unificado singleton: `app.ts` y `main.ts` importan `appLogger` directamente; `logger.ts` re-exporta para compatibilidad.
- 5 tests unitarios en `analytics-service.test.ts` (emitEvent + bindings de service).
- Build y suite completa: 243 tests OK.

### File List

- `src/config/loggers.ts` (nuevo)
- `src/application/services/analytics.service.ts` (nuevo)
- `src/infrastructure/logging/logger.ts` (modificado — re-export)
- `src/app.ts` (modificado)
- `src/main.ts` (modificado)
- `tests/analytics-service.test.ts` (nuevo)

### Change Log

- 2026-05-25: Infraestructura DLT-004 — loggers separados app/analytics, `analytics.service.ts` + `emitEvent`, unificación singleton pino.

---

## Referencias

- [Source: docs/architecture.md — §2, regla loggers DLT-004]
- [Source: docs/delta-backend-DLT-004.md — §B, §C]
- [Source: docs/prd-analytics.md — §5, §7, SC-03, SC-04]
- [Source: docs/logging.md]
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md — Historia 7.2]
- [Source: _bmad-output/initiative-backend/tickets/epic-analitica-e-instrumentacion-dlt-004/tickets/story-migracion-sql-y-dominio-items-dlt-004-plan.md]
- [Source: _bmad-output/initiative-backend/deferred-work.md — doble instancia pino]
- [Source: _bmad-output/project-context.md]
- [Source: src/infrastructure/logging/logger.ts]
- [Source: src/app.ts]
- [Source: src/main.ts]

---

Ultimate context engine analysis completed — comprehensive developer guide created.
