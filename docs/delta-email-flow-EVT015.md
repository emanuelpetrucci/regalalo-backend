# Delta — email-flow-mapping.md
**Referencia:** EVT-015
**Versión base:** 1.3
**Versión resultante:** 1.4
**Estado:** Aprobado (Correct Course 2026-05-29)
**Fecha:** Mayo 2026
**Motivo:** Digest horario de nuevos objetos publicados en el área del usuario

---

## Sección 1 — Tabla de Mapeo de Emails

### Cambio

Añadir EVT-015 a la tabla de eventos.

| ID_Evento | Trigger | Capa / Origen | Destinatario | Template_Ref | Condicionales |
|---|---|---|---|---|---|
| EVT-015 | Cron externo (cron-job.org) invoca `POST /api/jobs/nearby-items-digest` | Use Case: `SendNearbyItemsDigestUseCase` | Usuarios `is_active = TRUE`, `email_verified = TRUE`, con `location` dentro de 50 km de al menos un objeto sin notificar; excluye al donante de cada objeto | `TPL-010` | ≥1 objeto con `digest_notified_at IS NULL` y `status = 'active'`. Un email por usuario con objetos agrupados. |

---

## Sección 2 — Tabla de Definición de Datos por Evento

### Cambio

Añadir EVT-015 a la tabla de variables requeridas.

| ID_Evento | Template_Ref | Variables_Requeridas | Prioridad |
|---|---|---|---|
| EVT-015 | `TPL-010` | `recipientEmail`, `firstName`, `items[]`, `appUrl` | Media |

**Estructura del array `items[]`:**

```typescript
interface DigestItemVariable {
  itemId:      string;
  title:       string;
  condition:   string;
  distanceKm:  number;
  imageUrl?:   string;
}
```

---

## Sección nueva — Definición de TPL-010

### Cambio

Añadir template TPL-010 al catálogo de templates.

| Campo | Valor |
|---|---|
| **ID** | `TPL-010` |
| **Asunto** | `Nuevos objetos disponibles cerca de ti` |
| **Idioma** | Español (único idioma en MVP) |
| **Prioridad de envío** | Media |
| **Trigger** | EVT-015 |

**Variables del template:** `{{firstName}}`, `{{items}}`, `{{appUrl}}` — ver `docs/email-flow-mapping.md` v1.4.

**Presentación:** `renderEmailLayout()` (Épica 9). Bloque de imagen condicional si `imageUrl` presente.

---

## Sección 3 — Diagrama de Flujo por Capa

Ver `docs/email-flow-mapping.md` v1.4 — diagrama EXTERNAL CRON → JobsController → `SendNearbyItemsDigestUseCase` → TPL-010.

---

## Sección 5 — Notas de Diseño

**EVT-015 — Idempotencia:** `digest_notified_at` antes del envío; best-effort Resend.

**EVT-015 — Sin opt-out en MVP.**

**EVT-015 — Agrupación:** un email por usuario; orden `distanceKm ASC`.

**EVT-015 — `last_active_at`:** el digest no lo actualiza.
