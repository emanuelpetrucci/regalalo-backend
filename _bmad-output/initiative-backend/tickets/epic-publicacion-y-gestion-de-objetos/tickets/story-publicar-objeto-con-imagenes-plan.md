---
title: "Publicar objeto con imágenes"
type: feature
ticket: 1
status: done
created: 2026-10-25
---

# Story 2.1: Publicar objeto con imágenes

Status: done

## Story

Como donante autenticado,
quiero poder publicar un objeto con título, descripción, condición, código postal y hasta 5 imágenes,
para que los receptores de mi zona puedan solicitarlo.

## Acceptance Criteria

1. **Dado** que envío `POST /items` (multipart/form-data) con título, descripción, condición, código postal válido y hasta 5 imágenes cada una ≤ 2 MB, **cuando** el servidor procesa la petición, **entonces** responde `201` con `{ id, title, status: "active", createdAt }`, se crean registros en `items` e `item_images` con `storage_path` para cada imagen en Supabase Storage, y la `location` del objeto se geocodifica desde el `postalCode` del payload.

2. **Dado** que envío `POST /items` con más de 5 imágenes, **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request`.

3. **Dado** que envío `POST /items` con una imagen que supera 2 MB, **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request`.

4. **Dado** que envío `POST /items` con un código postal no geocodificable, **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request`.

5. **Dado** que envío `POST /items` sin token de autenticación, **cuando** el servidor procesa la petición, **entonces** responde `401 Unauthorized`.

## Tasks / Subtasks

- [x] Task 1: Instalar dependencias y añadir variables de entorno (AC: #1)
  - [x] Ejecutar `npm install multer @supabase/supabase-js` y `npm install -D @types/multer`
  - [x] Añadir `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` a `src/config/env.ts` usando `required()`
  - [x] Añadir los mismos tres vars (con valores dummy) al bloque `env:` de `vitest.config.ts`
  - [x] Añadir los tres vars a `.env.example` como documentación

- [x] Task 2: Crear migraciones SQL (AC: #1)
  - [x] Crear `src/infrastructure/database/supabase/migrations/003-create-items.sql` con tabla `items` (ver Dev Notes)
  - [x] Crear `src/infrastructure/database/supabase/migrations/004-create-item-images-and-storage-queue.sql` con tablas `item_images`, `storage_deletion_queue`, función `fn_queue_storage_deletion` y trigger `trg_queue_storage_deletion` (ver Dev Notes)

- [x] Task 3: Capa de Dominio (AC: #1)
  - [x] Crear `src/domain/entities/item.entity.ts` con `ItemCondition`, `ItemStatus` y la interfaz `Item`
  - [x] Crear `src/domain/repositories/item.repository.ts` con `IItemRepository` (método `createWithImages`)
  - [x] Crear `src/domain/services/storage.service.ts` con `IStorageService` (método `upload`)

- [x] Task 4: Capa de Aplicación (AC: #1, #4)
  - [x] Crear `src/application/dtos/publish-item.dto.ts`
  - [x] Crear `src/application/use-cases/item/publish-item.use-case.ts` con flujo upload-first (geocode → upload a Storage → transacción DB)

- [x] Task 5: Capa de Infraestructura (AC: #1)
  - [x] Crear `src/infrastructure/database/supabase/item.repository.ts` con `PostgresItemRepository.createWithImages` (transacción BEGIN/COMMIT/ROLLBACK, ST_MakePoint con lng primero)
  - [x] Crear `src/infrastructure/storage/supabase-storage.adapter.ts` con `SupabaseStorageAdapter` usando `@supabase/supabase-js`

- [x] Task 6: Capa de Interfaces (AC: #1, #2, #3, #5)
  - [x] Crear `src/interfaces/validators/publish-item.validator.ts` con Zod (title, description, condition enum, postalCode)
  - [x] Crear `src/interfaces/http/controllers/item.controller.ts` con `ItemController.publishItem`
  - [x] Crear `src/interfaces/http/routes/items.routes.ts` con `createItemRouter(deps)` (factory pattern — auth middleware recreado internamente, NO importado de `index.ts`)
  - [x] Modificar `src/interfaces/http/middlewares/error-handler.ts`: añadir handler de `multer.MulterError` antes del bloque `BadRequestException`
  - [x] Modificar `src/interfaces/http/routes/index.ts`: montar `itemRouter` en `/items`

- [x] Task 7: Tests (AC: #1–#5)
  - [x] Crear `tests/items-publish.test.ts` con los 9 casos de prueba (ver Dev Notes)
  - [x] Ejecutar `npx tsc --noEmit` sin errores
  - [x] Ejecutar `npx vitest run` — todos los tests pasan

### Review Findings

- [x] [Review][Patch] `NominatimAdapter.geocode()` lanza en lugar de devolver `null` para código postal no encontrado — cambiar para que devuelva `null` cuando Nominatim retorna resultados vacíos o coordenadas inválidas (errores HTTP siguen lanzando) [src/infrastructure/geocoding/nominatim.adapter.ts:31-36]

- [x] [Review][Patch] `GeocodingException` lanzada sin mensaje en `publish-item.use-case.ts` — `throw new GeocodingException()` sin argumento; el cliente recibe `{ "message": "" }` mientras que `register-user.use-case.ts` pasa un mensaje descriptivo [src/application/use-cases/item/publish-item.use-case.ts:23]

- [x] [Review][Patch] `ROLLBACK` en el catch de `createWithImages` no está en try/catch — si la conexión cae, el error del ROLLBACK sobreescribe el error original y `client.release()` libera una conexión rota al pool [src/infrastructure/database/supabase/item.repository.ts:57]

- [x] [Review][Defer] Storage orphans en fallo de upload mid-loop [src/application/use-cases/item/publish-item.use-case.ts:28] — deferred, aceptado explícitamente para MVP por spec
- [x] [Review][Defer] `condition` sin CHECK constraint en DB [src/infrastructure/database/supabase/migrations/003-create-items.sql:6] — deferred, validación en capa de aplicación por diseño
- [x] [Review][Defer] `item_images` sin ON DELETE CASCADE [src/infrastructure/database/supabase/migrations/004-create-item-images-and-storage-queue.sql] — deferred, eliminación de items fuera de scope actual
- [x] [Review][Defer] Tipo MIME tomado del Content-Type del cliente (no de magic bytes) [src/interfaces/http/routes/items.routes.ts:31] — deferred, hardening de seguridad, fuera de scope MVP
- [x] [Review][Defer] `upsert: false` en Storage no es idempotente en reintentos [src/infrastructure/storage/supabase-storage.adapter.ts:11] — deferred, requiere cambio de diseño mayor
- [x] [Review][Defer] Nominatim sin rate-limiting (429 → `GeocodingException`) [src/infrastructure/geocoding/nominatim.adapter.ts] — deferred, concern pre-existente en todos los flujos de geocodificación
- [x] [Review][Defer] INSERTs de `item_images` secuenciales dentro de transacción [src/infrastructure/database/supabase/item.repository.ts:34] — deferred, optimización de performance, aceptable para MVP (máx. 5 imágenes)
- [x] [Review][Defer] `multer limits.files:5` cuenta archivos de todos los campos del form, no solo `images` [src/interfaces/http/routes/items.routes.ts:29] — deferred, edge case menor
- [x] [Review][Defer] Todos los buffers de archivos en heap simultáneamente (hasta 10 MB por request) [src/application/use-cases/item/publish-item.use-case.ts:28] — deferred, inherente al diseño memoryStorage
- [x] [Review][Defer] `SupabaseStorageAdapter` crea cliente Supabase completo (incluye WebSocket realtime) para uso solo de Storage [src/infrastructure/storage/supabase-storage.adapter.ts:6] — deferred, ineficiencia menor
- [x] [Review][Defer] `req.currentUser!` non-null assertion sin guard de runtime [src/interfaces/http/controllers/item.controller.ts:11] — deferred, patrón pre-existente en el codebase
- [x] [Review][Defer] `upload` multer instanciado a nivel de módulo (fuera de `createItemRouter`) [src/interfaces/http/routes/items.routes.ts:28] — deferred, concern de testabilidad, no impacta tests actuales

## Dev Notes

### Nuevas Dependencias

```bash
npm install multer @supabase/supabase-js
npm install -D @types/multer
```

`multer` gestiona `multipart/form-data`. `@supabase/supabase-js` es el cliente oficial del Supabase Storage (se usa solo para Storage en esta historia; las queries SQL siguen usando `pg` directamente). [Source: docs/architecture.md#infrastructure/storage]

### Variables de Entorno — añadir a `src/config/env.ts`

```typescript
SUPABASE_URL: required('SUPABASE_URL'),
SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
SUPABASE_STORAGE_BUCKET: required('SUPABASE_STORAGE_BUCKET'),
```

Las tres usan `required()` (sin fallback). Sin ellas el servidor no arranca.

**Además de `src/config/env.ts`, añadir también a `vitest.config.ts`** en el bloque `env:` (con valores dummy para tests):
```typescript
SUPABASE_URL: 'https://test.supabase.co',
SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-that-is-long-enough',
SUPABASE_STORAGE_BUCKET: 'test-bucket',
```
Sin esto, `env.ts` lanzará al importar el módulo en los tests (aunque `SupabaseStorageAdapter` esté mockeado, el módulo se importa igualmente). [Source: vitest.config.ts]

**Y añadir a `.env.example`** (documentación):
```
# Supabase Storage (Historia 2.1)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=items
```

### Migraciones SQL

**`003-create-items.sql`** — tabla `items` con `requests_paused` (añadido en delta-backend.md):

```sql
CREATE TABLE IF NOT EXISTS items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id        UUID NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  condition       TEXT NOT NULL,
  location        GEOGRAPHY(POINT, 4326) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','reserved','completed','cancelled')),
  requests_paused BOOLEAN NOT NULL DEFAULT FALSE,
  degraded_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reserved_at     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_items_location ON items USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_degraded
  ON items(status, created_at)
  WHERE status = 'active' AND degraded_at IS NULL;
```

**`004-create-item-images-and-storage-queue.sql`**:

```sql
CREATE TABLE IF NOT EXISTS item_images (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES items(id),
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS storage_deletion_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION fn_queue_storage_deletion()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO storage_deletion_queue (storage_path)
  VALUES (OLD.storage_path);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_queue_storage_deletion
AFTER DELETE ON item_images
FOR EACH ROW EXECUTE FUNCTION fn_queue_storage_deletion();

CREATE INDEX IF NOT EXISTS idx_item_images_item ON item_images(item_id);
CREATE INDEX IF NOT EXISTS idx_storage_deletion_queue_pending
  ON storage_deletion_queue(created_at)
  WHERE processed_at IS NULL;
```

[Source: docs/architecture.md §3.2, §3.3, §3.8, §4; docs/delta-backend.md]

### Capa de Dominio

**`src/domain/entities/item.entity.ts`:**
```typescript
export type ItemCondition = 'new' | 'like_new' | 'good' | 'fair';
export type ItemStatus = 'active' | 'reserved' | 'completed' | 'cancelled';

export interface Item {
  id: string;
  donorId: string;
  title: string;
  description: string;
  condition: ItemCondition;
  status: ItemStatus;
  requestsPaused: boolean;
  degradedAt: Date | null;
  createdAt: Date;
  reservedAt: Date | null;
  completedAt: Date | null;
}
```

**`src/domain/repositories/item.repository.ts`:**
```typescript
import { Item, ItemCondition } from '../entities/item.entity';

export interface CreateItemInput {
  id: string;
  donorId: string;
  title: string;
  description: string;
  condition: ItemCondition;
  lat: number;
  lng: number;
  imagePaths: string[];
}

export interface IItemRepository {
  createWithImages(input: CreateItemInput): Promise<Item>;
}
```

**`src/domain/services/storage.service.ts`:**
```typescript
export interface IStorageService {
  upload(buffer: Buffer, mimeType: string, storagePath: string): Promise<void>;
}
```

### Capa de Aplicación

**`src/application/dtos/publish-item.dto.ts`:**
```typescript
import { ItemCondition } from '../../domain/entities/item.entity';

export interface PublishItemFileDto {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface PublishItemRequestDto {
  donorId: string;
  title: string;
  description: string;
  condition: ItemCondition;
  postalCode: string;
  files: PublishItemFileDto[];
}

export interface PublishItemResponseDto {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
}
```

**`src/application/use-cases/item/publish-item.use-case.ts`** — flujo upload-first:

```typescript
import { randomUUID } from 'crypto';
import { GeocodingException } from '../../../domain/exceptions/geocoding.exception';
import { IGeocodingService } from '../../services/geocoding.service';
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { IStorageService } from '../../../domain/services/storage.service';
import { PublishItemRequestDto, PublishItemResponseDto } from '../../dtos/publish-item.dto';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
};

export class PublishItemUseCase {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly storageService: IStorageService,
    private readonly geocodingService: IGeocodingService,
  ) {}

  async execute(dto: PublishItemRequestDto): Promise<PublishItemResponseDto> {
    const coords = await this.geocodingService.geocode(dto.postalCode);
    if (!coords) throw new GeocodingException();

    const itemId = randomUUID();
    const imagePaths: string[] = [];

    for (const file of dto.files) {
      const ext = MIME_TO_EXT[file.mimetype] ?? 'bin';
      const storagePath = `items/${itemId}/${randomUUID()}.${ext}`;
      await this.storageService.upload(file.buffer, file.mimetype, storagePath);
      imagePaths.push(storagePath);
    }

    const item = await this.itemRepo.createWithImages({
      id: itemId,
      donorId: dto.donorId,
      title: dto.title,
      description: dto.description,
      condition: dto.condition,
      lat: coords.lat,
      lng: coords.lon,  // IGeocodingService retorna { lat, lon } — campo es "lon" no "lng"
      imagePaths,
    });

    return { id: item.id, title: item.title, status: item.status, createdAt: item.createdAt };
  }
}
```

**Estrategia upload-first:** Se suben imágenes a Storage ANTES de la transacción DB. Si la transacción falla, los archivos quedan huérfanos en Storage (aceptado para MVP). Si una subida falla, las imágenes ya subidas también quedan huérfanas (aceptado para MVP). El mecanismo `storage_deletion_queue` + trigger cubre únicamente la purga programada por `pg_cron`.

### Capa de Infraestructura

**`src/infrastructure/database/supabase/item.repository.ts`:**
```typescript
import { Pool } from 'pg';
import { IItemRepository, CreateItemInput } from '../../../domain/repositories/item.repository';
import { Item } from '../../../domain/entities/item.entity';

export class PostgresItemRepository implements IItemRepository {
  constructor(private readonly db: Pool) {}

  async createWithImages(input: CreateItemInput): Promise<Item> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<{
        id: string; donor_id: string; title: string; description: string;
        condition: string; status: string; requests_paused: boolean;
        degraded_at: Date | null; created_at: Date;
        reserved_at: Date | null; completed_at: Date | null;
      }>(
        `INSERT INTO items (id, donor_id, title, description, condition, location, status)
         VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326), 'active')
         RETURNING id, donor_id, title, description, condition, status,
                   requests_paused, degraded_at, created_at, reserved_at, completed_at`,
        [input.id, input.donorId, input.title, input.description, input.condition,
         input.lng, input.lat],  // ST_MakePoint(lng, lat) — lng PRIMERO
      );

      for (const storagePath of input.imagePaths) {
        await client.query(
          'INSERT INTO item_images (item_id, storage_path) VALUES ($1, $2)',
          [input.id, storagePath],
        );
      }

      await client.query('COMMIT');
      const row = result.rows[0];
      return {
        id: row.id,
        donorId: row.donor_id,
        title: row.title,
        description: row.description,
        condition: row.condition as Item['condition'],
        status: row.status as Item['status'],
        requestsPaused: row.requests_paused,
        degradedAt: row.degraded_at,
        createdAt: row.created_at,
        reservedAt: row.reserved_at,
        completedAt: row.completed_at,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
```

**CRÍTICO: ST_MakePoint($lng, $lat)** — longitud es el primer parámetro, latitud el segundo. En la query: `$6 = input.lng`, `$7 = input.lat`. [Source: docs/architecture.md §3.2]

**CRÍTICO: `IGeocodingService.geocode()` retorna `{ lat: number; lon: number }` — el campo es `lon`, NO `lng`.** Usar `coords.lon` al construir el input del repositorio. [Source: src/application/services/geocoding.service.ts]

**`src/infrastructure/storage/supabase-storage.adapter.ts`:**
```typescript
import { createClient } from '@supabase/supabase-js';
import { env } from '../../../config/env';
import { IStorageService } from '../../../domain/services/storage.service';

export class SupabaseStorageAdapter implements IStorageService {
  private readonly client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  async upload(buffer: Buffer, mimeType: string, storagePath: string): Promise<void> {
    const { error } = await this.client.storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  }
}
```

### Capa de Interfaces

**`src/interfaces/validators/publish-item.validator.ts`** — Zod sobre campos del `req.body` (multer ya habrá parseado el multipart):

```typescript
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

const publishItemSchema = z.object({
  title:       z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  condition:   z.enum(['new', 'like_new', 'good', 'fair']),
  postalCode:  z.string().min(1).max(10),
});

export function validatePublishItemBody(req: Request, res: Response, next: NextFunction): void {
  const result = publishItemSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
```

**`src/interfaces/http/controllers/item.controller.ts`:**

```typescript
import { Request, Response, NextFunction } from 'express';
import { PublishItemUseCase } from '../../../application/use-cases/item/publish-item.use-case';

export class ItemController {
  constructor(private readonly publishItemUseCase: PublishItemUseCase) {}

  async publishItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const result = await this.publishItemUseCase.execute({
        donorId: req.currentUser!.id,
        title: req.body.title,
        description: req.body.description,
        condition: req.body.condition,
        postalCode: req.body.postalCode,
        files: files.map((f) => ({ buffer: f.buffer, mimetype: f.mimetype, originalname: f.originalname })),
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
}
```

**`src/interfaces/http/routes/items.routes.ts`** — factory con auth middleware propio (no importado de `index.ts` para evitar dependencia circular):

```typescript
import { Router } from 'express';
import multer from 'multer';
import { db } from '../../../infrastructure/database/supabase/db';
import { JwtService } from '../../../infrastructure/security/jwt.service';
import { PostgresUserRepository } from '../../../infrastructure/database/supabase/user.repository';
import { PostgresItemRepository } from '../../../infrastructure/database/supabase/item.repository';
import { SupabaseStorageAdapter } from '../../../infrastructure/storage/supabase-storage.adapter';
import { NominatimAdapter } from '../../../infrastructure/geocoding/nominatim.adapter';
import { PublishItemUseCase } from '../../../application/use-cases/item/publish-item.use-case';
import { ItemController } from '../controllers/item.controller';
import { createAuthMiddleware } from '../middlewares/auth.middleware';
import { validatePublishItemBody } from '../../validators/publish-item.validator';
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { IStorageService } from '../../../domain/services/storage.service';
import { IGeocodingService } from '../../../application/services/geocoding.service';
import { IJwtService } from '../../../application/services/jwt.service';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { BadRequestException } from '../../../domain/exceptions/bad-request.exception';

export interface ItemRouterDeps {
  itemRepo?: IItemRepository;
  storageService?: IStorageService;
  geocodingService?: IGeocodingService;
  jwtService?: IJwtService;
  userRepo?: IUserRepository;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException('Tipo de archivo no permitido'));
    }
  },
});

export function createItemRouter(deps: ItemRouterDeps = {}): Router {
  const jwtService   = deps.jwtService   ?? new JwtService();
  const userRepo     = deps.userRepo     ?? new PostgresUserRepository(db);
  const itemRepo     = deps.itemRepo     ?? new PostgresItemRepository(db);
  const storage      = deps.storageService ?? new SupabaseStorageAdapter();
  const geocoding    = deps.geocodingService ?? new NominatimAdapter();

  const authMiddleware    = createAuthMiddleware(jwtService, userRepo);
  const publishItemUseCase = new PublishItemUseCase(itemRepo, storage, geocoding);
  const controller         = new ItemController(publishItemUseCase);

  const router = Router();

  router.post(
    '/',
    authMiddleware,
    upload.array('images', 5),
    validatePublishItemBody,
    (req, res, next) => controller.publishItem(req, res, next),
  );

  return router;
}

export const itemRouter = createItemRouter();
```

**`src/interfaces/http/middlewares/error-handler.ts`** — añadir handler MulterError ANTES del bloque BadRequestException:

```typescript
import multer from 'multer';

// Añadir al inicio del errorHandler, antes de `if (err instanceof BadRequestException)`:
if (err instanceof multer.MulterError) {
  res.status(400).json({ message: err.message });
  return;
}
```

**`src/interfaces/http/routes/index.ts`** — montar itemRouter:

```typescript
import { itemRouter } from './items.routes';
// ...
router.use('/items', itemRouter);
```

### Patrón de Dependency Injection en items.routes.ts

El auth middleware se crea **dentro** de `createItemRouter()` (NO importado de `index.ts`) porque `index.ts` importará `items.routes.ts`, lo que crearía una dependencia circular. Ver `auth.routes.ts` como referencia — mismo patrón. [Source: src/interfaces/http/routes/auth.routes.ts]

### Tests — `tests/items-publish.test.ts`

Estructura: misma arquitectura que `tests/auth-password-reset.test.ts` (buildTestApp con deps inyectadas).

**Mock de usuario autenticado:** el `jwtService.verify` devuelve `{ userId, jwtVersion: 1 }` y `userRepo.findById` devuelve `mockUser`. Sin header Authorization → `authMiddleware` llama `next(new UnauthorizedException())` → 401.

**Adjuntar archivos en supertest:** usar `.attach('images', Buffer.from('x'.repeat(100)), { filename: 'a.jpg', contentType: 'image/jpeg' })`. Para simular >2MB: `Buffer.alloc(2 * 1024 * 1024 + 1)`.

**Casos de prueba (9):**

| # | Descripción | Esperado |
|---|-------------|----------|
| 8.1 | Request válido con 1 imagen | 201 `{ id, title, status: "active", createdAt }` |
| 8.2 | Request válido con 5 imágenes | 201 |
| 8.3 | Sin token de autenticación | 401 |
| 8.4 | Más de 5 imágenes (`LIMIT_FILE_COUNT`) | 400 |
| 8.5 | Imagen > 2MB (`LIMIT_FILE_SIZE`) | 400 |
| 8.6 | Código postal no geocodificable (`geocode` devuelve null) | 400 |
| 8.7 | Body inválido (falta `title`) | 400 |
| 8.8 | Storage falla (`storageService.upload` rechaza) | 500 |
| 8.9 | Sin imágenes (0 archivos adjuntos) | 201 |

**Test 8.1 — ejemplo completo:**
```typescript
it('8.1 — valid request 1 image: responds 201 with { id, title, status, createdAt }', async () => {
  const { app } = buildTestApp();
  const res = await request(app)
    .post('/items')
    .set('Authorization', 'Bearer mock-jwt-token')
    .field('title', 'Silla de madera')
    .field('description', 'En buen estado')
    .field('condition', 'good')
    .field('postalCode', '28001')
    .attach('images', Buffer.from('fake-image-data'), { filename: 'photo.jpg', contentType: 'image/jpeg' });

  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({
    id: expect.any(String),
    title: 'Silla de madera',
    status: 'active',
    createdAt: expect.any(String),
  });
});
```

**Importante en `buildTestApp`:** el mock de `userRepo` para auth middleware necesita `findById` (no `findByEmail`). El payload del JWT usa `sub` (no `userId`) para el ID de usuario — ver `auth.middleware.ts`:
```typescript
userRepo: {
  findByEmail: vi.fn(),
  findById: vi.fn().mockResolvedValue(mockUser),
  create: vi.fn(),
},
jwtService: {
  sign: vi.fn(),
  verify: vi.fn().mockReturnValue({ sub: mockUser.id, jwtVersion: 1 }),
  //                                 ^^^  NO "userId" — el middleware lee payload['sub']
},
```

`mockUser.jwtVersion` debe ser `1` para que `user.jwtVersion === jwtVersion` sea true. [Source: src/interfaces/http/middlewares/auth.middleware.ts]

### Project Structure Notes

- **`src/infrastructure/storage/`** — directorio nuevo; seguir convención de otros adaptadores de infraestructura (`src/infrastructure/geocoding/nominatim.adapter.ts`). [Source: docs/architecture.md §2]
- **`src/application/use-cases/item/`** — crear subdirectorio `item/` dentro de `use-cases/`. Misma convención que `user/`.
- **`src/domain/services/storage.service.ts`** — interfaz de dominio para el servicio de storage. Mismo patrón que `src/domain/services/mail.service.ts`.
- El `itemRouter` singleton al final de `items.routes.ts` (línea `export const itemRouter = createItemRouter()`) solo se instancia cuando el módulo se importa en producción; en tests se usa `createItemRouter(deps)` con mocks.

### References

- [Source: docs/architecture.md §3.2] — Schema `items` (con `requests_paused` de delta-backend.md)
- [Source: docs/architecture.md §3.3] — Schema `item_images`
- [Source: docs/architecture.md §3.8] — Schema `storage_deletion_queue` + trigger
- [Source: docs/architecture.md §4] — Índices
- [Source: docs/delta-backend.md] — Columna `requests_paused BOOLEAN NOT NULL DEFAULT FALSE`
- [Source: docs/architecture.md §2] — Estructura de directorios Clean Architecture
- [Source: src/interfaces/http/routes/auth.routes.ts] — Patrón factory `createAuthRouter(deps)`
- [Source: src/interfaces/http/middlewares/auth.middleware.ts] — `createAuthMiddleware(jwtService, userRepo)`
- [Source: src/application/use-cases/user/forgot-password.use-case.ts] — Patrón use case con servicios inyectados
- [Source: _bmad-output/initiative-backend/archive-v6/epics.md §Historia 2.1] — AC completos de la historia

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (bmad-dev-story, 2026-05-06)

### Debug Log References

- Ruta de imports en `supabase-storage.adapter.ts` corregida: `../../../` → `../../` (la carpeta `storage` está a 2 niveles de `src/`, no 3)
- `IGeocodingService.geocode` actualizado a retornar `| null` para soporte de test 8.6 y type-safety; `RegisterUserUseCase` y `NominatimAdapter` actualizados consecuentemente

### Completion Notes List

- Implementada historia completa `POST /items` con multipart/form-data (multer + Supabase Storage)
- Flujo upload-first: geocodificación → subida de imágenes a Storage → transacción DB atómica (BEGIN/COMMIT/ROLLBACK)
- Factory pattern en `createItemRouter(deps)` para testabilidad sin dependencia circular con `index.ts`
- `multer.MulterError` manejado en `error-handler.ts` antes del bloque `BadRequestException`
- 9 tests (8.1–8.9) cubren todos los ACs: 201 con 1 y 5 imágenes, 401 sin token, 400 por límite de archivos, límite de tamaño, código postal inválido, body inválido, 500 por fallo de storage, 201 sin imágenes
- `npx tsc --noEmit`: sin errores
- `npx vitest run`: 64 tests pasando (0 fallos, 0 regresiones)

### File List

- `src/config/env.ts` (modificado)
- `vitest.config.ts` (modificado)
- `.env.example` (modificado)
- `src/infrastructure/database/supabase/migrations/003-create-items.sql` (nuevo)
- `src/infrastructure/database/supabase/migrations/004-create-item-images-and-storage-queue.sql` (nuevo)
- `src/domain/entities/item.entity.ts` (nuevo)
- `src/domain/repositories/item.repository.ts` (nuevo)
- `src/domain/services/storage.service.ts` (nuevo)
- `src/application/dtos/publish-item.dto.ts` (nuevo)
- `src/application/use-cases/item/publish-item.use-case.ts` (nuevo)
- `src/application/services/geocoding.service.ts` (modificado — retorno nullable)
- `src/application/use-cases/user/register-user.use-case.ts` (modificado — null check geocoding)
- `src/infrastructure/database/supabase/item.repository.ts` (nuevo)
- `src/infrastructure/storage/supabase-storage.adapter.ts` (nuevo)
- `src/infrastructure/geocoding/nominatim.adapter.ts` (modificado — firma nullable)
- `src/interfaces/validators/publish-item.validator.ts` (nuevo)
- `src/interfaces/http/controllers/item.controller.ts` (nuevo)
- `src/interfaces/http/routes/items.routes.ts` (nuevo)
- `src/interfaces/http/middlewares/error-handler.ts` (modificado — MulterError handler)
- `src/interfaces/http/routes/index.ts` (modificado — monta /items)
- `tests/items-publish.test.ts` (nuevo)

### Change Log

- feat: implementar POST /items — publicar objeto con imágenes (Historia 2.1) — 2026-05-06
