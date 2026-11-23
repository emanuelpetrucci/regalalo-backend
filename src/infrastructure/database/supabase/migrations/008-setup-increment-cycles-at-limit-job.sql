-- Job pg_cron: incrementar cycles_at_limit para usuarios que agotaron su límite (corre a las 02:00 UTC diario)
-- Protección de doble incremento via last_cycle_incremented_at (ventana deslizante de 30 días)
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
