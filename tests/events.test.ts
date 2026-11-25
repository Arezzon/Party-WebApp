// @ts-ignore -- node:test is provided by Node; no @types/node in this project
import { test, before } from 'node:test';
// @ts-ignore -- node:assert is provided by Node; no @types/node in this project
import assert from 'node:assert/strict';

const runtime = globalThis as unknown as { process: { env: Record<string, string | undefined> } };
runtime.process.env.DATABASE_PATH = ':memory:';
runtime.process.env.SESSION_SECRET = 'test-secret';

let events: typeof import('../src/lib/events.ts');
let auth: typeof import('../src/lib/auth.ts');
let dbModule: typeof import('../src/lib/db.ts');

import { detectImageMime } from '../src/lib/validation';

/** Minimal valid 1×1 PNG. Filename and MIME are deliberately misleading. */
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWOwbvpm3fSNAUIBACy2Bs0ifrYRAAAAAElFTkSuQmCC';
const pngBytes = Uint8Array.from(atob(PNG_BASE64), (char) => char.charCodeAt(0));

/** Приймає і синхронний throw, і async reject (БД-виклики стали асинхронними). */
async function fails(
  fn: () => unknown | Promise<unknown>,
  check?: (error: any) => boolean,
  message = 'очікувалася помилка'
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (check && !check(error)) assert.fail(`${message}: неочікувана помилка ${String(error)}`);
    return;
  }
  assert.fail(`${message}: помилки не було`);
}

function coverFile(): File {
  return new File([pngBytes], '../../../../tmp/pwned.png', { type: 'image/png' });
}

function future(months = 1): string {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

before(async () => {
  events = await import('../src/lib/events.ts');
  auth = await import('../src/lib/auth.ts');
  dbModule = await import('../src/lib/db.ts');
});

async function author() {
  return auth.registerUser({ email: `author-${Date.now()}-${Math.random()}@example.com`, password: 'password123', name: 'Автор' });
}

test('створення події: UUID, 32 байти інвайту, обкладинка зберігається оригіналом', async () => {
  const user = await author();
  const event = await events.createEvent({
    authorId: user.id,
    title: 'Тестова тусовка',
    description: 'Опис події',
    startsAt: future(),
    places: 10,
    visibility: 'public',
    cover: coverFile()
  });

  assert.match(event.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(event.inviteToken, /^[0-9a-f]{64}$/);
  assert.equal(event.visibility, 'public');
  assert.equal(event.places, 10);
  assert.ok(event.coverBlob);
  const bytes = new Uint8Array(event.coverBlob!);
  // Workers не перекодуває: байти обкладинки зберігаються як є.
  assert.deepEqual(Array.from(bytes.slice(0, pngBytes.length)), Array.from(pngBytes), 'PNG зберігається без змін');
  assert.equal(detectImageMime(bytes), 'image/png');
  assert.ok(
    ['image/png', 'image/jpeg', 'image/webp'].includes(String(event.coverMime)),
    'разом з обкладинкою має зберігатися безпечний MIME зображення'
  );

  const response = await events.coverResponse(event);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), event.coverMime, 'Content-Type має відповідати збереженому MIME');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(String(response.headers.get('cache-control')), /public/);

  const etag = response.headers.get('etag');
  assert.ok(etag, 'обкладинка має ETag для кешування');
  const revalidated = await events.coverResponse(
    event,
    new Request('https://example.test/cover', { headers: { 'If-None-Match': etag! } })
  );
  assert.equal(revalidated.status, 304, 'If-None-Match має повертати 304 без тіла');
});

test('невалідні places (0, -1, 1.5, 7abc, 1e20) відхиляються зі статусом 400', async () => {
  const user = await author();
  for (const places of [0, -1, 1.5, '7abc', '1e20', 10001]) {
    await assert.rejects(
      () => events.createEvent({
        authorId: user.id,
        title: 'Подія',
        startsAt: future(),
        places,
        cover: coverFile()
      }),
      (error: unknown) => (error as { status?: number }).status === 400,
      `places=${places}`
    );
  }
});

test('порожня назва й дата 9999 відхиляються', async () => {
  const user = await author();
  await assert.rejects(
    () => events.createEvent({ authorId: user.id, title: '   ', startsAt: future(), places: 3, cover: coverFile() }),
    (error: unknown) => (error as { status?: number }).status === 400
  );
  await assert.rejects(
    () => events.createEvent({ authorId: user.id, title: 'Подія', startsAt: '9999-01-01T19:30:00.000Z', places: 3, cover: coverFile() }),
    (error: unknown) => (error as { status?: number }).status === 400
  );
});

test('редагування й видалення чужої події дає 403', async () => {
  const owner = await author();
  const stranger = await author();
  const event = await events.createEvent({
    authorId: owner.id,
    title: 'Чужа подія',
    startsAt: future(),
    places: 5,
    cover: coverFile()
  });

  await fails(
    () => events.updateEvent(event.id, stranger.id, { title: 'Взлом' }),
    (error) => error?.status === 403
  );
  await fails(
    () => events.deleteEvent(event.id, stranger.id),
    (error) => error?.status === 403
  );
  assert.equal((await events.getEvent(event.id))?.title, 'Чужа подія');

  const updated = await events.updateEvent(event.id, owner.id, { title: 'Нова назва' });
  assert.equal(updated.title, 'Нова назва');
});

test('зменшення місць нижче кількості записаних дає 400', async () => {
  const owner = await author();
  const guest = await author();
  const event = await events.createEvent({
    authorId: owner.id,
    title: 'Подія з учасником',
    startsAt: future(),
    places: 2,
    cover: coverFile()
  });
  const db = await dbModule.getDb();
  await db.prepare('INSERT INTO RSVP (event_id, user_id, created_at) VALUES (?, ?, ?)')
    .run(event.id, guest.id, new Date().toISOString());

  assert.equal(await events.rsvpCount(event.id), 1);
  await assert.rejects(
    () => events.updateEvent(event.id, owner.id, { places: 0 }),
    (error: unknown) => (error as { status?: number }).status === 400
  );
  const ok = await events.updateEvent(event.id, owner.id, { places: 2 });
  assert.equal(ok.places, 2);
  assert.equal((await events.getAttendees(event.id)).length, 1);
});

test('Idempotency-Key: повторний POST створює лише одну подію', async () => {
  const user = await author();
  const key = crypto.randomUUID();
  const input = {
    authorId: user.id,
    title: 'Ідемпотентна подія',
    startsAt: future(2),
    places: 4,
    visibility: 'public' as const,
    cover: coverFile(),
    idempotencyKey: key
  };
  const first = await events.createEvent(input);
  const second = await events.createEvent({ ...input, cover: coverFile() });
  assert.equal(second.id, first.id);
  assert.equal((await events.listUserEvents(user.id)).length, 1);
});

test('приватна подія недоступна без інвайту', async () => {
  const user = await author();
  const event = await events.createEvent({
    authorId: user.id,
    title: 'Приватна подія',
    startsAt: future(),
    places: 1,
    visibility: 'private',
    cover: coverFile()
  });
  assert.equal(await events.canViewEvent(event, null), false);
  assert.equal(await events.canViewEvent(event, event.inviteToken), true);
  assert.equal((await events.listPublicEvents('приватна')).length, 0);
  assert.equal((await events.listPublicEvents('тусовка')).length >= 1, true);
});
