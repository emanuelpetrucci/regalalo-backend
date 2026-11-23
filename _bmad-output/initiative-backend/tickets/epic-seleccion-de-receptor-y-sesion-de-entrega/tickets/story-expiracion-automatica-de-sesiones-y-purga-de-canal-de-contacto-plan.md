---
title: "Expiración automática de sesiones y purga de canal de contacto"
type: feature
ticket: 6
status: done
created: 2026-10-25
---

# Historia 4.6: Expiración automática de sesiones y purga de canal de contacto

Status: done

## Historia

Como sistema,
quiero que las sesiones de entrega que superen su deadline se marquen automáticamente como expiradas y el objeto asociado vuelva a estado activo,
para que los donantes no queden bloqueados con objetos en estado `reserved` indefinidamente, y quiero que el canal de contacto se purgue de sesiones cerradas tras 7 días para proteger la privacidad del donante.

## Acceptance Criteria

1. **Dado** que existe una sesión de entrega con `status = 'active'` y `deadline_at < NOW()`, **cuando** el job `expire-delivery-sessions` ejecuta en pg_cron, **entonces** la sesión pasa a `status = 'expired'` y el objeto asociado vuelve a `status = 'active'` con `reserved_at = NULL`, ambas actualizaciones en una única operación atómica (CTE).

2. **Dado** que el job `expire-delivery-sessions` expira una sesión, **cuando** el scheduler de Node.js ejecuta `ExpireDeliverySessionsUseCase`, **entonces** se envía un email TPL-004 al donante de cada sesión recién expirada (fire-and-forget: errores de envío se loguean con pino pero no interrumpen el procesamiento de otras sesiones).

3. **Dado** que existen sesiones con `status IN ('completed', 'cancelled', 'expired')` y `contact_purged = FALSE` y `completed_at < NOW() - INTERVAL '7 days'`, **cuando** el job `purge-contact-channel` ejecuta en pg_cron, **entonces** `contact_channel` se establece a NULL y `contact_purged = TRUE` en esas sesiones.

4. **Dado** que el servidor Node.js arranca, **cuando** el scheduler de sesiones corre por primera vez (inmediatamente al arranque), **entonces** procesa todas las sesiones cuyo `deadline_at` pasó en los últimos 75 minutos y les envía email TPL-004 (ventana de buffer para cubrir el desfase entre pg_cron y el scheduler).

5. **Dado** que no hay sesiones expiradas en la ventana de los últimos 75 minutos, **cuando** `ExpireDeliverySessionsUseCase` ejecuta, **entonces** no se envía ningún email.

## Tasks / Subtasks

- [x] Task 1: Añadir `ExpiredSessionForEmail` y `findExpiredSessions()` a la interfaz del repositorio (AC: #2, #4, #5)
  - [x] En `src/domain/repositories/delivery-session.repository.ts`: añadir interfaz `ExpiredSessionForEmail` y método `findExpiredSessions(): Promise<ExpiredSessionForEmail[]>` a `IDeliverySessionRepository`

- [x] Task 2: Implementar `findExpiredSessions()` en `PostgresDeliverySessionRepository` (AC: #2, #4, #5)
  - [x] En `src/infrastructure/database/supabase/delivery-session.repository.ts`: implementar `findExpiredSessions()` con query que une `delivery_sessions` + `users` (donor) + `items` y filtra `status = 'expired' AND deadline_at >= NOW() - INTERVAL '75 minutes'`

- [x] Task 3: Crear `ExpireDeliverySessionsUseCase` (AC: #2, #4, #5)
  - [x] Crear `src/application/use-cases/delivery/expire-delivery-sessions.use-case.ts`
  - [x] Constructor: `(deliverySessionRepo: IDeliverySessionRepository, mailService: IMailService)`
  - [x] `execute()`: llama `findExpiredSessions()`, para cada sesión envía TPL-004 al donante con `try/catch` (fire-and-forget)

- [x] Task 4: Crear `delivery-session-expiration.scheduler.ts` (AC: #2, #4)
  - [x] Crear `src/infrastructure/scheduler/delivery-session-expiration.scheduler.ts`
  - [x] Mismo patrón que `item-degradation.scheduler.ts`: ejecuta inmediatamente al arranque + `setInterval` cada 60 minutos

- [x] Task 5: Añadir TPL-004 a `resend.provider.ts` (AC: #2)
  - [x] En `src/infrastructure/email/resend.provider.ts`: añadir entrada `'TPL-004'` con subject y HTML que incluya `itemTitle` e `itemId`

- [x] Task 6: Crear migración 011 con los dos jobs pg_cron (AC: #1, #3)
  - [x] Crear `src/infrastructure/database/supabase/migrations/011-setup-expire-sessions-and-purge-contact-channel-jobs.sql`
  - [x] Job `expire-delivery-sessions`: CTE atómica, schedule `'30 * * * *'`
  - [x] Job `purge-contact-channel`: SQL simple, schedule `'30 3 * * *'`
  - [x] Seguir el patrón de migraciones anteriores: `DO $$ BEGIN PERFORM cron.unschedule(...); EXCEPTION WHEN OTHERS THEN NULL; END $$;` antes de cada `SELECT cron.schedule(...)`

- [x] Task 7: Actualizar `main.ts` (AC: #2, #4)
  - [x] En `src/main.ts`: importar `PostgresDeliverySessionRepository`, `ExpireDeliverySessionsUseCase`, `startDeliverySessionExpirationScheduler`
  - [x] Dentro del callback de `app.listen`: instanciar `deliverySessionRepo`, `expireSessionsUseCase`, llamar `startDeliverySessionExpirationScheduler(expireSessionsUseCase)`
  - [x] Reusar la instancia `mailService` ya existente en el archivo

- [x] Task 8: Escribir tests del use case (AC: #2, #4, #5)
  - [x] Crear `tests/expire-delivery-sessions.test.ts` siguiendo exactamente el patrón de `tests/degrade-inactive-items.test.ts`
  - [x] Test 20.1: sesión expirada existente → email TPL-004 enviado al donante con `itemTitle` e `itemId`
  - [x] Test 20.2: sin sesiones expiradas → no se envía ningún email
  - [x] Test 20.3: múltiples sesiones expiradas → un email por cada sesión
  - [x] Test 20.4: email falla para la primera sesión → no lanza excepción, procesa el resto

---

## Notas para el Dev Agent

### Contexto de arquitectura

Esta historia implementa dos mecanismos independientes de mantenimiento:

**Mecanismo A — Expiración de sesiones (pg_cron + Node.js):**
- `pg_cron` ejecuta la CTE SQL atómica que actualiza `delivery_sessions` y `items` directamente en la BD.
- El scheduler de Node.js ejecuta `ExpireDeliverySessionsUseCase` para enviar emails; es el único responsable de la notificación.
- Los dos componentes son complementarios: pg_cron garantiza la atomicidad de los datos; Node.js garantiza la notificación.

**Mecanismo B — Purga de canal de contacto (solo pg_cron):**
- Es un job SQL puro. No hay use case de Node.js ni email asociado. Solo la migración 011.

### Patrón de referencia: `DegradeInactiveItemsUseCase`

Seguir el patrón de story 2.6 (degradación automática) que ya existe en producción:

```
src/application/use-cases/item/degrade-inactive-items.use-case.ts  ← PATRÓN EXACTO
src/infrastructure/scheduler/item-degradation.scheduler.ts          ← PATRÓN EXACTO
```

Ambos archivos deben ser replicados casi literal para `ExpireDeliverySessionsUseCase` y `delivery-session-expiration.scheduler.ts`. La única diferencia es el repositorio, el templateId y las variables del email.

### Estado actual de los archivos a modificar

**`src/domain/repositories/delivery-session.repository.ts`** — estado actual (post-4.4):
```typescript
export interface IDeliverySessionRepository {
  selectReceiver(input: SelectReceiverInput): Promise<SelectReceiverResult>;
  findById(sessionId: string): Promise<DeliverySessionDetail | null>;
  confirmDelivery(sessionId: string, donorId: string): Promise<ConfirmDeliveryResult>;
  cancelDelivery(input: CancelDeliveryInput): Promise<CancelDeliveryResult>;
  // ← añadir aquí: findExpiredSessions()
}
```

Añadir antes de `IDeliverySessionRepository`:
```typescript
export interface ExpiredSessionForEmail {
  sessionId: string;
  donorEmail: string;
  itemId: string;
  itemTitle: string;
}
```

Y en la interfaz:
```typescript
findExpiredSessions(): Promise<ExpiredSessionForEmail[]>;
```

**`src/infrastructure/database/supabase/delivery-session.repository.ts`** — añadir al final de la clase `PostgresDeliverySessionRepository`:
```typescript
async findExpiredSessions(): Promise<ExpiredSessionForEmail[]> {
  const result = await this.db.query<{
    session_id: string;
    donor_email: string;
    item_id: string;
    item_title: string;
  }>(
    `SELECT ds.id AS session_id, u.email AS donor_email, i.id AS item_id, i.title AS item_title
     FROM delivery_sessions ds
     JOIN users u ON u.id = ds.donor_id
     JOIN items i ON i.id = ds.item_id
     WHERE ds.status = 'expired'
       AND ds.deadline_at >= NOW() - INTERVAL '75 minutes'`,
  );
  return result.rows.map(row => ({
    sessionId: row.session_id,
    donorEmail: row.donor_email,
    itemId: row.item_id,
    itemTitle: row.item_title,
  }));
}
```

**Nota sobre la ventana de 75 minutos:** el job pg_cron corre cada hora. El scheduler de Node.js también corre cada hora. La ventana de 75 minutos (no 60) es un buffer de seguridad para cubrir desfases de timing entre ambos procesos. Este mismo patrón se usa en `findNewlyDegradedItems()` que usa `degraded_at >= NOW() - INTERVAL '75 minutes'`.

**`src/infrastructure/email/resend.provider.ts`** — estado actual: tiene TPL-001, TPL-002, TPL-003, TPL-006, TPL-007, TPL-008. Faltan TPL-004 y TPL-005. Story 4.5 añade TPL-005; esta historia añade TPL-004:

```typescript
'TPL-004': {
  subject: 'La sesión de entrega de tu objeto ha expirado',
  html: (v) =>
    `<p>La sesión de entrega para el objeto <strong>${v.itemTitle}</strong> ha expirado sin confirmación.</p>` +
    `<p>El objeto ha vuelto a estar disponible para nuevos solicitantes.</p>`,
},
```

**`src/main.ts`** — estado actual:
```typescript
import { DegradeInactiveItemsUseCase } from './application/use-cases/item/degrade-inactive-items.use-case';
import { startItemDegradationScheduler } from './infrastructure/scheduler/item-degradation.scheduler';
// ...
const itemRepo = new PostgresItemRepository(db);
const mailService = new ResendMailProvider();
const degradeUseCase = new DegradeInactiveItemsUseCase(itemRepo, mailService);
startItemDegradationScheduler(degradeUseCase);

const storageAdapter = new SupabaseStorageAdapter(db);
startStorageDeletionScheduler(storageAdapter);
```

Añadir justo después de `startItemDegradationScheduler(degradeUseCase)`:
```typescript
const deliverySessionRepo = new PostgresDeliverySessionRepository(db);
const expireSessionsUseCase = new ExpireDeliverySessionsUseCase(deliverySessionRepo, mailService);
startDeliverySessionExpirationScheduler(expireSessionsUseCase);
```

Y los imports correspondientes al inicio del archivo.

### Código completo de archivos nuevos

**`src/application/use-cases/delivery/expire-delivery-sessions.use-case.ts`:**
```typescript
import pino from 'pino';
import { IDeliverySessionRepository } from '../../../domain/repositories/delivery-session.repository';
import { IMailService } from '../../../domain/services/mail.service';

const logger = pino();

export class ExpireDeliverySessionsUseCase {
  constructor(
    private readonly deliverySessionRepo: IDeliverySessionRepository,
    private readonly mailService: IMailService,
  ) {}

  async execute(): Promise<void> {
    const sessions = await this.deliverySessionRepo.findExpiredSessions();
    for (const session of sessions) {
      try {
        await this.mailService.send({
          to: session.donorEmail,
          templateId: 'TPL-004',
          variables: {
            itemTitle: session.itemTitle,
            itemId: session.itemId,
          },
        });
      } catch (err) {
        logger.error({ err, sessionId: session.sessionId }, 'Failed to send session expiration email');
      }
    }
  }
}
```

**`src/infrastructure/scheduler/delivery-session-expiration.scheduler.ts`:**
```typescript
import pino from 'pino';
import { ExpireDeliverySessionsUseCase } from '../../application/use-cases/delivery/expire-delivery-sessions.use-case';

const logger = pino();
const INTERVAL_MS = 60 * 60 * 1000;

export function startDeliverySessionExpirationScheduler(useCase: ExpireDeliverySessionsUseCase): void {
  const run = async (): Promise<void> => {
    try {
      await useCase.execute();
    } catch (err) {
      logger.error({ err }, 'Delivery session expiration scheduler failed');
    }
  };

  run();
  setInterval(run, INTERVAL_MS);
}
```

**`src/infrastructure/database/supabase/migrations/011-setup-expire-sessions-and-purge-contact-channel-jobs.sql`:**
```sql
-- Job pg_cron: expirar sesiones de entrega vencidas (corre cada hora a :30)
-- CTE atómica: actualiza delivery_sessions y restora items en una sola operación (SEC-006)
DO $$
BEGIN
  PERFORM cron.unschedule('expire-delivery-sessions');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;
SELECT cron.schedule(
  'expire-delivery-sessions',
  '30 * * * *',
  $$
    WITH expired AS (
      UPDATE delivery_sessions
      SET status = 'expired'
      WHERE status = 'active'
        AND deadline_at < NOW()
      RETURNING item_id
    )
    UPDATE items
    SET status      = 'active',
        reserved_at = NULL
    WHERE id IN (SELECT item_id FROM expired);
  $$
);

-- Job pg_cron: purgar canal de contacto de sesiones cerradas (corre a las 03:30 UTC diario)
DO $$
BEGIN
  PERFORM cron.unschedule('purge-contact-channel');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;
SELECT cron.schedule(
  'purge-contact-channel',
  '30 3 * * *',
  $$
    UPDATE delivery_sessions
    SET contact_channel = NULL,
        contact_purged  = TRUE
    WHERE contact_purged = FALSE
      AND status IN ('completed', 'cancelled', 'expired')
      AND completed_at < NOW() - INTERVAL '7 days';
  $$
);
```

### Estructura del test

**`tests/expire-delivery-sessions.test.ts`:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExpireDeliverySessionsUseCase } from '../src/application/use-cases/delivery/expire-delivery-sessions.use-case';
import { IDeliverySessionRepository, ExpiredSessionForEmail } from '../src/domain/repositories/delivery-session.repository';
import { IMailService } from '../src/domain/services/mail.service';

const EXPIRED_SESSION: ExpiredSessionForEmail = {
  sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  donorEmail: 'donor@test.com',
  itemId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  itemTitle: 'Mesa de madera',
};

function buildMocks(sessions: ExpiredSessionForEmail[] = [EXPIRED_SESSION]) {
  const deliverySessionRepo = {
    findExpiredSessions: vi.fn().mockResolvedValue(sessions),
  } as unknown as IDeliverySessionRepository;

  const mailService: IMailService = {
    send: vi.fn().mockResolvedValue(undefined),
  };

  return { deliverySessionRepo, mailService };
}

describe('ExpireDeliverySessionsUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('20.1 — envía TPL-004 al donante para sesión recién expirada', async () => {
    const { deliverySessionRepo, mailService } = buildMocks([EXPIRED_SESSION]);
    const useCase = new ExpireDeliverySessionsUseCase(deliverySessionRepo, mailService);
    await useCase.execute();

    expect(mailService.send).toHaveBeenCalledOnce();
    expect(mailService.send).toHaveBeenCalledWith({
      to: 'donor@test.com',
      templateId: 'TPL-004',
      variables: {
        itemTitle: 'Mesa de madera',
        itemId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
      },
    });
  });

  it('20.2 — no envía emails si no hay sesiones expiradas', async () => {
    const { deliverySessionRepo, mailService } = buildMocks([]);
    const useCase = new ExpireDeliverySessionsUseCase(deliverySessionRepo, mailService);
    await useCase.execute();

    expect(mailService.send).not.toHaveBeenCalled();
  });

  it('20.3 — envía un email por cada sesión expirada', async () => {
    const session2: ExpiredSessionForEmail = {
      sessionId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
      donorEmail: 'donor2@test.com',
      itemId: 'cccccccc-dddd-eeee-ffff-000000000000',
      itemTitle: 'Bicicleta',
    };
    const { deliverySessionRepo, mailService } = buildMocks([EXPIRED_SESSION, session2]);
    const useCase = new ExpireDeliverySessionsUseCase(deliverySessionRepo, mailService);
    await useCase.execute();

    expect(mailService.send).toHaveBeenCalledTimes(2);
  });

  it('20.4 — si un email falla, continúa con el siguiente y no lanza excepción', async () => {
    const session2: ExpiredSessionForEmail = {
      sessionId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
      donorEmail: 'donor2@test.com',
      itemId: 'cccccccc-dddd-eeee-ffff-000000000000',
      itemTitle: 'Bicicleta',
    };
    const { deliverySessionRepo, mailService } = buildMocks([EXPIRED_SESSION, session2]);
    vi.mocked(mailService.send).mockRejectedValueOnce(new Error('Resend error'));

    const useCase = new ExpireDeliverySessionsUseCase(deliverySessionRepo, mailService);
    await expect(useCase.execute()).resolves.not.toThrow();
    expect(mailService.send).toHaveBeenCalledTimes(2);
  });
});
```

### Precauciones importantes

**No hay endpoint HTTP en esta historia.** No modificar controladores, routes, validators. Solo: domain repo interface, infra repo impl, use case, scheduler, migration, main.ts, resend.provider.ts y el test.

**Instancia de `mailService` ya existente en `main.ts`:** reutilizar la instancia `const mailService = new ResendMailProvider()` que ya crea el bloque de degradación. No crear una segunda instancia.

**Sin `completed_at` en sesiones expiradas:** el job pg_cron de expiración NO establece `completed_at`. Por eso `findExpiredSessions` filtra por `deadline_at >= NOW() - INTERVAL '75 minutes'` en lugar de un campo de timestamp de expiración. Así identifica las sesiones que el job acaba de expirar.

**La purga de contact_channel usa `completed_at IS NOT NULL`:** para sesiones de tipo `completed`/`cancelled`, `completed_at` está establecido. Para sesiones `expired`, `completed_at` es NULL — estas sesiones NUNCA serán purgadas por el job de purga ya que el filtro `completed_at < NOW() - INTERVAL '7 days'` excluye NULLs. Esto es correcto según la arquitectura: las sesiones expiradas no tienen canal de contacto que purgar (el donante canceló implícitamente pero el canal podría haber sido establecido). Verificar en la architecture si esto es correcto — el job de purga usa `status IN ('completed', 'cancelled', 'expired')`, lo que sugiere que sesiones `expired` también deben purgarse. Si `completed_at` es NULL para estas sesiones, el filtro `completed_at < NOW() - INTERVAL '7 days'` las excluye silenciosamente. **Solución:** el job de purga también debería cubrir sesiones `expired` sin `completed_at` — usar `(completed_at IS NULL OR completed_at < NOW() - INTERVAL '7 days')`. Sin embargo, la migración 011 debe seguir fielmente la arquitectura §7 Job 3 que dice `completed_at < NOW() - INTERVAL '7 days'`. Implementar exactamente como está en la arquitectura; el producto puede refinarlo después.

**Orden de los jobs en migration 011:** primero `expire-delivery-sessions`, luego `purge-contact-channel`. Ambos con el patrón `DO $$ unschedule EXCEPTION WHEN OTHERS THEN NULL END $$` antes del `SELECT cron.schedule`.

### Regresiones a verificar

Esta historia **no modifica ningún endpoint HTTP existente**, no modifica ningún controller ni route. Riesgos:
- `delivery-session.repository.ts` (infra): añadir `findExpiredSessions` al final de la clase, sin tocar los métodos existentes.
- `main.ts`: añadir 3 líneas al bloque del `listen` callback — no reordenar ni eliminar nada existente.
- `resend.provider.ts`: añadir `TPL-004` al objeto `templates` — no modificar templates existentes.

Correr el test suite completo después de implementar para confirmar cero regresiones.

---

## Dev Agent Record

### Completion Notes

Implementación completada el 2026-05-13. Se crearon dos mecanismos de mantenimiento independientes:

**Mecanismo A (expiración + email):** `ExpireDeliverySessionsUseCase` con `findExpiredSessions()` usando ventana de 75 minutos. Scheduler que ejecuta al arranque y cada 60 minutos. Fire-and-forget con `try/catch` individual por sesión.

**Mecanismo B (purga de canal):** Job SQL puro en migración 011. Sin use case ni scheduler en Node.js.

4 tests (20.1–20.4) cubren los ACs #2, #4, #5. ACs #1 y #3 son cubiertos por los jobs pg_cron de la migración 011. Suite completa: 22 archivos, 161 tests, 0 regresiones.

## File List

- `src/domain/repositories/delivery-session.repository.ts` (modificado)
- `src/infrastructure/database/supabase/delivery-session.repository.ts` (modificado)
- `src/application/use-cases/delivery/expire-delivery-sessions.use-case.ts` (nuevo)
- `src/infrastructure/scheduler/delivery-session-expiration.scheduler.ts` (nuevo)
- `src/infrastructure/email/resend.provider.ts` (modificado)
- `src/infrastructure/database/supabase/migrations/011-setup-expire-sessions-and-purge-contact-channel-jobs.sql` (nuevo)
- `src/main.ts` (modificado)
- `tests/expire-delivery-sessions.test.ts` (nuevo)

### Review Findings

- [x] [Review][Decision] Sin idempotencia en envío de emails — aceptado como trade-off: hasta 2 emails por sesión en el caso normal, notificaciones perdidas si el servidor cae >75 min. Schema cerrado; fix requiere columna `expiration_email_sent_at`. Decisión: aceptar.
- [x] [Review][Patch] TPL-004 HTML omite `itemId` — Task 5 especifica que el HTML debe incluir `itemTitle` e `itemId`, pero el template solo renderiza `itemTitle` [src/infrastructure/email/resend.provider.ts:32]
- [x] [Review][Defer] `purge-contact-channel` nunca purga sesiones expiradas porque `completed_at` es NULL — problema conocido y explícitamente diferido en las notas del spec; fix futuro: usar `(completed_at IS NULL OR completed_at < NOW() - INTERVAL '7 days')` [src/infrastructure/database/supabase/migrations/011-setup-expire-sessions-and-purge-contact-channel-jobs.sql:38-43] — deferred, pre-existing
- [x] [Review][Defer] Instancias `pino()` a nivel de módulo sin config compartida [src/application/use-cases/delivery/expire-delivery-sessions.use-case.ts:5, src/infrastructure/scheduler/delivery-session-expiration.scheduler.ts:4] — deferred, pre-existing (patrón establecido, ya en deferred-work.md)
- [x] [Review][Defer] Handle de `setInterval` no almacenado — el scheduler no puede detenerse para graceful shutdown [src/infrastructure/scheduler/delivery-session-expiration.scheduler.ts:17] — deferred, pre-existing (ya en deferred-work.md desde 2-6)
- [x] [Review][Defer] `EXCEPTION WHEN OTHERS THEN NULL` suprime todos los errores del `cron.unschedule` — asimetría en manejo de errores de la migración [src/infrastructure/database/supabase/migrations/011-setup-expire-sessions-and-purge-contact-channel-jobs.sql:5-7] — deferred, pre-existing (patrón establecido desde migración 008)

## Change Log

- 2026-05-13: Implementación completa de historia 4.6 — expiración automática de sesiones de entrega y purga de canal de contacto. Añadidos 4 nuevos tests (20.1–20.4), 3 archivos nuevos, 4 archivos modificados.
