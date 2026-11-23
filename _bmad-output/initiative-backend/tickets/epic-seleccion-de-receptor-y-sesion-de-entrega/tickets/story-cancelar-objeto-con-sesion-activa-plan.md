---
title: "Cancelar objeto con sesión activa"
type: feature
ticket: 5
status: done
created: 2026-10-25
---

# Historia 4.5: Cancelar objeto con sesión activa

Status: done

## Historia

Como donante autenticado,
quiero que al cancelar mi objeto se cancele también la sesión de entrega activa y se notifique al receptor,
para que el receptor no quede esperando sin información.

## Acceptance Criteria

1. **Dado** que envío `DELETE /items/:id` siendo el donante y el objeto tiene una sesión de entrega en estado `active`, **cuando** el servidor procesa la petición en transacción atómica, **entonces** responde `200` con mensaje de confirmación **Y** la sesión activa queda en `status = 'cancelled'` y `completed_at = NOW()` **Y** el objeto queda en `status = 'cancelled'` y `completed_at = NOW()` **Y** se envía notificación al receptor de la sesión (EVT-005 / TPL-005) tras el commit (fire-and-forget).

2. **Dado** que el objeto no tiene ninguna sesión activa, **cuando** el servidor procesa la petición, **entonces** el comportamiento es el de Historia 2.4 (cancelación simple del objeto, sin email, sin modificar sesiones).

3. **Dado** que la transacción falla en cualquier paso, **cuando** el servidor procesa la petición, **entonces** ambas actualizaciones (sesión y objeto) se revierten completamente.

4. **Dado** que envío la petición siendo autenticado pero no siendo el donante, **cuando** el servidor procesa la petición, **entonces** responde `403 Forbidden`.

5. **Dado** que el objeto no existe, **cuando** el servidor procesa la petición, **entonces** responde `404 Not Found`.

## Tasks / Subtasks

- [x] Task 1: Cambiar tipo de retorno de `cancelItem` en `IItemRepository` (AC: #1, #2)
  - [x] En `src/domain/repositories/item.repository.ts`: añadir interfaz `CancelItemResult` y cambiar firma de `cancelItem` de `Promise<void>` a `Promise<CancelItemResult>`

- [x] Task 2: Reescribir `PostgresItemRepository.cancelItem` con transacción atómica (AC: #1, #2, #3)
  - [x] En `src/infrastructure/database/supabase/item.repository.ts`: convertir a transacción con `client`
  - [x] SELECT FOR UPDATE en items + SELECT FOR UPDATE en delivery_sessions (si existe)
  - [x] Si hay sesión activa: UPDATE session a 'cancelled'; luego UPDATE item a 'cancelled'
  - [x] RETURNING `receiverId` y `itemTitle`

- [x] Task 3: Extender `CancelItemUseCase` con email fire-and-forget (AC: #1, #2)
  - [x] En `src/application/use-cases/item/cancel-item.use-case.ts`:
    - Eliminar la llamada a `hasActiveDeliverySession` y el `ConflictException` que lanzaba
    - Añadir `IUserRepository` y `IMailService` como 2º y 3er parámetros del constructor
    - Tras el commit: si `result.receiverId` existe, obtener email del receptor y enviar TPL-005 (fire-and-forget, try/catch que loguea con pino)

- [x] Task 4: Añadir TPL-005 a `resend.provider.ts` (AC: #1)
  - [x] En `src/infrastructure/email/resend.provider.ts`: añadir entrada `'TPL-005'` al objeto `templates`
  - [x] Variables requeridas: `itemTitle`

- [x] Task 5: Actualizar wiring en `items.routes.ts` (AC: #1)
  - [x] En `src/interfaces/http/routes/items.routes.ts`: actualizar `new CancelItemUseCase(itemRepo)` a `new CancelItemUseCase(itemRepo, userRepo, mailService)`

- [x] Task 6: Actualizar `tests/items-cancel.test.ts` (regresión — OBLIGATORIO) (AC: #2)
  - [x] Cambiar mock de `cancelItem: vi.fn().mockResolvedValue(undefined)` a `vi.fn().mockResolvedValue({ receiverId: undefined, itemTitle: 'Test Item' })`
  - [x] **Eliminar test 11.6** ("donante con sesión activa → 409") — ese comportamiento ya no existe
  - [x] Añadir `mailService: { send: vi.fn().mockResolvedValue(undefined) }` a `defaultDeps` si aún no está

- [x] Task 7: Nuevos tests para el caso con sesión activa (AC: #1)
  - [x] Crear `tests/items-cancel-with-session.test.ts` — casos 19.1–19.3

- [x] Task 8: Verificación
  - [x] Ejecutar `npx tsc --noEmit` sin errores
  - [x] Ejecutar `npx vitest run` — todos los tests pasan (incluyendo tests 11.x actualizados y nuevos 19.x)

### Review Findings

- [x] [Review][Patch] Double ROLLBACK: los caminos de early-exit dentro del try llaman ROLLBACK explícito antes de throw; el catch externo intenta ROLLBACK nuevamente sobre una transacción ya revertida [src/infrastructure/database/supabase/item.repository.ts]
- [x] [Review][Patch] Log label incorrecto: falla de `userRepo.findById` se registra como 'EVT-005 email send failed' cuando no se intentó ningún envío de email [src/application/use-cases/item/cancel-item.use-case.ts]
- [x] [Review][Patch] Race condition de doble cancelación: segundo request concurrente del mismo donante pasa `findItemOwnership` y luego recibe 404 en lugar de respuesta idempotente o error semántico [src/application/use-cases/item/cancel-item.use-case.ts, src/infrastructure/database/supabase/item.repository.ts]
- [x] [Review][Defer] Múltiples sesiones activas: solo se cancela `rows[0]` — deferred, invariante de aplicación garantiza una sola sesión activa por ítem [src/infrastructure/database/supabase/item.repository.ts]
- [x] [Review][Defer] Item pausado: cancelación no notifica a solicitantes pendientes — deferred, fuera del scope de esta historia [src/application/use-cases/item/cancel-item.use-case.ts]
- [x] [Review][Defer] Logger pino inicializado con `env.LOG_LEVEL` en import-time — deferred, patrón pre-existente en el proyecto [src/application/use-cases/item/cancel-item.use-case.ts]
- [x] [Review][Defer] `userRepo.findById` awaiteado demora la respuesta 200 post-commit — deferred, decisión de diseño explícita en Dev Notes del spec [src/application/use-cases/item/cancel-item.use-case.ts]

## Dev Notes

### Cambio de comportamiento: eliminación del 409 por sesión activa

**ANTES de historia 4.5** (estado actual en `CancelItemUseCase`):
```typescript
const hasActiveSession = await this.itemRepo.hasActiveDeliverySession(itemId);
if (hasActiveSession) throw new ConflictException('Object has an active delivery session');
await this.itemRepo.cancelItem(itemId);
```

**DESPUÉS de historia 4.5**:
```typescript
// hasActiveDeliverySession ya NO se llama
const result = await this.itemRepo.cancelItem(itemId); // ahora maneja ambos casos
if (result.receiverId) { /* email fire-and-forget */ }
```

La historia 4.5 transforma `CancelItemUseCase` de "rechazar si hay sesión activa" a "cancelar item Y sesión activa si existe".

---

### Task 1 — `IItemRepository`: nuevo tipo de retorno

**Archivo a MODIFICAR**: `src/domain/repositories/item.repository.ts`

**Añadir** la interfaz `CancelItemResult` y cambiar la firma de `cancelItem`:

```typescript
export interface CancelItemResult {
  receiverId?: string;
  itemTitle: string;
}

export interface IItemRepository {
  // ... interfaces existentes sin cambio ...
  cancelItem(itemId: string): Promise<CancelItemResult>;  // ← era Promise<void>
  // ... resto sin cambio ...
}
```

**`hasActiveDeliverySession` permanece en la interfaz** — aunque el use case ya no lo llama, la interfaz lo conserva para no romper mocks existentes y por ser útil para pruebas.

---

### Task 2 — `PostgresItemRepository.cancelItem`: reescritura completa

**Archivo a MODIFICAR**: `src/infrastructure/database/supabase/item.repository.ts`

**Estado actual** del método `cancelItem` (líneas 259-267):
```typescript
async cancelItem(itemId: string): Promise<void> {
  const result = await this.db.query(
    `UPDATE items SET status = 'cancelled', completed_at = NOW()
     WHERE id = $1 AND status = 'active'`,
    [itemId],
  );
  if (result.rowCount === 0) throw new NotFoundException('Object not found');
}
```

**Reemplazar completamente** con la versión transaccional:

```typescript
async cancelItem(itemId: string): Promise<CancelItemResult> {
  const client = await this.db.connect();
  try {
    await client.query('BEGIN');

    // Bloquear item y obtener datos necesarios
    const itemResult = await client.query<{ title: string; status: string }>(
      `SELECT title, status FROM items WHERE id = $1 FOR UPDATE`,
      [itemId],
    );
    if (itemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new NotFoundException('Object not found');
    }

    const { title, status } = itemResult.rows[0];
    if (!['active', 'reserved'].includes(status)) {
      await client.query('ROLLBACK');
      throw new NotFoundException('Object not found');
    }

    // Buscar sesión activa (si existe, también bloquearla)
    const sessionResult = await client.query<{ id: string; receiver_id: string }>(
      `SELECT id, receiver_id
       FROM delivery_sessions
       WHERE item_id = $1 AND status = 'active'
       FOR UPDATE`,
      [itemId],
    );

    let receiverId: string | undefined;

    if (sessionResult.rows.length > 0) {
      const session = sessionResult.rows[0];
      receiverId = session.receiver_id;

      // Cancelar sesión
      await client.query(
        `UPDATE delivery_sessions SET status = 'cancelled', completed_at = NOW() WHERE id = $1`,
        [session.id],
      );
    }

    // Cancelar el item
    await client.query(
      `UPDATE items SET status = 'cancelled', completed_at = NOW() WHERE id = $1`,
      [itemId],
    );

    await client.query('COMMIT');
    return { receiverId, itemTitle: title };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}
```

**Puntos clave**:
- `status IN ('active', 'reserved')` — un item con sesión activa está en estado `reserved` (no `active`). Ambos son cancelables.
- `FOR UPDATE` en delivery_sessions previene que la sesión cambie de estado entre el SELECT y el UPDATE
- `receiverId` es `undefined` cuando no hay sesión activa — el use case usará esto para decidir si envía email
- `itemTitle` se retorna siempre (necesario para el email cuando hay sesión)

**Import nuevo a añadir**: `CancelItemResult` desde el repositorio de dominio (ya tiene el import de `IItemRepository` y otros).

---

### Task 3 — `CancelItemUseCase`: extensión con email

**Archivo a MODIFICAR**: `src/application/use-cases/item/cancel-item.use-case.ts`

Estado actual del archivo (completo):
```typescript
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { ConflictException } from '../../../domain/exceptions/conflict.exception';
import { CancelItemResponseDto } from '../../dtos/cancel-item.dto';

export class CancelItemUseCase {
  constructor(private readonly itemRepo: IItemRepository) {}

  async execute(itemId: string, userId: string): Promise<CancelItemResponseDto> {
    const item = await this.itemRepo.findItemOwnership(itemId);
    if (!item) throw new NotFoundException('Object not found');
    if (item.donorId !== userId) throw new ForbiddenException('Forbidden');

    const hasActiveSession = await this.itemRepo.hasActiveDeliverySession(itemId);
    if (hasActiveSession) throw new ConflictException('Object has an active delivery session');

    await this.itemRepo.cancelItem(itemId);
    return { message: 'Item cancelled successfully' };
  }
}
```

**El archivo completo queda así** después de la modificación:

```typescript
import pino from 'pino';
import { env } from '../../../config/env';
import { IItemRepository } from '../../../domain/repositories/item.repository';
import { IUserRepository } from '../../../domain/repositories/user.repository';
import { IMailService } from '../../../domain/services/mail.service';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { CancelItemResponseDto } from '../../dtos/cancel-item.dto';

const logger = pino({ level: env.LOG_LEVEL });

export class CancelItemUseCase {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly userRepo: IUserRepository,
    private readonly mailService: IMailService,
  ) {}

  async execute(itemId: string, userId: string): Promise<CancelItemResponseDto> {
    const item = await this.itemRepo.findItemOwnership(itemId);
    if (!item) throw new NotFoundException('Object not found');
    if (item.donorId !== userId) throw new ForbiddenException('Forbidden');

    const result = await this.itemRepo.cancelItem(itemId);

    if (result.receiverId) {
      try {
        const receiver = await this.userRepo.findById(result.receiverId);
        if (receiver) {
          this.mailService.send({
            to: receiver.email,
            templateId: 'TPL-005',
            variables: { itemTitle: result.itemTitle },
          }).catch(err => logger.warn(err, 'EVT-005 email send failed'));
        }
      } catch (err) {
        logger.warn(err, 'EVT-005 email send failed');
      }
    }

    return { message: 'Item cancelled successfully' };
  }
}
```

**Cambios respecto al estado anterior**:
- Eliminado import de `ConflictException` (ya no se usa)
- Añadidos imports de `pino`, `env`, `IUserRepository`, `IMailService`
- Eliminadas las dos líneas de `hasActiveDeliverySession` check
- Cambiado `await this.itemRepo.cancelItem(itemId)` por `const result = await this.itemRepo.cancelItem(itemId)`
- Añadido bloque fire-and-forget de email post-commit

**Patrón fire-and-forget**: la búsqueda del receptor (`userRepo.findById`) está dentro del try/catch para que un error en la BD no rompa la respuesta 200 ya confirmada al cliente. Solo `mailService.send` es explícitamente `.catch()` (fire-and-forget puro).

---

### Task 4 — TPL-005 en `resend.provider.ts`

**Archivo a MODIFICAR**: `src/infrastructure/email/resend.provider.ts`

**Añadir** la entrada `'TPL-005'` al objeto `templates`. Insertar entre `'TPL-003'` y `'TPL-006'` (orden numérico):

```typescript
'TPL-005': {
  subject: 'Actualización sobre el objeto que ibas a recibir',
  html: (v) =>
    `<p>El donante ha cancelado el objeto <strong>${v.itemTitle}</strong>.</p>` +
    `<p>La sesión de entrega ha sido cerrada. Si estás interesado en objetos similares, sigue explorando la plataforma.</p>`,
},
```

**Variables requeridas** (email-flow-mapping §2): solo `recipientEmail` (el `to` del payload) e `itemTitle`.

---

### Task 5 — Wiring en `items.routes.ts`

**Archivo a MODIFICAR**: `src/interfaces/http/routes/items.routes.ts`

**Una sola línea a cambiar**. Buscar:
```typescript
const cancelItemUseCase = new CancelItemUseCase(itemRepo);
```

Reemplazar por:
```typescript
const cancelItemUseCase = new CancelItemUseCase(itemRepo, userRepo, mailService);
```

`userRepo` y `mailService` ya están instanciados más arriba en `createItemRouter` — no hay que importar ni instanciar nada nuevo.

---

### Task 6 — Actualización de `tests/items-cancel.test.ts` (REGRESIÓN OBLIGATORIA)

**Archivo a MODIFICAR**: `tests/items-cancel.test.ts`

**Este paso es obligatorio** — sin él, los tests de esta historia romperán todos los tests de `items-cancel.test.ts`. La interfaz de `cancelItem` cambió de `Promise<void>` a `Promise<CancelItemResult>`.

**Cambio 1**: actualizar mock de `cancelItem` en `defaultItemRepo` (línea 37 aproximadamente):
```typescript
// ANTES:
cancelItem: vi.fn().mockResolvedValue(undefined),

// DESPUÉS:
cancelItem: vi.fn().mockResolvedValue({ receiverId: undefined, itemTitle: 'Test Item' }),
```

**Cambio 2**: añadir `mailService` a `defaultDeps` si no está presente. Verificar que `defaultDeps` incluye:
```typescript
mailService: { send: vi.fn().mockResolvedValue(undefined) },
```

**Cambio 3**: eliminar el test 11.6 completo — ya no tiene sentido:
```typescript
// ELIMINAR COMPLETAMENTE:
it('11.6 — donante válido pero con sesión activa: 409', async () => {
  ...
  expect(res.status).toBe(409);
  ...
});
```

**Cambio 4**: actualizar test 11.1 — la llamada a `cancelItem` ahora recibe un argumento y retorna un objeto. Verificar que el test pasa con el nuevo mock. El expect `itemRepo.cancelItem).toHaveBeenCalledWith(ITEM_UUID)` sigue siendo válido (la firma del método no cambia, solo el retorno).

**Por qué el test 11.1 falla sin este fix**: `CancelItemUseCase.execute` ahora hace `const result = await this.itemRepo.cancelItem(...)` y luego accede a `result.receiverId`. Si el mock retorna `undefined`, `result.receiverId` lanzará `TypeError: Cannot read properties of undefined`.

---

### Task 7 — Tests para el caso con sesión activa

**Archivo NUEVO**: `tests/items-cancel-with-session.test.ts`

**Importar**: `createItemRouter`, `errorHandler`, vitest, supertest — igual que `items-cancel.test.ts`.

**UUIDs de test**:
```typescript
const USER_UUID     = '550e8400-e29b-41d4-a716-446655440000';
const ITEM_UUID     = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const RECEIVER_UUID = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';
```

**Mock de `cancelItem` con sesión activa**:
```typescript
const mockCancelWithSession = {
  receiverId: RECEIVER_UUID,
  itemTitle: 'Mesa de madera',
};
```

**mockReceiver** (usuario receptor):
```typescript
const mockReceiver = {
  id: RECEIVER_UUID, email: 'receiver@example.com', passwordHash: '...',
  postalCode: '28001', reputationScore: 10, totalReceived: 1, totalDonated: 0,
  consecutiveNoShows: 0, cyclesAtLimit: 0, lastCycleIncrementedAt: null,
  jwtVersion: 1, createdAt: new Date(), lastActiveAt: new Date(),
};
```

**Helper `buildTestApp`**:
```typescript
function buildTestApp(depOverrides = {}) {
  const app = express();
  app.use(express.json());

  const defaultItemRepo = {
    createWithImages: vi.fn(), findActiveInRadius: vi.fn(), findById: vi.fn(),
    findItemOwnership: vi.fn().mockResolvedValue({ donorId: USER_UUID, status: 'reserved', requestsPaused: false }),
    hasActiveDeliverySession: vi.fn().mockResolvedValue(true),
    cancelItem: vi.fn().mockResolvedValue(mockCancelWithSession),
    setPauseStatus: vi.fn(), findNewlyDegradedItems: vi.fn(),
  };

  const defaultDeps = {
    jwtService: { sign: vi.fn(), verify: vi.fn().mockReturnValue({ sub: USER_UUID, jwtVersion: 1 }) },
    userRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn().mockImplementation((id: string) =>
        id === RECEIVER_UUID ? Promise.resolve(mockReceiver) : Promise.resolve(mockUser)
      ),
      create: vi.fn(),
    },
    itemRepo: { ...defaultItemRepo, ...depOverrides.itemRepo },
    mailService: { send: vi.fn().mockResolvedValue(undefined) },
    storageService: { upload: vi.fn() },
    geocodingService: { geocode: vi.fn() },
    requestRepo: { create: vi.fn(), findRankedCandidates: vi.fn() },
    deliverySessionRepo: { selectReceiver: vi.fn(), findById: vi.fn(), confirmDelivery: vi.fn(), cancelDelivery: vi.fn() },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/items', createItemRouter(deps));
  app.use(errorHandler);
  return { app, itemRepo: deps.itemRepo, mailService: deps.mailService };
}
```

**Casos de test**:

| Caso | Descripción | Setup | Expect |
|------|-------------|-------|--------|
| 19.1 | Donante cancela item con sesión activa → 200 + email al receptor | cancelItem → mockCancelWithSession | `status 200`, `body.message` existe, `mailService.send` llamado con `to: 'receiver@example.com'`, `templateId: 'TPL-005'` |
| 19.2 | Email falla → sigue siendo 200 (fire-and-forget) | `mailService: { send: vi.fn().mockRejectedValue(new Error('Resend API down')) }` | `status 200` |
| 19.3 | Receptor no encontrado en userRepo → 200 sin email | `userRepo.findById` → null para RECEIVER_UUID | `status 200`, `mailService.send` NO llamado |

**Detalle test 19.1**:
```typescript
it('19.1 — cancelar item con sesión activa → 200, TPL-005 enviado al receptor', async () => {
  const { app, mailService } = buildTestApp();
  const res = await request(app)
    .delete(`/items/${ITEM_UUID}`)
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('message');
  
  // Wait for fire-and-forget
  await new Promise(resolve => setTimeout(resolve, 10));
  
  expect(mailService.send).toHaveBeenCalledWith(
    expect.objectContaining({ to: 'receiver@example.com', templateId: 'TPL-005' })
  );
});
```

**Nota sobre el await setTimeout**: el fire-and-forget del email es asíncrono — la respuesta HTTP llega ANTES de que el email se envíe. Para verificar que el email se envió en el test, se necesita un tick de event loop. `await new Promise(resolve => setTimeout(resolve, 10))` da tiempo al microtask de email.

---

### Estructura de archivos

**Archivos NUEVOS** (1):
1. `tests/items-cancel-with-session.test.ts`

**Archivos MODIFICADOS** (5):
1. `src/domain/repositories/item.repository.ts` — añadir `CancelItemResult`, cambiar firma de `cancelItem`
2. `src/infrastructure/database/supabase/item.repository.ts` — reescribir `cancelItem` con transacción
3. `src/application/use-cases/item/cancel-item.use-case.ts` — añadir params + email fire-and-forget, eliminar `ConflictException`
4. `src/infrastructure/email/resend.provider.ts` — añadir TPL-005
5. `src/interfaces/http/routes/items.routes.ts` — `new CancelItemUseCase(itemRepo, userRepo, mailService)`

**Archivo MODIFICADO (regresión)**:
6. `tests/items-cancel.test.ts` — actualizar mock de `cancelItem` + eliminar test 11.6

**Archivos que NO se tocan**:
- `src/interfaces/http/controllers/item.controller.ts` — el handler `cancelItem` no cambia (llama al use case con mismos params)
- `src/interfaces/http/routes/delivery-sessions.routes.ts` — esta historia es sobre items, no delivery sessions
- Ninguna migración SQL — no hay cambios en esquema

---

### Por qué `hasActiveDeliverySession` se conserva en `IItemRepository`

El método sigue existiendo en la interfaz aunque ya no lo llame `CancelItemUseCase`. Razones:
1. Eliminar el método requeriría también actualizar los mocks en todos los archivos de test que lo incluyen
2. Los tests de integración podrían seguir usarlo para verificar el estado de la BD
3. La interfaz quedaría "adelgazada" de forma innecesaria

El método no se elimina en esta historia.

---

### Estado de archivos al inicio de esta historia

Esta historia modifica código que existe desde historias anteriores (2.4, 1.2, etc.). Verificar:
- `src/application/use-cases/item/cancel-item.use-case.ts` existe y tiene el import `ConflictException` y la llamada `hasActiveDeliverySession`
- `src/infrastructure/database/supabase/item.repository.ts` tiene `cancelItem` como UPDATE simple sin transacción
- `tests/items-cancel.test.ts` tiene el test 11.6 con `hasActiveDeliverySession: vi.fn().mockResolvedValue(true)` y `expect(res.status).toBe(409)`

---

### Referencias

- FR11 (extensión): cancelar objeto con sesión activa — [Source: _bmad-output/initiative-backend/archive-v6/epics.md — FR11, Historia 4.5]
- Arquitectura §12.3: secuencia de cancelación con sesión — [Source: docs/architecture.md:863-882]
- EVT-005/TPL-005: email al receptor — [Source: docs/email-flow-mapping.md — §1 y §2]
- Patrón fire-and-forget: [Source: src/application/use-cases/item/request-item.use-case.ts]
- Estado actual de `cancelItem`: [Source: src/infrastructure/database/supabase/item.repository.ts:259-267]
- Estado actual de `CancelItemUseCase`: [Source: src/application/use-cases/item/cancel-item.use-case.ts]
- Tests regresión: [Source: tests/items-cancel.test.ts:133-148]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

(ninguno)

### Completion Notes List

- Añadida interfaz `CancelItemResult` en dominio y cambiada la firma de `cancelItem` de `Promise<void>` a `Promise<CancelItemResult>`.
- `PostgresItemRepository.cancelItem` reescrito con transacción atómica: bloquea item y sesión activa con SELECT FOR UPDATE, cancela ambos en un solo commit, retorna `receiverId` e `itemTitle`.
- `CancelItemUseCase` extendido con `IUserRepository` e `IMailService`; se eliminó el check de `hasActiveDeliverySession` y el `ConflictException`. Post-commit envía TPL-005 al receptor (fire-and-forget con try/catch que loguea con pino).
- TPL-005 añadido a `resend.provider.ts` entre TPL-003 y TPL-006.
- Wiring en `items.routes.ts` actualizado para pasar `userRepo` y `mailService` al constructor de `CancelItemUseCase`.
- `tests/items-cancel.test.ts`: mock de `cancelItem` actualizado a `{ receiverId: undefined, itemTitle: 'Test Item' }`, añadido `mailService` a `defaultDeps`, eliminado test 11.6.
- Nuevo archivo `tests/items-cancel-with-session.test.ts` con casos 19.1–19.3 (200 + email, email fallido sigue 200, receptor no encontrado sin email).
- TypeScript sin errores; 157 tests en 21 archivos — todos pasan.

### File List

- `src/domain/repositories/item.repository.ts` — añadida `CancelItemResult`, firma de `cancelItem` actualizada
- `src/infrastructure/database/supabase/item.repository.ts` — `cancelItem` reescrito con transacción atómica, import de `CancelItemResult`
- `src/application/use-cases/item/cancel-item.use-case.ts` — reescrito: nuevos deps, email fire-and-forget, eliminado 409
- `src/infrastructure/email/resend.provider.ts` — añadida TPL-005
- `src/interfaces/http/routes/items.routes.ts` — wiring actualizado con `userRepo` y `mailService`
- `tests/items-cancel.test.ts` — mock actualizado, test 11.6 eliminado, `mailService` añadido
- `tests/items-cancel-with-session.test.ts` — nuevo archivo con casos 19.1–19.3

## Change Log

- 2026-05-13: Historia creada — ready-for-dev.
- 2026-05-13: Implementación completada — todos los ACs satisfechos, 157 tests pasan.
