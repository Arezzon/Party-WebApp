# Implementation Plan: Сервіс подій «Тусовка»

**Branch**: `001-tusivka-events` | **Date**: 2026-11-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-tusivka-events/spec.md`

## Summary
Вебзастосунок для створення подій із обмеженими місцями й запису учасників. Реалізується на Astro 7 (SSR на Cloudflare Workers Free через `@astrojs/cloudflare`) + React 19 (острівці з React Bits) + Tailwind 4 + shadcn/ui. Дані — Cloudflare D1, обкладинки — оригінальні байти BLOB ≤1.5 МБ. Авторизація через scrypt + HttpOnly cookie, захист Origin/CSRF, rate-limit. Деплой автоматичний через GitHub Actions.

## Technical Context

**Language/Version**: TypeScript strict, Node ≥22.23.4, Astro 7.4.13, React 19.3.1
**Primary Dependencies**: `@astrojs/cloudflare`, `@astrojs/react`, `tailwindcss@4`, `shadcn/ui`, React Bits (`@reactbits` registry), `wrangler`, `zod`
**Storage**: Cloudflare D1; обкладинки — оригінальні байти BLOB ≤1.5 МБ; сесії в D1
**Testing**: `node:test` + `node:assert` (`npm test`), `npx astro check`, `npm run build`, `scripts/perf-check.sh`
**Target Platform**: Cloudflare Workers Free, `https://tusivka.byndevav.workers.dev`
**Project Type**: Web application (SSR + React islands)
**Performance Goals**: home <400 мс, event <800 мс, cover <500 мс холодна; 0 500-х на malformed input
**Constraints**: D1 BLOB ≤2 МБ; Workers Free 10 мс CPU/запит; filename ігнорується
**Scale/Scope**: ~10 користувачів у демо, 7 екранів/маршрутів, 20 FR

## Constitution Check
*GATE: пройдено до Phase 0; перевірено після Phase 1.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Specification-First | ✅ | spec.md створено й валідовано перед plan |
| II. Security & Data Protection | ✅ | FR-001/002/009/018/019 + Research R2/R3; сторінки політики/правил у плані |
| III. Idempotency & Concurrency | ✅ | FR-007/012; унікальні індекси + IdempotencyKey у data-model |
| IV. Server-Side Validation & TZ | ✅ | FR-014/015; валідатор і Europe/Kyiv у data-model/contracts |
| V. Test-First | ✅ | FR тести в tasks (Phase 2+,每组 story має test task) |

Violations: none.

## Project Structure

### Documentation (this feature)
```text
specs/001-tusivka-events/
├── plan.md              # цей файл
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── web-routes.md    # HTTP-контракт маршрутів/екшенів
├── checklists/
│   └── requirements.md  # валідація spec
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)
```text
src/
├── lib/
│   ├── db.ts             # async D1-фасад, Node-фолбек для тестів
│   ├── auth.ts           # scrypt, cookie, session, Origin guard
│   ├── validation.ts     # zod-схеми (places, title, date, upload)
│   ├── images.ts         # magic bytes, оригінальні байти, ≤1.5 МБ
│   ├── events.ts         # CRUD, RSVP (transaction), comments, invite
│   ├── idempotency.ts    # IdempotencyKey перевірка
│   ├── timezone.ts       # UTC ↔ Europe/Kyiv
│   └── env.ts            # конфіг
├── middleware.ts         # сесія, Origin/CSRF, security headers
├── pages/
│   ├── index.astro                 # головна + пошук
│   ├── events/[id].astro           # сторінка події
│   ├── events/[id]/cover.ts        # ETag, Cache API, nosniff, private no-store
│   ├── register.astro / login.astro / logout.ts
│   ├── profile.astro               # профіль + редагування/видалення
│   ├── events/new.astro / events/[id]/edit.astro
│   ├── privacy.astro / rules.astro # політика й правила
│   └── api/
│       ├── events.ts      # POST створити (idempotent)
│       ├── events/[id].ts # PATCH/DELETE (author-only)
│       ├── events/[id]/rsvp.ts    # POST/DELETE ідемпотентний
│       ├── events/[id]/comments.ts # POST ідемпотентний, GET
│       ├── comments/[id]/report.ts # скарга
│       ├── comments/[id]/delete.ts # author-only
│       ├── invite/[token].ts       # вхід за інвайтом
│       └── profile.ts            # PATCH name / DELETE account
├── components/
│   ├── Header.astro              # nowrap на 375px
│   ├── EventCard.astro
│   ├── AuthForm.tsx / EventForm.tsx / CommentForm.tsx (React)
│   └── ui/ (shadcn button тощо)
├── styles/global.css
└── layouts/Layout.astro

tests/
├── auth.test.ts
├── events.test.ts
├── concurrency.test.ts
├── validation.test.ts
└── account.test.ts
```

**Structure Decision**: Один Astro-проєкт (SSR + React islands), без окремого backend. Уся бізнес-логіка в `src/lib`, доступ до неї через Astro API-маршрути. Це мінімізує кількість рухомих частин і спрощує деплой.

## Phase 0: Outline & Research
Див. [research.md](./research.md) — 9 рішень: SSR adapter, auth, DB, upload, timezone, idempotency, CSRF, UI, тести. Усі NEEDS CLARIFICATION відсутні.

## Phase 1: Design & Contracts
- [data-model.md](./data-model.md) — 7 сутностей, індекси, валідації.
- [contracts/web-routes.md](./contracts/web-routes.md) — HTTP-контракт.
- [quickstart.md](./quickstart.md) — сценарії перевірки.

## Поточний стан
- Прод: https://tusivka.byndevav.workers.dev — Cloudflare Workers + D1.
- CI: `.github/workflows/ci.yml`; деплой: `.github/workflows/deploy.yml`; оновлення: `.github/dependabot.yml`.
- Швидкість:див. `scripts/perf-check.sh` — home ~120–150 мс, event ~170–190 мс, cover ~150–390 мс.
- Детальніше: [specs/003-cloudflare-workers-cicd](../003-cloudflare-workers-cicd/spec.md).

## Complexity Tracking
*Constitution Check пройдено без порушень — таблиця не потрібна.*
