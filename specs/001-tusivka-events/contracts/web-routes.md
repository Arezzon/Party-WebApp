# Web Routes Contract: «Тусовка»

**Feature**: 001-tusivka-events

Загальне для всіх мутацій: перевірка `Origin` (400 при розбіжності), cookie сесія, friendly errors (400/403/404/413) без стектрейсів.

| Method | Path | Auth | Body | Success | Errors |
|--------|------|------|------|---------|--------|
| GET | `/` | — | — | HTML: майбутні публічні події + пошук `?q=` | — |
| GET | `/events/:id` | private: invite | — | HTML події, коментарі, places left | 404 |
| GET | `/events/:id/cover` | private: invite | — | `image/webp`, `nosniff` | 404 |
| POST | `/register` | — | email, password, name, Idempotency-Key | 303 → /login | 400 (email/пароль/duplicate) |
| GET/POST | `/login` | — | email, password | 303 → / | 400, 429 |
| POST | `/logout` | ✓ | — | 303 → / | 302 |
| GET | `/events/new` | ✓ | — | форма (max дати = +2р) | 302 → /login |
| POST | `/api/events` | ✓ | title, description, starts_at, places, cover, visibility, Idempotency-Key | 303 → /events/:id | 400, 413 |
| POST | `/api/events/:id/edit` | author | ті самі поля | 303 | 400, 403 |
| POST | `/api/events/:id/delete` | author | — | 303 → /profile | 403 |
| GET | `/profile` | ✓ | — | HTML 2 списки | 302 |
| POST | `/api/profile` | ✓ | name | 303 | 400 |
| POST | `/api/profile/delete` | ✓ | — | 303 → / (cookie cleared) | — |
| POST | `/api/events/:id/rsvp` | ✓, invite | Idempotency-Key | 303 | 400 (places=0/minула), 404 |
| POST | `/api/events/:id/unrsvp` | ✓ | — | 303 | 404 |
| POST | `/api/events/:id/comments` | ✓, invite | body, Idempotency-Key | 303 | 400, 404 |
| POST | `/api/comments/:id/report` | ✓ | reason | 303 | 400, 404 |
| POST | `/api/comments/:id/delete` | author comment \| author event | — | 303 | 403, 404 |
| GET | `/invite/:token` | token 32B | — | встановлює cookie `invite_<eventId>` → 303 → /events/:id | 404 |
| GET | `/privacy` | — | — | політика (ст. 12) | — |
| GET | `/rules` | — | — | правила + скарги | — |

## Explain行为的的政治
- `403` — чужа спроба редагування/видалення.
- `404` — приватна подія без інвайту (приховування існування).
- `429` — 10 невдалих логінів.
- `413` — файл >10MB.

## Response headers (усі)
```
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'
```
