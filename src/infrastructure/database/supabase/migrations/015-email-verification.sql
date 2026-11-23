-- 015-email-verification.sql — Verificación de email: columnas de token en users

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS verification_token_hash       TEXT,
  ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_resend_at         TIMESTAMPTZ;

-- Búsqueda por token en GET /auth/verify-email (solo usuarios pendientes)
CREATE INDEX IF NOT EXISTS idx_users_verification_token
  ON users(verification_token_hash)
  WHERE email_verified = FALSE;
