// @ts-ignore -- node:test is provided by Node; no @types/node in this project
import { test, before } from 'node:test';
// @ts-ignore -- node:assert is provided by Node; no @types/node in this project
import assert from 'node:assert/strict';

const runtime = globalThis as unknown as { process: { env: Record<string, string | undefined> } };
runtime.process.env.DATABASE_PATH = ':memory:';
runtime.process.env.SESSION_SECRET = 'test-secret';

let auth: typeof import('../src/lib/auth.ts');

before(async () => {
  auth = await import('../src/lib/auth.ts');
});

test('async scrypt хеш перевіряється обома шляхами', async () => {
  const password = 'пароль-для-асинхронного-тесту';
  const hash = await (auth as any).hashPasswordAsync(password);

  assert.match(hash, /^scrypt\$16384\$8\$1\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.equal(await (auth as any).verifyPasswordAsync(password, hash), true);
  assert.equal(await (auth as any).verifyPasswordAsync('не той пароль', hash), false);
  assert.equal((auth as any).verifyPassword(password, hash), true);
  assert.equal(await (auth as any).verifyPasswordAsync(password, (auth as any).hashPassword(password)), true);
});

test('пакет із 200 асинхронних перевірок не блокує event loop', async () => {
  const hash = await (auth as any).hashPasswordAsync('event-loop-password');
  const pending = Array.from({ length: 200 }, () => (auth as any).verifyPasswordAsync('event-loop-password', hash));

  const started = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const tickMs = Date.now() - started;

  assert.ok(tickMs < 250, `таймер затримався на ${tickMs} мс — scrypt блокує цикл подій`);
  assert.deepEqual(await Promise.all(pending), Array(200).fill(true));
});
