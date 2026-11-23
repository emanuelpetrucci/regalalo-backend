# Delta — technical-design-backend.md
**Versión base:** 1.1
**Versión resultante:** 1.2
**Estado:** Listo
**Fecha:** Mayo 2026
**Motivo:** Incorporación de flag `requests_paused` para bloqueo temporal de solicitudes

---

## Sección 3.2 — Tabla `items`

### Cambio

Añadir columna `requests_paused` a la tabla `items`.

```sql
ALTER TABLE items
ADD COLUMN requests_paused BOOLEAN NOT NULL DEFAULT FALSE;
```

**Nota:** sin migración de datos requerida. El valor por defecto `FALSE` cubre todos los registros existentes.

**Definición actualizada de la tabla:**

```sql
CREATE TABLE items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id       UUID NOT NULL REFERENCES users(id),
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  condition      TEXT NOT NULL,
  location       GEOGRAPHY(POINT, 4326) NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','reserved','completed','cancelled')),
  requests_paused BOOLEAN NOT NULL DEFAULT FALSE,
  degraded_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reserved_at    TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ
);
```

---

## Sección 4 — Índices

### Cambio

Sin índices adicionales requeridos. El flag `requests_paused` se evalúa únicamente en el contexto de un objeto ya identificado por `id`. El índice existente `idx_items_status` sigue siendo válido.

---

## Sección nueva — Use Case: RequestItem

### Cambio

Añadir validación de `requests_paused` previa a la creación de la solicitud en el use case `RequestItem`.

```typescript
// use-cases/item/RequestItem.ts

const item = await itemRepo.findById(itemId);
if (!item) throw new NotFoundException();
if (item.requestsPaused) throw new RequestsPausedException(); // 409
```

La comprobación de `requestsPaused` se evalúa antes de la validación del límite de solicitudes y de la comprobación de solicitud duplicada.

---

## Sección nueva — Endpoint: PATCH /items/:id/pause

### Cambio

Nuevo endpoint para activar y desactivar el flag `requests_paused` por parte del donante.

| Parámetro | Detalle |
|---|---|
| Método | PATCH |
| Ruta | `/items/:id/pause` |
| Autenticación | Requerida |
| Autorización | Solo el donante del objeto |

**Payload de entrada:**
```json
{
  "paused": "boolean"
}
```

**Respuesta esperada (200):**
```json
{
  "requestsPaused": "boolean"
}
```

**Errores:**

| Código | Motivo |
|---|---|
| 400 | Payload inválido |
| 401 | No autenticado |
| 403 | El usuario no es el donante |
| 404 | Objeto no encontrado |
| 409 | El objeto no está en estado `active` |

**Nota operativa:** el flag no tiene expiración automática. Si el donante no lo desactiva, el objeto permanece bloqueado indefinidamente en estado `active`. Riesgo asumido en esta versión.
