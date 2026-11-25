// @ts-ignore -- Node-типи не встановлені, модулі доступні у рантаймі.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
// @ts-ignore
import test from 'node:test';
// @ts-ignore
import assert from 'node:assert/strict';
// @ts-ignore
import { readFile } from 'node:fs/promises';

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
import { POST as reportPost } from '../src/pages/api/comments/[id]/report';
import { withIdempotency } from '../src/lib/idempotency';

test('MALFORMED JSON і порожні поля — дружні 400/404 без стектрейсів', async (t: any) => {
  const d = await db();
  const user = createUser(d);
  const session = createSession(d, user.id);
  t.after(() => cleanup(d, { users: [user.id] }));

  const badJson = await updateProfile(makeCtx({
    method: 'POST', cookies: { session }, body: '{not json', url: 'http://localhost/api/profile'
  }) as any);
  assert.equal(badJson.status, 400);
  assert.doesNotMatch(await badJson.text(), /stack trace|\bat\s+\S+\s+\(|TypeError|SyntaxError/i);

  const tooLong = await updateProfile(makeCtx({
    method: 'POST', cookies: { session }, body: JSON.stringify({ name: 'x'.repeat(81) }), url: 'http://localhost/api/profile'
  }) as any);
  assert.equal(tooLong.status, 400);

  const missingComment = await reportPost(makeCtx({
    method: 'POST', cookies: { session }, params: { id: randomUUID() },
    body: JSON.stringify({ reason: 'спам' }), url: 'http://localhost/api/comments/unknown/report'
  }) as any);
  assert.equal(missingComment.status, 404);
  assert.doesNotMatch(await missingComment.text(), /stack trace|\bat\s+\S+\s+\(/i);
});

test('дві однакові POST з одним Idempotency-Key створюють одну сутність', async (t: any) => {
  const d = await db();
  const user = createUser(d);
  t.after(() => cleanup(d, { users: [user.id] }));

  const key = randomUUID();
  let created = 0;
  const action = async () => { created += 1; return `comment-${created}`; };
  const first: any = await withIdempotency(user.id, key, 'comment', action);
  const second: any = await withIdempotency(user.id, key, 'comment', action);
  assert.equal(created, 1, 'функція створення викликана один раз');
  const firstId = first?.id ?? first;
  const secondId = second?.id ?? second;
  assert.equal(secondId, firstId, 'повтор повертає той самий результат');
});

test('завантаження: >10MB — 413, HTML/EXE/SVG-with-script — 400', async (t: any) => {
  const images: any = await import('../src/lib/images');
  const convert = images.toWebPBlob ?? images.encodeWebP ?? images.processCover ?? images.convertToWebP ?? images.toWebP;
  assert.equal(typeof convert, 'function', 'images.ts має експортувати конвертер зображень у WebP');

  const call = async (bytes: Uint8Array, name: string, type: string) => {
    const attempts: Array<() => Promise<any>> = [
      () => convert(bytes),
      () => convert(bytes, name),
      () => convert(new File([bytes as any], name, { type })),
      () => convert({ data: bytes, name, type })
    ];
    const errors: any[] = [];
    for (const attempt of attempts) {
      try { return await attempt(); } catch (error) { errors.push(error); }
    }
    // Пріоритет — помилка розміру (413), навіть якщо пізніші форми виклику дали 400.
    throw errors.find((error) => error?.status === 413 || error?.statusCode === 413) ?? errors[0];
  };

  const huge = Buffer.alloc(11 * 1024 * 1024, 0x89);
  await assert.rejects(
    () => call(huge, 'huge.png', 'image/png'),
    (error: any) => {
      const status = error?.status ?? error?.statusCode ?? error?.code;
      return status === 413 || /завеликий|10\s?MB|large|size|розмір/i.test(String(error?.message ?? error));
    },
    'файл понад 10MB має відхилятися з 413'
  );

  const dangerous: Array<[Uint8Array, string, string]> = [
    [Buffer.from('<script>alert(1)</script>'), 'cover.png', 'image/png'],
    [Buffer.from('MZ\x90\x00This is a Windows executable'), 'cover.exe', 'application/octet-stream'],
    [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'cover.svg', 'image/svg+xml']
  ];
  for (const [bytes, name, type] of dangerous) {
    await assert.rejects(
      () => call(bytes, name, type),
      (error: any) => {
        const status = error?.status ?? error?.statusCode ?? error?.code;
        return status === 400 || /недійсний|формат|тип|image|webp|magic|підтрим/i.test(String(error?.message ?? error));
      },
      `${name} має відхилятися з 400`
    );
  }
});

test('шапка на 375px: підписи не ламаються по складах', async () => {
  const source = await readFile(new URL('../src/components/site/SiteChrome.tsx', import.meta.url), 'utf8');
  assert.match(source, /white-space:\s*nowrap|whitespace-nowrap/, 'пункти шапки мають бути нерозривними');
  assert.doesNotMatch(source, /word-break:\s*break-all/, 'не можна рвати слова по складах');
});

test('валідний PNG перекодується у WebP', async (t: any) => {
  const images: any = await import('../src/lib/images');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const convert = images.toWebPBlob ?? images.encodeWebP ?? images.processCover ?? images.convertToWebP ?? images.toWebP;
  let result: any;
  for (const attempt of [
    () => convert(png),
    () => convert(png, 'pixel.png'),
    () => convert(new File([png], 'pixel.png', { type: 'image/png' })),
    () => convert({ data: png, name: 'pixel.png', type: 'image/png' })
  ]) {
    try { result = await attempt(); break; } catch { /* пробуємо наступну форму виклику */ }
  }
  assert.ok(result, 'PNG має успішно перекодуватися');
  let bytes: Uint8Array;
  if (result instanceof Uint8Array) bytes = result;
  else if (typeof Blob !== 'undefined' && result instanceof Blob) bytes = new Uint8Array(await result.arrayBuffer());
  else if (result?.blob instanceof Uint8Array) bytes = result.blob;
  else bytes = new Uint8Array(result?.data ?? result?.buffer ?? []);
  assert.equal(Buffer.from(bytes.slice(0, 4)).toString('ascii'), 'RIFF', 'результат має бути WebP (RIFF)');
  assert.equal(Buffer.from(bytes.slice(8, 12)).toString('ascii'), 'WEBP');
});
