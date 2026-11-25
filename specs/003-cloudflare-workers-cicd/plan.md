# Implementation Plan: Деплой і надійність «Тусовки»

**Branch**: `003-cloudflare-workers-cicd` | **Date**: 2026-11-25 | **Spec**: [spec.md](./spec.md)

## Summary
Переведення сервісу з локального Node/SQLite на Cloudflare Workers Free + D1, оптимізація віддачі сторінок/обкладинок, налаштування GitHub Actions (CI + deploy) і Dependabot.

## Technical Context

**Language/Version**: TypeScript strict, Node ≥22.23.4, Astro 7.4.13, React 19.3.1
**Primary Dependencies**: `@astrojs/cloudflare`, `wrangler@4`, `@astrojs/react`, Tailwind 4, shadcn/ui, React Bits, `tsx`, `zod`
**Storage**: Cloudflare D1 (SQLite-сумісний); обкладинки — оригінальні байти BLOB ≤1.5 МБ
**Testing**: `node:test` через `npm test`; `npx astro check`; `npm run build`; `scripts/perf-check.sh`
**Target Platform**: Cloudflare Workers Free, публічний URL `https://tusivka.byndevav.workers.dev`
**Performance Goals**: home <400 мс, event <800 мс, cover <500 мс холодна; тепла обкладинка з edge-кешу
**Constraints**: D1 BLOB ≤2 МБ; Workers Free 10 мс CPU/запит; PAT для workflow-файлів потребує `workflow` scope

## Constitution Check

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Specification-First | ✅ | Цей spec створено до фіналізації інфраструктури |
| II. Security & Data Protection | ✅ | Секрети в GitHub Secrets; приватні обкладинки `no-store` |
| III. Idempotency & Concurrency | ✅ | D1-міграції ідемпотентні; RSVP через умовний INSERT |
| IV. Server-Side Validation & TZ | ✅ | Валідація не змінювалась |
| V. Test-First | ✅ | CI виконує 32 тести перед деплоєм |
| VI. Operational Excellence | ✅ | CI, deploy, Dependabot, perf-check |

Violations: none.

## Project Structure

```text
.github/
├── workflows/
│   ├── ci.yml              # tests + typecheck + build
│   └── deploy.yml          # migrations + wrangler deploy on main
├── dependabot.yml          # npm + github-actions, weekly
└── pull_request_template.md
scripts/
└── perf-check.sh           # перевірка порогів продуктивності
migrations/
└── 0001_init.sql
wrangler.jsonc
src/lib/
├── db.ts                   # async D1 façade + Node fallback
├── events.ts               # фіксована схема, getCover(), ETag
├── images.ts               # magic bytes, original bytes, 1.5 МБ
└── cf-env.ts               # Workers bindings -> runtime env
src/pages/events/[id]/cover.ts  # Cache API + ETag + private no-store
```

**Structure Decision**: Один Worker із D1-біндингом; статичні асети входять до Worker. Усі зміни потрапляють на прод тільки через `main`.

## Phase 0: Outline & Research

Див. [research.md](./research.md) — 6 рішень: subdomain/TLS, D1-only covers, fixed schema, edge cache, CI scopes, fresh-checkout fallback.

## Phase 1: Design & Contracts

- [contracts/delivery.md](./contracts/delivery.md) — контракт workflow-ів і секретів.
- [quickstart.md](./quickstart.md) — послідовність перевірки деплою й продуктивності.

## Complexity Tracking

*Constitution Check пройдено без порушень.*
