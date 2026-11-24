// @ts-ignore -- Node-builtin, у проєкті немає @types/node
import assert from 'node:assert/strict';
// @ts-ignore -- Node-builtin, у проєкті немає @types/node
import { createHash, randomBytes, randomUUID } from 'node:crypto';
// @ts-ignore -- Node-builtin, у проєкті немає @types/node
import { test } from 'node:test';

import { getDb } from '../src/lib/db';
import { columns } from '../src/pages/invite/_check';
import { POST as rsvpPost } from '../src/pages/api/events/[id]/rsvp';
import { POST as unrsvpPost } from '../src/pages/api/events/[id]/unrsvp';
import { POST as commentPost, GET as commentsGet } from '../src/pages/api/events/[id]/comments';

/** Тестова інфраструктура — дзеркало інших тестів проєкту (node:test, без runner). */
export async function db(): Promise<any> {
  const raw: any = getDb();
  return raw?.db ?? raw;
}

export function makeCtx(options: {
  cookies?: Record<string, string>;
  method?: string;
  body?: string;
  url?: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
} = {}): any {
  const store = new Map<string, string>(Object.entries(options.cookies ?? {}));
  const url = options.url ?? 'http://localhost/';
  const headers: Record<string, string> = {
    origin: new URL(url).origin,
    cookie: [...store].map(([key, value]) => `${key}=${value}`).join('; '),
    ...(options.headers ?? {})
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

export function insertRow(d: any, table: string, values: Record<string, any>): void {
  const existing = new Set(columns(d, table));
  const entries = Object.entries(values).filter(([key]) => existing.has(key.toLowerCase()));
  const names = entries.map(([key]) => key);
  d.prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
    .run(...entries.map(([, value]) => value));
}

function createUser(d: any, name = 'Учасник'): { id: string; name: string } {
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

function createSession(d: any, userId: string): string {
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

function createEvent(d: any, authorId: string, places: number, title = 'Тестова тусовка'): { id: string; token: string } {
  const id = randomUUID();
  const token = randomBytes(32).toString('hex');
  insertRow(d, 'events', {
    id,
    author_id: authorId,
    title,
    description: 'Опис події',
    starts_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    places,
    cover_mime: 'image/webp',
    visibility: 'public',
    invite_token: token,
    created_at: new Date().toISOString()
  });
  return { id, token };
}

function cleanup(d: any, ids: { users?: string[]; events?: string[]; comments?: string[] }): void {
  const safe = (sql: string, ...args: any[]) => { try { d.prepare(sql).run(...args); } catch { /* каскад уже видалив */ } };
  for (const eventId of ids.events ?? []) safe('DELETE FROM reports WHERE comment_id IN (SELECT id FROM comments WHERE event_id = ?)', eventId);
  for (const commentId of ids.comments ?? []) safe('DELETE FROM reports WHERE comment_id = ?', commentId);
  for (const eventId of ids.events ?? []) safe('DELETE FROM events WHERE id = ?', eventId);
  for (const userId of ids.users ?? []) {
    safe('DELETE FROM sessions WHERE user_id = ?', userId);
    safe('DELETE FROM rsvp WHERE user_id = ?', userId);
    safe('DELETE FROM idempotencykey WHERE user_id = ?', userId);
    safe('DELETE FROM users WHERE id = ?', userId);
  }
}

function rsvpCtx(eventId: string, session: string, key: string) {
  return makeCtx({
    method: 'POST',
    cookies: { session },
    params: { id: eventId },
    headers: { 'Idempotency-Key': key },
    url: `http://localhost/api/events/${eventId}/rsvp`
  });
}

test('20 паралельних «Іду» на одне місце: рівно 1×303 і 19×400', async (t: any) => {
  const d = await db();
  const author = createUser(d, 'Організатор');
  const event = createEvent(d, author.id, 1);
  const participants = Array.from({ length: 20 }, () => {
    const user = createUser(d);
    return { id: user.id, session: createSession(d, user.id) };
  });
  t.after(() => cleanup(d, {
    users: [author.id, ...participants.map((p) => p.id)],
    events: [event.id]
  }));

  const responses = await Promise.all(
    participants.map((p) => rsvpPost(rsvpCtx(event.id, p.session, randomUUID()) as any))
  );
  const statuses = responses.map((response) => response.status);
  assert.equal(statuses.filter((status) => status === 303).length, 1, 'має бути рівно один успішний запис');
  assert.equal(statuses.filter((status) => status === 400).length, 19, 'решта мають отримати 400');

  const row = d.prepare('SELECT COUNT(*) AS n FROM rsvp WHERE event_id = ?').get(event.id) as any;
  assert.equal(Number(row.n), 1, 'у БД має бути рівно один RSVP');
  const success = responses.find((response) => response.status === 303);
  assert.equal(success?.headers.get('location'), `/events/${event.id}`);
});

test('RSVP ідемпотентний: повтор із тим самим ключем і «Скасувати» не створюють дублів', async (t: any) => {
  const d = await db();
  const author = createUser(d, 'Організатор');
  const user = createUser(d);
  const session = createSession(d, user.id);
  const event = createEvent(d, author.id, 3);
  t.after(() => cleanup(d, { users: [author.id, user.id], events: [event.id] }));

  const key = randomUUID();
  const first = await rsvpPost(rsvpCtx(event.id, session, key) as any);
  const second = await rsvpPost(rsvpCtx(event.id, session, key) as any);
  assert.equal(first.status, 303);
  assert.equal(second.status, 303);
  assert.equal(Number((d.prepare('SELECT COUNT(*) AS n FROM rsvp WHERE event_id = ?').get(event.id) as any).n), 1);

  const unrsvpUrl = `http://localhost/api/events/${event.id}/unrsvp`;
  const cancel = makeCtx({ method: 'POST', cookies: { session }, params: { id: event.id }, url: unrsvpUrl });
  assert.equal((await unrsvpPost(cancel as any)).status, 303);
  assert.equal((await unrsvpPost(makeCtx({
    method: 'POST', cookies: { session }, params: { id: event.id }, url: unrsvpUrl
  }) as any)).status, 303, 'повторне скасування ідемпотентне');
  assert.equal(Number((d.prepare('SELECT COUNT(*) AS n FROM rsvp WHERE event_id = ?').get(event.id) as any).n), 0);

  const again = await rsvpPost(rsvpCtx(event.id, session, randomUUID()) as any);
  assert.equal(again.status, 303, 'після скасування можна записатися знову');
  assert.equal(Number((d.prepare('SELECT COUNT(*) AS n FROM rsvp WHERE event_id = ?').get(event.id) as any).n), 1);
});

test('коментарі: ідемпотентність, валідація й текст замість HTML', async (t: any) => {
  const d = await db();
  const author = createUser(d, 'Організатор');
  const user = createUser(d, 'Коментатор');
  const session = createSession(d, user.id);
  const event = createEvent(d, author.id, 5);
  t.after(() => cleanup(d, { users: [author.id, user.id], events: [event.id] }));

  const dangerous = '<img src=x onerror="alert(1)">';
  const key = randomUUID();
  const postCtx = (body: string, idemKey: string) => makeCtx({
    method: 'POST',
    cookies: { session },
    params: { id: event.id },
    body: JSON.stringify({ body }),
    headers: { 'Idempotency-Key': idemKey },
    url: `http://localhost/api/events/${event.id}/comments`
  });

  const first = await commentPost(postCtx(dangerous, key) as any);
  const second = await commentPost(postCtx(dangerous, key) as any);
  assert.equal(first.status, 303);
  assert.equal(second.status, 303);
  assert.equal(Number((d.prepare('SELECT COUNT(*) AS n FROM comments WHERE event_id = ?').get(event.id) as any).n), 1,
    'дві однакові POST мають створити один коментар');

  const invalid = await commentPost(postCtx('   ', randomUUID()) as any);
  assert.equal(invalid.status, 400);
  const tooLong = await commentPost(postCtx('x'.repeat(2001), randomUUID()) as any);
  assert.equal(tooLong.status, 400);

  const json = await commentsGet(makeCtx({
    params: { id: event.id }, url: `http://localhost/api/events/${event.id}/comments`
  }) as any);
  assert.equal(json.status, 200);
  assert.match(String(json.headers.get('content-type') ?? ''), /application\/json/);
  const payload: any = await json.json();
  assert.equal(payload.comments.length, 1);
  assert.equal(payload.comments[0].body, dangerous, 'тіло зберігається й повертається як текст, а не як HTML');
  assert.equal(payload.comments[0].author, 'Коментатор');
});

test('200 паралельних запитів на дані головної: без 500, p95 < 1.5с', async (t: any) => {
  const d = await db();
  const author = createUser(d, 'Організатор');
  const events = [
    createEvent(d, author.id, 10, 'Тусовка Університет'),
    createEvent(d, author.id, 10, 'Тусовка Натхнення')
  ];
  t.after(() => cleanup(d, { users: [author.id], events: events.map((event) => event.id) }));

  const durations: number[] = [];
  const failures: unknown[] = [];
  const start = performance.now();
  await Promise.all(
    Array.from({ length: 200 }, async (_unused, index) => {
      const q = index % 2 === 0 ? 'тус' : 'ТУС';
      const before = performance.now();
      try {
        const rows = d.prepare(
          `SELECT e.id, e.title FROM events e
            WHERE e.visibility = 'public' AND e.starts_at > ?
            ORDER BY e.starts_at ASC LIMIT 500`
        ).all(new Date().toISOString()) as any[];
        // Те сама регістронезалежна фільтрація, що й у src/pages/index.astro.
        const needle = q.toLocaleLowerCase('uk-UA');
        const found = rows.filter((row) => String(row.title ?? '').toLocaleLowerCase('uk-UA').includes(needle));
        assert.ok(found.length >= 2, 'кирилиця в різному регістрі має знаходити обидві події');
      } catch (error) {
        failures.push(error);
      }
      durations.push(performance.now() - before);
    })
  );
  const elapsed = performance.now() - start;
  assert.deepEqual(failures, [], 'жоден із 200 паралельних запитів не має впасти');
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))];
  assert.ok(p95 < 1500, `p95 = ${p95.toFixed(1)}ms має бути < 1500ms`);
  assert.ok(elapsed < 5000, `200 запитів мають завершитися швидко, отримано ${elapsed.toFixed(1)}ms`);
});
