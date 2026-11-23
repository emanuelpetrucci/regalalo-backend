CREATE TABLE IF NOT EXISTS items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id        UUID NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  condition       TEXT NOT NULL,
  location        GEOGRAPHY(POINT, 4326) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','reserved','completed','cancelled')),
  requests_paused BOOLEAN NOT NULL DEFAULT FALSE,
  degraded_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reserved_at     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_items_location ON items USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_degraded
  ON items(status, created_at)
  WHERE status = 'active' AND degraded_at IS NULL;
