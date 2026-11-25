// @ts-nocheck -- node:test types are provided at runtime.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const runtime = globalThis as unknown as { process: { env: Record<string, string | undefined> } };
runtime.process.env.DATABASE_PATH = ':memory:';
runtime.process.env.SESSION_SECRET = 'test-secret';

let auth: typeof import('../src/lib/auth.ts');
let dbModule: typeof import('../src/lib/db.ts');

before(async () => {
  auth = await import('../src/lib/auth.ts');
  dbModule = await import('../src/lib/db.ts');
});

test('невдалі логи зберігаються у спільній таблиці, а не в памʼяті isolate', async () => {
  const key = `login:audit-${randomUUID()}`;
  await auth.clearLoginFailures(key);

  for (let i = 0; i < 10; i += 1) await auth.recordFailedLogin(key);

  const db = await dbModule.getDb();
  const row = await db.prepare('SELECT COUNT(*) AS n FROM LoginAttempts WHERE attempt_key = ?').get(key);
  assert.equal(Number(row?.n ?? 0), 10, 'лічильник має бути в БД');
  assert.equal((await auth.checkLoginRateLimit(key)).allowed, false);

  await auth.clearLoginFailures(key);
  const cleared = await db.prepare('SELECT COUNT(*) AS n FROM LoginAttempts WHERE attempt_key = ?').get(key);
  assert.equal(Number(cleared?.n ?? 0), 0, 'очищення має видаляти рядки з БД');
});
