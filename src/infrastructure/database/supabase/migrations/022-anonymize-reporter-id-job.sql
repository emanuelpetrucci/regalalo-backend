-- 022-anonymize-reporter-id-job.sql — Épica 14 (Historia 14-7)
-- Job pg_cron: anonimizar reporter_id en reportes cerrados con más de 2 años de antigüedad
-- Frecuencia: primer día del mes, 03:00 UTC (RGPD — D-REP-07)
DO $$
BEGIN
  PERFORM cron.unschedule('anonymize-reporter-id');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;
SELECT cron.schedule(
  'anonymize-reporter-id',
  '0 3 1 * *',
  $$
    UPDATE reports
    SET reporter_id = NULL
    WHERE status IN ('resolved', 'archived')
      AND resolved_at < NOW() - INTERVAL '2 years'
      AND reporter_id IS NOT NULL;
  $$
);
