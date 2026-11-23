-- 014-analytics-events.sql — DLT-004: persistencia durable de eventos de analítica (historia 7-7)

CREATE TABLE IF NOT EXISTS analytics_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event         TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL,
  user_id_hash  TEXT NOT NULL CHECK (char_length(user_id_hash) = 64),
  session_id    UUID,
  properties    JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event
  ON analytics_events(event);

CREATE INDEX IF NOT EXISTS idx_analytics_events_occurred_at
  ON analytics_events(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_hash
  ON analytics_events(user_id_hash);
