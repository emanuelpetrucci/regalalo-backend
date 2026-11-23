CREATE INDEX IF NOT EXISTS idx_users_location ON users USING GIST(location);
