---
title: "Cancelar sesión de entrega y declarar no-show"
type: feature
ticket: 4
status: done
created: 2026-10-25
---

# Historia 4.4: Cancelar sesión de entrega y declarar no-show

Status: done

## Historia

Como donante autenticado,
quiero poder cancelar una sesión de entrega con la opción de declarar que el receptor no se presentó,
para cerrar la sesión correctamente y penalizar al receptor si corresponde.

## Acceptance Criteria

1. **Dado** que envío `POST /delivery-sessions/:id/cancel` con `{ "noShow": false }` siendo el donante y la sesión en estado `active`, **cuando** el servidor procesa la petición en transacción atómica, **entonces** responde `200` con `{ status: "cancelled", noShowDeclared: false, completedAt }` **Y** `status = 'cancelled'`, `completed_at = NOW()`, `no_show_declared = FALSE` **Y** el objeto asociado vuelve a `status = 'active'` y `reserved_at = NULL` **Y** no se modifica la reputación de ninguna parte.

2. **Dado** que envío `POST /delivery-sessions/:id/cancel` con `{ "noShow": true }` siendo el donante y la sesión en estado `active`, **cuando** el servidor procesa la petición en transacción atómica, **entonces** responde `200` con `{ status: "cancelled", noShowDeclared: true, completedAt }` **Y** `no_show_declared = TRUE` **Y** `consecutive_no_shows` del receptor se incrementa en 1 **Y** `delta = -20 × consecutive_no_shows` (POST-incremento) se aplica al `reputation_score` del receptor **Y** se registra un evento `no_show` en `reputation_events` para el receptor **Y** el objeto vuelve a `status = 'active'` y `reserved_at = NULL`.

3. **Dado** que la sesión no está en estado `active`, **cuando** el servidor procesa la petición, **entonces** responde `409 Conflict`.

4. **Dado** que envío la petición siendo autenticado pero no siendo el donante de la sesión, **cuando** el servidor procesa la petición, **entonces** responde `403 Forbidden`.

5. **Dado** que envío `POST /delivery-sessions/:id/cancel` con un UUID que no existe, **cuando** el servidor procesa la petición, **entonces** responde `404 Not Found`.

6. **Dado** que envío `POST /delivery-sessions/:id/cancel` con `:id` inválido (no UUID v4) o sin el campo `noShow` en el body, **cuando** el servidor procesa la petición, **entonces** responde `400 Bad Request`.

## Tasks / Subtasks

- [x] Task 1: Extender `IDeliverySessionRepository` con `cancelDelivery` (AC: #1–#5)
  - [x] En `src/domain/repositories/delivery-session.repository.ts`: añadir `CancelDeliveryInput`, `CancelDeliveryResult`, método `cancelDelivery`

- [x] Task 2: Implementar `PostgresDeliverySessionRepository.cancelDelivery` (AC: #1–#5)
  - [x] En `src/infrastructure/database/supabase/delivery-session.repository.ts`: añadir método con transacción atómica
  - [x] SELECT FOR UPDATE incluye `item_id` para el UPDATE de items al final
  - [x] Rama no-show: incrementar `consecutive_no_shows` con RETURNING, calcular delta, aplicar a reputation_score, insertar en reputation_events

- [x] Task 3: DTO de respuesta (AC: #1, #2)
  - [x] Crear `src/application/dtos/cancel-delivery.dto.ts`

- [x] Task 4: `CancelDeliveryUseCase` (AC: #1–#5)
  - [x] Crear `src/application/use-cases/delivery-session/cancel-delivery.use-case.ts`
  - [x] Use case delega completamente al repo (sin lógica de negocio propia)

- [x] Task 5: Validator del body (AC: #6)
  - [x] Crear `src/interfaces/validators/cancel-delivery.validator.ts`
  - [x] Zod: `noShow: z.boolean()` — idéntico al patrón de `pause-item.validator.ts`

- [x] Task 6: Extender `DeliverySessionController` (AC: #1, #2)
  - [x] En `src/interfaces/http/controllers/delivery-session.controller.ts`:
    - Añadir `CancelDeliveryUseCase` como 3er parámetro del constructor
    - Añadir método `cancelDelivery(req, res, next)`

- [x] Task 7: Extender router `delivery-sessions.routes.ts` (AC: #1–#4, #6)
  - [x] En `src/interfaces/http/routes/delivery-sessions.routes.ts`:
    - Importar `CancelDeliveryUseCase` y `validateCancelDeliveryBody`
    - Instanciar `cancelDeliveryUseCase` dentro de `createDeliverySessionRouter`
    - Actualizar `new DeliverySessionController(...)` para incluir el 3er parámetro
    - Añadir ruta `POST /:id/cancel` con `authMiddleware`, `validateUuidParam('id')`, `validateCancelDeliveryBody`

- [x] Task 8: Tests (AC: #1–#6)
  - [x] Crear `tests/delivery-sessions-cancel.test.ts` — casos 18.1–18.9

- [x] Task 9: Verificación
  - [x] Ejecutar `npx tsc --noEmit` sin errores
  - [x] Ejecutar `npx vitest run` — todos los tests pasan

### Review Findings

- [x] [Review][Decision→Patch] item_requests no se resetean a pending al cancelar la sesión — Resuelto: `UPDATE item_requests SET status = 'pending' WHERE item_id = $1 AND status IN ('selected', 'rejected')` añadido a la transacción antes del COMMIT.

- [x] [Review][Patch] noShowResult.rows[0] sin guard de emptiness [src/infrastructure/database/supabase/delivery-session.repository.ts] — Resuelto: guard `if (noShowResult.rows.length === 0) throw new NotFoundException('Receptor no encontrado')` añadido.

- [x] [Review][Patch] updateResult.rows[0] sin guard de emptiness [src/infrastructure/database/supabase/delivery-session.repository.ts] — Resuelto: guard `if (updateResult.rows.length === 0) throw new NotFoundException(...)` añadido.

- [x] [Review][Defer] SELECT FOR UPDATE sin lock_timeout — bajo carga concurrente puede bloquear indefinidamente y agotar el connection pool [src/infrastructure/database/supabase/delivery-session.repository.ts] — deferred, pre-existing
- [x] [Review][Defer] req.currentUser! non-null assertion sin guard de runtime — patrón pre-existente en todos los controladores [src/interfaces/http/controllers/delivery-session.controller.ts] — deferred, pre-existing
- [x] [Review][Defer] Sin content-type enforcement en el validator — z.boolean() rechaza strings pero sin middleware de content-type un body form-urlencoded llega como string y produce 400 sin orientación [src/interfaces/validators/cancel-delivery.validator.ts] — deferred, pre-existing
- [x] [Review][Defer] req.body.noShow puede ser undefined si el validator es bypasseado — patrón pre-existente en todos los controladores [src/interfaces/http/controllers/delivery-session.controller.ts] — deferred, pre-existing
- [x] [Review][Defer] UPDATE items status='active' incondicional puede resucitar item pausado/borrado externamente — spec-compliant para el flujo normal [src/infrastructure/database/supabase/delivery-session.repository.ts] — deferred, pre-existing

## Dev Notes

### Diferencias clave respecto a `confirmDelivery` (historia 4.3)

| Aspecto | confirmDelivery (4.3) | cancelDelivery (4.4) |
|---------|----------------------|----------------------|
| Actualiza item | No (queda en `reserved`) | Sí: `active`, `reserved_at=NULL` |
| Reputación donante | +10 | Sin cambio |
| Reputación receptor | +10 | −20×consecutive_no_shows (solo si noShow=true) |
| reputation_events | 2 inserts (donor + receiver) | 1 insert (solo receiver, solo si noShow=true) |
| Verificación adicional | donor_confirmed=FALSE | Ninguna |
| Email | No | No |

**No hay email**: el email-flow-mapping no lista ningún EVT para `CancelDelivery`. El `CancelDeliveryUseCase` no toca `IMailService`.

---

### Task 1 — Extender `IDeliverySessionRepository`

**Archivo a MODIFICAR**: `src/domain/repositories/delivery-session.repository.ts`

Estado del archivo **después de historia 4.3** (completo):
```typescript
export interface SelectReceiverInput { itemId: string; requestId: string; donorId: string; contactChannel: string; }
export interface SelectReceiverResult { sessionId: string; status: 'active'; deadlineAt: Date; receiverId: string; itemTitle: string; itemCondition: string; }
export interface DeliverySessionDetail { id: string; itemId: string; donorId: string; receiverId: string; status: 'active'|'completed'|'cancelled'|'expired'; contactChannel: string|null; contactPurged: boolean; donorConfirmed: boolean; noShowDeclared: boolean; deadlineAt: Date; createdAt: Date; completedAt: Date|null; }
export interface ConfirmDeliveryResult { completedAt: Date; }
export interface IDeliverySessionRepository {
  selectReceiver(input: SelectReceiverInput): Promise<SelectReceiverResult>;
  findById(sessionId: string): Promise<DeliverySessionDetail | null>;
  confirmDelivery(sessionId: string, donorId: string): Promise<ConfirmDeliveryResult>;
}
```

**Añadir** `CancelDeliveryInput`, `CancelDeliveryResult`, y el método `cancelDelivery`:

```typescript
export interface CancelDeliveryInput {
  sessionId: string;
  donorId: string;
  noShow: boolean;
}

export interface CancelDeliveryResult {
  noShowDeclared: boolean;
  completedAt: Date;
}

export interface IDeliverySessionRepository {
  selectReceiver(input: SelectReceiverInput): Promise<SelectReceiverResult>;
  findById(sessionId: string): Promise<DeliverySessionDetail | null>;
  confirmDelivery(sessionId: string, donorId: string): Promise<ConfirmDeliveryResult>;
  cancelDelivery(input: CancelDeliveryInput): Promise<CancelDeliveryResult>;
}
```

**Por qué input como objeto** (no parámetros individuales): `cancelDelivery` recibe 3 parámetros — usar un objeto `CancelDeliveryInput` es más legible y extensible que `cancelDelivery(sessionId, donorId, noShow)`. Consistente con el patrón de `selectReceiver`.

---

### Task 2 — `PostgresDeliverySessionRepository.cancelDelivery`

**Archivo a MODIFICAR**: `src/infrastructure/database/supabase/delivery-session.repository.ts`

**Añadir** el método `cancelDelivery` a la clase existente. El SELECT FOR UPDATE debe incluir `item_id` (para el UPDATE final del objeto) y `receiver_id` (para la penalización no-show):

```typescript
async cancelDelivery(input: CancelDeliveryInput): Promise<CancelDeliveryResult> {
  const { sessionId, donorId, noShow } = input;
  const client = await this.db.connect();
  try {
    await client.query('BEGIN');

    const sessionResult = await client.query<{
      donor_id: string;
      receiver_id: string;
      item_id: string;
      status: string;
    }>(
      `SELECT donor_id, receiver_id, item_id, status
       FROM delivery_sessions
       WHERE id = $1
       FOR UPDATE`,
      [sessionId],
    );

    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new NotFoundException('Sesión no encontrada');
    }

    const { donor_id, receiver_id, item_id, status } = sessionResult.rows[0];

    if (donor_id !== donorId) {
      await client.query('ROLLBACK');
      throw new ForbiddenException('Forbidden');
    }
    if (status !== 'active') {
      await client.query('ROLLBACK');
      throw new ConflictException('Session is not active');
    }

    // Cancelar la sesión
    const updateResult = await client.query<{ completed_at: Date }>(
      `UPDATE delivery_sessions
       SET no_show_declared = $1, status = 'cancelled', completed_at = NOW()
       WHERE id = $2
       RETURNING completed_at`,
      [noShow, sessionId],
    );

    // Penalización por no-show (solo si noShow = true)
    if (noShow) {
      const noShowResult = await client.query<{ consecutive_no_shows: number }>(
        `UPDATE users
         SET consecutive_no_shows = consecutive_no_shows + 1
         WHERE id = $1
         RETURNING consecutive_no_shows`,
        [receiver_id],
      );
      const newConsecutiveNoShows = noShowResult.rows[0].consecutive_no_shows;
      const delta = -20 * newConsecutiveNoShows;

      await client.query(
        `UPDATE users SET reputation_score = reputation_score + $1 WHERE id = $2`,
        [delta, receiver_id],
      );

      await client.query(
        `INSERT INTO reputation_events (user_id, type, delta, session_id)
         VALUES ($1, 'no_show', $2, $3)`,
        [receiver_id, delta, sessionId],
      );
    }

    // Devolver el objeto a estado activo
    await client.query(
      `UPDATE items SET status = 'active', reserved_at = NULL WHERE id = $1`,
      [item_id],
    );

    await client.query('COMMIT');

    return {
      noShowDeclared: noShow,
      completedAt: updateResult.rows[0].completed_at,
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}
```

**Puntos clave del SQL de no-show**:
- `UPDATE users SET consecutive_no_shows = consecutive_no_shows + 1 WHERE id = $1 RETURNING consecutive_no_shows` → retorna el valor POST-incremento (nuevo valor)
- `delta = -20 × newConsecutiveNoShows` — arquitectura §12.6: "delta = -20 × consecutive_no_shows" usa el valor ya incrementado
- El delta es negativo (penalización) — `reputation_score += delta` lo reduce
- El UPDATE de `items` usa `reserved_at = NULL` — PostgreSQL acepta `= NULL` en SET (no usar `IS NULL`)

**Imports nuevos**: `CancelDeliveryInput`, `CancelDeliveryResult` desde el repositorio de dominio. `NotFoundException` ya fue importada en historia 4.3.

**No se modifica el donante**: `consecutive_no_shows` y `reputation_score` del donante NO cambian en cancelación. Solo el receptor recibe penalización.

---

### Task 3 — DTO de respuesta

**Archivo NUEVO**: `src/application/dtos/cancel-delivery.dto.ts`

```typescript
export interface CancelDeliveryResponseDto {
  status: 'cancelled';
  noShowDeclared: boolean;
  completedAt: Date;
}
```

---

### Task 4 — `CancelDeliveryUseCase`

**Archivo NUEVO**: `src/application/use-cases/delivery-session/cancel-delivery.use-case.ts`

```typescript
import { IDeliverySessionRepository } from '../../../domain/repositories/delivery-session.repository';
import { CancelDeliveryResponseDto } from '../../dtos/cancel-delivery.dto';

export class CancelDeliveryUseCase {
  constructor(
    private readonly deliverySessionRepo: IDeliverySessionRepository,
  ) {}

  async execute(
    sessionId: string,
    donorId: string,
    noShow: boolean,
  ): Promise<CancelDeliveryResponseDto> {
    const result = await this.deliverySessionRepo.cancelDelivery({ sessionId, donorId, noShow });
    return {
      status: 'cancelled',
      noShowDeclared: result.noShowDeclared,
      completedAt: result.completedAt,
    };
  }
}
```

---

### Task 5 — Validator del body

**Archivo NUEVO**: `src/interfaces/validators/cancel-delivery.validator.ts`

Copiar exactamente el patrón de `pause-item.validator.ts` (schema: `z.boolean()`, `safeParse`, `req.body = result.data`, `res.status(400)`):

```typescript
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

const cancelDeliverySchema = z.object({
  noShow: z.boolean(),
});

export function validateCancelDeliveryBody(req: Request, res: Response, next: NextFunction): void {
  const result = cancelDeliverySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid request body', errors: result.error.issues });
    return;
  }
  req.body = result.data;
  next();
}
```

**Comportamiento de `z.boolean()`**: Zod rechaza `"true"`, `"false"`, `0`, `1` — solo acepta el literal booleano `true` o `false`. Si el cliente envía `{"noShow": "true"}` → 400. El cliente debe enviar JSON con valor booleano real.

---

### Task 6 — Extender `DeliverySessionController`

**Archivo a MODIFICAR**: `src/interfaces/http/controllers/delivery-session.controller.ts`

Estado del archivo **después de historia 4.3**:
```typescript
import { GetDeliverySessionUseCase } from '...';
import { ConfirmDeliveryUseCase } from '...';

export class DeliverySessionController {
  constructor(
    private readonly getDeliverySessionUseCase: GetDeliverySessionUseCase,
    private readonly confirmDeliveryUseCase: ConfirmDeliveryUseCase,
  ) {}

  async getDeliverySession(...): Promise<void> { ... }
  async confirmDelivery(...): Promise<void> { ... }
}
```

**Añadir** import de `CancelDeliveryUseCase`, 3er parámetro al constructor, y método `cancelDelivery`:

```typescript
import { CancelDeliveryUseCase } from '../../../application/use-cases/delivery-session/cancel-delivery.use-case';

export class DeliverySessionController {
  constructor(
    private readonly getDeliverySessionUseCase: GetDeliverySessionUseCase,
    private readonly confirmDeliveryUseCase: ConfirmDeliveryUseCase,
    private readonly cancelDeliveryUseCase: CancelDeliveryUseCase,
  ) {}

  // ... getDeliverySession y confirmDelivery sin cambio ...

  async cancelDelivery(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.cancelDeliveryUseCase.execute(
        req.params.id,
        req.currentUser!.id,
        req.body.noShow,
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

Estado del archivo **después de historia 4.3** (sección relevante del factory):
```typescript
// imports de GetDeliverySessionUseCase, ConfirmDeliveryUseCase, DeliverySessionController
// DeliverySessionRouterDeps: { deliverySessionRepo, jwtService, userRepo }

export function createDeliverySessionRouter(deps = {}): Router {
  // ... instanciación de deps ...
  const getDeliverySessionUseCase = new GetDeliverySessionUseCase(deliverySessionRepo);
  const confirmDeliveryUseCase = new ConfirmDeliveryUseCase(deliverySessionRepo);
  const controller = new DeliverySessionController(getDeliverySessionUseCase, confirmDeliveryUseCase);

  router.get('/:id', authMiddleware, validateUuidParam('id'), ...);
  router.post('/:id/confirm', authMiddleware, validateUuidParam('id'), ...);
  return router;
}
```

**Añadir** imports, instancia, y ruta. El factory queda:

```typescript
import { CancelDeliveryUseCase } from '../../../application/use-cases/delivery-session/cancel-delivery.use-case';
import { validateCancelDeliveryBody } from '../../validators/cancel-delivery.validator';
// ... resto de imports sin cambio

export function createDeliverySessionRouter(deps: DeliverySessionRouterDeps = {}): Router {
  // ... instanciación de deps sin cambio ...
  const getDeliverySessionUseCase = new GetDeliverySessionUseCase(deliverySessionRepo);
  const confirmDeliveryUseCase = new ConfirmDeliveryUseCase(deliverySessionRepo);
  const cancelDeliveryUseCase = new CancelDeliveryUseCase(deliverySessionRepo);
  const controller = new DeliverySessionController(
    getDeliverySessionUseCase,
    confirmDeliveryUseCase,
    cancelDeliveryUseCase,
  );

  const router = Router();

  router.get('/:id', authMiddleware, validateUuidParam('id'),
    (req, res, next) => controller.getDeliverySession(req, res, next));

  router.post('/:id/confirm', authMiddleware, validateUuidParam('id'),
    (req, res, next) => controller.confirmDelivery(req, res, next));

  router.post('/:id/cancel', authMiddleware, validateUuidParam('id'), validateCancelDeliveryBody,
    (req, res, next) => controller.cancelDelivery(req, res, next));

  return router;
}

export const deliverySessionRouter = createDeliverySessionRouter();
```

---

### Task 8 — Tests

**Archivo NUEVO**: `tests/delivery-sessions-cancel.test.ts`

**UUIDs de test**:
```typescript
const DONOR_UUID   = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_UUID = '11111111-2222-4333-8444-555555555555';
```

**Mock de resultado base** (reusar para `noShow: false`):
```typescript
const mockCancelResult = {
  noShowDeclared: false,
  completedAt: new Date('2026-05-13T10:00:00.000Z'),
};
```

**Helper `buildTestApp`** (mismo patrón que `delivery-sessions-confirm.test.ts`):
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
      confirmDelivery: vi.fn(),
      cancelDelivery: vi.fn().mockResolvedValue(mockCancelResult),
    },
  };

  const deps = { ...defaultDeps, ...depOverrides };
  app.use('/delivery-sessions', createDeliverySessionRouter(deps));
  app.use(errorHandler);
  return { app, deliverySessionRepo: deps.deliverySessionRepo };
}
```

**Nota**: el mock de `deliverySessionRepo` DEBE incluir `confirmDelivery: vi.fn()` porque el router instancia `ConfirmDeliveryUseCase` con el mismo repo. Sin esto TypeScript podría quejarse (si el tipo es estricto) y el test fallará si se llama inadvertidamente.

**Casos de test**:

| Caso | Descripción | Setup | Expect |
|------|-------------|-------|--------|
| 18.1 | noShow=false, sesión activa → 200 sin penalización | `cancelDelivery` → `{ noShowDeclared: false, completedAt }` | `status 200`, `{ status: 'cancelled', noShowDeclared: false, completedAt }` |
| 18.2 | noShow=true, sesión activa → 200 con penalización | `cancelDelivery` → `{ noShowDeclared: true, completedAt }` | `status 200`, `{ status: 'cancelled', noShowDeclared: true, completedAt }` |
| 18.3 | Sesión no activa → 409 | repo throws ConflictException | `status 409` |
| 18.4 | No es el donante → 403 | repo throws ForbiddenException | `status 403` |
| 18.5 | Sesión no existe → 404 | repo throws NotFoundException | `status 404` |
| 18.6 | Sin autenticación → 401 | sin header Authorization | `status 401` |
| 18.7 | ID no es UUID v4 → 400 | URL `/delivery-sessions/not-a-uuid/cancel` | `status 400` |
| 18.8 | Body sin noShow → 400 | body `{}` | `status 400` |
| 18.9 | noShow es string, no boolean → 400 | body `{ "noShow": "true" }` | `status 400` |

**Detalle test 18.1** (verificar que se llama con los parámetros correctos):
```typescript
it('18.1 — noShow=false, sesión activa → 200 sin modificar reputación', async () => {
  const { app, deliverySessionRepo } = buildTestApp();
  const res = await request(app)
    .post(`/delivery-sessions/${SESSION_UUID}/cancel`)
    .set('Authorization', 'Bearer mock-jwt-token')
    .send({ noShow: false });

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ status: 'cancelled', noShowDeclared: false });
  expect(res.body).toHaveProperty('completedAt');
  expect(deliverySessionRepo.cancelDelivery).toHaveBeenCalledWith({
    sessionId: SESSION_UUID,
    donorId: DONOR_UUID,
    noShow: false,
  });
});
```

**Detalle test 18.2** (verifica noShowDeclared: true en respuesta):
```typescript
it('18.2 — noShow=true, sesión activa → 200 con noShowDeclared: true', async () => {
  const { app } = buildTestApp({
    deliverySessionRepo: {
      selectReceiver: vi.fn(), findById: vi.fn(), confirmDelivery: vi.fn(),
      cancelDelivery: vi.fn().mockResolvedValue({
        noShowDeclared: true,
        completedAt: new Date('2026-05-13T10:00:00.000Z'),
      }),
    },
  });
  const res = await request(app)
    .post(`/delivery-sessions/${SESSION_UUID}/cancel`)
    .set('Authorization', 'Bearer mock-jwt-token')
    .send({ noShow: true });

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ status: 'cancelled', noShowDeclared: true });
});
```

---

### Estructura de archivos

**Archivos NUEVOS** (4):
1. `src/application/dtos/cancel-delivery.dto.ts`
2. `src/application/use-cases/delivery-session/cancel-delivery.use-case.ts`
3. `src/interfaces/validators/cancel-delivery.validator.ts`
4. `tests/delivery-sessions-cancel.test.ts`

**Archivos MODIFICADOS** (4):
1. `src/domain/repositories/delivery-session.repository.ts` — añadir `CancelDeliveryInput`, `CancelDeliveryResult`, `cancelDelivery`
2. `src/infrastructure/database/supabase/delivery-session.repository.ts` — añadir método `cancelDelivery`
3. `src/interfaces/http/controllers/delivery-session.controller.ts` — 3er param + método `cancelDelivery`
4. `src/interfaces/http/routes/delivery-sessions.routes.ts` — instanciar `CancelDeliveryUseCase` + ruta `POST /:id/cancel`

**Archivos que NO se tocan**:
- `items.routes.ts`, `item.controller.ts` — fuera de scope
- `routes/index.ts` — el router ya está registrado desde historia 4.2
- `resend.provider.ts` — no hay email en esta historia
- `reputation_events` migration — ya creada en historia 4.3 (migración 010)

---

### Estado de archivos al inicio de esta historia

Esta historia se desarrolla DESPUÉS de que historia 4.3 esté completada. Verificar antes de proceder:
- `src/infrastructure/database/supabase/migrations/010-create-reputation-events.sql` existe
- `src/infrastructure/database/supabase/delivery-session.repository.ts` tiene `selectReceiver`, `findById`, `confirmDelivery`
- `src/interfaces/http/controllers/delivery-session.controller.ts` existe con 2 constructor params y 2 métodos
- `src/interfaces/http/routes/delivery-sessions.routes.ts` tiene rutas GET /:id y POST /:id/confirm

---

### Convenciones y puntos a no olvidar

- `reserved_at = NULL` en SQL (no `IS NULL`) — en SET clause se usa `= NULL`
- El delta de no-show usa el valor POST-incremento de `consecutive_no_shows` (no el valor anterior). El RETURNING de PostgreSQL en UPDATE siempre retorna el valor nuevo
- No modificar `consecutive_no_shows` del donante — solo del receptor
- La penalización de reputación es acumulativa: primer no-show = -20, segundo = -40, tercero = -60, etc.
- El score de reputación no tiene piso en el schema — puede volverse negativo

### Referencias

- FR22: cancelación con no-show — [Source: _bmad-output/initiative-backend/archive-v6/epics.md — FR22]
- Arquitectura §12.6: secuencia de transacción CancelDelivery — [Source: docs/architecture.md:926-946]
- Patrón validator boolean: [Source: src/interfaces/validators/pause-item.validator.ts]
- Patrón transacción repo: [Source: src/infrastructure/database/supabase/delivery-session.repository.ts — confirmDelivery]
- Email mapping (cancelación: sin email) — [Source: docs/email-flow-mapping.md — tabla §1]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

(ninguno)

### Completion Notes List

- Implementado `cancelDelivery` en `IDeliverySessionRepository` con `CancelDeliveryInput` y `CancelDeliveryResult`.
- Transacción atómica en `PostgresDeliverySessionRepository.cancelDelivery`: SELECT FOR UPDATE, UPDATE delivery_sessions, rama no-show con RETURNING para valor post-incremento, UPDATE items a `active`/`reserved_at=NULL`.
- Delta no-show usa valor POST-incremento de `consecutive_no_shows` (acumulativo: primer no-show=-20, segundo=-40, etc.).
- No hay email en esta historia. No se toca `IMailService`.
- `CancelDeliveryUseCase` delega completamente al repo sin lógica de negocio propia.
- Validator usa `z.boolean()` — rechaza strings, números; solo acepta literal `true`/`false`.
- 9 tests nuevos (18.1–18.9), todos pasan. Suite completa: 155/155 tests, 0 regresiones.
- `tsc --noEmit` sin errores.

### File List

- `src/domain/repositories/delivery-session.repository.ts` — modificado
- `src/infrastructure/database/supabase/delivery-session.repository.ts` — modificado
- `src/application/dtos/cancel-delivery.dto.ts` — nuevo
- `src/application/use-cases/delivery-session/cancel-delivery.use-case.ts` — nuevo
- `src/interfaces/validators/cancel-delivery.validator.ts` — nuevo
- `src/interfaces/http/controllers/delivery-session.controller.ts` — modificado
- `src/interfaces/http/routes/delivery-sessions.routes.ts` — modificado
- `tests/delivery-sessions-cancel.test.ts` — nuevo

## Change Log

- 2026-05-13: Historia creada — ready-for-dev.
- 2026-05-13: Implementación completa — 8 archivos nuevos/modificados, 9 tests nuevos (18.1–18.9), 155/155 tests pasan. Status → review.
