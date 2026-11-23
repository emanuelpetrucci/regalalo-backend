-- Habilitar PostGIS si no está habilitado
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                     TEXT NOT NULL UNIQUE,
  password_hash             TEXT NOT NULL,
  postal_code               TEXT NOT NULL,
  location                  GEOGRAPHY(POINT, 4326) NOT NULL,
  reputation_score          INTEGER NOT NULL DEFAULT 0,
  total_received            INTEGER NOT NULL DEFAULT 0,
  total_donated             INTEGER NOT NULL DEFAULT 0,
  consecutive_no_shows      INTEGER NOT NULL DEFAULT 0,
  cycles_at_limit           INTEGER NOT NULL DEFAULT 0,
  last_cycle_incremented_at TIMESTAMPTZ,
  jwt_version               INTEGER NOT NULL DEFAULT 1,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at            TIMESTAMPTZ
);

CREATE INDEX idx_users_location ON users USING GIST(location);
CREATE INDEX idx_users_cycle_increment
  ON users(last_cycle_incremented_at)
  WHERE cycles_at_limit > 0;
