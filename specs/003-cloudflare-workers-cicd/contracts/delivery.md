# Delivery Contract

## CI workflow

- **Triggers**: `push` to `main` and `refactor/cloudflare-workers-d1`; `pull_request` to `main`.
- **Steps**: `npm ci` → `npm test` → `npx astro check` → `npm run build`.
- **Result**: усі кроки мають завершитися успішно; інакше PR не мержиться.

## Deploy workflow

- **Triggers**: `push` to `main`, `workflow_dispatch`.
- **Required secrets**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- **Steps**: `npm ci` → `npm run build` → `wrangler d1 migrations apply tusivka --remote` → `wrangler deploy --name tusivka`.
- **Concurrency**: `deploy-production`, `cancel-in-progress: false`.

## Dependabot

- **Ecosystems**: `npm`, `github-actions`.
- **Schedule**: weekly, Monday 06:00 Europe/Kyiv.
- **Target branch**: `main`.
- **Grouping**: npm minor/patch в один PR.

## Public endpoint

- `https://tusivka.byndevav.workers.dev`
- Якщо hostname змінюється, новий TLS-сертифікат має бути перевірений перед оголошенням релізу.
