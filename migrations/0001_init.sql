CREATE TABLE IF NOT EXISTS Users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS Sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS Events (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  places INTEGER NOT NULL CHECK (places > 0),
  cover_blob BLOB,
  cover_mime TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  invite_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS RSVP (
  event_id TEXT NOT NULL REFERENCES Events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS Comments (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES Events(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES Users(id) ON DELETE SET NULL,
  author_name_snapshot TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS IdempotencyKey (
  key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  result_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS Reports (
  id TEXT PRIMARY KEY,
  comment_id TEXT REFERENCES Comments(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES Events(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);
CREATE TABLE IF NOT EXISTS ModerationActions (
  id TEXT PRIMARY KEY,
  report_id TEXT,
  comment_id TEXT,
  event_id TEXT,
  actor_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON Users(email COLLATE NOCASE);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvp ON RSVP(event_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_idem ON IdempotencyKey(user_id, key, kind);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invite ON Events(invite_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON Sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_events_public_future ON Events(visibility, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_author ON Events(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_event ON Comments(event_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_comment ON Reports(comment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_open ON Reports(comment_id, reporter_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_moderation_actions_event ON ModerationActions(event_id);
