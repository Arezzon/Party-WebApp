/**
 * SQLite storage (better-sqlite3, WAL). Seven tables from data-model.md,
 * unique indexes for RSVP, idempotency keys, invites and email.
 *
 * better-sqlite3 has no bundled TypeScript declarations in this project, so
 * the import is suppressed with @ts-ignore and a small typed façade is used.
 */
// @ts-ignore -- runtime module, typed below via SqliteDatabase
import Database from 'better-sqlite3';
// @ts-ignore -- node builtins are provided by the Node runtime
import { mkdirSync } from 'node:fs';
// @ts-ignore -- node builtins are provided by the Node runtime
import { randomUUID } from 'node:crypto';
import { DATABASE_PATH } from './env';

export interface SqliteStatement {
  get(...params: unknown[]): any;
  all(...params: unknown[]): any[];
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}

export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  pragma(name: string, value?: string | number): unknown;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
  close(): void;
}

/**
 * A handle exposing both the statement API and `.db`/`.database` self aliases
 * so callers can use `getDb().prepare(...)` or `getDb().db.prepare(...)`.
 */
export interface DbHandle extends SqliteDatabase {
  db: DbHandle;
  database: DbHandle;
  raw: SqliteDatabase;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}

export interface SessionRow {
  token_hash: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export interface EventRow {
  id: string;
  author_id: string;
  title: string;
  description: string;
  starts_at: string;
  places: number;
  cover_blob: Uint8Array | null;
  cover_mime: string | null;
  visibility: 'public' | 'private' | string;
  invite_token: string;
  created_at: string;
}

export interface RsvpRow {
  event_id: string;
  user_id: string;
  created_at: string;
}

export interface CommentRow {
  id: string;
  event_id: string;
  author_id: string | null;
  author_name_snapshot: string;
  body: string;
  created_at: string;
}

export interface IdempotencyRow {
  key: string;
  user_id: string;
  kind: string;
  result_id: string;
  created_at: string;
}

export interface ReportRow {
  id: string;
  comment_id: string | null;
  event_id: string | null;
  reporter_id: string;
  reason: string;
  created_at: string;
}

const SCHEMA = `
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
`;

let handle: DbHandle | null = null;

function resolvePath(path: string): string {
  if (path === ':memory:' || path.startsWith('file:')) return path;
  const runtimeGlobal = globalThis as unknown as {
    process?: { cwd?: () => string };
  };
  const cwd = typeof runtimeGlobal.process?.cwd === 'function' ? runtimeGlobal.process.cwd() : '.';
  if (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) return path;
  return `${cwd.replace(/\/$/, '')}/${path.replace(/^\.\//, '')}`;
}

function ensureColumn(raw: SqliteDatabase, table: string, column: string, definition: string): void {
  try {
    const columns = (raw.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
      .map((row) => String(row.name).toLowerCase());
    if (!columns.includes(column.toLowerCase())) {
      raw.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  } catch {
    // Table may not exist yet on a fresh database; CREATE TABLE handles it.
  }
}

function openDatabase(): DbHandle {
  const path = resolvePath(DATABASE_PATH);
  if (path !== ':memory:' && !path.startsWith('file:')) {
    const separator = path.lastIndexOf('/');
    if (separator > 0) {
      try { mkdirSync(path.slice(0, separator), { recursive: true }); } catch { /* read-only fs */ }
    }
  }

  const DatabaseCtor = Database as unknown as new (
    filename: string,
    options?: Record<string, unknown>
  ) => SqliteDatabase;
  const raw = new DatabaseCtor(path);
  try {
    raw.pragma('journal_mode = WAL');
    raw.pragma('busy_timeout = 5000');
    raw.pragma('synchronous = NORMAL');
    raw.pragma('foreign_keys = ON');
    raw.exec(SCHEMA);
    // Lightweight migrations for databases created by an older revision.
    ensureColumn(raw, 'Events', 'cover_mime', 'TEXT');
    ensureColumn(raw, 'Events', 'invite_token', "TEXT NOT NULL DEFAULT ''");
    ensureColumn(raw, 'Comments', 'author_name_snapshot', "TEXT NOT NULL DEFAULT ''");
    ensureColumn(raw, 'Reports', 'event_id', 'TEXT');
  } catch (error) {
    try { raw.close(); } catch { /* ignore */ }
    throw error;
  }

  const db = {
    prepare: (sql: string) => raw.prepare(sql),
    exec: (sql: string) => raw.exec(sql),
    pragma: (name: string, value?: string | number) =>
      value === undefined ? raw.pragma(name) : raw.pragma(name, value),
    transaction: <T extends (...args: any[]) => any>(fn: T) => raw.transaction(fn) as T,
    close: () => raw.close(),
    raw
  } as DbHandle;
  db.db = db;
  db.database = db;
  return db;
}

/** Lazily opened singleton. Safe to call from every request. */
export function getDb(): DbHandle {
  if (!handle) handle = openDatabase();
  return handle;
}

/** @deprecated Use getDb(). Kept for callers that import a live handle. */
export const db: DbHandle = getDb();

export function closeDb(): void {
  if (handle) {
    try { handle.close(); } catch { /* already closed */ }
    handle = null;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  const uuid = randomUUID as unknown as () => string;
  return uuid();
}

/** UUID v4 for events, users, comments and reports. */
export const uuid = newId;

export default db;
