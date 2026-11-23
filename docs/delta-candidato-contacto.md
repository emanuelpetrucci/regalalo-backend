# Delta Técnico — Canal de contacto del candidato en la postulación

**Proyecto:** Regálalo, lo regalo  
**Versión:** 1.0  
**Fecha:** Mayo 2026  
**Estado:** Product-approved · Pendiente validación técnica (agente de desarrollo)  
**Documentos base:** PRD v2.1 · Diseño técnico Fases A–G  
**Decisiones de producto:** 1A · 2B · 3C · 4A · 5A

---

## 1. Problema y solución

### Problema

El flujo actual tiene una asimetría de comunicación. Tras la selección del receptor, el donante revela su canal de contacto, pero queda en posición pasiva esperando que el receptor —accionado únicamente por un email— tome la iniciativa. Si ese email no se ve, el proceso se congela sin que ninguna parte tenga mecanismo de recuperación.

### Solución

El candidato proporciona su canal de contacto en el momento de postularse. Una vez que el donante selecciona receptor, ese canal queda disponible en la sesión de entrega, permitiendo al donante iniciar la comunicación de forma proactiva sin depender de que el receptor reaccione al email de notificación.

### Principio de diseño

La solución sigue el patrón simétrico ya establecido para el canal del donante:

| Aspecto | Donante | Candidato (nuevo) |
|---|---|---|
| Momento de aportación | Al seleccionar receptor (`POST .../select`) | Al postularse (`POST .../requests`) |
| Almacenamiento inicial | `delivery_sessions.contact_channel` | `item_requests.contact_channel` → copiado a `delivery_sessions.receiver_contact_channel` |
| Quién lo ve | Solo el receptor · sesión `active` | Solo el donante · sesión `active` |
| Purga | 7 días tras cierre (Job 3) | Inmediata para rechazados · 7 días para seleccionado (Job 3 ampliado) |
| Incluido en email | No | No |
| Formato | Texto libre | Texto libre (idéntico) |

---

## 2. Cambios en el modelo de datos

### 2.1 Tabla `item_requests` — campo nuevo

```sql
ALTER TABLE item_requests
  ADD COLUMN contact_channel TEXT;
```

**Schema resultante:**

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

**Notas:**
- Nullable a nivel de base de datos. La obligatoriedad se impone en el use case `RequestItem`, espejando el patrón de `contact_channel` en `delivery_sessions`.
- El campo se establece en `NULL` dentro de la transacción atómica de `SelectReceiver`, tanto en la solicitud seleccionada (tras copiar el valor a `delivery_sessions`) como en todas las rechazadas.
- Pasada esa transacción, ninguna fila de `item_requests` retiene datos de contacto.

---

### 2.2 Tabla `delivery_sessions` — dos campos nuevos

```sql
ALTER TABLE delivery_sessions
  ADD COLUMN receiver_contact_channel  TEXT,
  ADD COLUMN receiver_contact_purged   BOOLEAN NOT NULL DEFAULT FALSE;
```

**Schema resultante:**

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
  deadline_at               TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  completed_at              TIMESTAMPTZ
);
```

---

### 2.3 Índice — actualización

El índice existente cubre solo `contact_purged`. Se reemplaza para cubrir también `receiver_contact_purged`:

```sql
DROP INDEX IF EXISTS idx_sessions_contact_purge;

CREATE INDEX idx_sessions_contact_purge
  ON delivery_sessions(status, completed_at)
  WHERE contact_purged = FALSE
     OR receiver_contact_purged = FALSE;
```

---

## 3. Cambios en use cases

### 3.1 `RequestItem` — use case modificado

```
[CAMBIO] Input DTO ampliado:
  contactChannel: string  ← obligatorio

Validación (idéntica al contactChannel del donante en SelectReceiver):
  - Presente y no vacío
  - Si ausente o vacío → BadRequestException('contactChannel requerido')

Secuencia (sin cambios de lógica, solo almacenamiento del nuevo campo):
  1. Verificación anti-autosolicit
  2. Verificación de estado del objeto (active, no pausado)
  3. Sliding window: límite 3/30 días (SERIALIZABLE)
  4. Insertar item_requests con:
       status          = 'pending'
       contact_channel = contactChannel  ← nuevo
  5. Encolar email EVT-006 al donante    ← sin cambio en contenido
  6. Emitir AE-011                       ← sin cambio
```

---

### 3.2 `SelectReceiver` — use case modificado

```
PRE-TRANSACCIÓN:
  Leer item_requests.contact_channel de la solicitud seleccionada  ←
  (capturado antes de iniciar la transacción para usarlo en el INSERT)

SECUENCIA EN TRANSACCIÓN ATÓMICA:

  1. Crear delivery_session con:
       contact_channel          = contactChannel del payload (donante)
       receiver_contact_channel = contact_channel leído de item_requests  ←

  2. item_requests (solicitud seleccionada):
       status          = 'selected'
       contact_channel = NULL  ← purga inmediata tras copia a sesión

  3. item_requests (resto del mismo item):
       status          = 'rejected'
       contact_channel = NULL  ← purga inmediata para todos los rechazados

  4. items:
       status      = 'reserved'
       reserved_at = NOW()
```

**Garantía de integridad:** si la transacción falla en cualquier paso, no se produce copia parcial. El `contact_channel` del candidato permanece en `item_requests` hasta que la transacción complete con éxito.

---

### 3.3 `GetDeliverySession` — use case modificado

Se añade la regla de visibilidad **SEC-002c** paralela a las existentes SEC-002 y SEC-002b:

```
SEC-002c — receiverContactChannel (nuevo):

  Incluir en DTO únicamente si se cumplen las tres condiciones:
    1. current_user.id === session.donor_id
    2. session.status === 'active'
    3. session.receiver_contact_purged === FALSE

  En cualquier otro caso: receiverContactChannel = null.

  El receptor nunca recibe receiverContactChannel
  (fue él quien lo introdujo; no tiene utilidad de consulta).
```

**Tabla de visibilidad resultante por campo y rol:**

| Campo | Donante (sesión `active`) | Receptor (sesión `active`) |
|---|---|---|
| `contactChannel` | `null` (siempre) | valor (si no purgado) |
| `sharedContactChannel` | valor (si no purgado) | `null` (siempre) |
| `receiverContactChannel` | valor (si no purgado) | `null` (siempre) |

---

## 4. Cambios en contratos de API

### 4.1 `POST /items/:id/requests` — payload modificado

**Antes:** sin body.

**Después:**

```json
{
  "contactChannel": "string"
}
```

**Errores — tabla actualizada:**

| Código | Motivo |
|---|---|
| 400 | Usuario intenta solicitar su propio objeto |
| 400 | `contactChannel` ausente o vacío |
| 401 | No autenticado |
| 409 | Solicitud duplicada o límite de 3/30 días alcanzado |

**Respuesta 201:** sin cambios.

---

### 4.2 `GET /items/:id/requests` — sin cambios

El `contact_channel` del candidato no se expone en la lista de candidatos (Decisión 2B). El contrato de este endpoint no varía.

---

### 4.3 `GET /delivery-sessions/:id` — respuesta modificada

```json
{
  "id": "uuid",
  "itemId": "uuid",
  "status": "active | completed | cancelled | expired",
  "role": "donor | receiver",
  "contactChannel": "string | null",
  "sharedContactChannel": "string | null",
  "receiverContactChannel": "string | null",
  "deadlineAt": "ISO8601",
  "donorConfirmed": "boolean",
  "noShowDeclared": "boolean",
  "item": {
    "title": "string",
    "condition": "string",
    "images": ["url"]
  },
  "otherParty": {
    "userId": "uuid",
    "reputationScore": "integer",
    "distanceMeters": "number"
  },
  "createdAt": "ISO8601",
  "completedAt": "ISO8601 | null"
}
```

`receiverContactChannel` sigue las reglas SEC-002c. Retorna `null` si el consultante es el receptor, si la sesión no está `active`, o si ya fue purgado.

---

## 5. Cambios en jobs de pg_cron

### Job 3 — Purga de canales de contacto (ampliado)

**Antes:** purgaba únicamente `contact_channel` de la sesión.

**Después:** purga ambos canales en la misma operación atómica:

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

> La purga del `contact_channel` en `item_requests` de solicitudes rechazadas ocurre dentro de la transacción de `SelectReceiver`. No se requiere job adicional.

---

## 6. Documentos a actualizar

| Documento | Secciones afectadas |
|---|---|
| `architecture.md` | § 3.4 `item_requests` — campo `contact_channel` |
| `architecture.md` | § 3.5 `delivery_sessions` — `receiver_contact_channel` + `receiver_contact_purged` |
| `architecture.md` | § 4 Índices — reemplazar `idx_sessions_contact_purge` |
| `architecture.md` | § 12.2 `GetDeliverySession` — añadir SEC-002c y tabla de visibilidad |
| `architecture.md` | § 12.4 `RequestItem` — input DTO y validación |
| `architecture.md` | § 12.7 `SelectReceiver` — secuencia transaccional |
| `architecture.md` | Job 3 SQL — ampliar purga |
| `architecture.md` | API F5 `POST /items/:id/requests` — payload y errores |
| `architecture.md` | API F6 `GET /delivery-sessions/:id` — campo `receiverContactChannel` |
| `prd.md` | § Sesión de entrega — mención al canal del receptor |
| `prd.md` | § 12 Flujo de entrega — actualizar descripción de la solución |
| `email-flow-mapping.md` | Sin cambios |
| `ranking-system.md` | Sin cambios |
| `ranking-guia-producto.md` | Sin cambios |
| `prd-analytics.md` | Sin cambios |

---

## 7. Consideración de UX abierta (requiere decisión de producto)

El email EVT-006 (TPL-006) que recibe el donante al llegar una postulación no incluye el canal de contacto (Decisión 4A confirmada). Sin embargo, existe la posibilidad de añadir una línea informativa en ese email indicando que el candidato ha dejado un canal de contacto disponible en la plataforma, sin revelar su contenido, con el objetivo de incentivar al donante a acceder y tomar una decisión con mayor rapidez.

**Impacto técnico si se aprueba:** modificación de `TPL-006` únicamente. Sin cambio en use cases ni schema.

**Estado:** pendiente de decisión de producto.

---

## 8. Checklist de validación — agente de desarrollo

- [ ] El schema de `delivery_sessions` con los dos campos nuevos (`receiver_contact_channel`, `receiver_contact_purged`) es correcto y compatible con las migraciones existentes.
- [ ] La secuencia de `SelectReceiver` es correcta: lee el canal, lo copia a `delivery_sessions`, y lo pone a `NULL` en `item_requests` dentro de la misma transacción atómica.
- [ ] La regla SEC-002c — el donante ve `receiverContactChannel` solo en sesión `active` y sin purga — es coherente con las reglas SEC-002 y SEC-002b existentes.
- [ ] Decisión sobre la consideración de UX del punto 7 (TPL-006).
