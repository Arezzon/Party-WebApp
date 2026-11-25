<!--
Sync Impact Report:
Version change: 1.0.0 → 1.1.0
Modified principles: added VI. Operational Excellence; updated stack/cover requirements
Added sections: Deployment, CI/CD and performance quality gates
Removed sections: none
Removed sections: none
Follow-up TODOs: none
-->

# Тусовка Constitution

## Core Principles

### I. Specification-First (NON-NEGOTIABLE)
Кожна функція має SPEC, створений і валідований до появи коду. Реалізація не може додавати поведінку, якої немає в SPEC, без оновлення SPEC. Кожна user story має бути незалежно тестованою.

**Rationale**: Мета завдання — показати, де ШІ помиляється без явних інструкцій. Дисципліна SPEC → PLAN → TASKS → IMPLEMENT дає артефакт, який можна перевірити.

### II. Security & Data Protection (NON-NEGOTIABLE)
Кожен ввід користувача обробляється як ворожий. Обов'язкові: перевірка Origin (CSRF), хешування scrypt/argon2, HttpOnly cookie, rate-limit логіну, UUID-ідентифікатори, 32-байтові invite-токени, екранування HTML, валідація MIME/розміру завантажень. Персональні дані супроводжуються політикою конфіденційності; користувач має право редагувати й видалити свій акаунт (Закон №2297-VI).

**Rationale**: Максимум 40 балів за безпеку; критична помилка = −10. Витік даних або ін'єкція неприпустимі.

### III. Idempotency & Concurrency (NON-NEGOTIABLE)
Кожна мутація, яка створює сутність (подія, коментар, RSVP), захищена від повторного запиту (ідемпотентний ключ або еквівалентна перевірка). Останнє місце в події записується рівно один раз під час гонки. Повторний POST не створює дублів.

**Rationale**: 30 балів за надійність; гонки й дублі — типові баги ШІ-генерованих застосунків.

### IV. Server-Side Validation & Timezone Correctness
Валідація на сервері є останньою інстанцією: відхиляє 0/-1/1.5/7abc/1e20 local places, порожню назву, минулі й надто віддалені дати (>2 років), некоректні типи. Дата події зберігається в UTC і відображається в Europe/Kyiv (зима/літо), включно з формами редагування.

**Rationale**: 30 балів за якість; дата 9999 і хибний timezone були реальними знахідками.

### V. Test-First for Security & Concurrency
Автотести однією командою обов'язкові для: приватний доступ, Origin, ідемпотентність, гонка за місце, валідація зображень, видалення акаунта. Тест пишеться разом із функцією, що його реалізує.

**Rationale**: Бонус +5, але головне — це єдиний спосіб довести виправлення знахідок.

## Security & Privacy Requirements
- Політика конфіденційності + посилання біля реєстрації.
- Правила сервісу + механізм скарг; автор може видаляти коментарі під своєю подією.
- Профіль: зміна імені, видалення акаунта (сесії, події, RSVP видаляються; коментарі знеособлюються).
- Приватні події: 404 на сторінку/обкладинку/запис/коментар для всіх без інвайту.
- Обкладинки: перевірка magic bytes, збереження оригінальних байтів у D1 (≤1.5 МБ), `nosniff`, відхилення HTML/SVG зі скриптом/EXE; публічні — ETag + edge cache, приватні — `no-store`.

## Development Workflow & Quality Gates
- Стек: Astro 7 SSR на Cloudflare Workers Free + D1 + React 19 + Tailwind 4 + shadcn/ui + React Bits (registry `@reactbits`).
- Node: ≥22.23.4.
- Команди: `npm run dev`, `npm run build`, `npm test`, `npx astro check`, `bash scripts/perf-check.sh`.
- Перед здачею: `npm test` зелений, `astro check` 0 error, `astro build` успішний, perf-check `PASS`, self-audit як другий користувач; CodeQL без критичних alert-ів.
- Деплой тільки через GitHub Actions із `main`; секрети зберігаються в GitHub Secrets.

### VI. Operational Excellence (NON-NEGOTIABLE)
Кожен PR проходить автоматичні перевірки тестів, типів і білду. Зміни потрапляють на прод тільки після зеленого CI та merge у `main`. Продовий деплой застосовує міграції схеми. Залежності оновлюються автоматично. Публічні обкладинки мають кеш, приватні — ні.

**Rationale**: Ручний деплой і відсутність перевірок були причиною простоїв і регресій.

## Governance
Constitution має пріоритет над PLAN.md і TASKS.md. Зміни principle вимагають MINOR/MAJOR bump і оновлення Sync Impact Report. Усі PR перевіряються на відповідність принципам. Винятки фіксуються в plan.md з обґрунтуванням.

**Version**: 1.1.0 | **Ratified**: 2026-11-24 | **Last Amended**: 2026-11-25
