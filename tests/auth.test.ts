// @ts-ignore -- node:test is provided by Node; no @types/node in this project
import { test, before } from 'node:test';
// @ts-ignore -- node:assert is provided by Node; no @types/node in this project
import assert from 'node:assert/strict';

// Isolate every test run in its own in-memory SQLite database. env.ts reads
// DATABASE_PATH at import time, so assign it before importing app modules.
const runtime = globalThis as unknown as { process: { env: Record<string, string | undefined> } };
runtime.process.env.DATABASE_PATH = ':memory:';
runtime.process.env.SESSION_SECRET = 'test-secret';

let auth: typeof import('../src/lib/auth.ts');

before(async () => {
  auth = await import('../src/lib/auth.ts');
});

/** Приймає і синхронний throw, і async reject — БД-виклики тепер асинхронні. */
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

test('пароль зберігається у форматі scrypt і перевіряється константним часом', async () => {
  const hash = await auth.hashPassword('correct horse battery staple');

  // Коефіцієнти беруться з конфігурації модуля, а не хардкодяться в тесті.
  const n = (auth as any).SCRYPT_N ?? 16384;
  const r = (auth as any).SCRYPT_R ?? 8;
  const p = (auth as any).SCRYPT_P ?? 1;
  const keyHex = ((auth as any).SCRYPT_KEYLEN ?? 64) * 2;
  const format = new RegExp(
    `^scrypt\\$${n}\\$${r}\\$${p}\\$[0-9a-f]{32}\\$[0-9a-f]{${keyHex}}$`
  );
  assert.match(hash, format, 'формат scrypt$<N>$<r>$<p>$<salt>$<hash>');
  assert.equal(await auth.verifyPassword('correct horse battery staple', hash), true);
  assert.equal(await auth.verifyPassword('wrong password', hash), false);
  assert.equal(await auth.verifyPassword('correct horse battery staple', 'salt:hash'), false);
});

test('пароль «1» і невалідний email відхиляються при реєстрації', async () => {
  await fails(
    () => auth.registerUser({ email: 'user@example.com', password: '1', name: 'Тест' }),
    (error) => error?.code === 'invalid_password'
  );
  await fails(
    () => auth.registerUser({ email: 'not-an-email', password: 'password123', name: 'Тест' }),
    (error) => error?.code === 'invalid_email'
  );
  const user = await auth.registerUser({ email: 'user@example.com', password: 'password123', name: 'Тест' });
  assert.ok(user.id);
  assert.equal(user.email, 'user@example.com');
  await fails(
    () => auth.registerUser({ email: 'USER@example.com', password: 'password123', name: 'Інший' }),
    (error) => error?.code === 'email_taken'
  );
});

test('після 10 невдалих входів повертається 429-подібне блокування', async () => {
  const key = `auth-test-${Date.now()}`;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    await fails(
      () => auth.loginUser('nobody@example.com', 'wrong-password', key),
      (error) => error?.code === 'invalid_credentials',
      `спроба ${attempt}`
    );
  }
  assert.equal(await auth.isRateLimited(key), true);
  await fails(
    () => auth.loginUser('user@example.com', 'password123', key),
    (error) => {
      const e = error as { code?: string; message?: string };
      return e?.code === 'rate_limited' && e?.message === 'Забагато спроб. Зачекайте хвилину.';
    }
  );
  await auth.clearLoginFailures(key);
});

test('вихід інвалідує cookie: стара сесія більше не дає користувача', async () => {
  const user = await auth.getUserByEmail('user@example.com');
  assert.ok(user);
  const session = await auth.createSession(user!.id);
  assert.equal((await auth.getSessionUser(session.token))?.id, user!.id);
  await auth.deleteSession(session.token);
  assert.equal(await auth.getSession(session.token), null);
  assert.equal(await auth.getSessionUser(session.token), null);
});

test('Origin з іншого домену заборонений, відсутній — дозволений', async () => {
  const request = (origin?: string) =>
    new Request('https://tusivka.test/login', {
      method: 'POST',
      headers: origin ? { origin } : {}
    });
  assert.equal((await auth.checkOrigin(request())).allowed, true);
  assert.equal((await auth.checkOrigin(request('https://tusivka.test'))).allowed, true);
  assert.equal((await auth.checkOrigin(request('https://evil.example'))).allowed, false);
  assert.equal((await auth.checkOrigin(request('not a url'))).allowed, false);
});

test('Origin за публічним тунелем: Host приймається, чужий — ні', async () => {
  const proxied = (origin: string, host: string) =>
    new Request('http://localhost:4322/login', {
      method: 'POST',
      headers: { origin, host, 'x-forwarded-proto': 'https' }
    });
  assert.equal((await auth.checkOrigin(proxied('https://site.trycloudflare.com', 'site.trycloudflare.com'))).allowed, true);
  assert.equal((await auth.checkOrigin(proxied('https://evil.example', 'site.trycloudflare.com'))).allowed, false);
  assert.equal((await auth.checkOrigin(proxied('http://site.trycloudflare.com', 'site.trycloudflare.com'))).allowed, false);
});

test('Origin null дозволений тільки для same-origin', async () => {
  const withSite = (site?: string) =>
    new Request('https://tusivka.test/login', {
      method: 'POST',
      headers: site ? { origin: 'null', 'sec-fetch-site': site } : { origin: 'null' }
    });
  assert.equal((await auth.checkOrigin(withSite('same-origin'))).allowed, true);
  assert.equal((await auth.checkOrigin(withSite('none'))).allowed, true);
  assert.equal((await auth.checkOrigin(withSite('cross-site'))).allowed, false);
  assert.equal((await auth.checkOrigin(withSite('same-site'))).allowed, false);
});
