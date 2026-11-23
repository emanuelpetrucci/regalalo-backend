-- 020-admin-panel-schema.sql — Épica 13 (Panel Administrativo, historia 13-1)

-- ─── Tabla admin_users ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  jwt_version   INTEGER NOT NULL DEFAULT 1,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- ─── Tabla admin_otp_tokens ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_otp_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
  used          BOOLEAN NOT NULL DEFAULT FALSE,
  attempts      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_otp_tokens
  ADD CONSTRAINT admin_otp_max_attempts CHECK (attempts <= 3);

CREATE INDEX IF NOT EXISTS idx_admin_otp_active
  ON admin_otp_tokens(admin_user_id, expires_at)
  WHERE used = FALSE;

ALTER TABLE admin_otp_tokens ENABLE ROW LEVEL SECURITY;

-- ─── Tabla admin_audit_log ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  action           TEXT NOT NULL,
  entity_type      TEXT,
  entity_id        UUID,
  payload_snapshot JSONB NOT NULL DEFAULT '{}',
  ip_address       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_audit_log
  ADD CONSTRAINT admin_audit_valid_action CHECK (
    action IN (
      'admin.login', 'admin.otp_requested', 'user.suspended', 'user.reactivated',
      'user.verification_forced', 'user.reputation_corrected', 'user.no_shows_reset',
      'item.cancelled', 'item.reactivated', 'session.force_expired',
      'report.resolved', 'data.contact_channel_accessed'
    )
  );

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON admin_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_entity
  ON admin_audit_log(entity_type, entity_id);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- ─── Modificación items: campo paused_by_admin ───────────────────────────────

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS paused_by_admin BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'items_paused_by_admin_check'
  ) THEN
    ALTER TABLE items
      ADD CONSTRAINT items_paused_by_admin_check
      CHECK (paused_by_admin = FALSE OR requests_paused = TRUE);
  END IF;
END $$;

-- ─── Modificación reputation_events: ampliar constraint de tipo ──────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reputation_events_type_check'
  ) THEN
    ALTER TABLE reputation_events DROP CONSTRAINT reputation_events_type_check;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reputation_events_type_check'
  ) THEN
    ALTER TABLE reputation_events
      ADD CONSTRAINT reputation_events_type_check
      CHECK (type IN ('delivery_completed', 'no_show', 'admin_correction'));
  END IF;
END $$;

ALTER TABLE reputation_events
  DROP CONSTRAINT IF EXISTS reputation_events_admin_session_check,
  ADD CONSTRAINT reputation_events_admin_session_check
  CHECK (type != 'admin_correction' OR session_id IS NULL);
