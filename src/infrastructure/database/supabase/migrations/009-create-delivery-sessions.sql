CREATE TABLE IF NOT EXISTS delivery_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          UUID NOT NULL REFERENCES items(id),
  donor_id         UUID NOT NULL REFERENCES users(id),
  receiver_id      UUID NOT NULL REFERENCES users(id),
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','completed','cancelled','expired')),
  contact_channel  TEXT,
  contact_purged   BOOLEAN NOT NULL DEFAULT FALSE,
  donor_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,
  no_show_declared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_delivery_sessions_donor
  ON delivery_sessions(donor_id);
CREATE INDEX IF NOT EXISTS idx_delivery_sessions_receiver
  ON delivery_sessions(receiver_id);
CREATE INDEX IF NOT EXISTS idx_sessions_contact_purge
  ON delivery_sessions(status, completed_at)
  WHERE contact_purged = FALSE;
