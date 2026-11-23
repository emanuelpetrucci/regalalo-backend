CREATE TABLE IF NOT EXISTS reputation_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL
             CHECK (type IN ('delivery_completed','no_show')),
  delta      INTEGER NOT NULL,
  session_id UUID REFERENCES delivery_sessions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reputation_events_user
  ON reputation_events(user_id);

CREATE INDEX IF NOT EXISTS idx_reputation_events_session
  ON reputation_events(session_id);
