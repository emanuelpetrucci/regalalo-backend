-- 024-fix-reports-reason-check.sql — re-alinea constraint de motivos de reportes

BEGIN;

DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  IF to_regclass('public.reports') IS NULL THEN
    RETURN;
  END IF;

  FOR constraint_record IN
    SELECT DISTINCT c.conname
    FROM pg_constraint c
    JOIN pg_class t
      ON t.oid = c.conrelid
    JOIN pg_namespace n
      ON n.oid = t.relnamespace
    JOIN pg_attribute a
      ON a.attrelid = t.oid
     AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'c'
      AND n.nspname = 'public'
      AND t.relname = 'reports'
      AND a.attname = 'reason'
  LOOP
    EXECUTE format('ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
  END LOOP;
END $$;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_reason_check
  CHECK (reason IN (
    'contenido_inadecuado',
    'fraude_o_enganio',
    'spam',
    'objeto_ilegal',
    'objeto_peligroso',
    'información_falsa',
    'comportamiento_abusivo',
    'otro'
  ));

COMMIT;
