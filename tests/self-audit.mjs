// Живий self-audit через HTTP без прямого доступу до БД.
// Запуск: BASE_URL=https://tusivka.byndevav.workers.dev node tests/self-audit.mjs
// Для перевірки захищених сторінок задай AUDIT_EMAIL і AUDIT_PASSWORD.
const BASE = process.env.BASE_URL ?? 'https://tusivka.byndevav.workers.dev';
const origin = new URL(BASE).origin;
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function get(path, headers = {}) {
  return fetch(BASE + path, { redirect: 'manual', headers });
}

function cookieFrom(res) {
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}

for (const path of ['/', '/login', '/register', '/rules', '/privacy']) {
  const res = await get(path);
  check(`public ${path}`, res.status === 200, String(res.status));
}

const profile = await get('/profile');
check('anon profile redirects to login', profile.status === 302 && /\/login/.test(profile.headers.get('location') ?? ''), String(profile.status));

const createPage = await get('/events/new');
check('anon create-event redirects to login', createPage.status === 302 && /next=\/events\/new/.test(createPage.headers.get('location') ?? ''), String(createPage.status));

const badOrigin = await fetch(BASE + '/login', {
  method: 'POST',
  redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' },
  body: new URLSearchParams({ email: 'nobody@example.com', password: 'wrong-pass' })
});
check('cross-origin mutation rejected', badOrigin.status === 400, String(badOrigin.status));

const missing = await get('/events/00000000-0000-4000-8000-000000000000');
check('unknown event is friendly 404', missing.status === 404, String(missing.status));

const anonModeration = await get('/moderation');
check('anon moderation denied', anonModeration.status === 403 || anonModeration.status === 302, String(anonModeration.status));

const email = process.env.AUDIT_EMAIL;
const password = process.env.AUDIT_PASSWORD;
if (email && password) {
  const login = await fetch(BASE + '/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
    body: new URLSearchParams({ email, password })
  });
  if (login.status === 429) {
    console.log('SKIP  authenticated checks (login is rate-limited; wait for the window)');
  } else {
    check('authenticated login', login.status === 303, String(login.status));
    const cookie = cookieFrom(login);
    for (const path of ['/profile', '/events/new']) {
      const res = await get(path, { cookie });
      check(`authenticated ${path}`, res.status === 200, String(res.status));
    }
  }
} else {
  console.log('SKIP  authenticated checks (set AUDIT_EMAIL and AUDIT_PASSWORD)');
}

console.log(failures === 0 ? '\nSELF-AUDIT OK' : `\nSELF-AUDIT FAILED: ${failures}`);
process.exit(failures ? 1 : 0);
