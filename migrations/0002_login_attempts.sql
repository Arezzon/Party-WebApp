CREATE TABLE IF NOT EXISTS LoginAttempts (
  attempt_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_key_time ON LoginAttempts(attempt_key, created_at);
