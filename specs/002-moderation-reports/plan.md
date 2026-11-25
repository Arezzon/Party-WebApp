# Implementation Plan: Модерація скарг на коментарі

**Branch**: `002-moderation-reports` | **Date**: 2026-11-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-moderation-reports/spec.md`

## Summary

Виправити дублювання скарг і зробити скарги робочим процесом: одна активна скарга
на пару «коментар — скаржник», статусна модель, окрема сторінка черги для модератора
та API для відхилення скарги й видалення коментаря. Права автора коментаря/події
на видалення лишаються незмінними.

## Technical Context

**Language/Version**: TypeScript, Node.js ≥22.23.4

**Primary Dependencies**: Astro 7 SSR, React 19, Tailwind 4, better-sqlite3, node:test

**Storage**: SQLite (поточний `DATABASE_PATH`, у демо — `./data/tunnel.db`)

**Testing**: `npm test` (node:test), `npx astro check`, `npm run build`, `tests/self-audit.mjs`

**Target Platform**: Linux SSR-сервер, браузер (desktop + 375px mobile)

**Project Type**: web application (Astro SSR + React islands)

**Performance Goals**: черга до 500 скарг відображається без помітної затримки

**Constraints**: Origin/CSRF, HttpOnly-сесії, ідемпотентність мутацій, Convex/UTC не використовується

**Scale/Scope**: 1 нова сторінка, 3 API-роути, 1 допоміжний модуль, міграція БД, тести

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|---|---|---|
| I. Specification-First | PASS | spec.md створено й валідовано до коду |
| II. Security & Data Protection | PASS | перевірка сесії, Origin у middleware, екранування через Astro, рольова перевірка |
| III. Idempotency & Concurrency | PASS | частковий унікальний індекс + явна перевірка перед INSERT |
| IV. Server-Side Validation | PASS | причина 1–500 символів, існування коментаря, статус на сервері |
| V. Test-First | PASS | додано тести для ролі, дедупікації та HTTP-доступу |

## Project Structure

### Documentation (this feature)

```text
specs/002-moderation-reports/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── moderation-api.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── env.ts                     # MODERATOR_EMAILS
│   ├── db.ts                      # міграція Reports + ModerationActions
│   └── moderation.ts              # роль, створення скарги, розгляд
├── pages/
│   ├── moderation.astro           # черга модератора
│   └── api/
│       ├── comments/[id]/report.ts
│       ├── comments/[id]/delete.ts
│       └── moderation/[id]/
│           ├── dismiss.ts
│           └── delete.ts
├── components/site/
│   └── SiteHeader.astro           # посилання «Модерація» тільки для модератора
└── layouts/Layout.astro           # передає isModerator у шапку
tests/
├── moderation.test.ts
└── self-audit.mjs                 # додаткові перевірки модерації
```

**Structure Decision**: використовуємо чинний monorepo-подібний Astro-проект без нових пакетів;
модерація — ще одна сторінка й набір API-роутів у тій самій структурі.

## Complexity Tracking

> No violations.
