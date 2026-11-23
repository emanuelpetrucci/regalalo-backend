---
title: "Sincronizar documentación"
type: feature
ticket: 3
status: done
created: 2026-10-25
---

# Historia 12.3: Sincronizar documentación canal candidato

Status: review

## Historia

Como mantenedor,
quiero que PRD, arquitectura y épicas reflejen el canal de contacto del candidato,
para que implementación y revisiones futuras usen una sola fuente de verdad.

## Criterios de Aceptación

**Dado** el cierre de 12-2
**Cuando** se revisa `openapi/openapi.json`
**Entonces** documenta body en `POST /items/:id/requests` y `receiverContactChannel` en `GET /delivery-sessions/:id`
→ **Ya satisfecho** — `npm run openapi:generate` se ejecutó en historia 12-2 (494 tests, build limpio)

**Dado** la tabla §6 de `docs/delta-candidato-contacto.md`
**Cuando** se cierra la épica
**Entonces** están actualizados `docs/architecture.md` (§3.4–3.5, índices, Job 3, §12.2c, §12.4, §12.7), `docs/prd.md` (sesión de entrega, flujos §8 y §12) y `_bmad-output/initiative-backend/archive-v6/epics.md` (notas supersede en historias 3.1 / 4.1 / 4.2 / 4.6)

**Dado** emails y ranking
**Entonces** `email-flow-mapping.md`, `ranking-system.md` y `ranking-guia-producto.md` sin cambios (delta §6 explícito)

## Alcance explícito (IN / OUT)

| IN (12.3) | OUT |
|---|---|
| `docs/architecture.md` — §3.4, §3.5, §4, Job 3, §12.2c, §12.4, §12.7 | `openapi/openapi.json` — ya regenerado en 12-2 |
| `docs/prd.md` — sesión de entrega, §8 flujo, §12 flujo entrega | `docs/email-flow-mapping.md` |
| `epics.md` — notas supersede en 3.1, 4.1, 4.2, 4.6 | `docs/ranking-system.md` / `ranking-guia-producto.md` |
| Bump versión `architecture.md` a v1.7 con nota de cambios | Código TypeScript |
| | Tests (`npm test`) |
| | `npm run build` |

## Tareas / Subtareas

- [x] **Task 1 — `docs/architecture.md`: Actualización completa (v1.7)**
  - [x] 1a. Agregar nota de versión 1.7 al header (antes del bloque de v1.6)
  - [x] 1b. §3.4 `item_requests`: agregar `contact_channel TEXT` al CREATE TABLE (entre `status` y `created_at`)
  - [x] 1c. §3.5 `delivery_sessions`: agregar `receiver_contact_channel TEXT` y `receiver_contact_purged BOOLEAN NOT NULL DEFAULT FALSE` (tras `contact_purged`, antes de `donor_confirmed`)
  - [x] 1d. §4 Índices: reemplazar `idx_sessions_contact_purge` (solo `contact_purged = FALSE`) por la versión con condición OR que cubre ambos flags
  - [x] 1e. Job 3: reemplazar SQL de purga de `contact_channel` por el SQL ampliado que purga ambos canales
  - [x] 1f. §12.2 GetDeliverySession: agregar subsección `12.2c` con regla SEC-002c para `receiverContactChannel`
  - [x] 1g. §12.4 RequestItem: agregar mención de `contactChannel` como input obligatorio y regla de validación
  - [x] 1h. §12.7 SelectReceiver: reemplazar secuencia transaccional con versión ampliada (lectura pre-tx del canal, copia a sesión, purga en requests)

- [x] **Task 2 — `docs/prd.md`: Actualización Sesión de entrega y flujos**
  - [x] 2a. Sección "Sesión de entrega": agregar bullet sobre canal del candidato y tabla de visibilidad
  - [x] 2b. §8 Flujo de objeto paso 2 (Solicitudes): añadir que el receptor aporta su canal al postularse
  - [x] 2c. §12 Flujo de entrega: agregar mención de `receiver_contact_channel` en purga y visibilidad

- [x] **Task 3 — `epics.md`: Notas supersede en historias afectadas**
  - [x] 3a. Historia 3.1: agregar nota supersede sobre `contactChannel` obligatorio en POST /items/:id/requests
  - [x] 3b. Historia 4.1: agregar nota supersede sobre copia de `receiver_contact_channel` en la transacción atómica
  - [x] 3c. Historia 4.2: agregar nota supersede sobre nuevo campo `receiverContactChannel` en respuesta y SEC-002c
  - [x] 3d. Historia 4.6: agregar nota supersede sobre purga extendida a `receiver_contact_channel` y `receiver_contact_purged`

- [x] **Task 4 — Verificación final**
  - [x] Revisar que `openapi/openapi.json` ya tiene body en POST /items/:id/requests y campo `receiverContactChannel` (herencia de 12-2)
  - [x] Confirmar que `docs/delta-candidato-contacto.md` §6 está completamente cubierto

---

## Notas para el Dev Agent

### Naturaleza de la historia

**Esta es una historia de documentación pura.** No hay TypeScript, no hay tests, no hay `npm run build` ni `npm test`. Los únicos archivos a modificar son tres documentos Markdown. El criterio de éxito es que los documentos reflejen fielmente lo implementado en 12-1 y 12-2.

### Referencia canónica: `docs/delta-candidato-contacto.md`

El documento delta es la fuente de verdad para todos los cambios. Leerlo completo antes de implementar. Las secciones más relevantes:
- §2 → cambios de schema (para architecture.md §3.4, §3.5)
- §2.3 → índice actualizado (para architecture.md §4)
- §3 → cambios en use cases (para architecture.md §12.2c, §12.4, §12.7)
- §5 → Job 3 ampliado (para architecture.md Job 3)
- §6 → tabla de documentos a actualizar (lista maestra)

---

### TASK 1: Cambios exactos en `docs/architecture.md`

#### 1a — Header versión 1.7

Cambiar el encabezado:
```markdown
# technical-design-backend.md
**Versión:** 1.6  
```
→
```markdown
# technical-design-backend.md
**Versión:** 1.7  
```

Agregar nota de versión ANTES del bloque de v1.6 (todas las notas de versión son en orden descendente):
```
> Versión 1.7 — Correct Course 2026-05-31: canal de contacto del candidato (épica 12) — `item_requests.contact_channel` (§3.4), `delivery_sessions.receiver_contact_channel`/`receiver_contact_purged` (§3.5), índice `idx_sessions_contact_purge` ampliado con OR (§4), Job 3 purga ambos canales, §12.2c SEC-002c (`receiverContactChannel`), §12.4 `contactChannel` obligatorio en `RequestItem`, §12.7 secuencia `SelectReceiver` con copia y purga.
>
```

#### 1b — §3.4 `item_requests`: agregar `contact_channel`

**Estado actual** (líneas 211-221):
```sql
CREATE TABLE item_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES items(id),
  requester_id UUID NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','selected','rejected','cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, requester_id)
);
```

**Estado destino** (agregar `contact_channel` entre `status` y `created_at`):
```sql
CREATE TABLE item_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         UUID NOT NULL REFERENCES items(id),
  requester_id    UUID NOT NULL REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','selected','rejected','cancelled')),
  contact_channel TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, requester_id)
);
```

**Agregar nota** tras el bloque SQL (tras "Nota de atomicidad (SEC-003)" existente):
```markdown
**Nota — `contact_channel` (épica 12):**
Obligatorio en `RequestItem` a nivel de use case (validación `interfaces/validators/`); nullable en BD para compatibilidad con solicitudes legacy anteriores al deploy de 12-1. Se purga a `NULL` dentro de la transacción de `SelectReceiver` —tanto en la solicitud seleccionada (tras copiarse a `delivery_sessions`) como en todas las rechazadas. Pasada esa transacción, ninguna fila de `item_requests` retiene datos de contacto.
```

#### 1c — §3.5 `delivery_sessions`: agregar `receiver_contact_channel` y `receiver_contact_purged`

**Estado actual** (líneas 241-257):
```sql
CREATE TABLE delivery_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id           UUID NOT NULL REFERENCES items(id),
  donor_id          UUID NOT NULL REFERENCES users(id),
  receiver_id       UUID NOT NULL REFERENCES users(id),
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','completed','cancelled','expired')),
  contact_channel   TEXT,
  contact_purged    BOOLEAN NOT NULL DEFAULT FALSE,
  donor_confirmed   BOOLEAN NOT NULL DEFAULT FALSE,
  no_show_declared  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at       TIMESTAMPTZ NOT NULL
                    DEFAULT NOW() + INTERVAL '7 days',
  completed_at      TIMESTAMPTZ
);
```

**Estado destino** (agregar dos columnas tras `contact_purged`):
```sql
CREATE TABLE delivery_sessions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                   UUID NOT NULL REFERENCES items(id),
  donor_id                  UUID NOT NULL REFERENCES users(id),
  receiver_id               UUID NOT NULL REFERENCES users(id),
  status                    TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','completed','cancelled','expired')),
  contact_channel           TEXT,
  contact_purged            BOOLEAN NOT NULL DEFAULT FALSE,
  receiver_contact_channel  TEXT,
  receiver_contact_purged   BOOLEAN NOT NULL DEFAULT FALSE,
  donor_confirmed           BOOLEAN NOT NULL DEFAULT FALSE,
  no_show_declared          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at               TIMESTAMPTZ NOT NULL
                            DEFAULT NOW() + INTERVAL '7 days',
  completed_at              TIMESTAMPTZ
);
```

#### 1d — §4 Índices: reemplazar `idx_sessions_contact_purge`

**Estado actual** (líneas 440-442):
```sql
CREATE INDEX idx_sessions_contact_purge
  ON delivery_sessions(status, completed_at)
  WHERE contact_purged = FALSE;
```

**Estado destino** (condición OR para cubrir ambos flags):
```sql
DROP INDEX IF EXISTS idx_sessions_contact_purge;

CREATE INDEX idx_sessions_contact_purge
  ON delivery_sessions(status, completed_at)
  WHERE contact_purged = FALSE
     OR receiver_contact_purged = FALSE;
```

> Nota: En architecture.md representar solo el CREATE (el DROP es contexto de migración 12-1). Reemplazar el bloque existente únicamente con el nuevo CREATE INDEX.

#### 1e — Job 3: reemplazar SQL de purga

**Estado actual** (líneas 698-710):
```sql
SELECT cron.schedule(
  'purge-contact-channel',
  '30 3 * * *',
  $$
    UPDATE delivery_sessions
    SET contact_channel = NULL,
        contact_purged  = TRUE
    WHERE contact_purged = FALSE
      AND status IN ('completed', 'cancelled', 'expired')
      AND completed_at < NOW() - INTERVAL '7 days';
  $$
);
```

**Estado destino** (purga ambos canales):
```sql
SELECT cron.schedule(
  'purge-contact-channel',
  '30 3 * * *',
  $$
    UPDATE delivery_sessions
    SET contact_channel          = NULL,
        contact_purged           = TRUE,
        receiver_contact_channel = NULL,
        receiver_contact_purged  = TRUE
    WHERE (contact_purged = FALSE OR receiver_contact_purged = FALSE)
      AND status IN ('completed', 'cancelled', 'expired')
      AND completed_at < NOW() - INTERVAL '7 days';
  $$
);
```

**Agregar nota** tras el bloque SQL del Job 3:
```markdown
La purga del `contact_channel` en `item_requests` (solicitudes rechazadas) ocurre dentro de la transacción de `SelectReceiver` — no se requiere job adicional para ese campo.
```

#### 1f — §12.2 GetDeliverySession: agregar §12.2c SEC-002c

Existe actualmente §12.2 y §12.2b. Agregar §12.2c INMEDIATAMENTE DESPUÉS de §12.2b (antes de `### 12.3 CancelItem`):

```markdown
### 12.2c GetDeliverySession — `receiverContactChannel` (SEC-002c)

```
Canal del candidato seleccionado, visible al donante.

Incluir receiverContactChannel en el DTO únicamente si se cumplen las tres condiciones:
  1. current_user.id === session.donor_id
  2. session.status === 'active'
  3. session.receiver_contact_purged === FALSE

En cualquier otro caso: receiverContactChannel = null.

El receptor siempre recibe receiverContactChannel = null
(fue él quien lo introdujo; no tiene utilidad de consulta).
```

**Tabla de visibilidad consolidada por campo y rol:**

| Campo | Donante (sesión `active`, no purgado) | Receptor (sesión `active`) |
|---|---|---|
| `contactChannel` | `null` (siempre) | valor (SEC-002) |
| `sharedContactChannel` | valor (SEC-002b) | `null` (siempre) |
| `receiverContactChannel` | valor (SEC-002c) | `null` (siempre) |

---
```

#### 1g — §12.4 RequestItem: agregar `contactChannel` obligatorio

**Estado actual** (líneas 1344-1356):
```
### 12.4 RequestItem (POST /items/:id/requests)

```
Verificación anti-autosolicit:
  item.donor_id !== current_user.id
  → Si no se cumple: BadRequestException('No puedes solicitar tu propio objeto')

Esta verificación precede a la comprobación del límite de solicitudes.
El UNIQUE constraint de BD (item_id, requester_id) es una barrera de
integridad, no sustituye a esta verificación lógica.
```
```

**Estado destino** (agregar input y validación de `contactChannel`):
```
### 12.4 RequestItem (POST /items/:id/requests)

```
Input obligatorio (épica 12):
  contactChannel: string (mín. 1 carácter, máx. 500, trim aplicado)
  → Si ausente o vacío: BadRequestException('contactChannel requerido') → HTTP 400

Verificación anti-autosolicit:
  item.donor_id !== current_user.id
  → Si no se cumple: BadRequestException('No puedes solicitar tu propio objeto')

Esta verificación precede a la comprobación del límite de solicitudes.
El UNIQUE constraint de BD (item_id, requester_id) es una barrera de
integridad, no sustituye a esta verificación lógica.

Almacenamiento:
  item_requests.contact_channel = contactChannel (nullable en BD; obligatorio por use case)
```
```

#### 1h — §12.7 SelectReceiver: reemplazar secuencia transaccional

**Estado actual** (líneas 1411-1430):
```
### 12.7 SelectReceiver (POST /items/:id/requests/:requestId/select)

```
Verificación obligatoria (doble):
  item.donor_id === current_user.id
  AND request.item_id === item.id
  → Si no se cumple: ForbiddenException

Verificación de estado:
  request.status === 'pending'
  item.status === 'active'
  → Si no se cumple: ConflictException

Secuencia en transacción atómica:
  1. Crear delivery_session con contact_channel del payload
  2. request.status = 'selected' (la solicitud ganadora)
  3. Todas las demás requests del mismo item → status = 'rejected'
  4. item.status = 'reserved', item.reserved_at = NOW()
```
```

**Estado destino** (versión completa con canal candidato):
```
### 12.7 SelectReceiver (POST /items/:id/requests/:requestId/select)

```
Verificación obligatoria (doble):
  item.donor_id === current_user.id
  AND request.item_id === item.id
  → Si no se cumple: ForbiddenException

Verificación de estado:
  request.status === 'pending'
  item.status === 'active'
  → Si no se cumple: ConflictException

PRE-TRANSACCIÓN (épica 12):
  Leer item_requests.contact_channel de la solicitud seleccionada (FOR UPDATE)
  → Capturado antes de iniciar la transacción para usarlo en el INSERT

Secuencia en transacción atómica:
  1. Crear delivery_session con:
       contact_channel          = contactChannel del payload (donante)
       receiver_contact_channel = contact_channel leído pre-tx de item_requests
  2. item_requests (solicitud seleccionada):
       status          = 'selected'
       contact_channel = NULL  ← purga inmediata tras copia a sesión
  3. item_requests (demás solicitudes del mismo item, status = 'pending'):
       status          = 'rejected'
       contact_channel = NULL  ← purga inmediata para rechazados
  4. item.status = 'reserved', item.reserved_at = NOW()

Garantía: si la transacción falla en cualquier paso, no hay copia parcial.
El contact_channel del candidato permanece en item_requests hasta commit exitoso.
```
```

---

### TASK 2: Cambios exactos en `docs/prd.md`

#### 2a — Sección "Sesión de entrega"

**Estado actual** (líneas 112-121):
```markdown
### Sesión de entrega
- Activada tras selección de receptor
- Canal de contacto externo — introducido por el donante en el momento de confirmar la selección
- El canal de contacto se revela al receptor únicamente cuando la sesión está en estado `active`
- Si el donante cancela la sesión, el canal no queda en ningún historial visible para el receptor
- Deadline estricto: 7 días — no extensible
- **Confirmación por parte del donante** — el donante confirma la entrega para cerrar la sesión
- Al expirar sin confirmación, la sesión se cierra sin penalización y el objeto vuelve a estado activo
- El campo `contact_channel` se purga (sobrescrito con `NULL`) a los **7 días** de que la sesión alcance estado `completed`, `cancelled` o `expired`
```

**Estado destino** (agregar canal del candidato):
```markdown
### Sesión de entrega
- Activada tras selección de receptor
- Canal de contacto del candidato — aportado por el receptor al postularse (`POST /items/:id/requests`); copiado a la sesión al seleccionar receptor
- Canal de contacto del donante — introducido al confirmar la selección; visible solo al receptor en sesión `active`
- El donante puede ver el canal del candidato (`receiverContactChannel`) en sesión `active` para contacto proactivo (SEC-002c)
- Si el donante cancela la sesión, los canales no quedan en ningún historial visible para la otra parte
- Deadline estricto: 7 días — no extensible
- **Confirmación por parte del donante** — el donante confirma la entrega para cerrar la sesión
- Al expirar sin confirmación, la sesión se cierra sin penalización y el objeto vuelve a estado activo
- Ambos campos de contacto (`contact_channel` y `receiver_contact_channel`) se purgan a `NULL` a los **7 días** de que la sesión alcance estado `completed`, `cancelled` o `expired`
```

#### 2b — §8 Flujo de objeto paso 2

**Estado actual** (línea 138):
```markdown
2. Solicitudes de receptores
```

**Estado destino**:
```markdown
2. Solicitudes de receptores — el candidato aporta su canal de contacto al postularse
```

#### 2c — §12 Flujo de entrega

**Estado actual** (líneas 240-247):
```markdown
### Solución implementada

- Confirmación por el donante para completar la sesión
- Cierre automático al vencer deadline de 7 días sin penalización
- Al expirar una sesión, el objeto vuelve a estado activo automáticamente
- El donante recibe notificación por email cuando su objeto vuelve a estar disponible
- El receptor seleccionado recibe notificación por email si el donante cancela el objeto
- El campo `contact_channel` se purga a los 7 días de cierre de sesión
```

**Estado destino**:
```markdown
### Solución implementada

- Confirmación por el donante para completar la sesión
- Cierre automático al vencer deadline de 7 días sin penalización
- Al expirar una sesión, el objeto vuelve a estado activo automáticamente
- El donante recibe notificación por email cuando su objeto vuelve a estar disponible
- El receptor seleccionado recibe notificación por email si el donante cancela el objeto
- El candidato proporciona su canal de contacto al postularse; queda disponible al donante en sesión `active` (`receiverContactChannel`, SEC-002c)
- Ambos canales de contacto (`contact_channel` del donante y `receiver_contact_channel` del receptor) se purgan a los 7 días de cierre de sesión
```

---

### TASK 3: Cambios exactos en `epics.md`

En cada historia, agregar una nota "**⚠️ Superseded (12-2):**" al final de sus criterios de aceptación, ANTES del separador `---`.

#### 3a — Historia 3.1: Solicitar un objeto

Agregar ANTES del `---` que sigue al último criterio (línea 654):

```markdown
**⚠️ Superseded (12-2):** `POST /items/:id/requests` ahora exige body `{ "contactChannel": "string" }` (mín. 1 carácter). Sin body o con `contactChannel` vacío → `400`. El campo se persiste en `item_requests.contact_channel` y se purga al seleccionar receptor. Ver historia 12.2 y `docs/delta-candidato-contacto.md` §3.1.
```

#### 3b — Historia 4.1: Seleccionar receptor para un objeto

Agregar ANTES del `---` que sigue al último criterio (línea 751):

```markdown
**⚠️ Superseded (12-2):** La transacción atómica ahora incluye: (a) lectura de `item_requests.contact_channel` del candidato seleccionado pre-transacción; (b) INSERT en `delivery_sessions` con `receiver_contact_channel = contact_channel`; (c) `contact_channel = NULL` en la solicitud seleccionada y todas las rechazadas. Ver historia 12.2 y `docs/delta-candidato-contacto.md` §3.2.
```

#### 3c — Historia 4.2: Ver detalle de sesión de entrega

Agregar ANTES del `---` que sigue al último criterio (línea 781):

```markdown
**⚠️ Superseded (12-2):** La respuesta de `GET /delivery-sessions/:id` incluye el campo `receiverContactChannel: string | null`. Regla SEC-002c: el donante recibe el valor si la sesión está `active` y `receiver_contact_purged = FALSE`; el receptor siempre recibe `null`. También incluye `sharedContactChannel` (SEC-002b) para el donante. Ver historia 12.2 y `docs/delta-candidato-contacto.md` §3.3.
```

#### 3d — Historia 4.6: Expiración automática de sesiones y purga de canal de contacto

Agregar ANTES del `---` que sigue al último criterio (línea 900):

```markdown
**⚠️ Superseded (12-2):** El job `purge-contact-channel` purga ahora **ambos canales** en la misma operación: `contact_channel = NULL`, `contact_purged = TRUE`, `receiver_contact_channel = NULL`, `receiver_contact_purged = TRUE`. La condición WHERE usa `(contact_purged = FALSE OR receiver_contact_purged = FALSE)`. El índice `idx_sessions_contact_purge` fue ampliado con la misma condición OR. Ver historia 12.1 (migración) y `docs/delta-candidato-contacto.md` §5.
```

---

### Advertencias críticas

1. **No tocar `email-flow-mapping.md`**, `ranking-system.md` ni `ranking-guia-producto.md` — el delta §6 los excluye explícitamente.

2. **No tocar `openapi/openapi.json`** — ya fue regenerado en historia 12-2 (`npm run openapi:generate`). Verificar antes de cerrar que el archivo ya contiene el body en POST /items/:id/requests y el campo `receiverContactChannel` en DeliverySession.

3. **No editar migraciones SQL** — las columnas ya existen en prod desde la migración 018 (historia 12-1).

4. **Orden de versiones en architecture.md**: las notas de versión van en orden descendente (v1.7 → v1.6 → v1.5 → ...). Insertar v1.7 al inicio del bloque.

5. **`delivery_sessions.receiver_contact_channel` es nullable en BD** — un candidato seleccionado antes del deploy de 12-1 puede tener NULL. El use case `GetDeliverySession` devuelve `null` al donante en ese caso: comportamiento correcto y documentado.

6. **Las notas supersede en epics.md son aditivas** — no eliminar los criterios de aceptación originales. Solo agregar la nota al final como referencia histórica.

### Estructura de archivos

| Acción | Ruta |
|---|---|
| **UPDATE** | `docs/architecture.md` |
| **UPDATE** | `docs/prd.md` |
| **UPDATE** | `_bmad-output/initiative-backend/archive-v6/epics.md` |
| **VERIFICAR (solo lectura)** | `openapi/openapi.json` |
| **NO TOCAR** | `docs/email-flow-mapping.md` |
| **NO TOCAR** | `docs/ranking-system.md` |
| **NO TOCAR** | `docs/ranking-guia-producto.md` |
| **NO TOCAR** | `docs/prd-analytics.md` |

### Requisitos de testing

**No aplica.** Esta historia no introduce cambios de código. La verificación final es:
- Confirmar que `openapi/openapi.json` ya refleja los cambios (herencia de 12-2)
- Confirmar que los tres documentos actualizados son coherentes entre sí y con `docs/delta-candidato-contacto.md` §6

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (2026-06-01)

### Debug Log References

### Completion Notes List

- `docs/architecture.md` actualizado a v1.7: campos `contact_channel` en `item_requests` (§3.4), `receiver_contact_channel`/`receiver_contact_purged` en `delivery_sessions` (§3.5), índice `idx_sessions_contact_purge` ampliado con OR (§4), Job 3 purga ambos canales, nueva sección §12.2c con SEC-002c, §12.4 `contactChannel` obligatorio, §12.7 secuencia `SelectReceiver` completa con lectura pre-tx y purgas.
- `docs/prd.md` actualizado: sección "Sesión de entrega" describe ambos canales y su purga; §8 paso 2 menciona canal del candidato; §12 flujo de entrega incluye visibilidad y purga dual.
- `_bmad-output/initiative-backend/archive-v6/epics.md` actualizado: notas supersede en historias 3.1, 4.1, 4.2 y 4.6 con referencias a 12-2 y delta-candidato-contacto.md.
- `openapi/openapi.json` verificado: contiene `contactChannel` en body de POST /items/:id/requests y `receiverContactChannel` en DeliverySession — herencia completa de historia 12-2.

### File List

- docs/architecture.md
- docs/prd.md
- _bmad-output/initiative-backend/archive-v6/epics.md

## Change Log

- 2026-06-01: Documentación sincronizada con épica 12 — architecture.md v1.7, prd.md flujos actualizados, epics.md notas supersede en historias 3.1/4.1/4.2/4.6. openapi/openapi.json verificado (sin modificación, heredado de 12-2).
