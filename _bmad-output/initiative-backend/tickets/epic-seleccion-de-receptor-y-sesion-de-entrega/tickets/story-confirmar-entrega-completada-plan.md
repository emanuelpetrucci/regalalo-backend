---
title: "Confirmar entrega completada"
type: feature
ticket: 3
status: done
created: 2026-10-25
---

# Historia 4.3: Confirmar entrega completada

Status: done

## Historia

Como donante autenticado,
quiero poder confirmar que la entrega se realizó exitosamente,
para cerrar la sesión, actualizar la reputación de ambas partes y registrar el evento.

## Acceptance Criteria

1. **Dado** que envío `POST /delivery-sessions/:id/confirm` siendo el donante y la sesión en estado `active` con `donor_confirmed = FALSE`, **cuando** el servidor procesa la petición en transacción atómica, **entonces** responde `200` con `{ status: "completed", completedAt }` **Y** `donor_confirmed = TRUE`, `status = 'completed'`, `completed_at = NOW()` **Y** `reputation_score += 10` para donante y receptor **Y** `total_donated += 1` para el donante y `total_received += 1` para el receptor **Y** `consecutive_no_shows = 0` para ambos **Y** se registran dos eventos en `reputation_events` (tipo `delivery_completed`, delta `+10`) para cada usuario.

2. **Dado** que la sesión no está en estado `active`, **cuando** el servidor procesa la petición, **entonces** responde `409 Conflict`.

3. **Dado** que `donor_confirmed` ya es `TRUE`, **cuando** el servidor procesa la petición, **entonces** responde `409 Conflict` (previene doble confirmación).

4. **Dado** que envío la petición siendo autenticado pero no siendo el donante de la sesión, **cuando** el servidor procesa la petición, **entonces** responde `403 Forbidden`.

5. **Dado** que envío `POST /delivery-sessions/:id/confirm` con un UUID que no existe, **cuando** el servidor procesa la petición, **entonces** responde `404 Not Found`.

6. **Dado** que envío `POST /delivery-sessions/:id/confirm` con un `:id` que no es UUID v4 válido, **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request`.

## Tasks / Subtasks

- [x] Task 1: Migración SQL — crear tabla `reputation_events` e índice (AC: #1)
  - [x] Crear `src/infrastructure/database/supabase/migrations/010-create-reputation-events.sql`
  - [x] Incluir tabla `reputation_events` completa (ver Dev Notes para SQL exacto)
  - [x] Incluir índice `idx_reputation_events_user`

- [x] Task 2: Extender `IDeliverySessionRepository` con `confirmDelivery` (AC: #1–#5)
  - [x] En `src/domain/repositories/delivery-session.repository.ts`: añadir interfaz `ConfirmDeliveryResult` y método `confirmDelivery`

- [x] Task 3: Implementar `PostgresDeliverySessionRepository.confirmDelivery` (AC: #1–#5)
  - [x] En `src/infrastructure/database/supabase/delivery-session.repository.ts`: añadir método con transacción atómica completa
  - [x] Toda la lógica de verificación y actualización va dentro de la transacción (SELECT FOR UPDATE → checks → UPDATEs → INSERT reputation_events)

- [x] Task 4: DTO de respuesta (AC: #1)
  - [x] Crear `src/application/dtos/confirm-delivery.dto.ts`

- [x] Task 5: `ConfirmDeliveryUseCase` (AC: #1–#5)
  - [x] Crear `src/application/use-cases/delivery-session/confirm-delivery.use-case.ts`
  - [x] Use case trivialmente delega al repo: no hay lógica de negocio fuera de la transacción

- [x] Task 6: Extender `DeliverySessionController` (AC: #1)
  - [x] En `src/interfaces/http/controllers/delivery-session.controller.ts`:
    - Añadir `ConfirmDeliveryUseCase` como 2º parámetro del constructor
    - Añadir método `confirmDelivery(req, res, next)`

- [x] Task 7: Extender router `delivery-sessions.routes.ts` (AC: #1, #4, #6)
  - [x] En `src/interfaces/http/routes/delivery-sessions.routes.ts`:
    - Importar `ConfirmDeliveryUseCase`
    - Instanciar `confirmDeliveryUseCase` dentro de `createDeliverySessionRouter`
    - Actualizar `new DeliverySessionController(...)` para incluir el 2º parámetro
    - Añadir ruta `POST /:id/confirm` con `authMiddleware`, `validateUuidParam('id')`

- [x] Task 8: Tests (AC: #1–#6)
  - [x] Crear `tests/delivery-sessions-confirm.test.ts` — ver Dev Notes para casos exactos (17.1–17.7)

- [x] Task 9: Verificación
  - [x] Ejecutar `npx tsc --noEmit` sin errores
  - [x] Ejecutar `npx vitest run` — todos los tests pasan

### Review Findings

**Decision Needed:** (todas resueltas)
- [x] [Review][Decision] Ítem asociado no transiciona a `'completed'` — DESCARTADO: intencional, el ítem se gestiona en una historia posterior
- [x] [Review][Decision] Columna `delta` sin CHECK de límites — DESCARTADO: sin constraint, se confía en la app
- [x] [Review][Decision] FK `session_id` sin `ON DELETE` — DESCARTADO: RESTRICT intencional
- [x] [Review][Decision] FK `user_id` sin `ON DELETE` — DESCARTADO: RESTRICT intencional
- [x] [Review][Decision] `completedAt` tipado como `Date` → convertido a PATCH: cambiar a `string` + `.toISOString()` en controller

**Patches:**
- [x] [Review][Patch] Doble ROLLBACK en paths de error — cada guard llama `client.query('ROLLBACK')` antes de throw; el outer catch también intenta ROLLBACK. Eliminar los ROLLBACK explícitos dentro de los guards y dejar solo el del catch exterior [src/infrastructure/database/supabase/delivery-session.repository.ts]
- [x] [Review][Patch] `updateResult.rows[0]` accedido sin null check — un DELETE concurrente entre el `SELECT FOR UPDATE` y el `UPDATE RETURNING` deja `rows` vacío y lanza TypeError en producción [src/infrastructure/database/supabase/delivery-session.repository.ts]
- [x] [Review][Patch] Sin test para sesión en estado `'expired'` → 409 — el test 17.2 solo cubre `completed`; `expired` es un estado válido que también debe devolver 409 pero no está cubierto [tests/delivery-sessions-confirm.test.ts]
- [x] [Review][Patch] Test 17.1 no verifica que `completedAt` sea un ISO string válido — `toHaveProperty('completedAt')` pasa con `null`, `0` o string vacío [tests/delivery-sessions-confirm.test.ts]
- [x] [Review][Patch] Sin índice en `session_id` en `reputation_events` — queries de auditoría por sesión requieren full table scan; `session_id` es FK sin índice de soporte [src/infrastructure/database/supabase/migrations/010-create-reputation-events.sql]
- [x] [Review][Patch] `ConfirmDeliveryResponseDto.completedAt` tipado como `Date` en vez de `string` — cambiar tipo a `string` y llamar `.toISOString()` en use case [src/application/dtos/confirm-delivery.dto.ts, src/application/use-cases/delivery-session/confirm-delivery.use-case.ts]

**Deferred:**
- [x] [Review][Defer] `receiver_id` potencialmente NULL antes de usarlo en UPDATEs y INSERT — por diseño, `delivery_sessions` siempre se crea con receptor (historia 4.1); FK probable garantiza NOT NULL — deferred, pre-existente
- [x] [Review][Defer] Donor/receiver borrados mid-transacción — FK constraints sobre `delivery_sessions` deberían prevenir borrado mientras hay sesión activa — deferred, pre-existente
- [x] [Review][Defer] `ConfirmDeliveryUseCase` es pass-through puro — patrón arquitectónico establecido en el proyecto; thin use cases que delegan al repo — deferred, pre-existente
- [x] [Review][Defer] `SESSION_UUID` y `mockUser` duplicados entre archivos de test — deuda técnica pre-existente; corresponde a shared fixtures — deferred, pre-existente

## Dev Notes

### Naturaleza de esta historia

Esta historia introduce `reputation_events`, la única tabla del esquema que aún no existía en ninguna migración. Es crítica — sin ella, el INSERT en el Task 3 fallará en producción.

**No hay email en esta historia**. El `email-flow-mapping.md` no lista ningún EVT para la confirmación de entrega. `ConfirmDeliveryUseCase` no toca `IMailService`.

**Toda la lógica de autorización va en el repo** (no en el use case): la sesión se bloquea con `FOR UPDATE`, las verificaciones se hacen sobre la fila bloqueada, y las actualizaciones siguen inmediatamente. No hay window de TOCTOU. Este patrón es idéntico al de `selectReceiver` en historia 4.1.

---

### Task 1 — Migración 010: `reputation_events`

**Archivo NUEVO**: `src/infrastructure/database/supabase/migrations/010-create-reputation-events.sql`

```sql
CREATE TABLE IF NOT EXISTS reputation_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL
             CHECK (type IN ('delivery_completed','no_show')),
  delta      INTEGER NOT NULL,
  session_id UUID REFERENCES delivery_sessions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reputation_events_user
  ON reputation_events(user_id);
```

**Notas**:
- `session_id` es `REFERENCES delivery_sessions(id)` sin `NOT NULL` — el schema de arquitectura §3.6 no exige NOT NULL
- `type CHECK` admite exactamente dos valores: `'delivery_completed'` y `'no_show'` — no añadir más
- Esta tabla es exclusivamente de auditoría — `reputation_score` en `users` es la fuente de verdad operativa
- El índice `idx_reputation_events_user` es el definido en arquitectura §4

---

### Task 2 — Extender `IDeliverySessionRepository`

**Archivo a MODIFICAR**: `src/domain/repositories/delivery-session.repository.ts`

Estado actual del archivo después de historia 4.2 (completo):
```typescript
export interface SelectReceiverInput {
  itemId: string; requestId: string; donorId: string; contactChannel: string;
}
export interface SelectReceiverResult {
  sessionId: string; status: 'active'; deadlineAt: Date;
  receiverId: string; itemTitle: string; itemCondition: string;
}
export interface DeliverySessionDetail {
  id: string; itemId: string; donorId: string; receiverId: string;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  contactChannel: string | null; contactPurged: boolean;
  donorConfirmed: boolean; noShowDeclared: boolean;
  deadlineAt: Date; createdAt: Date; completedAt: Date | null;
}
export interface IDeliverySessionRepository {
  selectReceiver(input: SelectReceiverInput): Promise<SelectReceiverResult>;
  findById(sessionId: string): Promise<DeliverySessionDetail | null>;
}
```

**Añadir** `ConfirmDeliveryResult` e incluir `confirmDelivery` en la interfaz:

```typescript
export interface ConfirmDeliveryResult {
  completedAt: Date;
}

export interface IDeliverySessionRepository {
  selectReceiver(input: SelectReceiverInput): Promise<SelectReceiverResult>;
  findById(sessionId: string): Promise<DeliverySessionDetail | null>;
  confirmDelivery(sessionId: string, donorId: string): Promise<ConfirmDeliveryResult>;
}
```

---

### Task 3 — `PostgresDeliverySessionRepository.confirmDelivery`

**Archivo a MODIFICAR**: `src/infrastructure/database/supabase/delivery-session.repository.ts`

**Añadir** el método `confirmDelivery` a la clase existente. El método usa una transacción atómica completa con SELECT FOR UPDATE:

```typescript
async confirmDelivery(sessionId: string, donorId: string): Promise<ConfirmDeliveryResult> {
  const client = await this.db.connect();
  try {
    await client.query('BEGIN');

    const sessionResult = await client.query<{
      donor_id: string;
      receiver_id: string;
      status: string;
      donor_confirmed: boolean;
    }>(
      `SELECT donor_id, receiver_id, status, donor_confirmed
       FROM delivery_sessions
       WHERE id = $1
       FOR UPDATE`,
      [sessionId],
    );

    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new NotFoundException('Sesión no encontrada');
    }

    const { donor_id, receiver_id, status, donor_confirmed } = sessionResult.rows[0];

    if (donor_id !== donorId) {
      await client.query('ROLLBACK');
      throw new ForbiddenException('Forbidden');
    }
    if (status !== 'active') {
      await client.query('ROLLBACK');
      throw new ConflictException('Session is not active');
    }
    if (donor_confirmed) {
      await client.query('ROLLBACK');
      throw new ConflictException('Delivery already confirmed');
    }

    // Cerrar la sesión
    const updateResult = await client.query<{ completed_at: Date }>(
      `UPDATE delivery_sessions
       SET donor_confirmed = TRUE, status = 'completed', completed_at = NOW()
       WHERE id = $1
       RETURNING completed_at`,
      [sessionId],
    );

    // Actualizar reputación del donante
    await client.query(
      `UPDATE users
       SET reputation_score = reputation_score + 10,
           consecutive_no_shows = 0,
           total_donated = total_donated + 1
       WHERE id = $1`,
      [donor_id],
    );

    // Actualizar reputación del receptor
    await client.query(
      `UPDATE users
       SET reputation_score = reputation_score + 10,
           consecutive_no_shows = 0,
           total_received = total_received + 1
       WHERE id = $1`,
      [receiver_id],
    );

    // Registrar eventos de reputación para ambos
    await client.query(
      `INSERT INTO reputation_events (user_id, type, delta, session_id) VALUES
         ($1, 'delivery_completed', 10, $3),
         ($2, 'delivery_completed', 10, $3)`,
      [donor_id, receiver_id, sessionId],
    );

    await client.query('COMMIT');

    return { completedAt: updateResult.rows[0].completed_at };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}
```

**Imports nuevos a añadir** en este archivo: `NotFoundException` desde `../../../domain/exceptions/not-found.exception` y `ConfirmDeliveryResult` desde la interfaz.

**Imports ya existentes** (no duplicar): `ForbiddenException`, `ConflictException`, `Pool`, `IDeliverySessionRepository`, `SelectReceiverInput`, `SelectReceiverResult`.

**Orden de las verificaciones** (crítico — seguir exactamente):
1. Existencia (`rows.length === 0`) → NotFoundException
2. Donante (`donor_id !== donorId`) → ForbiddenException
3. Estado (`status !== 'active'`) → ConflictException
4. Ya confirmado (`donor_confirmed === TRUE`) → ConflictException

**Por qué dos UPDATEs separados para users** (no uno con CASE): claridad y mantenibilidad. Las columnas que se actualizan son distintas (`total_donated` vs `total_received`). Un CASE en un solo UPDATE funciona, pero la versión con dos UPDATEs es más legible y consistente con el estilo del proyecto.

---

### Task 4 — DTO de respuesta

**Archivo NUEVO**: `src/application/dtos/confirm-delivery.dto.ts`

```typescript
export interface ConfirmDeliveryResponseDto {
  status: 'completed';
  completedAt: Date;
}
```

---

### Task 5 — `ConfirmDeliveryUseCase`

**Archivo NUEVO**: `src/application/use-cases/delivery-session/confirm-delivery.use-case.ts`

```typescript
import { IDeliverySessionRepository } from '../../../domain/repositories/delivery-session.repository';
import { ConfirmDeliveryResponseDto } from '../../dtos/confirm-delivery.dto';

export class ConfirmDeliveryUseCase {
  constructor(
    private readonly deliverySessionRepo: IDeliverySessionRepository,
  ) {}

  async execute(
    sessionId: string,
    donorId: string,
  ): Promise<ConfirmDeliveryResponseDto> {
    const result = await this.deliverySessionRepo.confirmDelivery(sessionId, donorId);
    return { status: 'completed', completedAt: result.completedAt };
  }
}
```

**Por qué el use case es tan simple**: toda la lógica de estado (verificaciones de donorId, status, donor_confirmed) y todas las actualizaciones atómicas están en el repo. El use case solo mapea el resultado al DTO de respuesta. No hay lógica de negocio fuera de la transacción.

**No hay email**: `ConfirmDeliveryUseCase` no importa ni usa `IMailService`. El email-flow-mapping.md no lista ningún evento EVT para confirmar entrega.

---

### Task 6 — Extender `DeliverySessionController`

**Archivo a MODIFICAR**: `src/interfaces/http/controllers/delivery-session.controller.ts`

Estado del archivo **después de historia 4.2** (que crea este archivo):
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

**Modificar** para añadir segundo parámetro y método `confirmDelivery`. El archivo queda:

```typescript
import { Request, Response, NextFunction } from 'express';
import { GetDeliverySessionUseCase } from '../../../application/use-cases/delivery-session/get-delivery-session.use-case';
import { ConfirmDeliveryUseCase } from '../../../application/use-cases/delivery-session/confirm-delivery.use-case';

export class DeliverySessionController {
  constructor(
    private readonly getDeliverySessionUseCase: GetDeliverySessionUseCase,
    private readonly confirmDeliveryUseCase: ConfirmDeliveryUseCase,
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

  async confirmDelivery(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.confirmDeliveryUseCase.execute(
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

---

### Task 7 — Extender router `delivery-sessions.routes.ts`

**Archivo a MODIFICAR**: `src/interfaces/http/routes/delivery-sessions.routes.ts`

Estado del archivo **después de historia 4.2**:
```typescript
// imports de GetDeliverySessionUseCase, DeliverySessionController, etc.
export interface DeliverySessionRouterDeps {
  deliverySessionRepo?: IDeliverySessionRepository;
  jwtService?: IJwtService;
  userRepo?: IUserRepository;
}
export function createDeliverySessionRouter(deps: DeliverySessionRouterDeps = {}): Router {
  // ... instanciación de deps
  const getDeliverySessionUseCase = new GetDeliverySessionUseCase(deliverySessionRepo);
  const controller = new DeliverySessionController(getDeliverySessionUseCase);
  // ... router con GET /:id
}
export const deliverySessionRouter = createDeliverySessionRouter();
```

**Añadir** import de `ConfirmDeliveryUseCase`, instanciarla, pasar como 2º arg al controller, y registrar la nueva ruta. El factory function queda:

```typescript
import { ConfirmDeliveryUseCase } from '../../../application/use-cases/delivery-session/confirm-delivery.use-case';
// ... resto de imports sin cambio

export function createDeliverySessionRouter(deps: DeliverySessionRouterDeps = {}): Router {
  const jwtService = deps.jwtService ?? new JwtService();
  const userRepo = deps.userRepo ?? new PostgresUserRepository(db);
  const deliverySessionRepo = deps.deliverySessionRepo ?? new PostgresDeliverySessionRepository(db);

  const authMiddleware = createAuthMiddleware(jwtService, userRepo);
  const getDeliverySessionUseCase = new GetDeliverySessionUseCase(deliverySessionRepo);
  const confirmDeliveryUseCase = new ConfirmDeliveryUseCase(deliverySessionRepo);
  const controller = new DeliverySessionController(getDeliverySessionUseCase, confirmDeliveryUseCase);

  const router = Router();

  router.get(
    '/:id',
    authMiddleware,
    validateUuidParam('id'),
    (req, res, next) => controller.getDeliverySession(req, res, next),
  );

  router.post(
    '/:id/confirm',
    authMiddleware,
    validateUuidParam('id'),
    (req, res, next) => controller.confirmDelivery(req, res, next),
  );

  return router;
}

export const deliverySessionRouter = createDeliverySessionRouter();
```

**No hay body validator** para `POST /:id/confirm`: el endpoint no espera body. El único input es el `:id` de la URL (ya validado con `validateUuidParam`) y `req.currentUser!.id` (provisto por `authMiddleware`).

---

### Task 8 — Tests

**Archivo NUEVO**: `tests/delivery-sessions-confirm.test.ts`

**UUIDs de test**:
```typescript
const DONOR_UUID   = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_UUID = '11111111-2222-4333-8444-555555555555';
```

**Mock de resultado base**:
```typescript
const mockConfirmResult = { completedAt: new Date('2026-05-13T10:00:00.000Z') };
```

**mockUser** (igual que en tests previos de esta sesión):
```typescript
const mockUser = {
  id: DONOR_UUID, email: 'donor@example.com', passwordHash: '$argon2id$...',
  postalCode: '28001', reputationScore: 42, totalReceived: 1, totalDonated: 2,
  consecutiveNoShows: 0, cyclesAtLimit: 0, lastCycleIncrementedAt: null,
  jwtVersion: 1, createdAt: new Date(), lastActiveAt: new Date(),
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
      verify: vi.fn().mockReturnValue({ sub: DONOR_UUID, jwtVersion: 1 }),
    },
    userRepo: {
      findByEmail: vi.fn(),
      findById: vi.fn().mockResolvedValue(mockUser),
      create: vi.fn(),
    },
    deliverySessionRepo: {
      selectReceiver: vi.fn(),
      findById: vi.fn(),
      confirmDelivery: vi.fn().mockResolvedValue(mockConfirmResult),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/delivery-sessions', createDeliverySessionRouter(deps));
  app.use(errorHandler);
  return { app, deliverySessionRepo: deps.deliverySessionRepo };
}
```

**Casos de test**:

| Caso | Descripción | Setup | Expect |
|------|-------------|-------|--------|
| 17.1 | Donante confirma, sesión activa, no confirmada → 200 | repo.confirmDelivery resuelve | `status 200`, `{ status: 'completed', completedAt }` |
| 17.2 | Sesión no activa (ej. completed) → 409 | repo throws ConflictException('Session is not active') | `status 409` |
| 17.3 | Ya confirmada (donor_confirmed=TRUE) → 409 | repo throws ConflictException('Delivery already confirmed') | `status 409` |
| 17.4 | No es el donante → 403 | repo throws ForbiddenException | `status 403` |
| 17.5 | Sesión no encontrada → 404 | repo throws NotFoundException | `status 404` |
| 17.6 | Sin autenticación → 401 | sin header Authorization | `status 401` |
| 17.7 | ID no es UUID v4 → 400 | URL `/delivery-sessions/not-a-uuid/confirm` | `status 400` |

**Detalle test 17.1** (verificar shape exacto):
```typescript
it('17.1 — donante confirma sesión activa no confirmada → 200 { status, completedAt }', async () => {
  const { app, deliverySessionRepo } = buildTestApp();
  const res = await request(app)
    .post(`/delivery-sessions/${SESSION_UUID}/confirm`)
    .set('Authorization', 'Bearer mock-jwt-token');

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ status: 'completed' });
  expect(res.body).toHaveProperty('completedAt');
  expect(deliverySessionRepo.confirmDelivery).toHaveBeenCalledWith(SESSION_UUID, DONOR_UUID);
});
```

---

### Estructura de archivos

**Archivos NUEVOS** (3):
1. `src/infrastructure/database/supabase/migrations/010-create-reputation-events.sql`
2. `src/application/dtos/confirm-delivery.dto.ts`
3. `src/application/use-cases/delivery-session/confirm-delivery.use-case.ts`
4. `tests/delivery-sessions-confirm.test.ts`

**Archivos MODIFICADOS** (4):
1. `src/domain/repositories/delivery-session.repository.ts` — añadir `ConfirmDeliveryResult` + `confirmDelivery`
2. `src/infrastructure/database/supabase/delivery-session.repository.ts` — añadir método `confirmDelivery`
3. `src/interfaces/http/controllers/delivery-session.controller.ts` — añadir 2º param + `confirmDelivery` handler
4. `src/interfaces/http/routes/delivery-sessions.routes.ts` — instanciar `ConfirmDeliveryUseCase` + ruta `POST /:id/confirm`

**Archivos que NO se tocan**:
- `items.routes.ts`, `item.controller.ts` — fuera de scope
- `resend.provider.ts` — no hay email en esta historia
- `routes/index.ts` — el router ya está registrado desde historia 4.2
- `delivery-sessions-get.test.ts` — no añadir casos aquí; los tests de 4.3 van en su propio archivo

---

### Estado de los archivos al inicio de esta historia

**IMPORTANTE**: Esta historia se desarrolla DESPUÉS de que historia 4.2 (`ver-detalle-de-sesion-de-entrega`) esté completada. Los archivos `delivery-session.controller.ts` y `delivery-sessions.routes.ts` ya existen con el contenido de la historia 4.2. Ver sección Task 6 y Task 7 para el estado exacto de esos archivos antes de modificarlos.

Si el dev agent llega a esta historia sin que 4.2 esté implementada, los archivos `delivery-session.controller.ts` y `delivery-sessions.routes.ts` no existirán — **verificar que existen antes de proceder**.

---

### Verificación de migraciones previas

Las siguientes tablas ya existen (creadas en migraciones anteriores):
- `delivery_sessions` — migración 009 (historia 4.1)
- `users` con campos `reputation_score`, `total_donated`, `total_received`, `consecutive_no_shows` — migración 001

`reputation_events` NO existe hasta que se aplique la migración 010 de esta historia.

---

### Convenciones del proyecto

- El uso de `client.query('ROLLBACK')` seguido de `throw` antes del COMMIT es el patrón establecido en `delivery-session.repository.ts::selectReceiver` y `request.repository.ts::create`
- El `try { await client.query('ROLLBACK'); } catch { /* ignore */ }` en el bloque `catch` exterior maneja el caso donde el BEGIN mismo falló
- El `client.release()` en `finally` es obligatorio para devolver la conexión al pool
- No usar `SERIALIZABLE` aquí — `FOR UPDATE` es suficiente; los reads/writes son sobre una única sesión y sus usuarios relacionados sin riesgo de phantom reads

### Referencias

- FR21: confirmación atómica con reputación — [Source: _bmad-output/initiative-backend/archive-v6/epics.md — FR21]
- Arquitectura §12.5: secuencia de transacción ConfirmDelivery — [Source: docs/architecture.md:900-922]
- Schema `reputation_events`: [Source: docs/architecture.md:238-250]
- Índice `idx_reputation_events_user`: [Source: docs/architecture.md:365]
- Patrón de transacción: [Source: src/infrastructure/database/supabase/delivery-session.repository.ts — selectReceiver]
- Email mapping (confirmar: sin email) — [Source: docs/email-flow-mapping.md — tabla §1]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

(ninguno)

### Completion Notes List

- Migración 010 creada con tabla `reputation_events` (id, user_id, type CHECK, delta, session_id, created_at) e índice `idx_reputation_events_user`.
- `ConfirmDeliveryResult` añadida a la interfaz del repositorio junto con el método `confirmDelivery`.
- `PostgresDeliverySessionRepository.confirmDelivery` implementado con transacción atómica: SELECT FOR UPDATE → verificaciones en orden (existencia, donorId, status, donor_confirmed) → UPDATE delivery_sessions → dos UPDATEs a users → INSERT en reputation_events → COMMIT.
- `ConfirmDeliveryResponseDto` creado en application/dtos.
- `ConfirmDeliveryUseCase` creado: delega completamente al repo y mapea el resultado al DTO.
- `DeliverySessionController` extendido con segundo parámetro y método `confirmDelivery`.
- Router extendido con `POST /:id/confirm` protegido por `authMiddleware` y `validateUuidParam('id')`.
- 7 tests (casos 17.1–17.7) creados y pasando. Suite completa: 145/145 tests pasan sin regresiones. `tsc --noEmit` sin errores.

### File List

- `src/infrastructure/database/supabase/migrations/010-create-reputation-events.sql` (nuevo)
- `src/application/dtos/confirm-delivery.dto.ts` (nuevo)
- `src/application/use-cases/delivery-session/confirm-delivery.use-case.ts` (nuevo)
- `tests/delivery-sessions-confirm.test.ts` (nuevo)
- `src/domain/repositories/delivery-session.repository.ts` (modificado)
- `src/infrastructure/database/supabase/delivery-session.repository.ts` (modificado)
- `src/interfaces/http/controllers/delivery-session.controller.ts` (modificado)
- `src/interfaces/http/routes/delivery-sessions.routes.ts` (modificado)

## Change Log

- 2026-05-13: Historia creada — ready-for-dev.
- 2026-05-13: Historia implementada — migración 010 (reputation_events), ConfirmDeliveryUseCase, controller y router extendidos, 7 tests añadidos (145 total pasan).
