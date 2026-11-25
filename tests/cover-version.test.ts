// @ts-nocheck -- node:test types are provided at runtime.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const runtime = globalThis as unknown as { process: { env: Record<string, string | undefined> } };
runtime.process.env.DATABASE_PATH = ':memory:';
runtime.process.env.SESSION_SECRET = 'test-secret';

let auth: typeof import('../src/lib/auth.ts');
let events: typeof import('../src/lib/events.ts');

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWOwbvpm3fSNAUIBACy2Bs0ifrYRAAAAAElFTkSuQmCC';
const pngBytes = Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0));
const cover = () => new File([pngBytes], 'cover.png', { type: 'image/png' });
const future = () => new Date(Date.now() + 30 * 86400000).toISOString();

before(async () => {
  auth = await import('../src/lib/auth.ts');
  events = await import('../src/lib/events.ts');
});

test('версія обкладинки змінюється разом із файлом і потрапляє в URL', async () => {
  const user = await auth.registerUser({
    email: `cover-${Date.now()}-${Math.random()}@example.com`,
    password: 'password123',
    name: 'Автор'
  });
  const created = await events.createEvent({
    authorId: user.id,
    title: 'Подія з обкладинкою',
    startsAt: future(),
    places: 10,
    visibility: 'public',
    cover: cover()
  });
  assert.ok(created.coverVersion, 'подія має мати версію обкладинки');
  assert.match(events.coverUrl(created), /\?v=/);

  const updated = await events.updateEvent(created.id, user.id, { cover: cover() });
  assert.notEqual(updated.coverVersion, created.coverVersion, 'нова обкладинка має нову версію');
  assert.match(events.coverUrl(updated), new RegExp(`\\?v=${updated.coverVersion}$`));
});
