// @ts-ignore -- Node-типи не встановлені, модулі доступні у рантаймі.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
// @ts-ignore
import test from 'node:test';
// @ts-ignore
import assert from 'node:assert/strict';

const Buffer: any = (globalThis as any).Buffer;
import { getDb } from '../src/lib/db';

export async function db(): Promise<any> {
  const raw: any = await getDb();
  return raw?.db ?? raw;
}

/** Працює і з синхронними, і з асинхронними statement-ами. */
async function columns(d: any, table: string): Promise<string[]> {
  try {
    const rows: any[] = await d.prepare(`PRAGMA table_info(${table})`).all();
    return rows.map((row) => String(row.name).toLowerCase());
  } catch {
    return [];
  }
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
export async function insertRow(d: any, table: string, values: Record<string, any>): Promise<void> {
  const existing = new Set(await columns(d, table));
  const entries = Object.entries(values).filter(([key]) => existing.has(key.toLowerCase()));
  const names = entries.map(([key]) => key);
  await d.prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
    .run(...entries.map(([, value]) => value));
}

export async function createUser(d: any, name = 'Тестовий користувач'): Promise<{ id: string; name: string }> {
  const id = randomUUID();
  await insertRow(d, 'users', {
    id,
    email: `${id}@example.test`,
    name,
    password_hash: 'scrypt$16384$8$1$testsalt$testhash',
    created_at: new Date().toISOString()
  });
  return { id, name };
}

export async function createSession(d: any, userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await insertRow(d, 'sessions', {
    token_hash: createHash('sha256').update(token).digest('hex'),
    token,
    user_id: userId,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    created_at: new Date().toISOString()
  });
  return token;
}

export async function createEvent(d: any, authorId: string, visibility: 'public' | 'private' = 'public'): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  const token = randomBytes(32).toString('hex');
  await insertRow(d, 'events', {
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

export async function createComment(d: any, eventId: string, authorId: string | null, name = 'Автор'): Promise<string> {
  const id = randomUUID();
  await insertRow(d, 'comments', {
    id,
    event_id: eventId,
    author_id: authorId,
    author_name_snapshot: name,
    body: 'Тестовий коментар',
    created_at: new Date().toISOString()
  });
  return id;
}

export async function createRsvp(d: any, eventId: string, userId: string): Promise<void> {
  await insertRow(d, 'rsvp', {
    event_id: eventId,
    user_id: userId,
    created_at: new Date().toISOString()
  });
}

export async function cleanup(d: any, ids: { users?: string[]; events?: string[]; comments?: string[] }): Promise<void> {
  const safe = async (sql: string, ...args: any[]) => { try { await d.prepare(sql).run(...args); } catch { /* вже видалено каскадом */ } };
  for (const eventId of ids.events ?? []) await safe('DELETE FROM reports WHERE comment_id IN (SELECT id FROM comments WHERE event_id = ?)', eventId);
  for (const commentId of ids.comments ?? []) await safe('DELETE FROM reports WHERE comment_id = ?', commentId);
  for (const eventId of ids.events ?? []) await safe('DELETE FROM events WHERE id = ?', eventId);
  for (const userId of ids.users ?? []) {
    await safe('DELETE FROM sessions WHERE user_id = ?', userId);
    await safe('DELETE FROM rsvp WHERE user_id = ?', userId);
    await safe('DELETE FROM reports WHERE reporter_id = ?', userId);
    await safe('DELETE FROM idempotencykey WHERE user_id = ?', userId);
    await safe('DELETE FROM users WHERE id = ?', userId);
  }
}


import { POST as updateProfile } from '../src/pages/api/profile';
import { POST as deleteProfile } from '../src/pages/api/profile/delete';

test('зміна імені: 303, нове ім’я в БД і в знімках коментарів', async (t: any) => {
  const d = await db();
  const user = await createUser(d, 'Старе Ім’я');
  const session = await createSession(d, user.id);
  const other = await createUser(d);
  const event = await createEvent(d, other.id);
  const commentId = await createComment(d, event.id, user.id, 'Старе Ім’я');
  t.after(async () => { await cleanup(d, { users: [user.id, other.id], events: [event.id], comments: [commentId] }); });

  const ctx = makeCtx({
    method: 'POST',
    cookies: { session },
    body: JSON.stringify({ name: 'Нове Ім’я' }),
    url: 'http://localhost/api/profile'
  });
  const response = await updateProfile(ctx as any);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/profile');

  const row: any = await d.prepare('SELECT name FROM users WHERE id = ?').get(user.id);
  assert.equal(row.name, 'Нове Ім’я');
  const comment: any = await d.prepare('SELECT author_name_snapshot FROM comments WHERE id = ?').get(commentId);
  assert.ok(comment, 'коментар має існувати після зміни імені');
  assert.equal(comment.author_name_snapshot, 'Нове Ім’я');

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
  const user = await createUser(d, 'Автор');
  const other = await createUser(d, 'Інший');
  const guest = await createUser(d, 'Гість');
  const session = await createSession(d, user.id);
  const foreignEvent = await createEvent(d, other.id);
  const ownEvent = await createEvent(d, user.id);
  const ownComment = await createComment(d, foreignEvent.id, user.id, 'Автор');
  const guestComment = await createComment(d, ownEvent.id, guest.id, 'Гість');
  await createRsvp(d, ownEvent.id, guest.id);
  await createRsvp(d, foreignEvent.id, user.id);
  t.after(async () => { await cleanup(d, {
    users: [user.id, other.id, guest.id],
    events: [foreignEvent.id],
    comments: [ownComment]
  }); });

  const response = await deleteProfile(makeCtx({
    method: 'POST', cookies: { session }, body: '{}', url: 'http://localhost/api/profile/delete'
  }) as any);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/');

  assert.equal(await d.prepare('SELECT id FROM users WHERE id = ?').get(user.id), undefined, 'користувача видалено');
  assert.equal((await d.prepare('SELECT id FROM users WHERE id = ?').get(other.id))?.id, other.id, 'інші акаунти лишилися');
  assert.equal(await d.prepare('SELECT id FROM events WHERE id = ? OR author_id = ?').get(ownEvent.id, user.id), undefined, 'події автора видалено');
  assert.equal(await d.prepare('SELECT event_id FROM rsvp WHERE user_id = ? OR event_id = ?').get(user.id, ownEvent.id), undefined, 'записи видалено');
  assert.equal(await d.prepare('SELECT id FROM comments WHERE id = ?').get(guestComment), undefined, 'коментарі на видаленій події каскадно зникли');

  const anonymized: any = await d.prepare('SELECT author_id, author_name_snapshot, body FROM comments WHERE id = ?').get(ownComment);
  assert.ok(anonymized, 'коментар має лишитися після видалення автора');
  assert.equal(anonymized.author_id, null, 'автор знеособлений');
  assert.equal(anonymized.author_name_snapshot, 'Знайомець');
  assert.equal(anonymized?.body, 'Тестовий коментар');

  const afterDelete = await updateProfile(makeCtx({
    method: 'POST', cookies: { session }, body: JSON.stringify({ name: 'Вже немає' }), url: 'http://localhost/api/profile'
  }) as any);
  assert.equal(afterDelete.status, 401, 'стара сесія більше не працює');
});
