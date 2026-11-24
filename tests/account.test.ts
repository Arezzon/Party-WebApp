// @ts-ignore -- Node-типи не встановлені, модулі доступні у рантаймі.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
// @ts-ignore
import test from 'node:test';
// @ts-ignore
import assert from 'node:assert/strict';

const Buffer: any = (globalThis as any).Buffer;
import { getDb } from '../src/lib/db';
import { columns } from '../src/pages/invite/_check';

export async function db(): Promise<any> {
  const raw: any = await Promise.resolve(getDb());
  return raw?.db ?? raw;
}

export function makeCtx(options: {
  cookies?: Record<string, string>;
  method?: string;
  body?: string;
  url?: string;
  params?: Record<string, string>;
} = {}): any {
  const store = new Map<string, string>(Object.entries(options.cookies ?? {}));
  const url = options.url ?? 'http://localhost/';
  const headers: Record<string, string> = {
    origin: new URL(url).origin,
    cookie: [...store].map(([key, value]) => `${key}=${value}`).join('; ')
  };
  let body: string | undefined;
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = options.body;
  }
  const request = new Request(url, { method: options.method ?? 'GET', headers, body });
  return {
    cookies: {
      get: (key: string) => (store.has(key) ? { name: key, value: store.get(key) } : undefined),
      getAll: () => [...store].map(([name, value]) => ({ name, value })),
      set: (key: string, value: unknown) => { store.set(key, String(value)); },
      delete: (key: string) => { store.delete(key); }
    },
    locals: {},
    params: options.params ?? {},
    request,
    url: new URL(url),
    redirect: (path: string, status = 302) => new Response(null, { status, headers: { Location: path } }),
    _store: store
  };
}

/** Вставляє рядок, відбираючи лише колонки, що є у фактичній схемі. */
export function insertRow(d: any, table: string, values: Record<string, any>): void {
  const existing = new Set(columns(d, table));
  const entries = Object.entries(values).filter(([key]) => existing.has(key.toLowerCase()));
  const names = entries.map(([key]) => key);
  d.prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
    .run(...entries.map(([, value]) => value));
}

export function createUser(d: any, name = 'Тестовий користувач'): { id: string; name: string } {
  const id = randomUUID();
  insertRow(d, 'users', {
    id,
    email: `${id}@example.test`,
    name,
    password_hash: 'scrypt$16384$8$1$testsalt$testhash',
    created_at: new Date().toISOString()
  });
  return { id, name };
}

export function createSession(d: any, userId: string): string {
  const token = randomBytes(32).toString('hex');
  insertRow(d, 'sessions', {
    token_hash: createHash('sha256').update(token).digest('hex'),
    token,
    user_id: userId,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    created_at: new Date().toISOString()
  });
  return token;
}

export function createEvent(d: any, authorId: string, visibility: 'public' | 'private' = 'public'): { id: string; token: string } {
  const id = randomUUID();
  const token = randomBytes(32).toString('hex');
  insertRow(d, 'events', {
    id,
    author_id: authorId,
    title: 'Тестова подія',
    description: 'Опис',
    starts_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    places: 10,
    cover_mime: 'image/webp',
    visibility,
    invite_token: token,
    created_at: new Date().toISOString()
  });
  return { id, token };
}

export function createComment(d: any, eventId: string, authorId: string | null, name = 'Автор'): string {
  const id = randomUUID();
  insertRow(d, 'comments', {
    id,
    event_id: eventId,
    author_id: authorId,
    author_name_snapshot: name,
    body: 'Тестовий коментар',
    created_at: new Date().toISOString()
  });
  return id;
}

export function createRsvp(d: any, eventId: string, userId: string): void {
  insertRow(d, 'rsvp', {
    event_id: eventId,
    user_id: userId,
    created_at: new Date().toISOString()
  });
}

export function cleanup(d: any, ids: { users?: string[]; events?: string[]; comments?: string[] }): void {
  const safe = (sql: string, ...args: any[]) => { try { d.prepare(sql).run(...args); } catch { /* вже видалено каскадом */ } };
  for (const eventId of ids.events ?? []) safe('DELETE FROM reports WHERE comment_id IN (SELECT id FROM comments WHERE event_id = ?)', eventId);
  for (const commentId of ids.comments ?? []) safe('DELETE FROM reports WHERE comment_id = ?', commentId);
  for (const eventId of ids.events ?? []) safe('DELETE FROM events WHERE id = ?', eventId);
  for (const userId of ids.users ?? []) {
    safe('DELETE FROM sessions WHERE user_id = ?', userId);
    safe('DELETE FROM rsvp WHERE user_id = ?', userId);
    safe('DELETE FROM reports WHERE reporter_id = ?', userId);
    safe('DELETE FROM idempotencykey WHERE user_id = ?', userId);
    safe('DELETE FROM users WHERE id = ?', userId);
  }
}


import { POST as updateProfile } from '../src/pages/api/profile';
import { POST as deleteProfile } from '../src/pages/api/profile/delete';

test('зміна імені: 303, нове ім’я в БД і в знімках коментарів', async (t: any) => {
  const d = await db();
  const user = createUser(d, 'Старе Ім’я');
  const session = createSession(d, user.id);
  const other = createUser(d);
  const event = createEvent(d, other.id);
  const commentId = createComment(d, event.id, user.id, 'Старе Ім’я');
  t.after(() => cleanup(d, { users: [user.id, other.id], events: [event.id], comments: [commentId] }));

  const ctx = makeCtx({
    method: 'POST',
    cookies: { session },
    body: JSON.stringify({ name: 'Нове Ім’я' }),
    url: 'http://localhost/api/profile'
  });
  const response = await updateProfile(ctx as any);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/profile');

  const row = d.prepare('SELECT name FROM users WHERE id = ?').get(user.id) as any;
  assert.equal(row.name, 'Нове Ім’я');
  const comment = d.prepare('SELECT author_name_snapshot FROM comments WHERE id = ?').get(commentId) as any;
  if (comment && 'author_name_snapshot' in comment) assert.equal(comment.author_name_snapshot, 'Нове Ім’я');

  const invalid = await updateProfile(makeCtx({
    method: 'POST', cookies: { session }, body: JSON.stringify({ name: '   ' }), url: 'http://localhost/api/profile'
  }) as any);
  assert.equal(invalid.status, 400);
  const anonymous = await updateProfile(makeCtx({
    method: 'POST', body: JSON.stringify({ name: 'Хтось' }), url: 'http://localhost/api/profile'
  }) as any);
  assert.equal(anonymous.status, 401);
});

test('видалення акаунта: сесія мертва, події/записи зникли, коментар знеособлено', async (t: any) => {
  const d = await db();
  const user = createUser(d, 'Автор');
  const other = createUser(d, 'Інший');
  const guest = createUser(d, 'Гість');
  const session = createSession(d, user.id);
  const foreignEvent = createEvent(d, other.id);
  const ownEvent = createEvent(d, user.id);
  const ownComment = createComment(d, foreignEvent.id, user.id, 'Автор');
  const guestComment = createComment(d, ownEvent.id, guest.id, 'Гість');
  createRsvp(d, ownEvent.id, guest.id);
  createRsvp(d, foreignEvent.id, user.id);
  t.after(() => cleanup(d, {
    users: [user.id, other.id, guest.id],
    events: [foreignEvent.id],
    comments: [ownComment]
  }));

  const response = await deleteProfile(makeCtx({
    method: 'POST', cookies: { session }, body: '{}', url: 'http://localhost/api/profile/delete'
  }) as any);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/');

  assert.equal(d.prepare('SELECT id FROM users WHERE id = ?').get(user.id), undefined, 'користувача видалено');
  assert.equal(d.prepare('SELECT id FROM users WHERE id = ?').get(other.id)?.id, other.id, 'інші акаунти лишилися');
  assert.equal(d.prepare('SELECT id FROM events WHERE id = ? OR author_id = ?').get(ownEvent.id, user.id), undefined, 'події автора видалено');
  assert.equal(d.prepare('SELECT event_id FROM rsvp WHERE user_id = ? OR event_id = ?').get(user.id, ownEvent.id), undefined, 'записи видалено');
  assert.equal(d.prepare('SELECT id FROM comments WHERE id = ?').get(guestComment), undefined, 'коментарі на видаленій події каскадно зникли');

  const anonymized = d.prepare('SELECT author_id, author_name_snapshot, body FROM comments WHERE id = ?').get(ownComment) as any;
  assert.equal(anonymized?.author_id, null, 'автор знеособлений');
  if (anonymized && 'author_name_snapshot' in anonymized) assert.equal(anonymized.author_name_snapshot, 'Знайомець');
  assert.equal(anonymized?.body, 'Тестовий коментар');

  const afterDelete = await updateProfile(makeCtx({
    method: 'POST', cookies: { session }, body: JSON.stringify({ name: 'Вже немає' }), url: 'http://localhost/api/profile'
  }) as any);
  assert.equal(afterDelete.status, 401, 'стара сесія більше не працює');
});
