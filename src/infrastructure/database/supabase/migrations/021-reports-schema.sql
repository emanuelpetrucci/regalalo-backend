-- 021-reports-schema.sql — Épica 14 (Sistema de Reportes, historia 14-1)
-- Dependencia: 020-admin-panel-schema.sql (tabla admin_users requerida)

-- ─── Tabla reports ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_entity_type  TEXT NOT NULL
                        CHECK (reported_entity_type IN ('item', 'user')),
  reported_entity_id    UUID NOT NULL,
  reason                TEXT NOT NULL
                        CHECK (reason IN (
                          'contenido_inadecuado',
                          'fraude_o_enganio',
                          'spam',
                          'objeto_ilegal',
                          'objeto_peligroso',
                          'información_falsa',
                          'comportamiento_abusivo',
                          'otro'
                        )),
  description           TEXT CHECK (char_length(description) <= 500),
  entity_snapshot       JSONB NOT NULL DEFAULT '{}',
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'resolved', 'archived')),
  resolved_at           TIMESTAMPTZ,
  resolved_by           UUID REFERENCES admin_users(id),
  resolution_action     TEXT CHECK (resolution_action IN (
                          'archive', 'warn_user', 'cancel_item', 'suspend_user'
                        )),
  resolution_note       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reports' AND policyname = 'reports_select_own'
  ) THEN
    CREATE POLICY reports_select_own
      ON reports FOR SELECT
      USING (reporter_id = auth.uid());
  END IF;
END $$;

-- ─── Índices ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_reports_status_created
  ON reports(status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_reports_entity
  ON reports(reported_entity_type, reported_entity_id);

CREATE INDEX IF NOT EXISTS idx_reports_reporter_created
  ON reports(reporter_id, created_at DESC)
  WHERE reporter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_reporter_id
  ON reports(reporter_id)
  WHERE reporter_id IS NOT NULL;

-- ─── Vista ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW reports_summary_by_entity AS
SELECT
  reported_entity_type,
  reported_entity_id,
  COUNT(*)                                          AS total_reports,
  COUNT(*) FILTER (WHERE status = 'pending')        AS pending_reports,
  COUNT(*) FILTER (WHERE status = 'resolved')       AS resolved_reports,
  COUNT(*) FILTER (WHERE status = 'archived')       AS archived_reports,
  MAX(created_at)                                   AS last_report_at
FROM reports
GROUP BY reported_entity_type, reported_entity_id;
