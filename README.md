# «Тусовка» — сервіс подій

Спрощений Meetup: користувачі створюють події з обмеженою кількістю місць, інші на них записуються. Публічні/приватні події, обкладинки, пошук, коментарі, запрошення, профіль.

Стек: **Astro 7 (SSR, `@astrojs/node`, standalone) + React 19 + Tailwind 4 + shadcn/ui + React Bits** (registry `@reactbits`). Дані — SQLite (WAL), обкладинки — WebP BLOB у БД.

## Запуск

Потрібен **Node ≥ 22.23.4** (Astro 7). Якщо системний Node старіший — додай до PATH новіший, напр. `export PATH=/data/home/.hermes/tools/node-26.12.1-linux-x64/bin:$PATH`.

```bash
npm install
cp .env.example .env
# відредагуй .env: обов'язково задай SESSION_SECRET (openssl rand -hex 32)
npm run dev          # http://localhost:4321
```

Продакшен:

```bash
npm ci
npm run build
HOST=0.0.0.0 PORT=4321 node ./dist/server/entry.mjs
```

Або `npm run preview` для локальної перевірки зібраної версії.

## Змінні середовища

| Змінна | За замовчуванням | Призначення |
|---|---|---|
| `DATABASE_PATH` | `./data/tusivka.db` | Шлях до SQLite (папка створиться автоматично) |
| `SESSION_SECRET` | dev-заглушка | Секрет сесій; **змінити в проді** |
| `SESSION_COOKIE_NAME` | `session` | Ім'я cookie |
| `SESSION_TTL_DAYS` | `30` | Термін життя сесії |
| `SECURE_COOKIES` | `false` | `true` тільки на HTTPS |
| `MAX_UPLOAD_BYTES` | `10485760` | Ліміт обкладинки (10 MiB) |
| `MAX_LOGIN_ATTEMPTS` / `LOGIN_WINDOW_MS` | `10` / `60000` | Rate-limit логіну |
| `MAX_EVENT_YEARS` | `2` | Максимальний горизонт дати події |
| `MODERATOR_EMAILS` | `arsen@tusivka.local` | Email-и модераторів через кому; регістр не враховується |

Усі змінні мають безпечні дефолти — без `.env` застосунок піднімається в dev-режимі.

## Команди

```bash
npm test          # 32 автотести (node:test)
npx astro check   # перевірка типів; має бути 0 errors
npm run build     # продакшен-білд
```

## Структура

- `specs/001-tusivka-events/`, `specs/002-moderation-reports/` — Spec Kit: `spec.md`, `plan.md`, `tasks.md`, `data-model.md`, `contracts/`, `checklists/`
- `.specify/memory/constitution.md` — принципи проєкту
- `src/lib/` — DB, auth, валідація, ідемпотентність, moderation, зображення, час, події
- `src/pages/api/` — REST-екшени (події, RSVP, коментарі, профіль, скарги)
- `src/pages/events/`, `src/pages/invite/` — сторінки подій і запрошень
- `src/components/` — React-острівці (форми) і Astro-компоненти
- `tests/` — автотести безпеки, concurrency, валідації, приватності, акаунта, модерації; `self-audit.mjs` — живий HTTP-аудит

## Безпека й дані

- Паролі: scrypt `salt:hash`; сесії в БД, HttpOnly/SameSite=Lax cookie; вихід інвалідує сесію.
- CSRF: перевірка `Origin` на мутаціях; security-headers включно з `nosniff` і CSP.
- Обкладинки: магічні байти, ≤10 MiB, перекодування в WebP, збереження в БД, filename ігнорується.
- Приватні події: 404 на сторінку/обкладинку/RSVP/коментар без інвайту; 32-байтовий токен.
- ідемпотентність мутацій; гонка за останнє місце вирішується транзакцією.
- Персональні дані: `/privacy`, `/rules`, редагування імені та видалення акаунта з каскадом і знеособленням коментарів.
- Скарги: один відкритий запис на `(коментар, скаржник)`; модератор має `/moderation`, закриває скаргу або видаляє коментар, рішення пишеться в `ModerationActions`. Видалення коментаря автором події з прапорцем скарги теж фіксується.

## Модерація

Скарга з форми на сторінці події йде на `POST /api/comments/:id/report` (JSON `{ reason }` або форма); повторна скарга перетворюється на той самий відкритий запис. Для модераторів (`MODERATOR_EMAILS`):

- `GET /moderation` — черга відкритих скарг (HTML);
- `GET /api/moderation/reports` — та сама черга JSON;
- `POST /api/moderation/:id/dismiss` — відхилити скаргу;
- `POST /api/moderation/:id/delete` — видалити коментар.

Усі модераторські мутації перевіряють роль і `Origin`. Наявна, але не відкрита або неіснуюча скарга → 404.
Повна специфікація — `specs/002-moderation-reports/`.

## Додатково

Дизайн-токени — Linear-style dark (локальний шрифт Geist, без зовнішніх CDN). Анімації — компоненти React Bits через MCP-registry.
