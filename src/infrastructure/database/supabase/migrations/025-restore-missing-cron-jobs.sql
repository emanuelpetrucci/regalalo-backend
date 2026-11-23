-- 025-restore-missing-cron-jobs.sql
-- Restaura los 4 jobs pg_cron que no se registraron en producción.
-- Las migraciones 006, 007, 008 y 011 contienen la misma lógica; este
-- archivo los re-aplica de forma idempotente (unschedule + schedule).

-- Job: degradar objetos inactivos (cada hora a :00) — migración 006
DO $$
BEGIN
  PERFORM cron.unschedule('degrade-inactive-items');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;
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

-- Job: purgar imágenes de objetos completados/cancelados (03:00 UTC diario) — migración 007
DO $$
BEGIN
  PERFORM cron.unschedule('purge-item-images');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;
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

-- Job: incrementar cycles_at_limit (02:00 UTC diario) — migración 008
DO $$
BEGIN
  PERFORM cron.unschedule('increment-cycles-at-limit');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;
SELECT cron.schedule(
  'increment-cycles-at-limit',
  '0 2 * * *',
  $$
    UPDATE users
    SET
      cycles_at_limit           = cycles_at_limit + 1,
      last_cycle_incremented_at = NOW()
    WHERE id IN (
      SELECT requester_id
      FROM item_requests
      WHERE created_at >= NOW() - INTERVAL '30 days'
        AND status IN ('pending', 'selected')
      GROUP BY requester_id
      HAVING COUNT(*) >= 3
    )
    AND (
      last_cycle_incremented_at IS NULL
      OR last_cycle_incremented_at < NOW() - INTERVAL '30 days'
    );
  $$
);

-- Job: expirar sesiones de entrega vencidas (cada hora a :30) — migración 011
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
