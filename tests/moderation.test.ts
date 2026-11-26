// @ts-ignore -- node:test is a Node builtin
import { test, before } from 'node:test';
// @ts-ignore -- node:assert is a Node builtin
import assert from 'node:assert/strict';

const runtime = globalThis as unknown as { process: { env: Record<string, string | undefined> } };
runtime.process.env.DATABASE_PATH = ':memory:';
runtime.process.env.SESSION_SECRET = 'test-secret';
runtime.process.env.MODERATOR_EMAILS = 'arsen@tusivka.local,mod@example.test';

let moderation: typeof import('../src/lib/moderation.ts');
let db: any;

before(async () => {
  const appDb = await import('../src/lib/db.ts');
  moderation = await import('../src/lib/moderation.ts');
  db = await appDb.getDb();
  await db.prepare(`INSERT OR IGNORE INTO Users (id,email,name,password_hash,created_at)
              VALUES ('u1','arsen@tusivka.local','Арсен','x','2026-01-01'),
                     ('u2','maryna@tusivka.local','Марія','x','2026-01-01'),
                     ('u3','andrii@tusivka.local','Андрій','x','2026-01-01')`).run();
  await db.prepare(`INSERT OR IGNORE INTO Events
              (id,author_id,title,starts_at,places,invite_token,created_at)
              VALUES ('e1','u1','Тестова подія','2027-01-01T00:00:00Z',10,'t','2026-01-01')`).run();
  await db.prepare(`INSERT OR IGNORE INTO Comments (id,event_id,body,created_at,author_id,author_name_snapshot)
              VALUES ('c1','e1','Коментар','2026-01-01','u2','Марія')`).run();
});

test('роль модератора перевіряється з конфігурації без зміни БД', async () => {
  assert.equal(moderation.isModerator('arsen@tusivka.local'), true);
  assert.equal(moderation.isModerator('ARSEN@TUSIVKA.LOCAL'), true);
  assert.equal(moderation.isModerator('mod@example.test'), true);
  assert.equal(moderation.isModerator('maryna@tusivka.local'), false);
  assert.equal(moderation.isModerator(null), false);
  assert.equal(moderation.isModerator('arsen@tusivka.local', ['other@example.test']), false);
});

test('дві скарги від одного користувача дають один запис', async () => {
  const input = { commentId: 'c1', eventId: 'e1', reporterId: 'u3', reason: 'Спам' };
  const first = await moderation.createOpenReport(db, input);
  const second = await moderation.createOpenReport(db, input);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.report.id, first.report.id);
  assert.equal((await db.prepare(`SELECT COUNT(*) n FROM Reports WHERE comment_id='c1' AND reporter_id='u3'`).get()).n, 1);

  const other = await moderation.createOpenReport(db, { ...input, reporterId: 'u1' });
  assert.equal(other.created, true);
  assert.equal((await db.prepare(`SELECT COUNT(*) n FROM Reports WHERE comment_id='c1'`).get()).n, 2);
});

test('модератор може відхилити скаргу лише один раз', async () => {
  const report = (await moderation.createOpenReport(db, {
    commentId: 'c1', eventId: 'e1', reporterId: 'u2', reason: 'Образливий коментар'
  })).report;
  assert.equal((await moderation.listOpenReports(db)).length >= 1, true);
  const resolved = await moderation.resolveReport(db, report.id, 'u1', 'dismiss', 'помилкова скарга');
  assert.ok(resolved);
  assert.equal(await moderation.resolveReport(db, report.id, 'u1', 'dismiss'), null);
  assert.equal((await db.prepare(`SELECT status FROM Reports WHERE id=?`).get(report.id)).status, 'dismissed');
  assert.equal((await db.prepare(`SELECT action FROM ModerationActions WHERE report_id=?`).get(report.id)).action, 'dismiss');
  assert.equal((await db.prepare(`SELECT COUNT(*) n FROM Comments WHERE id='c1'`).get()).n, 1);
});

test('видалення коментаря модератором лишає запис-підставу', async () => {
  const report = (await moderation.createOpenReport(db, {
    commentId: 'c1', eventId: 'e1', reporterId: 'u3', reason: 'Порушення правил'
  })).report;
  const removed = await moderation.deleteCommentWithReport(db, report.id, 'u1');
  assert.ok(removed);
  assert.equal((await db.prepare(`SELECT COUNT(*) n FROM Comments WHERE id='c1'`).get()).n, 0);
  assert.equal((await db.prepare(`SELECT action FROM ModerationActions WHERE report_id=?`).get(report.id)).action, 'delete_comment');
});
