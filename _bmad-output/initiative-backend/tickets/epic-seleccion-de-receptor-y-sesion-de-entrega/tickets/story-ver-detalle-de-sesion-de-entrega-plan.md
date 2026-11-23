---
title: "Ver detalle de sesión de entrega"
type: feature
ticket: 2
status: done
created: 2026-10-25
---

# Historia 4.2: Ver detalle de sesión de entrega

Status: done

## Historia

Como donante o receptor autenticado,
quiero poder consultar el detalle de una sesión de entrega por su ID,
para conocer su estado, el deadline y el canal de contacto si corresponde.

## Acceptance Criteria

1. **Dado** que envío `GET /delivery-sessions/:id` siendo el donante o el receptor de la sesión, **cuando** el servidor procesa la petición, **entonces** responde `200` con `{ id, itemId, status, contactChannel, deadlineAt, donorConfirmed, noShowDeclared, createdAt, completedAt }`.

2. **Dado** que el solicitante es el receptor, la sesión está en estado `active` y `contact_purged = FALSE`, **cuando** el servidor procesa la petición, **entonces** el campo `contactChannel` incluye el valor real del canal de contacto.

3. **Dado** que el solicitante es el donante, o la sesión no está en estado `active`, o `contact_purged = TRUE`, **cuando** el servidor procesa la petición, **entonces** el campo `contactChannel` retorna `null`.

4. **Dado** que envío la petición siendo autenticado pero no siendo ni donante ni receptor de la sesión, **cuando** el servidor procesa la petición, **entonces** responde `403 Forbidden`.

5. **Dado** que envío `GET /delivery-sessions/:id` con un UUID que no existe en la base de datos, **cuando** el servidor procesa la petición, **entonces** responde `404 Not Found`.

6. **Dado** que envío `GET /delivery-sessions/:id` con un `:id` que no es un UUID v4 válido, **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request`.

## Tasks / Subtasks

- [x] Task 1: Extender `IDeliverySessionRepository` con `findById` (AC: #1–#5)
  - [x] En `src/domain/repositories/delivery-session.repository.ts`: añadir interfaz `DeliverySessionDetail` y método `findById`

- [x] Task 2: Implementar `PostgresDeliverySessionRepository.findById` (AC: #1, #5)
  - [x] En `src/infrastructure/database/supabase/delivery-session.repository.ts`: añadir método `findById` (SELECT simple, sin transacción)

- [x] Task 3: DTO de respuesta (AC: #1–#3)
  - [x] Crear `src/application/dtos/get-delivery-session.dto.ts`

- [x] Task 4: `GetDeliverySessionUseCase` (AC: #1–#5)
  - [x] Crear `src/application/use-cases/delivery-session/get-delivery-session.use-case.ts`
  - [x] Verificar existencia (404), verificar participación (403), aplicar lógica de visibilidad de `contactChannel`

- [x] Task 5: `DeliverySessionController` (AC: #1)
  - [x] Crear `src/interfaces/http/controllers/delivery-session.controller.ts`
  - [x] Método `getDeliverySession`: try/catch, `req.currentUser!.id`, `res.status(200).json(result)`

- [x] Task 6: Router `delivery-sessions.routes.ts` (AC: #1, #4, #6)
  - [x] Crear `src/interfaces/http/routes/delivery-sessions.routes.ts`
  - [x] Seguir exactamente el patrón `DeliverySessionRouterDeps` + `createDeliverySessionRouter(deps)` + `export const deliverySessionRouter = createDeliverySessionRouter()`
  - [x] Única ruta: `GET /:id` con `authMiddleware`, `validateUuidParam('id')`

- [x] Task 7: Registrar router en index (AC: #1)
  - [x] En `src/interfaces/http/routes/index.ts`: importar `deliverySessionRouter` y añadir `router.use('/delivery-sessions', deliverySessionRouter)`

- [x] Task 8: Tests (AC: #1–#6)
  - [x] Crear `tests/delivery-sessions-get.test.ts` — 8 tests (16.1–16.8), todos pasan

- [x] Task 9: Verificación
  - [x] Ejecutar `npx tsc --noEmit` sin errores
  - [x] Ejecutar `npx vitest run` — 138 tests pasan (0 regresiones)

### Review Findings

- [x] [Review][Patch] `status: string` en el DTO debe ser el union type `'active' | 'completed' | 'cancelled' | 'expired'` [src/application/dtos/get-delivery-session.dto.ts:3]
- [x] [Review][Defer] Escenario de auto-donación (donorId === receiverId) expone contactChannel al donante — deferred, pre-existing — concern pertenece a la creación de sesiones (historia 4-1)
- [x] [Review][Defer] Ambigüedad cuando contactChannel es null en DB con sesión activa y no purgada: receptor no puede distinguir "canal nunca provisto" de "canal oculto" — deferred, pre-existing — decisión de producto
- [x] [Review][Defer] Sin garantía compile-time de exclusión de donorId/receiverId del DTO: un futuro spread podría filtrar esos campos [src/application/dtos/get-delivery-session.dto.ts] — deferred, pre-existing
- [x] [Review][Defer] sessionId sin validación de formato en capa repositorio [src/infrastructure/database/supabase/delivery-session.repository.ts] — deferred, pre-existing — patrón consistente con el codebase
- [x] [Review][Defer] Singleton deliverySessionRouter instanciado en module load con dependencias de producción [src/interfaces/http/routes/delivery-sessions.routes.ts:41] — deferred, pre-existing — patrón idéntico a itemRouter y authRouter
- [x] [Review][Defer] req.currentUser! sin guard de runtime en controller [src/interfaces/http/controllers/delivery-session.controller.ts:13] — deferred, pre-existing — patrón consistente en todos los controllers
- [x] [Review][Defer] Test 16.1 usa ausencia de campos en vez de assertion del set exacto de keys [tests/delivery-sessions-get.test.ts:94] — deferred, pre-existing — mejora de calidad de tests
- [x] [Review][Defer] Sin test para contactChannel=null con sesión activa y no purgada [tests/delivery-sessions-get.test.ts] — deferred, pre-existing — bajo riesgo dado que el flujo normal garantiza contactChannel no nulo
- [x] [Review][Defer] Remoción de validateUuidParam causaría DatabaseError → 500 en lugar de 400 [src/infrastructure/database/supabase/delivery-session.repository.ts] — deferred, pre-existing — patrón de todos los repos

## Dev Notes

### Arquitectura de la historia

Esta historia introduce el primer endpoint bajo `/delivery-sessions`, que requiere un router completamente nuevo. El patrón de separación es idéntico al establecido en historias previas:

- **Repository** (`findById`): SELECT puro, sin transacción, retorna null si no existe
- **Use case**: lógica de autorización (participación) + lógica de visibilidad del contactChannel
- **Controller**: thin layer, try/catch, delega todo al use case

**Por qué la lógica de visibilidad va en el use case** (no en el repo): El repo expone el valor crudo de `contact_channel`. El use case decide si ese valor se incluye en el DTO basándose en identidad del solicitante y estado de la sesión. Esto es lógica de negocio (FR20, arquitectura §12.2), no lógica de acceso a datos.

---

### Task 1 — Extender `IDeliverySessionRepository`

**Archivo a MODIFICAR**: `src/domain/repositories/delivery-session.repository.ts`

Estado actual del archivo (al inicio de la historia):
```typescript
export interface SelectReceiverInput {
  itemId: string;
  requestId: string;
  donorId: string;
  contactChannel: string;
}

export interface SelectReceiverResult {
  sessionId: string;
  status: 'active';
  deadlineAt: Date;
  receiverId: string;
  itemTitle: string;
  itemCondition: string;
}

export interface IDeliverySessionRepository {
  selectReceiver(input: SelectReceiverInput): Promise<SelectReceiverResult>;
}
```

**Añadir** la interfaz `DeliverySessionDetail` y el método `findById`. El archivo debe quedar:
```typescript
export interface SelectReceiverInput {
  itemId: string;
  requestId: string;
  donorId: string;
  contactChannel: string;
}

export interface SelectReceiverResult {
  sessionId: string;
  status: 'active';
  deadlineAt: Date;
  receiverId: string;
  itemTitle: string;
  itemCondition: string;
}

export interface DeliverySessionDetail {
  id: string;
  itemId: string;
  donorId: string;
  receiverId: string;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  contactChannel: string | null;
  contactPurged: boolean;
  donorConfirmed: boolean;
  noShowDeclared: boolean;
  deadlineAt: Date;
  createdAt: Date;
  completedAt: Date | null;
}

export interface IDeliverySessionRepository {
  selectReceiver(input: SelectReceiverInput): Promise<SelectReceiverResult>;
  findById(sessionId: string): Promise<DeliverySessionDetail | null>;
}
```

**Nota crítica**: `donorId` y `receiverId` están en `DeliverySessionDetail` para que el use case pueda verificar la participación. No aparecerán en el DTO de respuesta HTTP.

---

### Task 2 — `PostgresDeliverySessionRepository.findById`

**Archivo a MODIFICAR**: `src/infrastructure/database/supabase/delivery-session.repository.ts`

**Añadir** el método `findById` a la clase existente (que ya tiene `selectReceiver`). El método es un SELECT simple, sin transacción ni FOR UPDATE — solo lectura.

```typescript
async findById(sessionId: string): Promise<DeliverySessionDetail | null> {
  const result = await this.db.query<{
    id: string;
    item_id: string;
    donor_id: string;
    receiver_id: string;
    status: 'active' | 'completed' | 'cancelled' | 'expired';
    contact_channel: string | null;
    contact_purged: boolean;
    donor_confirmed: boolean;
    no_show_declared: boolean;
    deadline_at: Date;
    created_at: Date;
    completed_at: Date | null;
  }>(
    `SELECT id, item_id, donor_id, receiver_id, status, contact_channel, contact_purged,
            donor_confirmed, no_show_declared, deadline_at, created_at, completed_at
     FROM delivery_sessions
     WHERE id = $1`,
    [sessionId],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    itemId: row.item_id,
    donorId: row.donor_id,
    receiverId: row.receiver_id,
    status: row.status,
    contactChannel: row.contact_channel,
    contactPurged: row.contact_purged,
    donorConfirmed: row.donor_confirmed,
    noShowDeclared: row.no_show_declared,
    deadlineAt: row.deadline_at,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}
```

**Nota**: usar `this.db.query(...)` directamente (no `this.db.connect()`) — sin transacción para lectura simple. Este es el patrón usado en `item.repository.ts` para `findById` y `findActiveInRadius`.

**Nota sobre imports**: añadir `DeliverySessionDetail` a los imports desde `delivery-session.repository`.

---

### Task 3 — DTO de respuesta

**Archivo NUEVO**: `src/application/dtos/get-delivery-session.dto.ts`

```typescript
export interface GetDeliverySessionResponseDto {
  id: string;
  itemId: string;
  status: string;
  contactChannel: string | null;
  deadlineAt: Date;
  donorConfirmed: boolean;
  noShowDeclared: boolean;
  createdAt: Date;
  completedAt: Date | null;
}
```

**Qué NO está en el DTO**: `donorId`, `receiverId`, `contactPurged` — son campos internos usados por el use case para la lógica de autorización y visibilidad, pero no deben exponerse en la respuesta HTTP.

---

### Task 4 — `GetDeliverySessionUseCase`

**Archivo NUEVO**: `src/application/use-cases/delivery-session/get-delivery-session.use-case.ts`

```typescript
import { IDeliverySessionRepository } from '../../../domain/repositories/delivery-session.repository';
import { ForbiddenException } from '../../../domain/exceptions/forbidden.exception';
import { NotFoundException } from '../../../domain/exceptions/not-found.exception';
import { GetDeliverySessionResponseDto } from '../../dtos/get-delivery-session.dto';

export class GetDeliverySessionUseCase {
  constructor(
    private readonly deliverySessionRepo: IDeliverySessionRepository,
  ) {}

  async execute(
    sessionId: string,
    currentUserId: string,
  ): Promise<GetDeliverySessionResponseDto> {
    const session = await this.deliverySessionRepo.findById(sessionId);
    if (!session) throw new NotFoundException('Sesión no encontrada');

    const isParticipant =
      session.donorId === currentUserId || session.receiverId === currentUserId;
    if (!isParticipant) throw new ForbiddenException('Forbidden');

    const revealContactChannel =
      currentUserId === session.receiverId &&
      session.status === 'active' &&
      !session.contactPurged;

    return {
      id: session.id,
      itemId: session.itemId,
      status: session.status,
      contactChannel: revealContactChannel ? session.contactChannel : null,
      deadlineAt: session.deadlineAt,
      donorConfirmed: session.donorConfirmed,
      noShowDeclared: session.noShowDeclared,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
    };
  }
}
```

**Lógica de contactChannel** (arquitectura §12.2):
- Se revela **solo** si las tres condiciones se cumplen simultáneamente: solicitante es receptor, sesión activa, `contact_purged = FALSE`
- El donante **nunca** recibe el campo real (fue él quien lo introdujo; la arquitectura lo prohíbe explícitamente)
- `contactPurged = TRUE` → null aunque el receptor acceda y la sesión esté activa

---

### Task 5 — `DeliverySessionController`

**Archivo NUEVO**: `src/interfaces/http/controllers/delivery-session.controller.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { GetDeliverySessionUseCase } from '../../../application/use-cases/delivery-session/get-delivery-session.use-case';

export class DeliverySessionController {
  constructor(
    private readonly getDeliverySessionUseCase: GetDeliverySessionUseCase,
  ) {}

  async getDeliverySession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.getDeliverySessionUseCase.execute(
        req.params.id,
        req.currentUser!.id,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
```

**Patrón idéntico** a los handlers en `item.controller.ts`: try/catch, `req.currentUser!.id` (non-null assertion pre-existente en todos los controladores — no introducir nada nuevo).

---

### Task 6 — Router `delivery-sessions.routes.ts`

**Archivo NUEVO**: `src/interfaces/http/routes/delivery-sessions.routes.ts`

Seguir **exactamente** el patrón de `auth.routes.ts` (interfaz de deps + función factory + export de instancia default):

```typescript
import { Router } from 'express';
import { db } from '../../../infrastructure/database/supabase/db';
import { JwtService } from '../../../infrastructure/security/jwt.service';
import { PostgresUserRepository } from '../../../infrastructure/database/supabase/user.repository';
import { PostgresDeliverySessionRepository } from '../../../infrastructure/database/supabase/delivery-session.repository';
import { GetDeliverySessionUseCase } from '../../../application/use-cases/delivery-session/get-delivery-session.use-case';
import { DeliverySessionController } from '../controllers/delivery-session.controller';
import { createAuthMiddleware } from '../middlewares/auth.middleware';
import { validateUuidParam } from '../../validators/uuid-param.validator';
import { IDeliverySessionRepository } from '../../../domain/repositories/delivery-session.repository';
import { IJwtService } from '../../../application/services/jwt.service';
import { IUserRepository } from '../../../domain/repositories/user.repository';

export interface DeliverySessionRouterDeps {
  deliverySessionRepo?: IDeliverySessionRepository;
  jwtService?: IJwtService;
  userRepo?: IUserRepository;
}

export function createDeliverySessionRouter(deps: DeliverySessionRouterDeps = {}): Router {
  const jwtService = deps.jwtService ?? new JwtService();
  const userRepo = deps.userRepo ?? new PostgresUserRepository(db);
  const deliverySessionRepo = deps.deliverySessionRepo ?? new PostgresDeliverySessionRepository(db);

  const authMiddleware = createAuthMiddleware(jwtService, userRepo);
  const getDeliverySessionUseCase = new GetDeliverySessionUseCase(deliverySessionRepo);
  const controller = new DeliverySessionController(getDeliverySessionUseCase);

  const router = Router();

  router.get(
    '/:id',
    authMiddleware,
    validateUuidParam('id'),
    (req, res, next) => controller.getDeliverySession(req, res, next),
  );

  return router;
}

export const deliverySessionRouter = createDeliverySessionRouter();
```

---

### Task 7 — Registro en `index.ts`

**Archivo a MODIFICAR**: `src/interfaces/http/routes/index.ts`

Estado actual del archivo (4 líneas relevantes):
```typescript
import { Router } from 'express';
import { healthRouter } from './health.routes';
import { authRouter } from './auth.routes';
import { itemRouter } from './items.routes';
...
router.use(healthRouter);
router.use('/auth', authRouter);
router.use('/items', itemRouter);
```

**Añadir** la importación y el `router.use`. El archivo queda:
```typescript
import { Router } from 'express';
import { healthRouter } from './health.routes';
import { authRouter } from './auth.routes';
import { itemRouter } from './items.routes';
import { deliverySessionRouter } from './delivery-sessions.routes';
import { db } from '../../../infrastructure/database/supabase/db';
import { JwtService } from '../../../infrastructure/security/jwt.service';
import { PostgresUserRepository } from '../../../infrastructure/database/supabase/user.repository';
import { createAuthMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(healthRouter);
router.use('/auth', authRouter);
router.use('/items', itemRouter);
router.use('/delivery-sessions', deliverySessionRouter);

export { router };

export const authMiddleware = createAuthMiddleware(
  new JwtService(),
  new PostgresUserRepository(db),
);
```

---

### Task 8 — Tests

**Archivo NUEVO**: `tests/delivery-sessions-get.test.ts`

**Patrón de test**: igual a `tests/items-select.test.ts`: `createDeliverySessionRouter(deps)` montado en `express()`, mocks de repo vía `vi.fn()`, `supertest`.

**UUIDs de test**:
```typescript
const USER_UUID     = '550e8400-e29b-41d4-a716-446655440000';
const DONOR_UUID    = '660e8400-e29b-41d4-a716-446655440001';
const SESSION_UUID  = '11111111-2222-4333-8444-555555555555';
const ITEM_UUID     = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
```

**Mock de sesión base** (para reusar en tests):
```typescript
const mockSession = {
  id: SESSION_UUID,
  itemId: ITEM_UUID,
  donorId: DONOR_UUID,
  receiverId: USER_UUID,   // USER_UUID es el receptor por defecto
  status: 'active' as const,
  contactChannel: 'Telegram: @donante',
  contactPurged: false,
  donorConfirmed: false,
  noShowDeclared: false,
  deadlineAt: new Date('2026-05-20T02:00:00.000Z'),
  createdAt: new Date('2026-05-13T02:00:00.000Z'),
  completedAt: null,
};
```

**Helper `buildTestApp`**:
```typescript
function buildTestApp(depOverrides = {}) {
  const app = express();
  app.use(express.json());

  const defaultDeps = {
    jwtService: {
      sign: vi.fn(),
      verify: vi.fn().mockReturnValue({ sub: USER_UUID, jwtVersion: 1 }),
    },
    userRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn().mockResolvedValue(mockUser),
      create: vi.fn(),
    },
    deliverySessionRepo: {
      selectReceiver: vi.fn(),
      findById: vi.fn().mockResolvedValue(mockSession),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/delivery-sessions', createDeliverySessionRouter(deps));
  app.use(errorHandler);
  return { app, deliverySessionRepo: deps.deliverySessionRepo };
}
```

**Casos de test a implementar**:

| Caso | Descripción | Setup | Expect |
|------|-------------|-------|--------|
| 16.1 | Donante accede → 200, contactChannel null | `findById` → sesión con `donorId = USER_UUID` (USER_UUID es quien hace la petición) | `status 200`, `contactChannel === null` |
| 16.2 | Receptor accede, activa, no purgada → 200, contactChannel incluido | sesión base (USER_UUID es receiver, status active, contactPurged false) | `status 200`, `contactChannel === 'Telegram: @donante'` |
| 16.3 | Receptor accede pero sesión completed → 200, contactChannel null | sesión con `status: 'completed'` | `status 200`, `contactChannel === null` |
| 16.4 | Receptor accede, activa, contact_purged true → 200, contactChannel null | sesión con `contactPurged: true` | `status 200`, `contactChannel === null` |
| 16.5 | Usuario no participa → 403 | sesión con `donorId` y `receiverId` distintos a `USER_UUID` | `status 403` |
| 16.6 | Sesión no existe → 404 | `findById` → null | `status 404` |
| 16.7 | ID no es UUID v4 → 400 | URL `/delivery-sessions/not-a-uuid` | `status 400` |
| 16.8 | Sin autenticación → 401 | sin header `Authorization` | `status 401` |

**Detalle del test 16.1** (donante accede — caso especial, leer con atención):
```typescript
it('16.1 — donante accede → 200, contactChannel null', async () => {
  const { app } = buildTestApp({
    deliverySessionRepo: {
      selectReceiver: vi.fn(),
      findById: vi.fn().mockResolvedValue({
        ...mockSession,
        donorId: USER_UUID,       // quien hace la petición ES el donante
        receiverId: DONOR_UUID,   // el receptor es otro usuario
      }),
    },
  });
  const res = await request(app)
    .get(`/delivery-sessions/${SESSION_UUID}`)
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(200);
  expect(res.body.contactChannel).toBeNull();
  expect(res.body).toHaveProperty('id', SESSION_UUID);
  expect(res.body).toHaveProperty('itemId', ITEM_UUID);
  expect(res.body).toHaveProperty('status', 'active');
  expect(res.body).not.toHaveProperty('donorId');
  expect(res.body).not.toHaveProperty('receiverId');
  expect(res.body).not.toHaveProperty('contactPurged');
});
```

**Detalle del test 16.2** (receptor con visibilidad completa):
```typescript
it('16.2 — receptor accede, sesión activa, no purgada → 200, contactChannel incluido', async () => {
  const { app } = buildTestApp();
  // mockSession ya tiene receiverId = USER_UUID, status = 'active', contactPurged = false
  const res = await request(app)
    .get(`/delivery-sessions/${SESSION_UUID}`)
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(200);
  expect(res.body.contactChannel).toBe('Telegram: @donante');
});
```

---

### Estructura de archivos

**Archivos NUEVOS** (6):
1. `src/application/dtos/get-delivery-session.dto.ts`
2. `src/application/use-cases/delivery-session/get-delivery-session.use-case.ts`
3. `src/interfaces/http/controllers/delivery-session.controller.ts`
4. `src/interfaces/http/routes/delivery-sessions.routes.ts`
5. `tests/delivery-sessions-get.test.ts`

**Archivos MODIFICADOS** (3):
1. `src/domain/repositories/delivery-session.repository.ts` — añadir `DeliverySessionDetail` + `findById`
2. `src/infrastructure/database/supabase/delivery-session.repository.ts` — añadir método `findById`
3. `src/interfaces/http/routes/index.ts` — importar y registrar `deliverySessionRouter`

**Archivos que NO se tocan**:
- `items.routes.ts`, `item.controller.ts` — esta historia no toca el dominio de items
- Ninguna migración SQL — la tabla `delivery_sessions` ya fue creada en la migración 009 (historia 4.1)
- `resend.provider.ts` — esta historia no envía emails

---

### Verificar que la migración 009 existe

Antes de implementar, confirmar que `src/infrastructure/database/supabase/migrations/009-create-delivery-sessions.sql` existe (creado en historia 4.1). Si no existe, la implementación de `findById` funcionará en tests (por mocks) pero fallará en producción. **No crear la migración aquí** — pertenece a la historia 4.1.

---

### Convenciones del proyecto a mantener

- **Directorio de use cases**: `src/application/use-cases/delivery-session/` — nuevo subdirectorio bajo `use-cases/` (similar a `use-cases/item/` y `use-cases/user/`)
- **Naming de archivos**: `get-delivery-session.use-case.ts`, `delivery-session.controller.ts`, `delivery-sessions.routes.ts` (plural en routes, singular en controller y use case)
- **No hay validators de body** para esta historia — GET sin body, solo UUID param (ya manejado por `validateUuidParam`)
- **No hay rate limit específico** — este endpoint no está listado en arquitectura §11 con rate limit especial; aplica solo el global de `app.ts`

---

### No se agrega migración SQL

La tabla `delivery_sessions` fue creada en la migración 009 (historia 4.1). Esta historia solo lee de esa tabla. No crear ningún archivo de migración.

### No hay emails

Esta historia no dispara ningún email. No tocar `resend.provider.ts`.

### Referencias

- FR20: visibilidad de contactChannel — [Source: _bmad-output/initiative-backend/archive-v6/epics.md — FR20]
- Arquitectura §12.2: reglas de autorización GetDeliverySession — [Source: docs/architecture.md:842-859]
- Schema delivery_sessions: [Source: _bmad-output/initiative-backend/tickets/epic-seleccion-de-receptor-y-sesion-de-entrega/tickets/story-seleccionar-receptor-para-un-objeto-plan.md — Task 1]
- Patrón factory router: [Source: src/interfaces/http/routes/auth.routes.ts]
- Patrón test con createRouter: [Source: tests/items-select.test.ts]
- Patrón findById sin transacción: [Source: src/infrastructure/database/supabase/item.repository.ts — findById]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

(ninguno)

### Completion Notes List

- Extendida `IDeliverySessionRepository` con `DeliverySessionDetail` y `findById`. `donorId`/`receiverId` en el detail solo para uso interno del use case — no se exponen en HTTP.
- `findById` usa `this.db.query` directamente (sin pool client ni transacción) — patrón de lectura simple igual que `item.repository.ts:findById`.
- Lógica de visibilidad de `contactChannel` en el use case: se revela únicamente si `currentUserId === session.receiverId && status === 'active' && !contactPurged` (tres condiciones simultáneas). El donante nunca recibe el valor real.
- Router creado bajo `/delivery-sessions` con patrón `createDeliverySessionRouter(deps)` idéntico a `auth.routes.ts`. Registrado en `index.ts`.
- 8 tests (16.1–16.8) cubren todos los ACs: donante sin contactChannel, receptor con visibilidad, sesión completada, contact_purged, no participa, 404, UUID inválido, 401. Total: 138 tests, 0 regresiones.
- `npx tsc --noEmit` sin errores.

### File List

- `src/domain/repositories/delivery-session.repository.ts` (modificado — `DeliverySessionDetail` + `findById`)
- `src/infrastructure/database/supabase/delivery-session.repository.ts` (modificado — método `findById`)
- `src/application/dtos/get-delivery-session.dto.ts` (nuevo)
- `src/application/use-cases/delivery-session/get-delivery-session.use-case.ts` (nuevo)
- `src/interfaces/http/controllers/delivery-session.controller.ts` (nuevo)
- `src/interfaces/http/routes/delivery-sessions.routes.ts` (nuevo)
- `src/interfaces/http/routes/index.ts` (modificado — import + registro `/delivery-sessions`)
- `tests/delivery-sessions-get.test.ts` (nuevo)

## Change Log

- 2026-05-13: Historia creada — ready-for-dev.
- 2026-05-13: Implementación completa — router `/delivery-sessions`, use case con lógica de visibilidad de contactChannel, 8 tests nuevos (138 totales, 0 regresiones).
