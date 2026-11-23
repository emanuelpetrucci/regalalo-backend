# Delta — technical-design-backend.md

> **⚠️ Obsoleto — IDs incorrectos.** Este borrador reutilizaba EVT-014 / TPL-009 (verificación de email). Usar **`docs/delta-backend-EVT015.md`** (EVT-015 / TPL-010). Aprobado en Correct Course 2026-05-29.

**Referencia:** EVT-014 *(erróneo — ver EVT-015)*
**Versión base:** 1.3 (post DLT-003)
**Versión resultante:** 1.4
**Estado:** Pendiente de aprobación
**Fecha:** Mayo 2026
**Motivo:** Notificación digest horaria de nuevos objetos publicados en el área del usuario

---

## Resumen del cambio

Nuevo endpoint `POST /jobs/item-digest` invocable por un cron externo (cron-job.org) cada hora. El endpoint detecta todos los objetos publicados en la última hora que aún no han sido incluidos en ningún digest, identifica los usuarios activos dentro de un radio de 50 km de cada objeto, agrupa los objetos por usuario y envía un único email de resumen por usuario. Los emails se envían con mejor esfuerzo; los ítems se marcan como notificados independientemente del resultado individual de cada envío.

---

## Sección 3.2 — Tabla `items`

### Cambio

Añadir columna `digest_notified_at` a la tabla `items`.

```sql
ALTER TABLE items
  ADD COLUMN digest_notified_at TIMESTAMPTZ DEFAULT NULL;
```

**Nota:** sin migración de datos requerida. `NULL` implica que el objeto no ha sido incluido en ningún digest. Los objetos existentes en estado `active` con `created_at` anterior a esta migración no entrarán nunca en el digest (la ventana de 1 hora ya los habrá excluido).

**Definición completa actualizada de la tabla:**

```sql
CREATE TABLE items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id            UUID NOT NULL REFERENCES users(id),
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  condition           TEXT NOT NULL,
  location            GEOGRAPHY(POINT, 4326) NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','reserved','completed','cancelled')),
  requests_paused     BOOLEAN NOT NULL DEFAULT FALSE,
  degraded_at         TIMESTAMPTZ,
  digest_notified_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reserved_at         TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ
);
```

---

## Sección 4 — Índices

### Cambio

Añadir índice parcial para la consulta de digest.

```sql
CREATE INDEX idx_items_digest_pending
  ON items(created_at)
  WHERE digest_notified_at IS NULL
    AND status = 'active';
```

**Justificación:** el use case filtra siempre por `digest_notified_at IS NULL AND status = 'active'`. El índice parcial reduce drásticamente el espacio de búsqueda — la gran mayoría de objetos históricos habrán sido ya notificados y quedarán fuera del índice.

---

## Sección nueva — Variable de entorno: `CRON_SECRET`

### Cambio

Añadir variable de entorno al proceso Node.js.

| Variable | Tipo | Descripción |
|---|---|---|
| `CRON_SECRET` | `string` | Secret compartido entre cron-job.org y el backend. Mínimo 32 caracteres, generado con `openssl rand -hex 32`. |

La variable se configura en Railway (panel de entorno del servicio) y en cron-job.org como header HTTP `X-Cron-Secret: <valor>`.

---

## Sección nueva — Middleware: `CronAuthMiddleware`

### Cambio

Nuevo middleware de autenticación exclusivo para las rutas `/jobs/*`.

**Ubicación:** `src/interfaces/http/middlewares/cron-auth.middleware.ts`

```typescript
import { Request, Response, NextFunction } from 'express';

export function cronAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const secret = req.headers['x-cron-secret'];

  if (!secret || secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
```

**Reglas de aplicación:**
- Se aplica exclusivamente sobre las rutas `POST /jobs/*`.
- No reemplaza ni interactúa con el middleware JWT existente — son rutas independientes.
- La comparación es en tiempo constante para evitar timing attacks sobre el secret. Si se detecta riesgo real en auditoría futura, reemplazar con `crypto.timingSafeEqual`.

---

## Sección nueva — Use Case: `SendItemDigestNotificationsUseCase`

### Cambio

**Ubicación:** `src/application/use-cases/jobs/SendItemDigestNotificationsUseCase.ts`

**Dependencias inyectadas:**
- `IItemRepository` — consulta de objetos pendientes y marcado de notificados
- `IUserRepository` — búsqueda de usuarios en radio geográfico
- `IMailService` — envío de emails via Resend

**Flujo de ejecución:**

```
1. Recuperar todos los objetos pendientes de digest:
   status = 'active'
   AND digest_notified_at IS NULL
   AND created_at >= NOW() - INTERVAL '1 hour'
   (con primera imagen de cada objeto si existe)

2. Si no hay objetos → retornar { processedItems: 0, recipientsNotified: 0, emailsFailed: 0 }
   (salida limpia, sin efecto secundario)

3. Para cada objeto, recuperar usuarios elegibles dentro de 50 km:
   is_active = TRUE
   AND id != item.donor_id
   AND ST_DWithin(user.location, item.location, 50000)

4. Construir mapa de agrupación: Map<userId, DigestUserEntry>
   DigestUserEntry = { email, firstName, items: DigestItemEntry[] }
   DigestItemEntry = { itemId, title, condition, distanceKm, imageUrl? }

5. Marcar TODOS los objetos del paso 1 como notificados:
   UPDATE items SET digest_notified_at = NOW()
   WHERE id IN (<ids del paso 1>)
   — Este UPDATE ocurre ANTES del envío de emails.
   — Garantiza idempotencia: si el proceso muere durante el envío,
     los objetos no volverán a procesarse en la siguiente ejecución.

6. Para cada usuario del mapa:
   a. Llamar IMailService.send(TPL-009, variables)
   b. En caso de error: registrar en pino (level: 'warn', itemIds incluidos)
   c. Incrementar counter emailsSent o emailsFailed según resultado

7. Retornar DTO:
   { processedItems: number, recipientsNotified: number, emailsFailed: number, executionMs: number }
```

**Consulta SQL — paso 1 (objetos pendientes con primera imagen):**

```sql
SELECT
  i.id            AS item_id,
  i.donor_id,
  i.title,
  i.condition,
  i.location,
  (
    SELECT CONCAT(
      $1,                    -- SUPABASE_URL (env var, inyectado en la query)
      '/storage/v1/object/public/items/',
      ii.storage_path
    )
    FROM item_images ii
    WHERE ii.item_id = i.id
    ORDER BY ii.created_at ASC
    LIMIT 1
  ) AS first_image_url
FROM items i
WHERE i.status = 'active'
  AND i.digest_notified_at IS NULL
  AND i.created_at >= NOW() - INTERVAL '1 hour';
```

> Nota sobre `first_image_url`: si el objeto no tiene imágenes, el subselect retorna `NULL`. La variable `imageUrl` en TPL-009 es opcional; el template renderiza el bloque de imagen solo si el valor está presente.

**Consulta SQL — paso 3 (usuarios elegibles por objeto):**

```sql
SELECT
  u.id                                                        AS user_id,
  u.email,
  u.first_name,
  ROUND(ST_Distance(u.location, $1::geography) / 1000)::int  AS distance_km
FROM users u
WHERE u.is_active = TRUE
  AND u.id != $2
  AND ST_DWithin(u.location, $1::geography, 50000);
-- $1 = item.location (GEOGRAPHY POINT del objeto)
-- $2 = item.donor_id
```

**DTO de salida:**

```typescript
// src/application/dtos/jobs/ItemDigestResultDto.ts
export interface ItemDigestResultDto {
  processedItems:     number;
  recipientsNotified: number;
  emailsFailed:       number;
  executionMs:        number;
}
```

---

## Sección nueva — Controller: `JobsController`

### Cambio

**Ubicación:** `src/interfaces/http/controllers/jobs.controller.ts`

```typescript
import { Request, Response } from 'express';
import { SendItemDigestNotificationsUseCase } from '../../../application/use-cases/jobs/SendItemDigestNotificationsUseCase';

export class JobsController {
  constructor(
    private readonly sendItemDigestUseCase: SendItemDigestNotificationsUseCase
  ) {}

  async itemDigest(req: Request, res: Response): Promise<void> {
    const start = Date.now();

    const result = await this.sendItemDigestUseCase.execute();

    res.status(200).json({
      ...result,
      executionMs: Date.now() - start,
    });
  }
}
```

---

## Sección nueva — Ruta: `POST /jobs/item-digest`

### Cambio

**Ubicación:** `src/interfaces/http/routes/jobs.routes.ts`

```typescript
import { Router } from 'express';
import { cronAuthMiddleware } from '../middlewares/cron-auth.middleware';
import { JobsController } from '../controllers/jobs.controller';

export function createJobsRouter(controller: JobsController): Router {
  const router = Router();

  router.post(
    '/item-digest',
    cronAuthMiddleware,
    (req, res) => controller.itemDigest(req, res)
  );

  return router;
}
```

**Registro en `main.ts`:**

```typescript
app.use('/jobs', createJobsRouter(jobsController));
```

| Propiedad | Valor |
|---|---|
| Método | POST |
| Ruta | `/jobs/item-digest` |
| Autenticación | `X-Cron-Secret` header |
| Autenticación JWT | No requerida |
| Rate limit global | **Excluido** — protegido por secret |
| Rate limit específico | 5 peticiones / IP / 10 minutos (defensa en profundidad) |

**Respuesta (200):**

```json
{
  "processedItems": 5,
  "recipientsNotified": 23,
  "emailsFailed": 0,
  "executionMs": 847
}
```

**Errores:**

| Código | Motivo |
|---|---|
| 401 | Header `X-Cron-Secret` ausente o incorrecto |
| 500 | Error interno no controlado |

> Nota: la respuesta 200 se devuelve incluso si `emailsFailed > 0`. El fallo en el envío de un email individual no es un error del endpoint — es un evento registrado en logs. cron-job.org solo reintentará si el código de respuesta no es 2xx.

---

## Sección 11 — Rate Limiting

### Cambio

Añadir instancia de rate limit específica para el endpoint de jobs.

```typescript
// middlewares/rate-limit.ts — añadir al bloque existente

export const jobsRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,  // 10 minutos
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
```

**Tabla actualizada:**

| Instancia | Scope | Límite | Ventana |
|---|---|---|---|
| Global | Todas las rutas (excepto `/jobs/*`) | 60 peticiones / IP | 60 segundos |
| Auth | `/auth/*` | 10 peticiones / IP | 15 minutos |
| Ranking | `GET /items/:id/requests` | 10 peticiones / IP | 1 minuto |
| Jobs | `/jobs/*` | 5 peticiones / IP | 10 minutos |

> La exclusión del rate limit global sobre `/jobs/*` es intencional. cron-job.org llama desde IPs fijas de sus servidores; el rate limit global podría bloquear una ejecución legítima en escenario de IP compartida.

---

## Sección 2 — Estructura de Carpetas

### Cambio

Añadir el nuevo use case y controller a la estructura existente.

```
src/
├── application/
│   ├── use-cases/
│   │   ├── jobs/                          ← NUEVO directorio
│   │   │   └── SendItemDigestNotificationsUseCase.ts
│   └── dtos/
│       └── jobs/                          ← NUEVO directorio
│           └── ItemDigestResultDto.ts
│
├── interfaces/
│   ├── http/
│   │   ├── controllers/
│   │   │   └── jobs.controller.ts         ← NUEVO
│   │   ├── middlewares/
│   │   │   └── cron-auth.middleware.ts    ← NUEVO
│   │   └── routes/
│   │       └── jobs.routes.ts             ← NUEVO
```

---

## Configuración de cron-job.org

Documentado aquí como referencia operativa. No afecta al código.

| Parámetro | Valor |
|---|---|
| URL | `https://<railway-domain>/jobs/item-digest` |
| Método | POST |
| Header | `X-Cron-Secret: <CRON_SECRET>` |
| Horario | `0 * * * *` (cada hora en punto) |
| Notificación de fallo | Email al equipo si HTTP ≠ 2xx |
| Timeout | 30 segundos |

> El valor de `CRON_SECRET` debe generarse con `openssl rand -hex 32` y almacenarse en Railway como variable de entorno antes de registrar el cron en cron-job.org.
