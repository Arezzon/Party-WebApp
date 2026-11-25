# Quickstart: перевірка деплою та продуктивності

## Передумови
- Node ≥22.23.4, npm, доступ до GitHub і Cloudflare.
- Секрети `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` у GitHub Actions.

## Команди

```bash
npm ci
npm test
npx astro check
npm run build
BASE=https://tusivka.byndevav.workers.dev bash scripts/perf-check.sh
```

## Очікувані результат
- 32/32 тестів, 0 errors типу, успішний білд.
- `perf-check.sh`: home <400 мс, event <800 мс, cover <500 мс; рядок `PASS`.
- Після merge у `main`: CI і Deploy workflow завершуються `success`.
- `https://tusivka.byndevav.workers.dev/` віддає 200 без TLS-попереджень.

Деталі контракту: [contracts/delivery.md](./contracts/delivery.md).
