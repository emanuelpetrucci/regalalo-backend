CREATE TABLE IF NOT EXISTS item_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES items(id),
  requester_id UUID NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','selected','rejected','cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, requester_id)
);

CREATE INDEX IF NOT EXISTS idx_requests_item ON item_requests(item_id);
CREATE INDEX IF NOT EXISTS idx_requests_requester_date
  ON item_requests(requester_id, created_at);

-- Job pg_cron: degradar objetos inactivos (corre cada hora a :00)
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
