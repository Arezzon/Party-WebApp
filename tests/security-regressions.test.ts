// @ts-nocheck -- node:test types are provided at runtime.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = globalThis as unknown as { process: { env: Record<string, string | undefined> } };
runtime.process.env.DATABASE_PATH = ':memory:';
runtime.process.env.SESSION_SECRET = 'test-secret';

let auth: typeof import('../src/lib/auth.ts');

before(async () => {
  auth = await import('../src/lib/auth.ts');
});

test('clientKey довіряє CF-Connecting-IP, а не X-Forwarded-For від клієнта', () => {
  const request = (headers: Record<string, string>) => new Request('https://tusivka.test/', { headers });
  assert.equal(auth.clientKey(request({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' })), '1.2.3.4');
  assert.equal(auth.clientKey(request({ 'x-forwarded-for': '9.9.9.9' })), 'local', 'XFF не є довіреним джерелом IP');
  assert.equal(auth.clientKey(request({})), 'local');
});

test('safeNextPath пропускає тільки same-origin шляхи', () => {
  const base = 'https://tusivka.test';
  assert.equal(auth.safeNextPath('/events/abc?tab=1', base), '/events/abc?tab=1');
  assert.equal(auth.safeNextPath('//evil.com', base), '/');
  assert.equal(auth.safeNextPath('/\\evil.com', base), '/');
  assert.equal(auth.safeNextPath('https://evil.com/', base), '/');
  assert.equal(auth.safeNextPath('', base), '/');
});

test('logout дочекався видалення сесії й не має GET-аліасу', async () => {
  const source = await readFile(new URL('../src/pages/logout.ts', import.meta.url), 'utf8');
  assert.match(source, /await deleteSession\(token\)/, 'D1 DELETE має бути await, інакше Workers скасують його після відповіді');
  assert.doesNotMatch(source, /export const GET/, 'GET не має змінювати стан');
});

test('інвайт-cookie має secure-прапорець у проді', async () => {
  const source = await readFile(new URL('../src/pages/invite/[token].ts', import.meta.url), 'utf8');
  assert.match(source, /secure: SECURE_COOKIES/, 'cookie з bearer-токеном не має йти plaintext HTTP');
});
