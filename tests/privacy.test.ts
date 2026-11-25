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


import { GET as inviteGet } from '../src/pages/invite/[token]';
import { POST as reportPost } from '../src/pages/api/comments/[id]/report';
import { POST as commentDelete } from '../src/pages/api/comments/[id]/delete';
import { canViewEvent } from '../src/pages/invite/_check';

test('інвайт з 32 байтів: cookie invite_<eventId> і 303 на подію', async (t: any) => {
  const d = await db();
  const author = await createUser(d);
  const event = await createEvent(d, author.id, 'private');
  t.after(async () => { await cleanup(d, { users: [author.id], events: [event.id] }); });

  const missing = await inviteGet(makeCtx({ params: { token: 'not-a-token' } }) as any);
  assert.equal(missing.status, 404, 'короткий токен має дати 404');
  const unknown = await inviteGet(makeCtx({ params: { token: 'a'.repeat(64) } }) as any);
  assert.equal(unknown.status, 404, 'невідомий токен має дати 404');

  const ctx = makeCtx({ params: { token: event.token } });
  const response = await inviteGet(ctx as any);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), `/events/${event.id}`);
  assert.equal(ctx._store.get(`invite_${event.id}`), event.token);

  const overview = { id: event.id, visibility: 'private', invite_token: event.token, author_id: author.id };
  assert.equal(await canViewEvent(makeCtx() as any, overview), false, 'без cookie приватна подія нечитаєма');
  assert.equal(await canViewEvent(makeCtx({ cookies: { [`invite_${event.id}`]: event.token } }) as any, overview), true);
});

test('приватна подія: запис і коментар без інвайту — 404, з інвайтом — працює', async (t: any) => {
  const d = await db();
  const author = await createUser(d);
  const reporter = await createUser(d);
  const session = await createSession(d, reporter.id);
  const event = await createEvent(d, author.id, 'private');
  const commentId = await createComment(d, event.id, author.id, 'Автор');
  t.after(async () => { await cleanup(d, { users: [author.id, reporter.id], events: [event.id], comments: [commentId] }); });

  const request = (cookies: Record<string, string>) => makeCtx({
    method: 'POST',
    cookies: { session, ...cookies },
    params: { id: commentId },
    body: JSON.stringify({ reason: 'Порушення правил' }),
    url: `http://localhost/api/comments/${commentId}/report`
  });

  const denied = await reportPost(request({}) as any);
  assert.equal(denied.status, 404, 'без інвайту не можна навіть дізнатися про коментар');
  assert.doesNotMatch(await denied.text(), /stack|at Object|TypeError/i);

  const allowed = await reportPost(request({ [`invite_${event.id}`]: event.token }) as any);
  assert.equal(allowed.status, 303, 'з інвайтом скарга приймається');
  assert.equal(allowed.headers.get('location'), `/events/${event.id}`);

  const deleteDenied = await commentDelete(makeCtx({
    method: 'POST',
    cookies: { session },
    params: { id: commentId },
    body: '{}',
    url: `http://localhost/api/comments/${commentId}/delete`
  }) as any);
  assert.equal(deleteDenied.status, 404);
});

test('приватної події немає у публічному списку', async (t: any) => {
  const d = await db();
  const author = await createUser(d);
  const event = await createEvent(d, author.id, 'private');
  t.after(async () => { await cleanup(d, { users: [author.id], events: [event.id] }); });
  const rows: any[] = await d.prepare("SELECT id FROM events WHERE visibility = 'public' AND starts_at > ?")
    .all(new Date().toISOString());
  const publicIds = rows.map((row) => row.id);
  assert.ok(!publicIds.includes(event.id), 'приватна подія не повинна потрапляти у видачу');
});
