---
title: "Degradación automática de objetos inactivos"
type: feature
ticket: 6
status: done
created: 2026-10-25
---

# Historia 2.6: Degradación automática de objetos inactivos

Status: done

## Historia

Como sistema,
quiero degradar automáticamente los objetos que llevan 7 días sin selección de receptor,
para que aparezcan al final del feed y el donante sepa que su objeto tiene baja actividad.

## Acceptance Criteria

1. **Dado** que existe un objeto con `status = 'active'`, `degraded_at IS NULL`, `created_at < NOW() - 7 días` y sin ninguna request en estado `selected`, **cuando** se ejecuta el job `degrade-inactive-items` (pg_cron, cada hora), **entonces** el campo `degraded_at` se establece en ese objeto.

2. **Dado** que el job detecta que `degraded_at` se establece por primera vez en un objeto, **cuando** el scheduler Node.js procesa la ventana de objetos recién degradados, **entonces** se invoca `DegradeInactiveItemsUseCase` que envía notificación al donante (EVT-012 / TPL-007).

3. **Dado** que un objeto ya tiene `degraded_at IS NOT NULL`, **cuando** se ejecuta el job pg_cron, **entonces** ese objeto no es procesado nuevamente (garantizado por `WHERE degraded_at IS NULL`).

4. **Dado** que el objeto tiene al menos una request en estado `selected`, **cuando** se ejecuta el job pg_cron, **entonces** ese objeto no se degrada (garantizado por `WHERE id NOT IN (SELECT item_id FROM item_requests WHERE status = 'selected')`).

## Tasks / Subtasks

- [x] Task 1: Migración de base de datos (AC: #1, #3, #4)
  - [x] Crear `src/infrastructure/database/supabase/migrations/006-create-item-requests-and-degrade-job.sql`:
    - Tabla `item_requests` (schema completo — use cases en Historia 3.1)
    - Índices de `item_requests`
    - Registro del job pg_cron `degrade-inactive-items`

- [x] Task 2: Extender capa de Dominio (AC: #2)
  - [x] Añadir a `src/domain/repositories/item.repository.ts`: interfaz `NewlyDegradedItem` y método `findNewlyDegradedItems` a `IItemRepository`

- [x] Task 3: Implementación del repositorio (AC: #2)
  - [x] Implementar `findNewlyDegradedItems` en `src/infrastructure/database/supabase/item.repository.ts`

- [x] Task 4: Capa de Aplicación (AC: #2)
  - [x] Crear `src/application/use-cases/item/degrade-inactive-items.use-case.ts`

- [x] Task 5: Template de email (AC: #2)
  - [x] Añadir `TPL-007` a `src/infrastructure/email/resend.provider.ts`

- [x] Task 6: Scheduler Node.js (AC: #2)
  - [x] Crear `src/infrastructure/scheduler/item-degradation.scheduler.ts`
  - [x] Actualizar `src/main.ts`: instanciar `DegradeInactiveItemsUseCase` e iniciar scheduler tras server startup

- [x] Task 7: Tests (AC: #2)
  - [x] Crear `tests/degrade-inactive-items.test.ts` con 3 casos de prueba (ver Dev Notes)
  - [x] Actualizar mock de `itemRepo` en todos los test files existentes: añadir `findNewlyDegradedItems: vi.fn()`
  - [x] Ejecutar `npx tsc --noEmit` sin errores
  - [x] Ejecutar `npx vitest run` — todos los tests pasan

### Review Findings

- [x] [Review][Decision] Ventana 75 min > intervalo 60 min → email duplicado posible — Aceptado como limitación MVP (decisión de Emanuel, 2026-05-07). Documentado junto con la limitación de downtime en Dev Notes.
- [x] [Review][Patch] `cron.schedule` no idempotente en migración — corregido con DO block + cron.unschedule [src/infrastructure/database/supabase/migrations/006-create-item-requests-and-degrade-job.sql]
- [x] [Review][Patch] `findNewlyDegradedItems` no filtra por `status = 'active'` — corregido añadiendo `AND i.status = 'active'` [src/infrastructure/database/supabase/item.repository.ts:278]
- [x] [Review][Defer] `setInterval` handle no almacenado — graceful shutdown imposible [src/infrastructure/scheduler/item-degradation.scheduler.ts:16] — deferred, pre-existing
- [x] [Review][Defer] Multi-instancia: cada instancia arranca su propio setInterval → emails duplicados en horizontal scaling [src/main.ts:18] — deferred, pre-existing
- [x] [Review][Defer] `pino()` module scope en 2 archivos nuevos — no comparte config con logger de la app [degrade-inactive-items.use-case.ts:5, item-degradation.scheduler.ts:4] — deferred, pre-existing
- [x] [Review][Defer] `donorEmail` sin validación de null — depende de constraint NOT NULL en users.email [src/infrastructure/database/supabase/item.repository.ts:278] — deferred, pre-existing

## Dev Notes

### Arquitectura del job: dos capas complementarias

Esta historia implementa dos mecanismos separados que trabajan juntos:

1. **pg_cron (DB)**: Actualiza `degraded_at` en la base de datos. Es la fuente de verdad. SQL puro, sin dependencia de Node.js.
2. **Scheduler Node.js**: Corre cada 60 minutos. Lee los items recién degradados (ventana: últimos 75 minutos) y envía el email via `DegradeInactiveItemsUseCase`.

La ventana de 75 minutos (5 más que el intervalo del cron) garantiza que si hay un pequeño desfase entre pg_cron y el scheduler Node.js, los items no se pierdan. **Limitación MVP aceptada:** si el servidor está caído >75 minutos cuando pg_cron degrada un item, ese item no recibe notificación.

### Task 1: Migración `006-create-item-requests-and-degrade-job.sql`

Esta migración crea la tabla `item_requests` (schema completo) Y registra el job pg_cron. La tabla se necesita antes de registrar el job porque la cláusula WHERE del job hace referencia a `item_requests`.

```sql
-- Tabla item_requests (los use cases se implementan en Historia 3.1)
CREATE TABLE IF NOT EXISTS item_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES items(id),
  requester_id UUID NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','selected','rejected','cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, requester_id)
);

CREATE INDEX IF NOT EXISTS idx_requests_item ON item_requests(item_id);
CREATE INDEX IF NOT EXISTS idx_requests_requester_date
  ON item_requests(requester_id, created_at);

-- Job pg_cron: degradar objetos inactivos (corre cada hora a :00)
SELECT cron.schedule(
  'degrade-inactive-items',
  '0 * * * *',
  $$
    UPDATE items
    SET degraded_at = NOW()
    WHERE status = 'active'
      AND degraded_at IS NULL
      AND created_at < NOW() - INTERVAL '7 days'
      AND id NOT IN (
        SELECT item_id FROM item_requests
        WHERE status = 'selected'
      );
  $$
);
```

**Nota sobre pg_cron en Supabase:** La extensión `pg_cron` debe estar habilitada en Supabase antes de ejecutar `cron.schedule(...)`. Se habilita desde el dashboard de Supabase → Database → Extensions → `pg_cron`. Si ya está habilitada (puede haberse habilitado en una migración anterior), el `SELECT cron.schedule(...)` simplemente registra o actualiza el job.

### Task 2 & 3: `findNewlyDegradedItems`

**Añadir a `src/domain/repositories/item.repository.ts`** (después de `FindItemOwnershipResult`, antes de `IItemRepository`):

```typescript
export interface NewlyDegradedItem {
  itemId: string;
  donorEmail: string;
}

export interface IItemRepository {
  // ...métodos existentes...
  setPauseStatus(itemId: string, paused: boolean): Promise<void>;
  findNewlyDegradedItems(): Promise<NewlyDegradedItem[]>;  // añadir
}
```

**Implementar en `PostgresItemRepository`:**

```typescript
async findNewlyDegradedItems(): Promise<NewlyDegradedItem[]> {
  const result = await this.db.query<{ item_id: string; donor_email: string }>(
    `SELECT i.id AS item_id, u.email AS donor_email
     FROM items i
     JOIN users u ON u.id = i.donor_id
     WHERE i.degraded_at IS NOT NULL
       AND i.degraded_at >= NOW() - INTERVAL '75 minutes'`,
  );
  return result.rows.map(row => ({
    itemId: row.item_id,
    donorEmail: row.donor_email,
  }));
}
```

**Import a añadir en `item.repository.ts` de infraestructura:**
```typescript
import {
  // ...existentes...
  NewlyDegradedItem,  // añadir
} from '../../../domain/repositories/item.repository';
```

### Task 4: `DegradeInactiveItemsUseCase`

```typescript
// src/application/use-cases/item/degrade-inactive-items.use-case.ts
import pino from 'pino';
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { IMailService } from '../../../domain/services/mail.service';

const logger = pino();

export class DegradeInactiveItemsUseCase {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly mailService: IMailService,
  ) {}

  async execute(): Promise<void> {
    const items = await this.itemRepo.findNewlyDegradedItems();
    for (const item of items) {
      try {
        await this.mailService.send({
          to: item.donorEmail,
          templateId: 'TPL-007',
          variables: {},
        });
      } catch (err) {
        logger.error({ err, itemId: item.itemId }, 'Failed to send degradation email');
        // continúa con el siguiente item — un fallo no detiene los demás
      }
    }
  }
}
```

**Nota de diseño:** El try/catch individual por item garantiza que un fallo de Resend para un item no bloquea las notificaciones del resto. Se loguea el error pero no se lanza. El scheduler verá `0` errores y continuará.

### Task 5: TPL-007 en `resend.provider.ts`

Añadir a la constante `templates` en `src/infrastructure/email/resend.provider.ts`:

```typescript
'TPL-007': {
  subject: 'Tu objeto ha perdido visibilidad',
  html: () => `<p>Tu objeto lleva más de 7 días publicado sin que ningún receptor haya sido seleccionado. Ha bajado al final del feed.</p><p>Puedes mejorar su visibilidad actualizando la descripción o revisando el código postal.</p>`,
},
```

El archivo actualmente tiene TPL-001, TPL-002, TPL-008. Añadir TPL-007 en el mismo objeto `templates`, manteniendo los existentes intactos.

### Task 6: Scheduler y `main.ts`

**`src/infrastructure/scheduler/item-degradation.scheduler.ts`** (archivo nuevo):

```typescript
import pino from 'pino';
import { DegradeInactiveItemsUseCase } from '../../application/use-cases/item/degrade-inactive-items.use-case';

const logger = pino();
const INTERVAL_MS = 60 * 60 * 1000; // 1 hora

export function startItemDegradationScheduler(useCase: DegradeInactiveItemsUseCase): void {
  const run = async (): Promise<void> => {
    try {
      await useCase.execute();
    } catch (err) {
      logger.error({ err }, 'Item degradation scheduler failed');
    }
  };

  run();  // ejecución inmediata al arranque (para items degradados mientras el servidor estaba caído)
  setInterval(run, INTERVAL_MS);
}
```

**`src/main.ts`** — añadir inicialización del scheduler después de `app.listen`:

```typescript
import pino from 'pino';
import { app } from './app';
import { env } from './config/env';
import { db } from './infrastructure/database/supabase/db';
import { PostgresItemRepository } from './infrastructure/database/supabase/item.repository';
import { ResendMailProvider } from './infrastructure/email/resend.provider';
import { DegradeInactiveItemsUseCase } from './application/use-cases/item/degrade-inactive-items.use-case';
import { startItemDegradationScheduler } from './infrastructure/scheduler/item-degradation.scheduler';

const logger = pino({ level: env.LOG_LEVEL });

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Server started');

  // Iniciar scheduler de degradación
  const itemRepo = new PostgresItemRepository(db);
  const mailService = new ResendMailProvider();
  const degradeUseCase = new DegradeInactiveItemsUseCase(itemRepo, mailService);
  startItemDegradationScheduler(degradeUseCase);

}).on('error', (err: NodeJS.ErrnoException) => {
  logger.fatal(err, 'Server failed to start');
  process.exit(1);
});
```

**Por qué instanciar dentro del callback de `listen`:** Garantiza que el servidor está listo antes de iniciar el scheduler. Las conexiones a DB ya están disponibles en este punto.

**Patrón de instanciación directa en `main.ts`:** Este es el único lugar donde se hace wiring a nivel de proceso. Los repositorios y servicios ya se instancian por separado dentro de los routers (en `createItemRouter`) — no hay conflicto ni acoplamiento.

### Task 7: Tests — `tests/degrade-inactive-items.test.ts`

Este test es un **unit test puro** del use case. No usa `buildTestApp` ni Express — solo instancia el use case directamente con mocks.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DegradeInactiveItemsUseCase } from '../src/application/use-cases/item/degrade-inactive-items.use-case';
import { IItemRepository, NewlyDegradedItem } from '../src/domain/repositories/item.repository';
import { IMailService } from '../src/domain/services/mail.service';

const DEGRADED_ITEM: NewlyDegradedItem = {
  itemId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  donorEmail: 'donor@test.com',
};

function buildMocks(items: NewlyDegradedItem[] = [DEGRADED_ITEM]) {
  const itemRepo = {
    findNewlyDegradedItems: vi.fn().mockResolvedValue(items),
    // otros métodos no son necesarios para este use case
  } as unknown as IItemRepository;

  const mailService: IMailService = {
    send: vi.fn().mockResolvedValue(undefined),
  };

  return { itemRepo, mailService };
}
```

**Casos de prueba:**

| # | Test | Setup | Esperado |
|---|------|-------|----------|
| D.1 | envía email por cada item recién degradado | 1 item en `findNewlyDegradedItems` | `mailService.send` llamado 1x con `{ to: donor@test.com, templateId: 'TPL-007' }` |
| D.2 | no hace nada si no hay items recién degradados | `findNewlyDegradedItems` retorna `[]` | `mailService.send` no es llamado |
| D.3 | continúa enviando si un email falla | 2 items, primer email lanza Error | `mailService.send` llamado 2x; la función no lanza |

```typescript
it('D.1 — envía email para item recién degradado', async () => {
  const { itemRepo, mailService } = buildMocks([DEGRADED_ITEM]);
  const useCase = new DegradeInactiveItemsUseCase(itemRepo, mailService);
  await useCase.execute();

  expect(mailService.send).toHaveBeenCalledOnce();
  expect(mailService.send).toHaveBeenCalledWith({
    to: 'donor@test.com',
    templateId: 'TPL-007',
    variables: {},
  });
});

it('D.2 — no envía emails si no hay items degradados', async () => {
  const { itemRepo, mailService } = buildMocks([]);
  const useCase = new DegradeInactiveItemsUseCase(itemRepo, mailService);
  await useCase.execute();

  expect(mailService.send).not.toHaveBeenCalled();
});

it('D.3 — continúa con el siguiente item si un email falla', async () => {
  const item2: NewlyDegradedItem = { itemId: 'bbbbbbbb-...', donorEmail: 'donor2@test.com' };
  const { itemRepo, mailService } = buildMocks([DEGRADED_ITEM, item2]);
  vi.mocked(mailService.send).mockRejectedValueOnce(new Error('Resend error'));
  // segunda llamada tiene éxito (default mock)

  const useCase = new DegradeInactiveItemsUseCase(itemRepo, mailService);
  await expect(useCase.execute()).resolves.not.toThrow();
  expect(mailService.send).toHaveBeenCalledTimes(2);
});
```

### Actualización de mocks en tests existentes

Todos los archivos que mockean `itemRepo` con `createItemRouter(deps)` necesitan `findNewlyDegradedItems: vi.fn()`:

- `tests/items-list.test.ts`
- `tests/items-publish.test.ts`
- `tests/items-get.test.ts`
- `tests/items-cancel.test.ts`
- `tests/items-pause.test.ts`

Sin esta adición, TypeScript rechazará el mock porque `IItemRepository` ahora exige `findNewlyDegradedItems`.

### ACs #1, #3, #4 — validación fuera del scope de Node.js tests

Los ACs #1, #3, #4 son comportamientos del job pg_cron (SQL puro). Su validación es:
- **AC #1**: La cláusula `WHERE status = 'active' AND degraded_at IS NULL AND created_at < NOW() - INTERVAL '7 days'` garantiza que solo items activos no degradados y con >7 días se procesan.
- **AC #3**: `WHERE degraded_at IS NULL` garantiza idempotencia — items ya degradados no se tocan.
- **AC #4**: `AND id NOT IN (SELECT item_id FROM item_requests WHERE status = 'selected')` excluye objetos con receptor seleccionado.

Estos se validan leyendo el SQL de la migración, no con tests Node.js.

### Project Structure Notes

- `src/infrastructure/database/supabase/migrations/006-create-item-requests-and-degrade-job.sql` — nuevo
- `src/infrastructure/scheduler/` — directorio nuevo; crear junto con el archivo
- `src/infrastructure/scheduler/item-degradation.scheduler.ts` — nuevo
- `src/application/use-cases/item/degrade-inactive-items.use-case.ts` — nuevo
- `src/infrastructure/email/resend.provider.ts` — modificar (añadir TPL-007)
- `src/main.ts` — modificar (añadir scheduler startup)
- No hay nuevo DTO — el use case no devuelve datos al exterior
- No hay cambios en `ItemController`, `ItemRouterDeps`, ni en los routers HTTP
- La tabla `item_requests` se crea AQUÍ (schema completo). Los use cases de solicitudes son Historia 3.1.

### References

- [Source: _bmad-output/initiative-backend/archive-v6/epics.md §Historia 2.6] — ACs de degradación automática
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md §FR24] — Degradar objetos inactivos tras 7 días (job pg_cron, email EVT-012)
- [Source: docs/architecture.md §7, Job 1] — SQL exacto del job `degrade-inactive-items` (cron schedule `0 * * * *`)
- [Source: docs/architecture.md §3.4] — Schema completo de `item_requests`
- [Source: docs/architecture.md §4] — Índices de `item_requests`: `idx_requests_item`, `idx_requests_requester_date`
- [Source: docs/architecture.md §10] — EVT-012: notificación al donante cuando objeto se degrada
- [Source: src/infrastructure/email/resend.provider.ts] — Patrón de templates existentes (TPL-001, TPL-002, TPL-008)
- [Source: src/domain/services/mail.service.ts] — Interfaz `IMailService` y `MailPayload`
- [Source: src/main.ts] — Entry point donde se añade el scheduler startup
- [Source: src/infrastructure/database/supabase/migrations/003-create-items.sql] — Formato de migraciones existentes
- [Source: _bmad-output/initiative-backend/tickets/epic-publicacion-y-gestion-de-objetos/tickets/story-pausar-y-reanudar-solicitudes-de-un-objeto-plan.md] — Estado actual de `IItemRepository` (7 métodos, incluyendo `setPauseStatus`)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (bmad-create-story, 2026-05-07)

### Debug Log References

### Completion Notes List

- Task 1: Migración `006-create-item-requests-and-degrade-job.sql` creada — tabla `item_requests` con schema completo + índices + job pg_cron `degrade-inactive-items` (cron `0 * * * *`, ventana 7 días, excluye items con request `selected`).
- Task 2: `NewlyDegradedItem` interface + método `findNewlyDegradedItems` añadidos a `IItemRepository` en domain.
- Task 3: `findNewlyDegradedItems` implementado en `PostgresItemRepository` — query JOIN items+users, ventana 75 minutos.
- Task 4: `DegradeInactiveItemsUseCase` creado — itera items degradados, envía TPL-007 con try/catch por item (un fallo no detiene los demás).
- Task 5: TPL-007 añadido a `ResendMailProvider` — "Tu objeto ha perdido visibilidad".
- Task 6: `startItemDegradationScheduler` creado en `src/infrastructure/scheduler/` — ejecución inmediata al arranque + setInterval 1h. `main.ts` actualizado para instanciar use case y arrancar scheduler dentro del callback de `listen`.
- Task 7: 3 tests unit para `DegradeInactiveItemsUseCase` (D.1 email enviado, D.2 lista vacía, D.3 fallo no bloquea). Mocks de 5 test files actualizados con `findNewlyDegradedItems: vi.fn()`. tsc limpio. 98/98 tests pasando.

### File List

- src/infrastructure/database/supabase/migrations/006-create-item-requests-and-degrade-job.sql (nuevo)
- src/domain/repositories/item.repository.ts (modificado — añadir `NewlyDegradedItem` + `findNewlyDegradedItems`)
- src/infrastructure/database/supabase/item.repository.ts (modificado — implementar `findNewlyDegradedItems`)
- src/application/use-cases/item/degrade-inactive-items.use-case.ts (nuevo)
- src/infrastructure/email/resend.provider.ts (modificado — añadir TPL-007)
- src/infrastructure/scheduler/item-degradation.scheduler.ts (nuevo)
- src/main.ts (modificado — inicializar scheduler tras server start)
- tests/degrade-inactive-items.test.ts (nuevo)
- tests/items-list.test.ts (modificado — mock itemRepo actualizado)
- tests/items-publish.test.ts (modificado — mock itemRepo actualizado)
- tests/items-get.test.ts (modificado — mock itemRepo actualizado)
- tests/items-cancel.test.ts (modificado — mock itemRepo actualizado)
- tests/items-pause.test.ts (modificado — mock itemRepo actualizado)
