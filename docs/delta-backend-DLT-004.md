# Delta — technical-design-backend.md
**Referencia:** DLT-004
**Versión base:** 1.3
**Versión resultante:** 1.4
**Estado:** Incorporado — `docs/architecture.md` v1.4 (2026-05-24, Correct Course)
**Fecha:** Mayo 2026
**Motivo:** Incorporación de la capa de analítica e instrumentación — PRD Analítica v1.0

---

## Resumen de cambios

| Área | Sección afectada | Tipo de cambio |
|---|---|---|
| A | §3.2 Tabla `items` | Dos columnas nuevas: `category`, `weight_range` |
| A | §4 Índices | Sin cambios requeridos |
| B | §2 Estructura de carpetas | Nuevo archivo `config/loggers.ts` |
| C | §2 Estructura de carpetas | Nuevo servicio `application/services/analytics.service.ts` |
| D | §7 Jobs de pg_cron | Instrumentación analítica en Job 1 y Job 5 |
| D | §12 Reglas de Autorización por Use Case | Instrumentación analítica en use cases existentes |

---

## A — Sección 3.2 — Tabla `items`

### Cambio

Añadir columnas `category` y `weight_range` a la tabla `items`.

```sql
ALTER TABLE items
  ADD COLUMN category     TEXT NOT NULL,
  ADD COLUMN weight_range TEXT NOT NULL;

ALTER TABLE items
  ADD CONSTRAINT chk_items_category
    CHECK (category IN (
      'furniture','electronics','clothing','books',
      'toys','kitchen','sports','tools','other'
    ));

ALTER TABLE items
  ADD CONSTRAINT chk_items_weight_range
    CHECK (weight_range IN ('lt1','1to5','5to20','gt20'));
```

**Nota de migración:** ambos campos son `NOT NULL`. Si existen registros previos deben recibir un valor antes de aplicar las constraints. Valor de relleno recomendado para registros históricos: `category = 'other'`, `weight_range = 'lt1'`.

**Definición completa actualizada de la tabla:**

```sql
CREATE TABLE items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id        UUID NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  condition       TEXT NOT NULL,
  category        TEXT NOT NULL
                  CHECK (category IN (
                    'furniture','electronics','clothing','books',
                    'toys','kitchen','sports','tools','other'
                  )),
  weight_range    TEXT NOT NULL
                  CHECK (weight_range IN ('lt1','1to5','5to20','gt20')),
  location        GEOGRAPHY(POINT, 4326) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','reserved','completed','cancelled')),
  requests_paused BOOLEAN NOT NULL DEFAULT FALSE,
  degraded_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reserved_at     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);
```

**Valores del selector `category` — referencia para validadores y formulario de publicación:**

| Valor interno | Etiqueta visible |
|---|---|
| `furniture` | Muebles |
| `electronics` | Electrónica |
| `clothing` | Ropa y calzado |
| `books` | Libros y material educativo |
| `toys` | Juguetes |
| `kitchen` | Cocina y hogar |
| `sports` | Deporte y ocio |
| `tools` | Herramientas |
| `other` | Otro |

**Valores del selector `weight_range` — referencia para validadores y formulario de publicación:**

| Valor interno | Etiqueta visible | Estimado ESG |
|---|---|---|
| `lt1` | Menos de 1 kg | ~0.5 kg |
| `1to5` | Entre 1 y 5 kg | ~3 kg |
| `5to20` | Entre 5 y 20 kg | ~12 kg |
| `gt20` | Más de 20 kg | ~25 kg |

> Los pesos estimados se usan exclusivamente para métricas ESG agregadas. No se exponen a nivel de objeto individual en ningún DTO de respuesta.

---

## A — Sección 4 — Índices

### Cambio

Sin índices adicionales requeridos. `category` y `weight_range` no son candidatos a índice en el contexto de las consultas del MVP. Los filtros de analítica se realizan sobre los logs, no sobre la base de datos operativa.

---

## B — Sección 2 — Estructura de carpetas — Logger de analítica

### Cambio

Añadir archivo `config/loggers.ts` con separación de loggers de aplicación y analítica.

```
src/
└── config/
    └── loggers.ts     ← nuevo
```

**Contenido de `src/config/loggers.ts`:**

```typescript
import pino from 'pino';

// Logger de aplicación — errores, requests HTTP, infraestructura
export const appLogger = pino({
  level: 'info',
  base: { service: 'app' },
});

// Logger de analítica — eventos de negocio exclusivamente
export const analyticsLogger = pino({
  level: 'info',
  base: { service: 'analytics' },
});
```

**Regla de implementación — separación estricta de loggers:**
Los dos loggers nunca se mezclan. Un error de base de datos va a `appLogger`. Un evento de negocio va a `analyticsLogger`. Esta separación permite filtrar, retener y redirigir cada stream de forma independiente sin modificar el código de aplicación. En Railway, los logs de ambos streams se distinguen por el campo `service` del JSON estructurado.

**Nota de retención (MVP):**
Los logs de analítica se emiten a stdout en Railway junto al stream de aplicación. Se recomienda configurar la retención máxima disponible en Railway desde el día 1. La transición a Supabase Storage (umbral: >1.000 usuarios activos) no requiere cambios en el código de aplicación — únicamente configuración del transport de pino.

---

## C — Sección 2 — Estructura de carpetas — analytics.service

### Cambio

Añadir servicio `analytics.service.ts` en `application/services/`.

```
src/
└── application/
    └── services/
        └── analytics.service.ts     ← nuevo
```

**Contenido de `src/application/services/analytics.service.ts`:**

```typescript
import { analyticsLogger } from '../../config/loggers';
import { createHash } from 'crypto';

function hashUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex');
}

export function emitEvent(
  event: string,
  userId: string,
  properties: Record<string, unknown>,
  sessionId?: string
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

**Reglas de implementación:**

- `emitEvent` se llama **después** de que la transacción de base de datos haya sido confirmada (committed). Nunca dentro de una transacción activa.
- Un fallo en `emitEvent` no debe revertir ni interrumpir ninguna operación de negocio. La llamada es fire-and-forget: no se awaita ni se captura en flujo de control de negocio.
- `userId` nunca se pasa en crudo al logger — siempre se hashea internamente mediante `hashUserId`.
- `properties` no debe contener: coordenadas exactas, email, `contact_channel`, ni UUID de usuario en crudo.

**Esquema canónico del evento emitido:**

```json
{
  "event": "entidad.acción",
  "timestamp": "2026-05-24T10:00:00.000Z",
  "userId": "<sha256-del-uuid>",
  "sessionId": "<uuid-de-sesión | null>",
  "properties": {
    "campo1": "valor1"
  }
}
```

---

## D — Sección 7 — Jobs de pg_cron — Instrumentación analítica

### Job 1 — Degradación por inactividad de objetos

El job SQL existente no se modifica. Se añade instrumentación a nivel de aplicación en el adaptador que ejecuta o procesa los resultados del job.

**Evento a emitir por cada objeto degradado:**

```typescript
// infrastructure/jobs/degrade-inactive-items.ts

import { emitEvent } from '../../application/services/analytics.service';

// Por cada item degradado en el batch:
emitEvent(
  'item.degraded',
  item.donorId,
  {
    itemId: item.id,
    category: item.category,
    daysActiveBeforeDegradation: Math.floor(
      (Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    ),
  }
);
```

> **Nota:** si el Job 1 se ejecuta exclusivamente como SQL puro via pg_cron sin capa de aplicación intermedia, la instrumentación de `item.degraded` (AE-013) se difiere a una revisión posterior cuando se implemente un mecanismo de notificación por email para este evento (EVT-012 ya existe en email-flow-mapping). En ese contexto, el adaptador que gestiona la notificación puede emitir el evento de analítica.

### Job 5 — Cierre automático de sesiones expiradas

Mismo criterio que Job 1. La instrumentación se añade en el adaptador de procesamiento post-job, no en el SQL de pg_cron.

**Evento a emitir por cada sesión expirada:**

```typescript
// infrastructure/jobs/expire-delivery-sessions.ts

import { emitEvent } from '../../application/services/analytics.service';

// Por cada sesión expirada en el batch:
emitEvent(
  'session.expired',
  session.donorId,
  {
    sessionId: session.id,
    itemId: session.itemId,
    category: item.category,
    durationMs: Date.now() - new Date(session.createdAt).getTime(),
  },
  session.id
);
```

---

## D — Sección 12 — Reglas de Autorización por Use Case — Instrumentación analítica

La instrumentación de analítica se añade como paso final en cada use case, tras el commit de la transacción. No modifica la lógica de negocio, las validaciones de autorización ni el flujo de errores de ningún use case.

---

### Use Case: RegisterUser — AE-001

```typescript
// use-cases/user/RegisterUser.ts

import { emitEvent } from '../../services/analytics.service';

// Tras commit de la transacción:
emitEvent(
  'user.registered',
  user.id,
  {
    postalCode: user.postalCode,
  }
);
```

---

### Use Case: LoginUser — AE-002

```typescript
// use-cases/user/LoginUser.ts

import { emitEvent } from '../../services/analytics.service';

// Tras autenticación exitosa:
emitEvent(
  'user.login',
  user.id,
  {}
);
```

---

### Use Case: CreateItem — AE-010

```typescript
// use-cases/item/CreateItem.ts

import { emitEvent } from '../../services/analytics.service';

// Tras commit de la transacción:
emitEvent(
  'item.published',
  currentUser.id,
  {
    itemId: item.id,
    category: item.category,
    condition: item.condition,
    weightRange: item.weightRange,
  }
);
```

---

### Use Case: RequestItem — AE-011 y AE-031

```typescript
// use-cases/item/RequestItem.ts

import { emitEvent } from '../../services/analytics.service';

// Tras commit exitoso de la solicitud:
emitEvent(
  'item.requested',
  currentUser.id,
  {
    itemId: item.id,
    category: item.category,
  }
);

// Si se lanza LimitExceededException (límite de 3/30 días alcanzado):
emitEvent(
  'limit.reached',
  currentUser.id,
  {
    windowStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    windowEnd: new Date().toISOString(),
  }
);
```

> El evento `limit.reached` (AE-031) se emite en el bloque catch específico de `LimitExceededException`, antes de relanzar la excepción hacia el controlador.

---

### Use Case: SelectReceiver — AE-012

```typescript
// use-cases/item/SelectReceiver.ts

import { emitEvent } from '../../services/analytics.service';

// Tras commit de la transacción (sesión creada):
emitEvent(
  'item.receiver_selected',
  currentUser.id,
  {
    itemId: item.id,
    candidateCount: pendingRequestsCountAtSelection,
    timeToSelectMs: Date.now() - new Date(item.createdAt).getTime(),
  },
  deliverySession.id
);
```

> `pendingRequestsCountAtSelection` — número de solicitudes en estado `pending` recuperado antes de la transacción de selección, durante la consulta de ranking.

---

### Use Case: CancelItem — AE-014

```typescript
// use-cases/item/CancelItem.ts

import { emitEvent } from '../../services/analytics.service';

// Tras commit de la transacción:
emitEvent(
  'item.cancelled',
  currentUser.id,
  {
    itemId: item.id,
    category: item.category,
    hadActiveSession: activeSessionExistedBeforeCancellation,
  }
);
```

> `hadActiveSession` — booleano resuelto antes de la transacción de cancelación, al verificar la existencia de sesión activa (§12.3).

---

### Use Case: PauseItemRequests — AE-015

```typescript
// use-cases/item/PauseItemRequests.ts

import { emitEvent } from '../../services/analytics.service';

// Tras commit del cambio de flag:
emitEvent(
  'item.requests_paused',
  currentUser.id,
  {
    itemId: item.id,
    paused: payload.paused,
  }
);
```

---

### Use Case: ConfirmDelivery — AE-020

```typescript
// use-cases/delivery/ConfirmDelivery.ts

import { emitEvent } from '../../services/analytics.service';

// Tras commit de la transacción:
emitEvent(
  'session.completed',
  currentUser.id,
  {
    itemId: session.itemId,
    category: item.category,
    weightRange: item.weightRange,
    durationMs: Date.now() - new Date(session.createdAt).getTime(),
  },
  session.id
);
```

---

### Use Case: CancelDelivery — AE-022 y AE-023

```typescript
// use-cases/delivery/CancelDelivery.ts

import { emitEvent } from '../../services/analytics.service';

// Tras commit de la transacción:
const eventName = payload.noShow
  ? 'session.cancelled_no_show'
  : 'session.cancelled_donor';

emitEvent(
  eventName,
  currentUser.id,
  {
    sessionId: session.id,
    itemId: session.itemId,
    category: item.category,
    durationMs: Date.now() - new Date(session.createdAt).getTime(),
  },
  session.id
);
```

---

### ReputationService — AE-030

```typescript
// application/services/ReputationService.ts

import { emitEvent } from './analytics.service';

// En onDeliveryCompleted, tras actualizar el score:
emitEvent(
  'reputation.changed',
  user.id,
  {
    delta: +10,
    type: 'delivery_completed',
    newScore: user.reputationScore,
    consecutiveNoShows: 0,
  }
);

// En onNoShow, tras actualizar el score:
emitEvent(
  'reputation.changed',
  user.id,
  {
    delta: delta,
    type: 'no_show',
    newScore: user.reputationScore,
    consecutiveNoShows: user.consecutiveNoShows,
  }
);
```

> `newScore` en el evento corresponde al valor actualizado tras aplicar el delta. No expone el UUID del usuario — el `emitEvent` lo hashea internamente.

---

## Catálogo de eventos instrumentados — referencia consolidada

| ID | Evento | Use Case / Job | Fase de roadmap |
|---|---|---|---|
| AE-001 | `user.registered` | `RegisterUser` | Fase 3 |
| AE-002 | `user.login` | `LoginUser` | Fase 3 |
| AE-010 | `item.published` | `CreateItem` | Fase 4 |
| AE-011 | `item.requested` | `RequestItem` | Fase 4 |
| AE-012 | `item.receiver_selected` | `SelectReceiver` | Fase 4 |
| AE-013 | `item.degraded` | Job 1: `degrade-inactive-items` | Fase 4 |
| AE-014 | `item.cancelled` | `CancelItem` | Fase 4 |
| AE-015 | `item.requests_paused` | `PauseItemRequests` | Fase 4 |
| AE-020 | `session.completed` | `ConfirmDelivery` | Fase 6 |
| AE-021 | `session.expired` | Job 5: `expire-delivery-sessions` | Fase 6 |
| AE-022 | `session.cancelled_no_show` | `CancelDelivery` | Fase 6 |
| AE-023 | `session.cancelled_donor` | `CancelDelivery` | Fase 6 |
| AE-030 | `reputation.changed` | `ReputationService` | Fase 5 |
| AE-031 | `limit.reached` | `RequestItem` | Fase 5 |
