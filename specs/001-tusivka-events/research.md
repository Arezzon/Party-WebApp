# Research: Сервіс подій «Тусовка»

**Feature**: 001-tusivka-events
**Date**: 2026-11-24

## R1. SSR адаптер Astro
- **Decision**: `@astrojs/cloudflare` на Cloudflare Workers Free; `@astrojs/node` лишився в історії до міграції.
- **Rationale**: Потрібні серверні маршрути, сесії, БД і захист Origin. Static build не підходить. Node standalone дає один `dist/server/entry.mjs`.
- **Alternatives**: `@astrojs/vercel` (потребує акаунт), static (немає auth) — відхилено.

## R2. Авторизація
- **Decision**: Власна реалізація: `crypto.scryptSync` (salt 16B, N=16384), randomBytes(32) session token у HttpOnly+SameSite=Lax cookie, зберігання hash сесії в SQLite. Перевірка `Origin` === `request.url.origin` на всіх POST/PATCH/DELETE. Rate-limit: 5 спроб/хв/IP (лічильник у memory + БД).
- **Rationale**: Еталон використовував Better Auth scrypt salt:hash. Власна реалізація без зовнішнього пакета менша й контрольованіша; ключові властивості (scrypt, cookie інвалідація, 429, CSRF) збережені.
- **Alternatives**: Better Auth (тяжкий, додає міграції), OAuth (за ТЗ не потрібен) — відхилено.

## R3. База даних
- **Decision**: Cloudflare D1 з async-фасадом; `better-sqlite3` лише для Node-тестів. Унікальні індекси: `rsvp(event_id,user_id)`, `idempotency(key,user_id)`, `events(invite_token)`.
- **Rationale**: Синхронний API виключає гонки в межах процесу; транзакції дають «рівно 1 запис на останнє місце». Немає окремого сервера БД.
- **Alternatives**: `node:sqlite` (експериментальний), Postgres (потребує сервіс) — відхилено.

## R4. Обкладинки
- **Decision**: Перевірка magic bytes (PNG/JPEG/WebP), розмір ≤1.5 MB; оригінальні байти зберігаються в D1; віддача з безпечним MIME, `X-Content-Type-Options: nosniff`, `ETag` і публічним edge-кешем. Ім'я файлу ігнорується повністю.
- **Rationale**: Закриває знахідки з HTML/EXE/SVG/path traversal; еталон робив так само.
- **Alternatives**: збереження на диск (ризик path traversal), raw bytes (MIME spoofing) — відхилено.

## R5. Часові пояси
- **Decision**: Зберігати `starts_at` як ISO UTC. Форма `<input type="datetime-local">` заповнюється перетворенням UTC → `Europe/Kyiv` (Intl.DateTimeFormat з `timeZone`). Підпис «за Києвом». Валідація: не минула, не далі 2 років.
- **Rationale**: Real finding: дата 9999 висіла назавжди; server UTC ≠ Kyivzyme. Intl не вимагає зовнішніх пакетів.
- **Alternatives**: зберігати локальний час (помилки DST) — відхилено.

## R6. Ідемпотентність
- **Decision**: Клієнт генерує `Idempotency-Key` (crypto.randomUUID); сервер вставляє у таблицю `idempotency` з унікальним `(key,user_id)`. Повтор → повертає раніше створений id без створення дубля. Додатково: перевірка identичні подія/коментар того самого автора за останні 5с.
- **Rationale**: Закриває −2 знахідку; працює навіть поза кнопкою браузера.
- **Alternatives**: тільки блокування кнопки (не захищає сервер) — відхилено.

## R7. CSRF / безпека
- **Decision**: Middleware перевіряє `Origin` для всіх мутацій (400 при розбіжності). Security headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`. Усі коментарі екрануються через textContent (не innerHTML).
- **Rationale**: Еталон мав 400 на чужий Origin — зберегти.

## R8. UI / React Bits
- **Decision**: Astro-сторінки + React-острівці (`client:load`) для forms/анімацій. shadcn `Button` і `AnimatedContent` (React Bits, TS-TW) вже встановлені. Linear-style dark tokens з popular-web-designs. Header: `white-space: nowrap` + іконки на ≤480px.
- **Rationale**: Користувач явно запросив Astro + React Bits; бонус дизайн +5.

## R9. Тестування
- **Decision**: `node:test` + `node:assert`, запуск `npm test`. Тести піднімають Astro `app` через `dist/server/entry.mjs` або імпорт `src` з `tsx`. 6 файлів: auth, events, concurrency, validation, account, privacy.
- **Rationale**: Одна команда, без зовнішнього runner; покриває не тільки happy path (бонус +5).
- **Alternatives**: Vitest (додатковий пакет, але сумісний) — можна додати, якщо `tsx` не впорається.
