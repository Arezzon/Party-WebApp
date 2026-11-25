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

test('пароль зберігається у форматі scrypt і перевіряється константним часом', () => {
  const hash = auth.hashPassword('correct horse battery staple');
  assert.match(hash, /^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(auth.verifyPassword('correct horse battery staple', hash), true);
  assert.equal(auth.verifyPassword('wrong password', hash), false);
  assert.equal(auth.verifyPassword('correct horse battery staple', 'salt:hash'), false);
});

test('пароль «1» і невалідний email відхиляються при реєстрації', () => {
  assert.throws(
    () => auth.registerUser({ email: 'user@example.com', password: '1', name: 'Тест' }),
    (error: unknown) => (error as { code?: string }).code === 'invalid_password'
  );
  assert.throws(
    () => auth.registerUser({ email: 'not-an-email', password: 'password123', name: 'Тест' }),
    (error: unknown) => (error as { code?: string }).code === 'invalid_email'
  );
  const user = auth.registerUser({ email: 'user@example.com', password: 'password123', name: 'Тест' });
  assert.ok(user.id);
  assert.equal(user.email, 'user@example.com');
  assert.throws(
    () => auth.registerUser({ email: 'USER@example.com', password: 'password123', name: 'Інший' }),
    (error: unknown) => (error as { code?: string }).code === 'email_taken'
  );
});

test('після 10 невдалих входів повертається 429-подібне блокування', () => {
  const key = `auth-test-${Date.now()}`;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    assert.throws(
      () => auth.loginUser('nobody@example.com', 'wrong-password', key),
      (error: unknown) => (error as { code?: string }).code === 'invalid_credentials',
      `спроба ${attempt}`
    );
  }
  assert.equal(auth.isRateLimited(key), true);
  assert.throws(
    () => auth.loginUser('user@example.com', 'password123', key),
    (error: unknown) => {
      const e = error as { code?: string; message?: string };
      return e.code === 'rate_limited' && e.message === 'Забагато спроб. Зачекайте хвилину.';
    }
  );
  auth.clearLoginFailures(key);
});

test('вихід інвалідує cookie: стара сесія більше не дає користувача', () => {
  const user = auth.getUserByEmail('user@example.com');
  assert.ok(user);
  const session = auth.createSession(user!.id);
  assert.equal(auth.getSessionUser(session.token)?.id, user!.id);
  auth.deleteSession(session.token);
  assert.equal(auth.getSession(session.token), null);
  assert.equal(auth.getSessionUser(session.token), null);
});

test('Origin з іншого домену заборонений, відсутній — дозволений', () => {
  const request = (origin?: string) =>
    new Request('https://tusivka.test/login', {
      method: 'POST',
      headers: origin ? { origin } : {}
    });
  assert.equal(auth.checkOrigin(request()).allowed, true);
  assert.equal(auth.checkOrigin(request('https://tusivka.test')).allowed, true);
  assert.equal(auth.checkOrigin(request('https://evil.example')).allowed, false);
  assert.equal(auth.checkOrigin(request('not a url')).allowed, false);
});

test('Origin за публічним тунелем: Host приймається, чужий — ні', () => {
  const proxied = (origin: string, host: string) =>
    new Request('http://localhost:4322/login', {
      method: 'POST',
      headers: { origin, host, 'x-forwarded-proto': 'https' }
    });
  assert.equal(auth.checkOrigin(proxied('https://site.trycloudflare.com', 'site.trycloudflare.com')).allowed, true);
  assert.equal(auth.checkOrigin(proxied('https://evil.example', 'site.trycloudflare.com')).allowed, false);
  assert.equal(auth.checkOrigin(proxied('http://site.trycloudflare.com', 'site.trycloudflare.com')).allowed, false);
});

test('Origin null дозволений тільки для same-origin', () => {
  const withSite = (site?: string) =>
    new Request('https://tusivka.test/login', {
      method: 'POST',
      headers: site ? { origin: 'null', 'sec-fetch-site': site } : { origin: 'null' }
    });
  assert.equal(auth.checkOrigin(withSite('same-origin')).allowed, true);
  assert.equal(auth.checkOrigin(withSite('none')).allowed, true);
  assert.equal(auth.checkOrigin(withSite('cross-site')).allowed, false);
  assert.equal(auth.checkOrigin(withSite('same-site')).allowed, false);
});
