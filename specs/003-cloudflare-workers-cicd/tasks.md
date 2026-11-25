---
description: "Task list for Cloudflare Workers deployment and CI/CD"
---

# Tasks: Деплой і надійність «Тусовки»

**Input**: Design documents from `/specs/003-cloudflare-workers-cicd/`
**Prerequisites**: plan.md, spec.md, research.md, contracts/delivery.md

**Status**: Implemented — усі задачі виконані й перевірені на продакшені.

**Organization**: Setup → Foundational → User Stories US1–US4 → Polish.

## Phase 1: Setup

- [x] T001 [P] Додати `wrangler.jsonc` з D1-біндингом `DB` і асетами в `/data/workspace/tusivka-app`
- [x] T002 [P] Створити `migrations/0001_init.sql` і застосувати локально та `--remote`
- [x] T003 [P] Зберігти `SESSION_SECRET` через `wrangler secret put SESSION_SECRET`

## Phase 2: Foundational

- [x] T004 Переписати `src/lib/db.ts` на async D1-фасад із Node-фолбеком
- [x] T005 Додати `src/lib/cf-env.ts` іMiddleware-прив'язку Worker env
- [x] T006 Перевести всі виклики БД на `await getDb()` та await statement-методів
- [x] T007 [P] Вилучити `sharp` і `@astrojs/node`, додати `@astrojs/cloudflare`
- [x] T008 Зробити Node-фолбек створювачем батьківської папки `DATABASE_PATH`

## Phase 3: US1 — Публічний URL (P1)

- [x] T009 [US1] Змінити акаунт-субдомен Workers на `byndevav` і задеплоїти `tusivka`
- [x] T010 [US1] Дочекатися TLS-сертифіката й перевірити HTTPS 200

**Independent Test**: `https://tusivka.byndevav.workers.dev/` відповідає 200 без TLS-попереджень.

## Phase 4: US2 — Продуктивність (P1)

- [x] T011 [US2] Закріпити схему константами в `src/lib/events.ts`, прибрати PRAGMA-інтроспекцію
- [x] T012 [US2] Паралелізувати D1-читання в `src/pages/events/[id]/index.astro`
- [x] T013 [US2] Додати `getCover()` з мінімальним запитом і ETag у `src/lib/events.ts`
- [x] T014 [US2] Додати Cache API для публічних обкладинок у `src/pages/events/[id]/cover.ts`
- [x] T015 [US2] Додати `scripts/perf-check.sh` з порогами 400/800/500 мс

**Independent Test**: `bash scripts/perf-check.sh` друкує `PASS`.

## Phase 5: US3 — CI/CD (P1)

- [x] T016 [US3] Додати `.github/workflows/ci.yml` (tests, typecheck, build)
- [x] T017 [US3] Додати `.github/workflows/deploy.yml` (migrations + wrangler deploy)
- [x] T018 [US3] Виставити секрети `CLOUDFLARE_API_TOKEN` і `CLOUDFLARE_ACCOUNT_ID`
- [x] T019 [US3] Прогнати PR #1, дочекатися зелених перевірок і змержити в `main`
- [x] T020 [US3] Перевірити успішний deploy run і smoke-ginx після merge

**Independent Test**: CI і Deploy workflow на `main` мають статус `success`.

## Phase 6: US4 — Dependabot (P2)

- [x] T021 [US4] Додати `.github/dependabot.yml` для npm і github-actions
- [x] T022 [US4] Додати `.github/pull_request_template.md`
- [x] T023 [US4] Видалити застарілу локальну гілку `master` і стару feature-гілку
- [x] T024 [US4] Додати `.github/workflows/codeql.yml` для JavaScript/TypeScript

**Independent Test**: Dependabot створює PR; у репозиторії лишилась тільки `main`.

## Dependencies

- US1 → US2 → US3 → US4 (інфраструктура спочатку, потім швидкість, потім автоматизація).

## Parallel Execution Examples

- T001–T003 — різні конфіг-файли, можна паралельно.
- T011–T015 — різні модулі, але T015 перевіряє результат попередніх.

## Implementation Strategy

MVP — US1+US2 (живий і швидкий сайт). Потім US3 (автоматизація) і US4 (підтримка залежностей).
