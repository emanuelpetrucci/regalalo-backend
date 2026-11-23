---
title: "Purga automática de imágenes y cola de borrado en Storage"
type: feature
ticket: 7
status: done
created: 2026-10-25
---

# Historia 2.7: Purga automática de imágenes y cola de borrado en Storage

Status: review

## Historia

Como sistema,
quiero purgar las imágenes de objetos finalizados y garantizar el borrado físico en Supabase Storage incluso ante caídas del servidor,
para no acumular archivos huérfanos.

## Acceptance Criteria

1. **Dado** que existen objetos con `status IN ('completed','cancelled')` y `completed_at < NOW() - 30 días` con registros en `item_images`, **cuando** se ejecuta el job `purge-item-images` (pg_cron, 03:00 UTC diario), **entonces** se eliminan los registros de `item_images` para esos objetos.

2. **Dado** que se elimina un registro de `item_images`, **cuando** el trigger `trg_queue_storage_deletion` se activa, **entonces** se inserta el `storage_path` en `storage_deletion_queue` con `processed_at IS NULL` (garantizado por el trigger ya existente — migración 004).

3. **Dado** que existen registros en `storage_deletion_queue` con `processed_at IS NULL`, **cuando** el `SupabaseStorageAdapter` ejecuta su polling (al arranque y cada 10 minutos), **entonces** se eliminan los archivos en Supabase Storage y se marca `processed_at = NOW()`.

4. **Dado** que el servidor estaba caído durante la ejecución del job de purga, **cuando** el servidor reinicia, **entonces** el polling del `SupabaseStorageAdapter` procesa los registros pendientes al arrancar.

## Tasks / Subtasks

- [x] Task 1: Migración de base de datos (AC: #1)
  - [x] Crear `src/infrastructure/database/supabase/migrations/007-setup-purge-item-images-job.sql`:
    - Job pg_cron `purge-item-images` (03:00 UTC diario)
    - SQL exacto: ver Dev Notes

- [x] Task 2: Extender `SupabaseStorageAdapter` (AC: #3, #4)
  - [x] Cambiar constructor: `constructor(private readonly db: Pool, private readonly client = createClient(...)) {}`
  - [x] Añadir `import { Pool } from 'pg'` en el archivo
  - [x] Añadir método `async processDeletionQueue(): Promise<void>` — ver Dev Notes para implementación exacta
  - [x] Importar `pino` en el adapter

- [x] Task 3: Actualizar wiring de `SupabaseStorageAdapter` (AC: #3)
  - [x] En `src/interfaces/http/routes/items.routes.ts`, línea 52: cambiar `new SupabaseStorageAdapter()` → `new SupabaseStorageAdapter(db)` (el `db` ya está importado en ese archivo)

- [x] Task 4: Crear scheduler (AC: #3, #4)
  - [x] Crear `src/infrastructure/scheduler/storage-deletion.scheduler.ts`
  - [x] Patrón idéntico a `item-degradation.scheduler.ts` con intervalo de 10 minutos
  - [x] La función recibe `storageAdapter: SupabaseStorageAdapter`

- [x] Task 5: Actualizar `main.ts` (AC: #4)
  - [x] Importar `SupabaseStorageAdapter` y `startStorageDeletionScheduler`
  - [x] Dentro del callback `listen()`, después del scheduler de degradación:
    - `const storageAdapter = new SupabaseStorageAdapter(db);`
    - `startStorageDeletionScheduler(storageAdapter);`

- [x] Task 6: Tests (AC: #3)
  - [x] Crear `tests/storage-deletion.test.ts` con 3 casos — ver Dev Notes para casos exactos

- [x] Task 7: Verificación
  - [x] Ejecutar `npx tsc --noEmit` sin errores
  - [x] Ejecutar `npx vitest run` — todos los tests pasan

## Dev Notes

### Arquitectura: sin use case, sin domain interface

Esta historia NO introduce:
- Ningún método nuevo en `IItemRepository`
- Ningún use case en la capa application
- Ninguna ruta HTTP nueva

El job pg_cron opera 100% en SQL. El polling opera en infrastructure (`SupabaseStorageAdapter`). No hay lógica de dominio que extraer.

Comparación con Historia 2.6:
- 2.6: pg_cron (DB) + UseCase (application) + Scheduler (infrastructure)
- 2.7: pg_cron (DB) + método en Adapter (infrastructure) + Scheduler (infrastructure)

---

### Task 1 — SQL exacto para migration 007

**Archivo**: `src/infrastructure/database/supabase/migrations/007-setup-purge-item-images-job.sql`

```sql
-- Job pg_cron: purgar imágenes de objetos completados/cancelados (corre a las 03:00 UTC diario)
-- El trigger trg_queue_storage_deletion (migración 004) encola automáticamente los storage_path
-- en storage_deletion_queue cuando se eliminan registros de item_images.
SELECT cron.schedule(
  'purge-item-images',
  '0 3 * * *',
  $$
    DELETE FROM item_images
    WHERE item_id IN (
      SELECT id FROM items
      WHERE status IN ('completed', 'cancelled')
        AND completed_at < NOW() - INTERVAL '30 days'
    );
  $$
);
```

**IMPORTANTE**: `trg_queue_storage_deletion` y `storage_deletion_queue` YA EXISTEN (migración 004).
No recrearlos. El trigger se activa automáticamente en cada DELETE de `item_images`.

---

### Task 2 — Implementación de `SupabaseStorageAdapter`

**Archivo completo resultante**:

```typescript
import { Pool } from 'pg';
import pino from 'pino';
import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env';
import { IStorageService } from '../../domain/services/storage.service';

const logger = pino();

export class SupabaseStorageAdapter implements IStorageService {
  constructor(
    private readonly db: Pool,
    private readonly client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
  ) {}

  async upload(buffer: Buffer, mimeType: string, storagePath: string): Promise<void> {
    const { error } = await this.client.storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  }

  async processDeletionQueue(): Promise<void> {
    const result = await this.db.query<{ id: string; storage_path: string }>(
      'SELECT id, storage_path FROM storage_deletion_queue WHERE processed_at IS NULL ORDER BY created_at',
    );

    for (const row of result.rows) {
      try {
        const { error } = await this.client.storage
          .from(env.SUPABASE_STORAGE_BUCKET)
          .remove([row.storage_path]);

        if (error) throw new Error(`Storage delete failed: ${error.message}`);

        await this.db.query(
          'UPDATE storage_deletion_queue SET processed_at = NOW() WHERE id = $1',
          [row.id],
        );
      } catch (err) {
        logger.error({ err, storagePath: row.storage_path }, 'Failed to delete storage file');
      }
    }
  }
}
```

**Invariante crítico**: `processed_at = NOW()` se escribe DESPUÉS del `remove()` exitoso. Si el
remove falla, el registro queda con `processed_at IS NULL` y se reintenta en el siguiente polling.
Si se escribe antes del remove, un fallo deja el archivo huérfano permanentemente.

---

### Task 3 — Cambio en items.routes.ts

**Antes** (línea 52):
```typescript
const storage = deps.storageService ?? new SupabaseStorageAdapter();
```

**Después**:
```typescript
const storage = deps.storageService ?? new SupabaseStorageAdapter(db);
```

El `db: Pool` ya está importado en ese archivo (línea 3: `import { db } from '../../../infrastructure/database/supabase/db'`).
Sin este cambio, TypeScript dará error de compilación (argumento requerido faltante).

---

### Task 4 — Scheduler

**Archivo**: `src/infrastructure/scheduler/storage-deletion.scheduler.ts`

```typescript
import pino from 'pino';
import { SupabaseStorageAdapter } from '../storage/supabase-storage.adapter';

const logger = pino();
const INTERVAL_MS = 10 * 60 * 1000;

export function startStorageDeletionScheduler(storageAdapter: SupabaseStorageAdapter): void {
  const run = async (): Promise<void> => {
    try {
      await storageAdapter.processDeletionQueue();
    } catch (err) {
      logger.error({ err }, 'Storage deletion scheduler failed');
    }
  };

  run();
  setInterval(run, INTERVAL_MS);
}
```

---

### Task 5 — main.ts resultante

```typescript
import pino from 'pino';
import { app } from './app';
import { env } from './config/env';
import { db } from './infrastructure/database/supabase/db';
import { PostgresItemRepository } from './infrastructure/database/supabase/item.repository';
import { SupabaseStorageAdapter } from './infrastructure/storage/supabase-storage.adapter';
import { ResendMailProvider } from './infrastructure/email/resend.provider';
import { DegradeInactiveItemsUseCase } from './application/use-cases/item/degrade-inactive-items.use-case';
import { startItemDegradationScheduler } from './infrastructure/scheduler/item-degradation.scheduler';
import { startStorageDeletionScheduler } from './infrastructure/scheduler/storage-deletion.scheduler';

const logger = pino({ level: env.LOG_LEVEL });

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Server started');

  const itemRepo = new PostgresItemRepository(db);
  const mailService = new ResendMailProvider();
  const degradeUseCase = new DegradeInactiveItemsUseCase(itemRepo, mailService);
  startItemDegradationScheduler(degradeUseCase);

  const storageAdapter = new SupabaseStorageAdapter(db);
  startStorageDeletionScheduler(storageAdapter);

}).on('error', (err: NodeJS.ErrnoException) => {
  logger.fatal(err, 'Server failed to start');
  process.exit(1);
});
```

**IMPORTANTE**: Esta instancia de `SupabaseStorageAdapter(db)` en `main.ts` es SEPARADA de la
que usa `items.routes.ts`. Ambas comparten el mismo `db` Pool. Es correcto — el adapter en el router
es para uploads; este es para el polling de borrado.

---

### Task 6 — Tests

**Estrategia de mock**: `SupabaseStorageAdapter` acepta el cliente Supabase como segundo parámetro
(con default). En los tests se inyecta un mock del cliente. No se necesita `vi.mock('@supabase/supabase-js')`.

**Archivo**: `tests/storage-deletion.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { SupabaseStorageAdapter } from '../src/infrastructure/storage/supabase-storage.adapter';

function buildMocks(queueRows: Array<{ id: string; storage_path: string }> = []) {
  const mockRemove = vi.fn().mockResolvedValue({ error: null });
  const mockFrom = vi.fn().mockReturnValue({ remove: mockRemove });
  const mockClient = { storage: { from: mockFrom } } as any;

  const queryMock = vi.fn();
  // Primera llamada: SELECT pendientes
  queryMock.mockResolvedValueOnce({ rows: queueRows });
  // Llamadas siguientes: UPDATE processed_at (una por fila)
  queryMock.mockResolvedValue({ rows: [] });

  const mockDb = { query: queryMock } as unknown as Pool;

  return { mockDb, mockClient, mockRemove, mockFrom };
}

describe('SupabaseStorageAdapter.processDeletionQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('S.1 — elimina archivo y marca processed_at para registros pendientes', async () => {
    const row = { id: 'row-uuid-1', storage_path: 'items/abc/photo.webp' };
    const { mockDb, mockClient, mockRemove } = buildMocks([row]);

    const adapter = new SupabaseStorageAdapter(mockDb, mockClient);
    await adapter.processDeletionQueue();

    expect(mockRemove).toHaveBeenCalledWith(['items/abc/photo.webp']);
    expect(mockDb.query).toHaveBeenCalledTimes(2);
    const updateCall = vi.mocked(mockDb.query).mock.calls[1];
    expect(updateCall[0]).toContain('processed_at = NOW()');
    expect(updateCall[1]).toEqual(['row-uuid-1']);
  });

  it('S.2 — no hace nada si la cola está vacía', async () => {
    const { mockDb, mockClient, mockRemove } = buildMocks([]);

    const adapter = new SupabaseStorageAdapter(mockDb, mockClient);
    await adapter.processDeletionQueue();

    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockDb.query).toHaveBeenCalledTimes(1); // solo el SELECT
  });

  it('S.3 — continúa con el siguiente item si un borrado falla', async () => {
    const row1 = { id: 'row-uuid-1', storage_path: 'items/abc/photo1.webp' };
    const row2 = { id: 'row-uuid-2', storage_path: 'items/abc/photo2.webp' };

    const mockRemove = vi.fn()
      .mockResolvedValueOnce({ error: { message: 'Storage error' } })
      .mockResolvedValueOnce({ error: null });
    const mockFrom = vi.fn().mockReturnValue({ remove: mockRemove });
    const mockClient = { storage: { from: mockFrom } } as any;

    const queryMock = vi.fn()
      .mockResolvedValueOnce({ rows: [row1, row2] }) // SELECT
      .mockResolvedValue({ rows: [] });               // UPDATE (solo el segundo)
    const mockDb = { query: queryMock } as unknown as Pool;

    const adapter = new SupabaseStorageAdapter(mockDb, mockClient);
    await expect(adapter.processDeletionQueue()).resolves.not.toThrow();

    expect(mockRemove).toHaveBeenCalledTimes(2);
    // Solo row2 debe haber generado UPDATE (row1 falló en remove, no se marca)
    const updateCalls = vi.mocked(mockDb.query).mock.calls.filter(c =>
      String(c[0]).includes('processed_at = NOW()')
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][1]).toEqual(['row-uuid-2']);
  });
});
```

---

### Relación con tests existentes

Esta historia **no añade métodos a `IItemRepository`**. Los mocks existentes en los otros test files
(`items-publish.test.ts`, `items-list.test.ts`, `items-get.test.ts`, `items-cancel.test.ts`,
`items-pause.test.ts`, `degrade-inactive-items.test.ts`) **no necesitan actualizarse**.

---

### Checklist de regresión

- `items.routes.ts` línea 52 actualizada (o TypeScript fallará en compilación)
- `processDeletionQueue()` marca `processed_at` solo tras remove exitoso
- El scheduler de `main.ts` instancia `SupabaseStorageAdapter(db)` con el Pool ya disponible
- No se crean nuevas tablas ni triggers en migration 007 (solo el pg_cron job)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (bmad-dev-story, 2026-05-07)

### Completion Notes List

- Task 1: Migración 007 creada con DO block + cron.unschedule previo (idempotente) + job pg_cron `purge-item-images` (03:00 UTC diario, DELETE en item_images de objetos completed/cancelled con >30 días).
- Task 2: `SupabaseStorageAdapter` reescrito con constructor `(db: Pool, client = createClient(...))` + método `processDeletionQueue()` — marca `processed_at` solo tras `remove()` exitoso; fallo por fila no detiene los demás.
- Task 3: `items.routes.ts` línea 52 actualizada: `new SupabaseStorageAdapter(db)`.
- Task 4: `storage-deletion.scheduler.ts` creado — mismo patrón que `item-degradation.scheduler.ts`, intervalo 10 min, ejecución inmediata al arranque.
- Task 5: `main.ts` actualizado con import de `SupabaseStorageAdapter` y `startStorageDeletionScheduler`, ambos arrancados dentro del callback `listen()`.
- Task 6: `tests/storage-deletion.test.ts` creado — 3 casos (S.1 elimina y marca, S.2 cola vacía, S.3 fallo no bloquea).
- Task 7: `npx tsc --noEmit` sin errores. `npx vitest run` 101/101 tests pasando (14 suites).

### File List

- src/infrastructure/database/supabase/migrations/007-setup-purge-item-images-job.sql (nuevo)
- src/infrastructure/storage/supabase-storage.adapter.ts (modificado — constructor + processDeletionQueue)
- src/interfaces/http/routes/items.routes.ts (modificado — SupabaseStorageAdapter(db))
- src/infrastructure/scheduler/storage-deletion.scheduler.ts (nuevo)
- src/main.ts (modificado — SupabaseStorageAdapter + startStorageDeletionScheduler)
- tests/storage-deletion.test.ts (nuevo)

### Review Findings

- [x] [Review][Defer] DELETE sin LIMIT en migration 007 — Riesgo de lock prolongado en `item_images` aceptado para MVP; backlog inicial pequeño y lock window tolerable. Reevaluar si el volumen de items crece significativamente.
- [ ] [Review][Patch] SELECT sin LIMIT en `processDeletionQueue` — carga toda la cola en memoria en cada poll [src/infrastructure/storage/supabase-storage.adapter.ts:22]
- [ ] [Review][Patch] Handle de `setInterval` descartado — scheduler no puede detenerse; guardar y exponer para graceful shutdown [src/infrastructure/scheduler/storage-deletion.scheduler.ts:15]
- [ ] [Review][Patch] `completed_at IS NOT NULL` no explícito en SQL — hacer explícito para evitar dependencia del comportamiento implícito de NULL en comparaciones [src/infrastructure/database/supabase/migrations/007-setup-purge-item-images-job.sql:19]
- [x] [Review][Defer] `processDeletionQueue` no declarado en `IStorageService` — spec explícitamente dice "sin domain interface"; acoplamiento concreto aceptado por diseño [src/infrastructure/storage/supabase-storage.adapter.ts] — deferred, pre-existing
- [x] [Review][Defer] UPDATE puede fallar tras storage.remove() exitoso — benigno si Supabase devuelve éxito en doble borrado; manejado por try/catch del loop [src/infrastructure/storage/supabase-storage.adapter.ts:36-39] — deferred, pre-existing
- [x] [Review][Defer] Sin retry counter ni dead-letter para borrados permanentemente fallidos — más allá del scope del MVP [src/infrastructure/storage/supabase-storage.adapter.ts] — deferred, pre-existing
- [x] [Review][Defer] Logger pino() módulo-level sin LOG_LEVEL — patrón pre-existente en item-degradation.scheduler.ts [src/infrastructure/scheduler/storage-deletion.scheduler.ts, src/infrastructure/storage/supabase-storage.adapter.ts] — deferred, pre-existing
- [x] [Review][Defer] Sin documentación de coordinación operacional entre pg_cron (03:00 UTC) y scheduler Node (10 min) — riesgo operacional, no de código [src/infrastructure/database/supabase/migrations/007-setup-purge-item-images-job.sql] — deferred, pre-existing
