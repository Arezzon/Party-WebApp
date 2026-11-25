/**
 * Async storage façade.
 *
 * Workers uses the D1 binding; Node tests fall back to better-sqlite3 through
 * a dynamic import that the Worker bundler ignores. Every statement method is
 * async, so all callers must await it.
 */
import { DATABASE_PATH } from './env';

export type Row = Record<string, any>;

export interface DbStatement {
  bind(...params: unknown[]): DbStatement;
  get<T = Row>(...params: unknown[]): Promise<T | undefined>;
  all<T = Row>(...params: unknown[]): Promise<T[]>;
  run(...params: unknown[]): Promise<{ changes: number; success?: boolean; [key: string]: any }>;
  first<T = Row>(...params: unknown[]): Promise<T | undefined>;
}

export interface DbBatchItem {
  sql: string;
  params?: unknown[];
}

export interface DbHandle {
  prepare(sql: string): DbStatement;
  batch(items: DbBatchItem[]): Promise<any[]>;
  exec(sql: string): Promise<void>;
  close(): void;
}

export interface UserRow extends Row {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}
export interface SessionRow extends Row {
  token_hash: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}
export interface EventRow extends Row {
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
export interface RsvpRow extends Row {
  event_id: string;
  user_id: string;
  created_at: string;
}
export interface CommentRow extends Row {
  id: string;
  event_id: string;
  author_id: string | null;
  author_name_snapshot: string;
  body: string;
  created_at: string;
}
export interface IdempotencyRow extends Row {
  key: string;
  user_id: string;
  kind: string;
  result_id: string;
  created_at: string;
}
export interface ReportRow extends Row {
  id: string;
  comment_id: string | null;
  event_id: string | null;
  reporter_id: string;
  reason: string;
  status: string;
  created_at: string;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS Users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS Sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS Events (id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', starts_at TEXT NOT NULL, places INTEGER NOT NULL CHECK (places > 0), cover_blob BLOB, cover_mime TEXT, visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')), invite_token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS RSVP (event_id TEXT NOT NULL REFERENCES Events(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, PRIMARY KEY (event_id, user_id));
CREATE TABLE IF NOT EXISTS Comments (id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES Events(id) ON DELETE CASCADE, author_id TEXT REFERENCES Users(id) ON DELETE SET NULL, author_name_snapshot TEXT NOT NULL DEFAULT '', body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS IdempotencyKey (key TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE, kind TEXT NOT NULL, result_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS Reports (id TEXT PRIMARY KEY, comment_id TEXT REFERENCES Comments(id) ON DELETE CASCADE, event_id TEXT REFERENCES Events(id) ON DELETE CASCADE, reporter_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL, resolved_at TEXT, resolved_by TEXT);
CREATE TABLE IF NOT EXISTS ModerationActions (id TEXT PRIMARY KEY, report_id TEXT, comment_id TEXT, event_id TEXT, actor_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE, action TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
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
`;

let d1Binding: any = null;
let handlePromise: Promise<DbHandle> | null = null;

/** Called from Astro middleware with the Workers `env.DB` binding. */
export function bindDatabase(binding: any): void {
  if (binding) d1Binding = binding;
}

function d1Statement(d1: any, sql: string): DbStatement {
  let bound: unknown[] = [];
  const make = (params: unknown[]) => {
    const st = d1.prepare(sql);
    return params.length ? st.bind(...params) : st;
  };
  const stmt: DbStatement = {
    bind(...params) {
      bound = params;
      return stmt;
    },
    async get(...params) {
      const result = await make(params.length ? params : bound).all();
      return (result?.results?.[0] ?? undefined) as any;
    },
    async first(...params) {
      const row = await make(params.length ? params : bound).first();
      return (row ?? undefined) as any;
    },
    async all(...params) {
      const result = await make(params.length ? params : bound).all();
      return (result?.results ?? []) as any[];
    },
    async run(...params) {
      const result = await make(params.length ? params : bound).run();
      return {
        ...result,
        success: result?.success !== false,
        changes: Number(result?.meta?.changes ?? 0)
      };
    }
  };
  return stmt;
}

function wrapD1(d1: any): DbHandle {
  return {
    prepare: (sql) => d1Statement(d1, sql),
    async batch(items) {
      return d1.batch(items.map((item) => {
        const st = d1.prepare(item.sql);
        return item.params?.length ? st.bind(...item.params) : st;
      }));
    },
    async exec(sql) { await d1.exec(sql); },
    close() {}
  };
}

async function nodeHandle(): Promise<DbHandle> {
  // Fresh clones have no gitignored data/ directory — create it for the
  // Node-only test fallback instead of failing on a clean CI checkout.
  if (DATABASE_PATH !== ':memory:') {
    // @ts-ignore -- Node builtin; excluded from the Worker bundle
    const { dirname } = await import(/* @vite-ignore */ 'node:path');
    // @ts-ignore -- Node builtin; excluded from the Worker bundle
    const { mkdirSync } = await import(/* @vite-ignore */ 'node:fs');
    mkdirSync(dirname(DATABASE_PATH), { recursive: true });
  }
  // @ts-ignore -- Node-only test fallback; excluded from the Worker bundle
  const mod: any = await import(/* @vite-ignore */ 'better-sqlite3');
  const Database = mod.default ?? mod;
  const raw = new Database(DATABASE_PATH);
  try {
    raw.pragma('journal_mode = WAL');
    raw.pragma('busy_timeout = 5000');
    raw.pragma('foreign_keys = ON');
    raw.exec(SCHEMA_SQL);
  } catch (error) {
    try { raw.close(); } catch { /* ignore */ }
    throw error;
  }
  return {
    prepare(sql) {
      const st = raw.prepare(sql);
      let bound: unknown[] = [];
      const stmt: DbStatement = {
        bind(...params) { bound = params; return stmt; },
        async get(...params) { return st.get(...(params.length ? params : bound)) ?? undefined; },
        async first(...params) { return st.get(...(params.length ? params : bound)) ?? undefined; },
        async all(...params) { return st.all(...(params.length ? params : bound)) as any[]; },
        async run(...params) {
          const result = st.run(...(params.length ? params : bound));
          return { ...result, success: true, changes: Number(result?.changes ?? 0) };
        }
      };
      return stmt;
    },
    async batch(items) {
      return raw.transaction(() => items.map((item) => raw.prepare(item.sql).run(...(item.params ?? []))))();
    },
    async exec(sql) { raw.exec(sql); },
    close() { try { raw.close(); } catch { /* ignore */ } }
  };
}

async function open(): Promise<DbHandle> {
  return d1Binding ? wrapD1(d1Binding) : nodeHandle();
}

export function getDb(): Promise<DbHandle> {
  if (!handlePromise) handlePromise = open();
  return handlePromise;
}

export function closeDb(): void {
  handlePromise = null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export const uuid = newId;
