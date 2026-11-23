---
title: PRD — Capa de Analítica e Instrumentación
version: '1.1'
date: '2026-05-26'
documentType: technical-complement
classification:
  domain: general
  projectType: api_backend
inputDocuments:
  - docs/prd.md
relatedDocuments:
  - docs/architecture.md
status: pending-approval
---

# 📊 PRD — Capa de Analítica e Instrumentación
## "Regálalo"

> Versión 1.0 — Documento inicial.
> Complemento de [`docs/prd.md`](prd.md) (PRD MVP v3.0). No modifica el alcance del MVP. Define captura de datos, instrumentación de eventos y base para monetización futura basada en datos.

---

## 🧭 1. Visión

Construir desde el inicio una capa de observabilidad del comportamiento del sistema que permita:

- Entender la salud operativa del ecosistema en tiempo real.
- Acumular datos estructurados de valor analítico y comercial.
- Habilitar decisiones de producto basadas en evidencia.
- Sentar las bases técnicas para los modelos de monetización dependientes de datos (datos agregados, certificados ESG) sin rediseño posterior.

Esta capa es **invisible para el usuario final** y **no modifica ningún flujo de negocio existente**.

---

## ⚙️ 2. Principios

- Captura en origen — los eventos se registran en la capa de aplicación, no inferidos a posteriori desde logs de acceso.
- Sin fricción de usuario — ningún dato de esta capa requiere input adicional del usuario en esta fase.
- Separación de concerns — los logs de analítica son independientes de los logs de aplicación (errores, infraestructura).
- Privacidad por diseño — ningún evento expone coordenadas exactas, email ni datos de contacto.
- Persistencia durable en MVP — eventos en Postgres (`analytics_events`, misma instancia Supabase); sin herramientas analíticas externas (PostHog, etc.).
- Bajo coste operativo — pino en stdout como copia operativa; consultas MVP vía SQL.
- Esquema estable — el esquema de evento se define ahora para que sea extensible sin rotura hacia herramientas futuras.

---

## 🎯 3. Alcance

### Incluido en esta fase

- Definición del esquema canónico de evento de analítica.
- Catálogo de eventos de negocio a instrumentar.
- Separación de loggers en el backend (aplicación vs. analítica).
- Dos campos nuevos en el modelo de objeto: `category` y `weight_range`.
- Estrategia de retención y destino de eventos en MVP (Postgres + stdout).
- Tabla `analytics_events` y dual-write desde `emitEvent`.

### No incluido en esta fase

- Herramienta de analítica externa (PostHog, Plausible, etc.).
- Dashboard de métricas.
- Export automático a almacén analítico o Supabase Storage (post-MVP).
- Analítica de frontend (eventos de UI, clics, scroll).
- Modelo de monetización de datos (dependiente de volumen de usuarios).

---

## ✅ 3.1 Criterios de éxito

Criterios verificables al cerrar la instrumentación en MVP (Fase 8):

| ID | Criterio | Verificación |
|---|---|---|
| SC-01 | Los eventos del catálogo (AE-001…AE-033) emiten log tras commit exitoso en su use case o job | Tests de integración o revisión de cobertura en PR |
| SC-02 | Ningún evento incluye email, coordenadas exactas ni `contact_channel` en `properties` | Auditoría estática + test de muestra por evento |
| SC-03 | `userId` en logs es SHA-256 del UUID, nunca UUID en crudo | Assert en tests de `emitEvent` |
| SC-04 | Streams `app` y `analytics` separados (`service` distinto en pino) | Revisión de configuración + log de smoke |
| SC-05 | Retención de logs en Railway configurada (mínimo 30 días recomendado) como **copia operativa** (stdout) | Checklist pre-lanzamiento |
| SC-06 | Campos `category` y `weight_range` obligatorios en publicación de ítem | Tests API + migración aplicada |
| SC-07 | Cada `emitEvent` persiste fila en `analytics_events` tras commit; fallo de insert no revierte negocio | Tests con mock de repositorio + smoke SQL pre-lanzamiento |

**Usuario activo (referencia Post-MVP):** usuario con al menos un evento `user.login` o acción de negocio (p. ej. `item.published`, `item.requested`) en los últimos 30 días — usado para export opcional a Supabase Storage o herramienta externa (>1.000 usuarios activos).

---

## 🧩 4. Cambios en el Modelo de Datos

Dos campos nuevos en la tabla `items`. Su ausencia en esta fase hace irrecuperable retroactivamente la dimensión analítica de los objetos ya publicados.

### 4.1 Campo `category`

| Parámetro | Detalle |
|---|---|
| Tabla | `items` |
| Tipo | `TEXT NOT NULL` |
| Restricción | `CHECK (category IN (valores definidos))` |
| Obligatorio | Sí — campo requerido en publicación |
| Visible para el usuario | Sí — selector en el formulario de publicación |

**Valores iniciales del selector:**

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

> Los valores del selector son extensibles sin cambio de esquema. La restricción CHECK debe actualizarse si se añaden categorías nuevas.

### 4.2 Campo `weight_range`

| Parámetro | Detalle |
|---|---|
| Tabla | `items` |
| Tipo | `TEXT NOT NULL` |
| Restricción | `CHECK (weight_range IN (valores definidos))` |
| Obligatorio | Sí — campo requerido en publicación |
| Visible para el usuario | Sí — selector en el formulario de publicación |

**Valores del selector:**

| Valor interno | Etiqueta visible | Referencia ESG |
|---|---|---|
| `lt1` | Menos de 1 kg | ~0.5 kg estimado |
| `1to5` | Entre 1 y 5 kg | ~3 kg estimado |
| `5to20` | Entre 5 y 20 kg | ~12 kg estimado |
| `gt20` | Más de 20 kg | ~25 kg estimado |

> El peso estimado por rango se usa exclusivamente para cálculos de impacto ESG agregados. Nunca se expone a nivel de objeto individual.

### 4.3 Tabla `analytics_events` (persistencia MVP)

| Parámetro | Detalle |
|---|---|
| Tabla | `analytics_events` |
| Propósito | Almacén durable de eventos AE-001…AE-033 |
| Acceso | Solo backend (service role). Sin API REST pública. |
| Privacidad | `user_id_hash` = SHA-256 del UUID; sin FK a `users` |

**Columnas:** `event`, `occurred_at`, `user_id_hash`, `session_id` (nullable), `properties` (JSONB), `created_at`.

Espejo del payload canónico §5. `emitEvent` escribe en Pino (stdout) y en esta tabla (dual-write, fire-and-forget). Detalle SQL: `docs/architecture.md` §3.9.

---

## 📐 5. Esquema Canónico de Evento

Todos los eventos de analítica siguen esta estructura sin excepción:

```json
{
  "event": "entidad.acción",
  "timestamp": "2026-05-24T10:00:00.000Z",
  "userId": "hash-sha256-del-uuid",
  "sessionId": "uuid-de-sesión-si-aplica",
  "properties": {
    "campo1": "valor1",
    "campo2": "valor2"
  }
}
```

**Reglas del esquema:**

- `event` — formato `entidad.acción` en minúsculas con punto como separador. Ejemplos: `item.published`, `session.completed`.
- `timestamp` — ISO 8601 con milisegundos y zona UTC. Generado en el momento del evento, no del log.
- `userId` — SHA-256 del UUID del usuario. Nunca el UUID en crudo ni el email. Permite correlación entre eventos del mismo usuario sin exponer identidad.
- `sessionId` — UUID de `delivery_session` cuando el evento está asociado a una. `null` en el resto.
- `properties` — objeto plano. Sin anidamiento profundo. Sin campos de coordenadas exactas. Sin email. Sin `contact_channel`.

---

## 📋 6. Catálogo de Eventos

### 6.1 Eventos de usuario

| ID | Evento | Trigger | Properties relevantes |
|---|---|---|---|
| AE-001 | `user.registered` | Use Case: `RegisterUser` | `postalCode` (no coordenadas) |
| AE-002 | `user.login` | Use Case: `LoginUser` | — |

### 6.2 Eventos de objeto

| ID | Evento | Trigger | Properties relevantes |
|---|---|---|---|
| AE-010 | `item.published` | Use Case: `CreateItem` | `itemId`, `category`, `condition`, `weightRange` |
| AE-011 | `item.requested` | Use Case: `RequestItem` | `itemId`, `category` |
| AE-012 | `item.receiver_selected` | Use Case: `SelectReceiver` | `itemId`, `sessionId`, `timeToSelectMs`, `candidateCount` |
| AE-013 | `item.degraded` | Job: `degrade-inactive-items` | `itemId`, `category`, `daysActiveBeforeDegradation` |
| AE-014 | `item.cancelled` | Use Case: `CancelItem` | `itemId`, `category`, `hadActiveSession` |
| AE-015 | `item.requests_paused` | Use Case: `PauseItemRequests` | `itemId`, `paused` |

### 6.3 Eventos de sesión de entrega

| ID | Evento | Trigger | Properties relevantes |
|---|---|---|---|
| AE-020 | `session.completed` | Use Case: `ConfirmDelivery` | `sessionId`, `itemId`, `category`, `weightRange`, `durationMs` |
| AE-021 | `session.expired` | Job: `expire-delivery-sessions` | `sessionId`, `itemId`, `category`, `durationMs` |
| AE-022 | `session.cancelled_no_show` | Use Case: `CancelDelivery` (noShow=true) | `sessionId`, `itemId`, `category`, `durationMs` |
| AE-023 | `session.cancelled_donor` | Use Case: `CancelDelivery` (noShow=false) | `sessionId`, `itemId`, `category`, `durationMs` |

### 6.4 Eventos de sistema

| ID | Evento | Trigger | Properties relevantes |
|---|---|---|---|
| AE-030 | `reputation.changed` | ReputationService | `delta`, `type`, `newScore` (hasheado), `consecutiveNoShows` |
| AE-031 | `limit.reached` | Use Case: `RequestItem` | `windowStart`, `windowEnd` |
| AE-032 | `report.submitted` | Use Case: `CreateReportUseCase` | `entityType` (`'item'`/`'user'`), `reason` — sin `reporter_id` en crudo ni `reported_entity_id` |
| AE-033 | `report.resolved` | Use Case: `AdminResolveReportUseCase` | `action`, `entityType` (`'item'`/`'user'`), `resolutionTimeHours` (horas entre `created_at` y NOW()) |

> `durationMs` — diferencia entre `created_at` y el timestamp del evento de cierre. Mide el tiempo real de ciclo de cada sesión.
> `timeToSelectMs` — diferencia entre `item.created_at` y el momento de selección. Mide la velocidad de decisión del donante.
> `candidateCount` — número de solicitudes en estado `pending` en el momento de la selección.

---

## 🔧 7. Implementación Técnica

### 7.1 Separación de loggers (pino)

```javascript
// src/config/loggers.ts

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

Los dos loggers **nunca se mezclan**. Un error de base de datos va a `appLogger`. Un evento de negocio va a `analyticsLogger`. Esta separación permite filtrar, retener y redirigir cada stream de forma independiente sin tocar el código de aplicación.

### 7.2 Función de emisión de eventos

```javascript
// src/application/services/analytics.service.ts

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

### 7.3 Ejemplo de uso en un use case

```javascript
// use-cases/delivery/ConfirmDelivery.ts

import { emitEvent } from '../../services/analytics.service';

// ... lógica de negocio ...

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

### 7.4 Regla de implementación

El `emitEvent` se llama **después** de que la transacción de base de datos haya sido confirmada (committed). Nunca dentro de la transacción. Un fallo en la emisión del evento de analítica (log o insert en `analytics_events`) no debe revertir una operación de negocio.

### 7.5 Persistencia en Postgres (MVP)

Tras `analyticsLogger.info`, si `ANALYTICS_PERSISTENCE=postgres` (default en producción), insertar en `analytics_events` de forma asíncrona (p. ej. `setImmediate`). Preferir `safeEmitEvent` en use cases. Implementación: historia 7-7.

---

## 💾 8. Retención y Destino de Eventos en MVP

| Fase | Destino primario | Destino secundario | Retención |
|---|---|---|---|
| MVP | Postgres `analytics_events` | Railway stdout (`service: analytics`) | BD: indefinida en MVP; logs Railway ≥30 días recomendado |
| Post-MVP (>1.000 usuarios activos) | Postgres (sigue siendo fuente) | Export opcional a Supabase Storage (NDJSON) | Archivo según política |
| Futuro | Postgres + herramienta analítica | Según integración | A evaluar |

El catálogo AE y `emitEvent` permanecen estables; cambios futuros son transports o jobs de export, no re-instrumentación de use cases.

---

## 📈 9. Métricas Derivadas

Con los eventos del catálogo, las siguientes métricas son calculables desde el inicio sin infraestructura adicional:

**Salud del ecosistema:**
- Tasa de conversión objeto → sesión completada
- Tiempo medio de selección de receptor (donante)
- Tiempo medio de ciclo completo (publicación → entrega)
- Tasa de expiración de sesiones vs. completadas
- Tasa de no-show por cohorte temporal

**Volumen y actividad:**
- Objetos publicados por categoría y período
- Distribución de peso estimado redistribuido
- Usuarios activos (donantes vs. receptores vs. ambos roles)
- Tasa de retención a 30 / 60 / 90 días

**Base para ESG:**
- Peso total estimado redistribuido (kg) por período
- Objetos salvados de residuo por categoría
- Índice de circularidad (objetos completados / objetos publicados)

**Base para datos agregados vendibles:**
- Densidad de actividad por código postal (anonimizado)
- Categorías más demandadas por zona geográfica
- Perfil de comportamiento agregado del ecosistema

---

## ⚠️ 10. Riesgos Asumidos

- Los logs en Railway son efímeros por defecto. Si no se configura retención o exportación antes de alcanzar el límite, se pierden eventos históricos. **Mitigación:** configurar retención máxima en Railway desde el día 1.
- El hash SHA-256 del userId permite correlación entre eventos del mismo usuario pero no permite identificación directa. Si en el futuro se necesita cruzar con datos de usuario, se requiere el UUID original en base de datos. El sistema conserva esta posibilidad por diseño.
- Los pesos estimados por rango tienen un margen de error significativo. Son válidos para métricas agregadas y tendencias, no para certificaciones individuales de precisión.
- La ausencia de frontend analytics impide medir abandono de flujos, errores de UX y comportamiento de navegación. Esta limitación es aceptada en MVP.

---

## 🗺️ 11. Integración con el Roadmap Existente

| Fase MVP | Acción de analítica asociada |
|---|---|
| Fase 1 — Infraestructura base | Configurar separación de loggers. Configurar retención en Railway. |
| Fase 2 — Modelo de datos | Añadir `category` y `weight_range` a la tabla `items`. |
| Fase 4 — Flujo de objetos | Instrumentar AE-010, AE-011, AE-012, AE-013, AE-014, AE-015. |
| Fase 5 — Ranking y reputación | Instrumentar AE-030, AE-031. |
| Fase 6 — Sesión de entrega | Instrumentar AE-020, AE-021, AE-022, AE-023. |
| Fase 3 — Autenticación | Instrumentar AE-001, AE-002. |
| Fase 8 — Calidad y lanzamiento | Verificar cobertura completa del catálogo. Revisar ausencia de datos sensibles en eventos. |

---

## 📦 12. Estado

- Documento: aprobación pendiente (`status: pending-approval` en frontmatter)
- PRD padre: [`docs/prd.md`](prd.md) (MVP v3.0)
- Dependencias bloqueantes para implementación: ninguna
- Impacto sobre el roadmap MVP: mínimo — dos campos nuevos en Fase 2, instrumentación distribuida en fases existentes
- Decisiones pendientes de aprobación: valores definitivos del selector `category`, confirmación de retención en Railway
