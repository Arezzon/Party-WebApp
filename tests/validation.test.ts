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
import { detectImageMime } from '../src/lib/validation';

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
import { POST as reportPost } from '../src/pages/api/comments/[id]/report';
import { withIdempotency } from '../src/lib/idempotency';

test('MALFORMED JSON і порожні поля — дружні 400/404 без стектрейсів', async (t: any) => {
  const d = await db();
  const user = await createUser(d);
  const session = await createSession(d, user.id);
  t.after(async () => { await cleanup(d, { users: [user.id] }); });

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
  const user = await createUser(d);
  t.after(async () => { await cleanup(d, { users: [user.id] }); });

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

test('завантаження: >1.5 МіБ — 413; HTML/EXE/SVG — 400 за magic bytes', async () => {
  const images: any = await import('../src/lib/images');
  const processCover = images.processCover ?? images.processUpload ?? images.validateAndConvertImage ?? images.encodeWebP;
  assert.equal(typeof processCover, 'function', 'images.ts має валідувати завантаження');

  // Валідний PNG-префікс, але розмір перевищує ліміт D1 для BLOB (1.5 МіБ).
  const pngMagic = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const limit = images.D1_MAX_COVER_BYTES ?? 1_500_000;
  const huge = new Uint8Array(limit + 1);
  huge.set(pngMagic);
  await assert.rejects(
    () => processCover(huge),
    (error: any) => {
      const status = error?.status ?? error?.statusCode ?? error?.code;
      return status === 413 || /завеликий|1[,.\s]?5|large|size|розмір/i.test(String(error?.message ?? error));
    },
    'файл понад 1.5 МіБ має відхилятися з 413'
  );

  // Назва та заявлений MIME навмисно оманливі — вирішує лише вміст.
  const dangerous: Array<[Uint8Array, string, string]> = [
    [Buffer.from('<script>alert(1)</script>'), 'cover.png', 'image/png'],
    [Buffer.from('MZ\x90\x00This is a Windows executable'), 'cover.exe', 'application/octet-stream'],
    [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'cover.svg', 'image/svg+xml']
  ];
  for (const [bytes, name, type] of dangerous) {
    await assert.rejects(
      () => processCover(new File([bytes as any], name, { type })),
      (error: any) => {
        const status = error?.status ?? error?.statusCode ?? error?.code;
        return status === 400 || /недійсний|формат|тип|image|magic|підтрим/i.test(String(error?.message ?? error));
      },
      `${name} має відхилятися з 400`
    );
  }
});

test('шапка на 375px: підписи не ламаються по складах', async () => {
  const nav = await readFile(new URL('../src/components/site/SiteHeader.astro', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  assert.match(nav + css, /white-space:\s*nowrap/, 'пункти шапки мають бути нерозривними');
  assert.doesNotMatch(nav + css, /word-break:\s*break-all/, 'не можна рвати слова по складах');
});

test('сітка подій на мобільному: дата прихована, стрілка в першому рядку', async () => {
  const css = await readFile(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  assert.match(css, /\.event-row \{[^}]*grid-template-columns:\s*48px minmax\(0, 1fr\) 20px/, 'на мобільному має бути 3 колонки');
  assert.match(css, /\.event-row \.event-row__date \{\s*display:\s*none/, 'дата має бути прихована з більшою специфічністю, ніж .event-date');
  assert.match(css, /\.event-row__arrow \{[^}]*justify-self:\s*end/, 'стрілка має бути в останній колонці');
  const home = await readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
  assert.match(home, /hidden text-xs text-muted-foreground sm:block/, 'дубль дати на мобільному має бути прихований');
});

test('довга назва події без пробілів не розтягує сторінку події', async () => {
  const detail = await readFile(new URL('../src/components/site/EventDetail.astro', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  assert.match(css, /\.display \{[^}]*overflow-wrap:\s*anywhere/, 'заголовок має переносити довге слово без пробілів');
  assert.match(detail, /min-w-0 order-2 lg:order-1/, 'grid-дитина має min-w-0, інакше min-width:auto розтягує трек');
});

test('гостьова картка коментарів: центрований CTA, іконка згори й ієрархія', async () => {
  const detail = await readFile(new URL('../src/components/site/EventDetail.astro', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  assert.match(detail, /class="cta-card p-6 sm:p-7"/, 'картка має окремий CTA-стиль');
  assert.ok(detail.includes('grid h-full grid-rows-[auto_auto_auto] content-center justify-items-center gap-y-5 text-center'), 'вміст відцентрований по обох осях');
  const iconAt = detail.indexOf('cta-card__icon');
  const headingAt = detail.indexOf('<h3 class="mt-2 text-base font-medium leading-snug">');
  const buttonAt = detail.indexOf('class="pill pill--primary group"');
  assert.ok(iconAt > -1 && headingAt > iconAt && buttonAt > headingAt, 'порядок: іконка → текст → кнопка');
  assert.match(detail, /<h2 class="eyebrow">Учасники/, 'секція учасників має заголовок другого рівня');
  assert.match(detail, /<h2 class="eyebrow">Коментарі/, 'секція коментарів має заголовок другого рівня');
  assert.match(detail, /<h3 class="mt-2 text-base font-medium leading-snug">/, 'назва в картці — заголовок третього рівня');
  assert.match(css, /\.cta-card \{[^}]*radial-gradient/, 'фон картки має акцентний градієнт');
});

test('створення події доступне тільки після await requireUser', async () => {
  const page = await readFile(new URL('../src/pages/events/new.astro', import.meta.url), 'utf8');
  assert.match(page, /await requireUser\(Astro\)/, 'перевірка сесії має бути асинхронною');
  assert.match(page, /Astro\.redirect\('\/login\?next=\/events\/new'/, 'анонім має йти на логін');
});

test('валідний PNG зберігається оригіналом з MIME за magic bytes', async () => {
  const images: any = await import('../src/lib/images');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  // Ім'я та MIME навмисно хибні: у Workers немає перекодування, лише sniffing.
  const result: any = await images.processCover(new File([png], 'pixel.exe', { type: 'text/html' }));
  assert.ok(result, 'PNG має проходити валідацію');

  let bytes: Uint8Array;
  if (result instanceof Uint8Array) bytes = result;
  else if (typeof Blob !== 'undefined' && result instanceof Blob) bytes = new Uint8Array(await result.arrayBuffer());
  else if (result?.blob instanceof Uint8Array) bytes = result.blob;
  else bytes = new Uint8Array(result?.bytes ?? result?.data ?? result?.buffer ?? []);

  assert.equal(Buffer.from(bytes).toString('base64'), png.toString('base64'), 'байти обкладинки зберігаються без змін');
  assert.equal(Buffer.from(bytes.slice(0, 8)).toString('hex'), '89504e470d0a1a0a', 'має зберегтися PNG-magic');
  assert.notEqual(Buffer.from(bytes.slice(0, 4)).toString('ascii'), 'RIFF', 'не має бути перекодування у WebP');
  assert.equal(detectImageMime(bytes), 'image/png');
  assert.equal(result.mime ?? result.sourceMime, 'image/png', 'MIME визначається вмістом, а не ім\'ям файлу');
  assert.equal(Number(result.size ?? bytes.length), png.length);

  const headers = images.coverHeaders(result.mime ?? 'image/png');
  assert.equal(headers['Content-Type'], 'image/png');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
});
