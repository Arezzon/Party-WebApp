// @ts-nocheck -- node:test types are provided at runtime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('self-audit працює проти BASE_URL без прямого доступу до SQLite', async () => {
  const src = await readFile(new URL('../tests/self-audit.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /better-sqlite3/, 'аудит не має читати локальну БД напряму');
  assert.doesNotMatch(src, /127\.0\.0\.1:4399/, 'аудит не має вимагати локальний Node-сервер');
  assert.match(src, /process\.env\.BASE_URL/, 'аудит має приймати BASE_URL');
});
