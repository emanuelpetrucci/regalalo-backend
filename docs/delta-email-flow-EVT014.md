# Delta — email-flow-mapping.md

> **⚠️ Obsoleto — IDs incorrectos.** Usar **`docs/delta-email-flow-EVT015.md`** (EVT-015 / TPL-010). Aprobado en Correct Course 2026-05-29.

**Referencia:** EVT-014 *(erróneo — ver EVT-015)*
**Versión base:** 1.1
**Versión resultante:** 1.2
**Estado:** Pendiente de aprobación
**Fecha:** Mayo 2026
**Motivo:** Incorporación de EVT-014 — digest horario de nuevos objetos publicados en el área del usuario

---

## Sección 1 — Tabla de Mapeo de Emails

### Cambio

Añadir EVT-014 a la tabla de eventos.

| ID_Evento | Trigger | Capa / Origen | Destinatario | Template_Ref | Condicionales |
|---|---|---|---|---|---|
| EVT-014 | Cron externo (cron-job.org) invoca `POST /jobs/item-digest` cada hora | Use Case: `SendItemDigestNotificationsUseCase` | Usuarios activos (`is_active = TRUE`) dentro de 50 km de al menos un objeto publicado en la última hora, excluyendo al donante de cada objeto | `TPL-009` | Al menos 1 objeto con `digest_notified_at IS NULL`, `status = 'active'` y `created_at >= NOW() - INTERVAL '1 hour'`. El usuario no es el donante de ninguno de los objetos agrupados en su digest. |

---

## Sección 2 — Tabla de Definición de Datos por Evento

### Cambio

Añadir EVT-014 a la tabla de variables requeridas.

| ID_Evento | Template_Ref | Variables_Requeridas | Prioridad |
|---|---|---|---|
| EVT-014 | `TPL-009` | `recipientEmail`, `firstName`, `items[]` | Media |

**Estructura del array `items[]`:**

```typescript
interface DigestItemVariable {
  itemId:      string;   // UUID — usado para construir el enlace al objeto
  title:       string;
  condition:   string;
  distanceKm:  number;   // entero redondeado — calculado con ST_Distance / 1000
  imageUrl?:   string;   // URL pública de Supabase Storage — presente solo si el objeto tiene imágenes
}
```

---

## Sección nueva — Definición de TPL-009

### Cambio

Añadir template TPL-009 al catálogo de templates.

| Campo | Valor |
|---|---|
| **ID** | `TPL-009` |
| **Asunto** | `Nuevos objetos disponibles cerca de ti` |
| **Idioma** | Español (único idioma en MVP) |
| **Prioridad de envío** | Media |
| **Trigger** | EVT-014 |

**Variables del template:**

| Variable | Tipo | Obligatoria | Descripción |
|---|---|---|---|
| `{{firstName}}` | `string` | Sí | Nombre del destinatario — para saludo personalizado |
| `{{items}}` | `DigestItemVariable[]` | Sí | Lista de objetos disponibles en el área. Mínimo 1 elemento. |
| `{{items[n].itemId}}` | `string` | Sí | UUID del objeto — se usa para construir `{{appUrl}}/items/{{items[n].itemId}}` |
| `{{items[n].title}}` | `string` | Sí | Título del objeto |
| `{{items[n].condition}}` | `string` | Sí | Condición del objeto (nuevo, como nuevo, buen estado, etc.) |
| `{{items[n].distanceKm}}` | `number` | Sí | Distancia aproximada al objeto en kilómetros (entero) |
| `{{items[n].imageUrl}}` | `string` | No | URL de la primera imagen del objeto. Si `null` o ausente, el bloque de imagen no se renderiza. |
| `{{appUrl}}` | `string` | Sí | URL base de la aplicación — variable de entorno global del servicio de email |

**Estructura narrativa del template:**

```
Asunto: Nuevos objetos disponibles cerca de ti

Hola, {{firstName}}:

Hay [N] objeto(s) nuevo(s) disponible(s) cerca de tu zona en las últimas horas:

━━━━━━━━━━━━━━━━━━━━━━
[Si imageUrl presente]
[Imagen del objeto — max 600px ancho]

{{items[n].title}}
Condición: {{items[n].condition}}
A ~{{items[n].distanceKm}} km de ti

[Botón: Ver objeto] → {{appUrl}}/items/{{items[n].itemId}}
━━━━━━━━━━━━━━━━━━━━━━
[Repetido por cada ítem del array]

(Footer estándar de la plataforma)
```

**Notas de renderizado:**

- El bloque de imagen es condicional: el template evalúa si `imageUrl` tiene valor. Si no existe, se omite sin dejar espacio vacío.
- El enlace "Ver objeto" apunta a `{{appUrl}}/items/{{itemId}}`. El frontend debe gestionar la redirección a login si el usuario no está autenticado.
- El número `[N]` del texto introductorio se calcula dinámicamente a partir de `items.length`.
- Si `distanceKm` es 0 (usuario muy próximo al objeto), mostrar "menos de 1 km".

---

## Sección 3 — Diagrama de Flujo por Capa

### Cambio

Añadir EVT-014 al diagrama de flujo.

```
┌─────────────────────────────────────────────────────────┐
│                EXTERNAL CRON (cron-job.org)             │
│     POST /jobs/item-digest — cada hora (0 * * * *)      │
│             Header: X-Cron-Secret: <secret>             │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              INTERFACES / HTTP                          │
│   CronAuthMiddleware — valida X-Cron-Secret             │
│   JobsController.itemDigest()                           │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│             APPLICATION / USE CASES                     │
│                                                         │
│  SendItemDigestNotificationsUseCase                     │
│    1. Consulta objetos pendientes (última hora)         │
│    2. Busca usuarios en radio 50km por objeto           │
│    3. Agrupa objetos por usuario                        │
│    4. Marca objetos como digest_notified_at = NOW()     │
│    5. IMailService.send(TPL-009) por cada usuario       │
│    6. Retorna ItemDigestResultDto                       │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              INFRASTRUCTURE / EMAIL                     │
│                                                         │
│  ResendMailProvider implements IMailService             │
│  → Renderizado de TPL-009 con array de items            │
│  → Llamada a API de Resend (un email por usuario)       │
└─────────────────────────────────────────────────────────┘
```

---

## Sección 4 — Eventos Evaluados y Descartados

### Cambio

Sin nuevos descartes en este delta.

---

## Sección 5 — Notas de Diseño

### Cambio

Añadir nota EVT-014.

**EVT-014 — Idempotencia y ventana temporal:**
Los objetos se marcan con `digest_notified_at = NOW()` **antes** del envío de emails, no después. Esta decisión garantiza que incluso ante una caída del proceso durante el envío, los objetos no sean re-procesados en la siguiente ejecución horaria. El envío es best-effort: si Resend falla para un usuario concreto, el fallo queda registrado en pino (`level: warn`) con los IDs de los objetos afectados, pero no revierte el marcado de `digest_notified_at`. Esta política es coherente con el tratamiento de emails en el resto del sistema.

**EVT-014 — Ausencia de opt-out en MVP:**
No existe mecanismo de opt-out de notificaciones digest en esta versión. Todos los usuarios activos dentro del radio reciben el email. La funcionalidad de preferencias de notificación queda diferida a versiones posteriores.

**EVT-014 — Agrupación multi-objeto:**
Un mismo usuario puede estar dentro del radio de múltiples objetos publicados en la misma hora. En ese caso recibe un único email con todos los objetos agrupados, ordenados por `distanceKm ASC`. No se envía un email por objeto.

**EVT-014 — Relación con el registro de `last_active_at`:**
El envío de un digest a un usuario **no actualiza** `last_active_at`. Este campo se actualiza únicamente por acciones del usuario autenticado, no por emails recibidos.
