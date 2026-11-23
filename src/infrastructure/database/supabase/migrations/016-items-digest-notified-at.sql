-- EVT-015: digest horario de objetos cercanos — idempotencia pre-envío
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS digest_notified_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_items_digest_pending
  ON items(created_at)
  WHERE digest_notified_at IS NULL
    AND status = 'active';
