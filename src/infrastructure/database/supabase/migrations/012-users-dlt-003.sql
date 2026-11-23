-- 012-users-dlt-003.sql — DLT-003: ampliación tabla users

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name         TEXT,
  ADD COLUMN IF NOT EXISTS last_name          TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url         TEXT,
  ADD COLUMN IF NOT EXISTS phone              TEXT,
  ADD COLUMN IF NOT EXISTS email_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'es';

-- Backfill identidad antes de NOT NULL (usuarios de v1.2 sin nombre)
UPDATE users
SET
  first_name = COALESCE(NULLIF(TRIM(first_name), ''), 'Usuario'),
  last_name  = COALESCE(NULLIF(TRIM(last_name), ''), 'Pendiente')
WHERE first_name IS NULL OR last_name IS NULL;

ALTER TABLE users
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN last_name SET NOT NULL;
