# Sprint Change Proposal — DLT-004

**Proyecto:** backend (Regálalo)  
**Fecha:** 2026-05-24  
**Autor del análisis:** Correct Course (BMad)  
**Referencia:** `docs/delta-backend-DLT-004.md`, `docs/prd-analytics.md`  
**Estado:** Aprobada por Emanuel — 2026-05-24

---

## 1. Resumen del issue

### Problema / disparador

Se dispone del delta de diseño **DLT-004** (architecture v1.3 → v1.4) que incorpora la **capa de analítica e instrumentación** según PRD Analítica v1.0:

- Dos columnas obligatorias en `items`: `category`, `weight_range`
- Separación de loggers pino (`app` vs `analytics`)
- Servicio `analytics.service` con `emitEvent` (SHA-256 de userId, fire-and-forget post-commit)
- Instrumentación de 15 eventos (AE-001…AE-031) en use cases y jobs existentes

### Contexto

| Artefacto | Estado actual |
|---|---|
| `docs/architecture.md` | **v1.3** (DLT-003) — sin analítica ni columnas en `items` |
| `docs/prd-analytics.md` | Especificación completa; vinculada al delta |
| `src/` | Sin `category`, `weight_range`, `loggers.ts`, ni `analytics.service` |
| Épicas 1–5 | **Completadas** — publicación y flujos sin campos analíticos |
| Épica 6 | **En curso** (6.4 en review, 6.5 ready-for-dev) — DLT-003 |
| `sprint-status.yaml` | Sin épica de analítica |

### Evidencia

- Migración `003-create-items.sql` no incluye `category` ni `weight_range`
- Búsqueda en `src/`: cero referencias a `analytics.service`, `analyticsLogger`, `category`, `weight_range`
- `deferred-work.md` ya registra deuda de **dos instancias pino** (1-1) — DLT-004 la resuelve con `config/loggers.ts`
- Jobs de degradación y expiración **sí** tienen use cases Node (`DegradeInactiveItemsUseCase`, `ExpireDeliverySessionsUseCase`) — instrumentación AE-013 / AE-021 viable en adaptador, no solo SQL

### Tipo de cambio

**Nuevo requisito de producto** (capa transversal de observabilidad) — no es bug ni malentendido del MVP original; extiende el contrato de publicación de objetos y añade telemetría sin alterar reglas de negocio core.

---

## 2. Análisis de impacto

### Impacto en épicas

| Épica | Impacto |
|---|---|
| 1 (Auth) | **Superseded en spec** para instrumentación AE-001/AE-002; implementación vía historia 7.x sin reabrir historias `done` |
| 2 (Objetos) | **Contrato roto** en `POST` publicar ítem — requiere `category` + `weightRange`; migración con backfill |
| 3 (Solicitudes) | Instrumentación AE-011, AE-031 en `RequestItem` |
| 4 (Entrega) | Instrumentación AE-012, AE-020–023; job AE-021 |
| 5 (Perfil) | Sin cambio de contrato HTTP |
| 6 (DLT-003) | **Sin conflicto directo** — completar 6.x antes o en paralelo según capacidad; orden recomendado: terminar 6.4/6.5, luego épica 7 |
| **7 (nueva)** | Épica dedicada DLT-004 — analítica + schema items |

### Impacto en historias existentes (`done`)

No se reabren entradas en `sprint-status.yaml`. La brecha se cierra con **Épica 7** (patrón idéntico a Épica 6 / DLT-003).

### Conflictos de artefactos (aplicados 2026-05-24)

| Artefacto | Estado |
|---|---|
| `docs/architecture.md` | [x] v1.4 |
| `docs/delta-backend-DLT-004.md` | [x] Incorporado |
| `docs/prd.md` | [x] Referencia en flujo de publicación |
| `_bmad-output/initiative-backend/archive-v6/epics.md` | [x] FR41–42, Épica 7, historias 7.1–7.6 |
| `_bmad-output/project-context.md` | [x] Reglas analítica |
| `sprint-status.yaml` | [x] épica 7 en backlog |
| OpenAPI + frontend | Pendiente — tras implementación 7.3+ |

### Impacto técnico

- **Migración SQL** `013-items-dlt-004.sql` con backfill `category='other'`, `weight_range='lt1'` antes de NOT NULL
- **Breaking change API** en publicación de ítems (validadores Zod + OpenAPI)
- **15 puntos de instrumentación** — riesgo de regresión bajo si se testea con mocks de logger
- **Privacidad:** prohibición de PII en `properties`; `userId` hasheado — alineado con NFR2 (no coordenadas)
- **Jobs:** instrumentar en use cases existentes de scheduler (no difiere AE-013/AE-021 salvo que se elimine capa Node)

### Impacto frontend (repo `no-lo-vendo`)

- Formulario de publicación: selectores `category` y `weightRange` (etiquetas en delta §A)
- No exponer pesos ESG en UI de detalle (solo agregados futuros)
- Coordinar tras OpenAPI actualizado — **fuera de scope backend** pero bloqueante para E2E publicación

---

## 3. Enfoque recomendado

**Opción seleccionada:** Ajuste directo (Opción 1) — Épica 7 en backlog, sin rollback de épicas 1–6.

| Criterio | Valoración |
|---|---|
| Esfuerzo | **Medio-alto** (6 historias, migración breaking, 15 eventos) |
| Riesgo | **Medio** (migración NOT NULL con datos; breaking POST items; no await en emitEvent) |
| MVP funcional | **Sin reducción** — analítica es capa transversal; publicación gana 2 campos obligatorios |
| Timeline | +1 sprint tras cerrar épica 6 (o historias 7.1–7.2 en paralelo con 6.5) |

**No viable:** Rollback de épicas 2–4 (coste prohibitivo).  
**No viable:** Revisión MVP / diferir `category` (pérdida irreversible de dimensión analítica — PRD Analítica §4).

### Orden sugerido de implementación

```
6.4 (review) → 6.5 → 7.1 → 7.2 → 7.3 → 7.4 → 7.5 → 7.6
```

`7.1` antes de `7.3` porque CreateItem necesita columnas en BD. `7.2` puede ir en paralelo con `7.1` si dos desarrolladores.

---

## 4. Propuestas de cambio detalladas

### 4.1 Architecture (`docs/architecture.md` v1.4)

**Sección §3.2 — Tabla `items`**

OLD: sin `category`, `weight_range`  
NEW: columnas y CHECK constraints según `delta-backend-DLT-004.md` §A

**Sección §2 — Estructura**

NEW: `src/config/loggers.ts`, `src/application/services/analytics.service.ts`

**Sección §7 / §12**

NEW: bloques de instrumentación por use case y notas en jobs (AE-013, AE-021 en adaptadores Node)

**Rationale:** Fuente única de verdad para agentes BMAD y OpenAPI.

---

### 4.2 PRD (`docs/prd.md`)

**Sección publicación de objetos (FR8 equivalente)**

OLD: título, descripción, condición, ubicación, imágenes  
NEW: añadir categoría y rango de peso obligatorios; enlace a `docs/prd-analytics.md` para catálogo de eventos

**Rationale:** Trazabilidad MVP ↔ analítica sin duplicar catálogo AE completo en PRD principal.

---

### 4.3 Épicas — Nueva Épica 7

#### FR41 (nuevo)

El sistema debe persistir `category` y `weight_range` en cada ítem, validados con CHECK en BD y Zod en API de publicación.

#### FR42 (nuevo)

El sistema debe emitir eventos de analítica (catálogo AE-001…AE-031) tras commit exitoso, con loggers separados y sin PII en `properties`.

#### Historia 7.1: Migración SQL y dominio items (DLT-004)

**Criterios de aceptación (resumen):**

- Migración `013-items-dlt-004.sql` con backfill y constraints
- Entidad/repositorio mapean `category` y `weightRange`
- Tests de repositorio con valores válidos/inválidos

#### Historia 7.2: Loggers y analytics.service

**Criterios:**

- `config/loggers.ts` con `appLogger` y `analyticsLogger` (`service: app|analytics`)
- `emitEvent` hashea userId, fire-and-forget, nunca en transacción activa
- Refactor mínimo: `pinoHttp` y `main.ts` usan `appLogger` (cierra deferred 1-1)

#### Historia 7.3: API publicar ítem — category y weightRange

**Criterios:**

- `POST` publicar ítem exige `category` y `weightRange` (enums del delta)
- OpenAPI actualizado; tests API 400 en valores inválidos
- AE-010 emitido post-commit en publish use case

#### Historia 7.4: Instrumentación autenticación (AE-001, AE-002)

**Criterios:**

- `RegisterUser` → `user.registered` con `postalCode` en properties
- `LoginUser` → `user.login` tras auth exitosa
- Tests con spy/mock de `analyticsLogger`

#### Historia 7.5: Instrumentación objetos y solicitudes (AE-011–015, AE-031)

**Criterios:**

- Eventos en RequestItem (incl. `limit.reached` en catch `LimitExceededException` antes de relanzar)
- Eventos en SelectReceiver, CancelItem, PauseItemRequests
- AE-013 en `DegradeInactiveItemsUseCase` por ítem degradado

#### Historia 7.6: Instrumentación entrega y reputación (AE-020–023, AE-030, AE-021)

**Criterios:**

- ConfirmDelivery, CancelDelivery (rama noShow), ReputationService
- AE-021 en `ExpireDeliverySessionsUseCase`
- Verificación SC-01 del PRD analítica (cobertura de catálogo)

---

### 4.4 UI/UX (frontend)

**Pantalla publicar objeto**

- Añadir dos selectores con etiquetas del delta §A (español)
- Validación reactiva alineada con enums API

**Rationale:** Sin UI, API breaking deja publicación rota en producción.

---

## 5. Handoff de implementación

### Clasificación de alcance

**Moderado** — Nueva épica 7 + breaking change en API de ítems + coordinación frontend. No requiere replanificación PM completa (delta y PRD analítica ya especifican el qué).

### Responsables

| Rol | Responsabilidad |
|---|---|
| Developer (backend) | Historias 7.1 → 7.6; tests; OpenAPI |
| Developer (frontend) | Selectores publicación tras `api:generate` |
| PO (opcional) | Validar enums `category` / etiquetas UX |

### Criterios de éxito

1. Migración aplicada; ítems existentes con backfill.
2. SC-01…SC-06 de `docs/prd-analytics.md` verificables en CI o checklist PR.
3. Streams `service: app` y `service: analytics` distinguibles en logs Railway.
4. OpenAPI y cliente Angular regenerados.
5. Ningún evento con email, coordenadas ni UUID crudo en `properties`.

---

## 6. Checklist Correct Course (resumen)

| Sección | Estado |
|---|---|
| 1.1 Trigger | [x] Done — DLT-004 + PRD Analítica |
| 1.2 Problema | [x] Done — Nuevo requisito transversal |
| 1.3 Evidencia | [x] Done — Schema y código sin implementar |
| 2.1 Épica actual (6) | [x] Done — Puede continuar; épica 7 después |
| 2.2 Cambios épicas | [x] Done — Épica 7 propuesta |
| 2.3 Épicas futuras | [x] Done — Sin obsolescencia |
| 2.4 Nuevas épicas | [x] Done — Épica 7 |
| 2.5 Prioridad | [x] Done — Tras épica 6 |
| 3.1 PRD | [x] Done |
| 3.2 Architecture | [x] Done |
| 3.3 UX | [!] Action-needed — Formulario publicación (frontend, tras 7.3) |
| 3.4 Otros | [x] Done — OpenAPI, deferred pino, Railway retención |
| 4.1 Ajuste directo | [x] Viable |
| 4.2 Rollback | [x] Not viable |
| 4.3 MVP review | [x] Not viable |
| 4.4 Path seleccionado | [x] Opción 1 |
| 5.x Componentes propuesta | [x] Done — este documento |
| 6.3 Aprobación usuario | [x] Done — yes (2026-05-24) |
| 6.4 sprint-status.yaml | [x] Done — épica 7 en backlog |
| 6.5 Handoff | [x] Done |

---

## Aprobación

**Aprobada** — Artefactos actualizados. Siguiente paso: `bmad-dev-story` con historia **6.5** (si prioridad DLT-003) o **7.1** (inicio DLT-004).

**Alcance:** Moderado — Developer agent, orden `6.5 → 7.1…7.6`.
