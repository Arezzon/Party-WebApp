// T035: живий self-audit — двоє користувачів через реальний HTTP-сервер.
// Запуск: node self-audit.mjs (сервер має слухати BASE_URL).
import Database from 'better-sqlite3';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4399';
const origin = new URL(BASE).origin;
const db = new Database(process.env.DATABASE_PATH ?? './data/tusivka.db');
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function cookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

async function form(path, fields, cookie = '', extra = {}) {
  const body = new URLSearchParams(fields);
  // Astro's own CSRF guard compares Origin with the URL it sees behind the
  // adapter; omit Origin on legit requests (our middleware also allows that)
  // and test rejection separately below.
  const headers = { 'content-type': 'application/x-www-form-urlencoded', cookie, ...extra };
  return fetch(BASE + path, { method: 'POST', redirect: 'manual', headers, body });
}

async function register(email, name) {
  const res = await form('/register', { email, password: 'SecurePass123', name });
  check(`register ${email}`, res.status === 303);
  const login = await form('/login', { email, password: 'SecurePass123' });
  check(`login ${email}`, login.status === 303);
  return cookies(login);
}

const suffix = Date.now().toString(36);
const a = await register(`auditor-a-${suffix}@example.test`, 'Автор');
const b = await register(`auditor-b-${suffix}@example.test`, 'Чужий');

const future = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 16);
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const fd = new FormData();
fd.set('title', 'Аудит подія');
fd.set('description', 'перевірка прав');
fd.set('starts_at', future);
fd.set('places', '2');
fd.set('visibility', 'public');
fd.set('cover', new Blob([png], { type: 'image/png' }), 'cover.png');
const created = await fetch(BASE + '/api/events', {
  method: 'POST', redirect: 'manual',
  headers: { cookie: a }, body: fd
});
check('author creates event', created.status === 303, String(created.status));
const id = created.headers.get('location')?.split('/').pop();

if (id) {
  const patchOther = await form(`/api/events/${id}/edit`, { title: 'Вламано', places: '2', visibility: 'public' }, b);
  check('other user cannot edit', patchOther.status === 403, String(patchOther.status));

  const delOther = await fetch(BASE + `/api/events/${id}/delete`, {
    method: 'POST', redirect: 'manual', headers: { cookie: b }
  });
  check('other user cannot delete', delOther.status === 403, String(delOther.status));

  const self = await fetch(BASE + '/profile', { headers: { cookie: a } });
  const html = await self.text();
  check('author sees own event in profile', html.includes('Аудит подія'));

  const commentText = 'Самоаудит: перевірка скарги';
  const madeComment = await fetch(BASE + `/api/events/${id}/comments`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie: a, 'Content-Type': 'application/json', 'Idempotency-Key': `audit-${suffix}` },
    body: JSON.stringify({ body: commentText })
  });
  check('author creates comment', madeComment.status === 303, String(madeComment.status));
  const commentId = db.prepare('SELECT id FROM Comments WHERE event_id = ? AND body = ?').get(id, commentText)?.id;
  if (commentId) {
    const first = await form(`/api/comments/${commentId}/report`, { reason: 'Спам' }, a);
    const second = await form(`/api/comments/${commentId}/report`, { reason: 'Спам' }, a);
    check('report accepted twice', first.status === 303 && second.status === 303, `${first.status}/${second.status}`);
    const count = db.prepare("SELECT COUNT(*) n FROM Reports WHERE comment_id = ? AND status = 'open'").get(commentId).n;
    check('duplicate report not stored', count === 1, String(count));
  }
  const modQueue = await fetch(BASE + '/api/moderation/reports', { headers: { cookie: a } });
  check('non-moderator cannot read queue', modQueue.status === 403, String(modQueue.status));

  const noOrigin = await form(`/api/events/${id}/edit`, { title: 'X', places: '1', visibility: 'public' }, a, { origin: 'https://evil.example' });
  check('cross-origin mutation rejected', noOrigin.status === 400 || noOrigin.status === 403, String(noOrigin.status));
}

const anonPrivate = await fetch(BASE + '/events/nonexistent');
check('unknown event 404 friendly', anonPrivate.status === 404, String(anonPrivate.status));

console.log(failures === 0 ? '\nSELF-AUDIT OK' : `\nSELF-AUDIT FAILED: ${failures}`);
process.exit(failures ? 1 : 0);
