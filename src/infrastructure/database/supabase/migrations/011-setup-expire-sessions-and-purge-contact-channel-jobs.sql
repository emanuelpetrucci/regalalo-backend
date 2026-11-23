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
