---
description: "Task list for Тусовка events service implementation"
---

# Tasks: Сервіс подій «Тусовка»

**Input**: Design documents from `/specs/001-tusivka-events/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/web-routes.md

**Status**: Implemented. Історичні ID задач збережено; поточний стек — Cloudflare Workers + D1 (див. [specs/003-cloudflare-workers-cicd](../003-cloudflare-workers-cicd/tasks.md)).

**Tests**: Tests REQUIRED by constitution Principle V (security/concurrency).

**Organization**: Tasks grouped by user story (US1–US6) for independent implementation/testing.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Проєктний/node配置, залежності

- [X] T001 [ historic ] Встановити залежності `zod`, `tsx`, `@astrojs/cloudflare`, `wrangler`; `better-sqlite3` лишився лише для Node-тестів
- [X] T002 [P] Додати `test` script у `package.json` (`node --import tsx --test tests/*.test.ts`) і `.env.example` з `DATABASE_PATH`, `SESSION_SECRET`
- [X] T003 [P] Створити `src/lib/env.ts` (конфіг із process.env з дефолтами)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: DB, auth, middleware, валідація — усе, що блокусially всі story

**⚠️ CRITICAL**: No user story work until complete.

- [X] T004 Створити `src/lib/db.ts`: async D1-фасад зі схемою з data-model.md (User, Session, Event, RSVP, Comment, IdempotencyKey, Report), індекси, FK ON DELETE
- [X] T005 [P] Реалізувати `src/lib/auth.ts`: scrypt salt:hash, session token (randomBytes 32, sha256 у БД), cookie HttpOnly+Samesite=Lax, `requireUser(context)`; rate-limit логіну (10 спроб → 429)
- [X] T006 [P] Реалізувати `src/middleware.ts`: перевірка Origin для мутацій (400), security headers (nosniff, no-referrer, DENY, CSP), читання сесії, invite cookie
- [X] T007 [P] Реалізувати `src/lib/validation.ts`: zod-схеми places/title/dates/body/upload з data-model.md (dated ≤2р, magic bytes ≤10MB)
- [X] T008 [P] Реалізувати `src/lib/images.ts`: magic bytes, оригінальні байти, ≤1.5 МБ, безпечний MIME + nosniff; ігнорування filename
- [X] T009 [P] Реалізувати `src/lib/idempotency.ts`: `withIdempotency(userId,key,kind,fn)` через UNIQUE (user_id,key,kind)
- [X] T010 [P] Реалізувати `src/lib/timezone.ts`: UTC↔Europe/Kyiv (Intl), підпис «за Києвом», max date +2р
- [X] T011 Створити `src/layouts/Layout.astro` + `src/components/Header.astro` (nowrap на 375px, іконки ≤480px) + імпорт global.css

**Checkpoint**: Foundation готовий.

---

## Phase 3: User Story 1 — Акаунти (P1) 🎯 MVP

**Goal**: Реєстрація/вхід/вихід + політика конфіденційності.
**Independent Test**: реєстрація, 429 після 10 спроб, стара cookie → 302, посилання на політику біля форми.

- [X] T012 [P] [US1] Test `tests/auth.test.ts`: scrypt format, 400 пароль «1», 429, cookie інвалідація, Origin 400
- [X] T013 [US1] Сторінки `src/pages/register.astro`, `login.astro` + `src/components/AuthForm.tsx` (React, shadcn Button) із посиланням на `/privacy` біля кнопки
- [X] T014 [US1] Екшени `src/pages/register.ts`, `login.ts`, `logout.ts` через auth.ts
- [X] T015 [US1] Сторінка `src/pages/privacy.astro` (ст. 12 Закону №2297-VI: володілець, мета, передача, права)

---

## Phase 4: User Story 2 — Створення та керування подією (P1)

**Goal**: Author створює/редагує/видаляє подію з обкладинкою, бачить учасників.
**Independent Test**: створити подію з PNG (оригінальні байти); чужі 403; places/дата валідація; зменшення places нижче записаних → 400.

- [X] T016 [P] [US2] Test `tests/events.test.ts`: створення, валідація places 0/-1/1.5/7abc/1e20, дата 9999, author-only 403
- [X] T017 [US2] `src/lib/events.ts`: CRUD, upload обкладинки через images.ts, збереження UTC, invite_token 32B
- [X] T018 [US2] Сторінки `src/pages/events/new.astro`, `events/[id]/edit.astro` + `src/components/EventForm.tsx` (React, max date +2р)
- [X] T019 [US2] API `src/pages/api/events.ts` (POST ідемпотентний), `api/events/[id]/edit.ts`, `delete.ts`; список учасників на сторінці події
- [X] T020 [US2] Сторінка `src/pages/events/[id]/cover.ts` — ETag + Cache API, nosniff, приватні `no-store`

---

## Phase 5: User Story 3 — Головна, пошук, сторінка події (P1)

**Goal**: Список майбутніх публічних подій, пошук, «Іду»/«Скасувати», коментарі.
**Independent Test**: 2 події, пошук кирилицею в різному регістрі, `%` не ламає, 20 паралельних «Іду» на places=1 → 1×303/19×400, XSS екранується.

- [X] T021 [P] [US3] Test `tests/concurrency.test.ts`: гонка за останнє місце, ідемпотентні RSVP, 200 запитів p95
- [X] T022 [US3] `src/pages/index.astro`: список + пошук `?q=` ( virtualization LLM-safe LIKE, регістронезалежно, екранування `%`)
- [X] T023 [US3] `src/pages/events/[id].astro`: кнопки «Іду»/«Скасувати», places left, коментарі з textContent
- [X] T024 [US3] API `src/pages/api/events/[id]/rsvp.ts`, `unrsvp.ts`, `comments.ts` (ідемпотентні), `src/components/CommentForm.tsx` (React)

---

## Phase 6: User Story 4 — Приватні події (P2)

**Goal**: Приватні події тільки за інвайтом.
**Independent Test**: 404 скрізь без інвайту; з інвайтом усе працює.

- [X] T025 [P] [US4] Test `tests/privacy.test.ts`: 404 сторінка/обкладинка/запис/коментар; немає в пошуку
- [X] T026 [US4] `src/pages/invite/[token].ts`: валідація 32B, cookie `invite_<eventId>`, 303 → /events/:id
- [X] T027 [US4] Перевірка інвайту в `events/[id].astro`, `cover.ts`, rsvp/comments API (через middleware helper `canViewEvent`)

---

## Phase 7: User Story 5 — Профіль і права на дані (P2)

**Goal**: 2 списки, зміна імені, видалення акаунта з каскадом і знеособленням.
**Independent Test**: після видалення сесія мертва, події/RSVP зникли, коментар «Знайомець».

- [X] T028 [P] [US5] Test `tests/account.test.ts`: change name, delete каскад, анонімізація коментарів
- [X] T029 [US5] `src/pages/profile.astro` + `src/components/ProfileForm.tsx` (React)
- [X] T030 [US5] API `src/pages/api/profile.ts` (PATCH name), `profile/delete.ts` (DELETE cascade)

---

## Phase 8: User Story 6 — Правила, скарги, ідемпотентність, адаптив (P3)

**Goal**: Закрити 3 незначні знахідки.
**Independent Test**: 2 POST → 1 сутність; 375px без переносів; скарга й видалення коментаря.

- [X] T031 [P] [US6] Test `tests/validation.test.ts`: подвійний POST, malformed input 400/404/413 без стектрейсів, 300MB 413, SVG/HTML/EXE 400
- [X] T032 [US6] `src/pages/rules.astro` + API `api/comments/[id]/report.ts`, `delete.ts` (author comment | author event)
- [X] T033 [US6] Перевірка `Header.astro` на 375px (white-space: nowrap / іконки), порожні стани, overflow-wrap

---

## Phase 9: Polish & Cross-Cutting

- [X] T034 [P] README.md з інструкцією запуску, ENV, архітектурою
- [X] T035 [P] Self-audit: зайти другим користувачем і спробувати чужі дії; усунути знайдене
- [X] T036 Фінальна перевірка: `npm test`, `npx astro check` (0 errors), `npm run build` успішний

---

## Dependencies

- Setup (T001–T003) → Foundation (T004–T011) → US1/US2 (P1) → US3 → US4/US5 (P2) → US6 (P3) → Polish.
- US4/US5/US6 залежать від US1/US2/US3 (використовують auth, events, comments).

## Parallel Execution Examples

- Phase 1: T002 ∥ T003 (різні файли).
- Phase 2: T005 ∥ T006 ∥ T007 ∥ T008 ∥ T009 ∥ T010 ∥ T011 після T004.
- Phase 3: T012 ∥ T013 після foundation; T014 після T013.
- Phase 4: T016 ∥ T017 ∥ T018 після US1; T019/T020 після T017.
- Phase 5: T021 ∥ T022 ∥ T023 після US2; T024 після T023.

## Implementation Strategy

**MVP scope**: Phase 1 + 2 + US1 + US2 + US3 (реєстрація, події, запис) — це 5/7 пунктів ТЗ і ~70 балів. Далі US4/US5/US6 закривають усі знахідки. Деплой — фінальний бонус +3.

## Self-audit evidence (T035)

- `tests/self-audit.mjs` — живий HTTP-аудит із двома користувачами на зібраному сервері (`node ./dist/server/entry.mjs`, PORT=4399, окрема БД `data/audit.db`): 10/10 PASS (реєстрація, вхід, створення події з PNG (оригінальні байти), чужий 403 на редагування/видалення, профіль автора, відхилення чужого Origin, дружній 404).
- Під час аудиту знайдено й виправлено: `.env.example` був відсутній, README лишався дефолтним шаблоном Astro.
