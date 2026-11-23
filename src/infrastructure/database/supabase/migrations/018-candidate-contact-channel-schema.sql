-- 018-candidate-contact-channel-schema.sql — Épica 12 (delta-candidato-contacto v1.0)

-- Recovery guard: ensures item_requests exists even if migration 006 was recorded as applied
-- without the table being physically created (pg_cron bypass can cause this in some envs).
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

-- Canal de contacto del candidato en solicitudes
ALTER TABLE item_requests
  ADD COLUMN IF NOT EXISTS contact_channel TEXT;

COMMENT ON COLUMN item_requests.contact_channel IS
  'Canal de contacto aportado por el candidato al postular (12-2). NULL en solicitudes pre-deploy.';

-- Canal copiado del candidato en sesiones de entrega (simétrico al canal del donante)
ALTER TABLE delivery_sessions
  ADD COLUMN IF NOT EXISTS receiver_contact_channel TEXT;

ALTER TABLE delivery_sessions
  ADD COLUMN IF NOT EXISTS receiver_contact_purged BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN delivery_sessions.receiver_contact_channel IS
  'Copia del canal del receptor al crear la sesión (12-2). NULL hasta la selección.';

COMMENT ON COLUMN delivery_sessions.receiver_contact_purged IS
  'TRUE cuando el canal del receptor ha sido purgado por el job pg_cron.';

-- Límite de longitud en canales de contacto (texto libre, máx. 500 chars)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_item_requests_contact_channel_length'
  ) THEN
    ALTER TABLE item_requests
      ADD CONSTRAINT chk_item_requests_contact_channel_length
      CHECK (contact_channel IS NULL OR char_length(contact_channel) <= 500);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_delivery_sessions_receiver_contact_channel_length'
  ) THEN
    ALTER TABLE delivery_sessions
      ADD CONSTRAINT chk_delivery_sessions_receiver_contact_channel_length
      CHECK (receiver_contact_channel IS NULL OR char_length(receiver_contact_channel) <= 500);
  END IF;
END $$;

-- Reemplazar índice parcial para incluir ambos flags de purga
-- (DROP + CREATE porque el predicado cambia; IF NOT EXISTS omitido intencionalmente — el DROP
-- garantiza que no existe antes del CREATE; el runner captura 42P07 en caso de reintento)
DROP INDEX IF EXISTS idx_sessions_contact_purge;

CREATE INDEX idx_sessions_contact_purge
  ON delivery_sessions(status, completed_at)
  WHERE contact_purged = FALSE
     OR receiver_contact_purged = FALSE;

-- Reschedule Job 3: purgar ambos canales de contacto en sesiones cerradas
DO $$
BEGIN
  PERFORM cron.unschedule('purge-contact-channel');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;

SELECT cron.schedule(
  'purge-contact-channel',
  '30 3 * * *',
  $$
    UPDATE delivery_sessions
    SET contact_channel          = NULL,
        contact_purged           = TRUE,
        receiver_contact_channel = NULL,
        receiver_contact_purged  = TRUE
    WHERE (contact_purged = FALSE OR receiver_contact_purged = FALSE)
      AND status IN ('completed', 'cancelled', 'expired')
      AND completed_at < NOW() - INTERVAL '7 days';
  $$
);
