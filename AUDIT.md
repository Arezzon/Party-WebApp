# Тусовка — повна перебудова UI (clean slate)

Дата: 2026-11-25

## Що зробив

Весь попередній UI-шар видалено з нуля: `src/components/bits/*`, `Header.astro`, `SiteEffects.astro`, старі форми, `Layout.astro`, `global.css` і всі сторінки. Бекенд (`src/lib/*`, `src/pages/api/*`, `middleware.ts`) не змінено — контракти, валідація, idempotency, сесії й захист Origin лишились недоторканими.

Новий UI зібраний у `src/components/site/*` і побудований тільки на готових компонентах React Bits:

- **Шапка** — `PillNav` + `NeonLogo`, одна на всі сторінки, з `whitespace-nowrap` на 375px.
- **Підвал** — `GlassIcons`.
- **Заголовки** — `SplitText`, `ShinyText`.
- **Фон** — `Grainient` (WebGL), `Noise`, CSS-сонце й перспективна сітка.
- **Головна** — `PromoStrip` (`HoloMosaic`, `SpecularButton`), `EventExplorer` (`CurvedInput`, `AnimatedList`, `Counter`).
- **Подія** — `BorderGlow`, `SpotlightCard`, `Counter`, `AnimatedList`, `FadeContent`, `SpecularButton`; додано блок коментарів із формами скарги/видалення.
- **Профіль** — `ProfileCard`, `AnimatedList`, `BorderGlow`, `FadeContent`, `SpecularButton`.
- **Форми** — `AnimatedContent`, `SpotlightCard`, `SpecularButton`; багатопольові поля лишаються нативними (у бібліотеці немає готового багатопольового form-компонента), стилізовані через `.vc-field`.
- **Правила** — `NeonGlyphs` + `SiteHeading`.

## Стиль

Vice City: нічний фіолет `#07020f`, неоновий рожевий `#ff2d87`, океан-ціан `#10e0ff`, бузок `#b45cff`. Токени винесені в `global.css`; усі кольори компонентів передані явно через пропси.

## Виправлені проблеми минулої версії

- Субтитр більше не обривається (`DecryptedText` з `maxIterations={10}` прибрано — тепер `ShinyText`).
- Жодних дубльованих шапок/підвалів і стилів, що випадають.
- Коментарі нарешті рендеряться на сторінці події (раніше API був, UI не було).

## Перевірка

- `astro check` — 0 errors
- `npm test` — 26/26
- `npm run build` — success
- `tests/self-audit.mjs` через живий HTTP — SELF-AUDIT OK (реєстрація, логін, створення події, 403 чужим, profile, CSRF, 404)
- Браузер: headless Chromium, усі публічні сторінки гідруються (0 негідрованих острівців), фон і навігація на місці, горизонтального переповнення немає; захищені сторінки `/profile`, `/events/new`, `/events/:id`, `/events/:id/edit` — 200 з валідною сесією.
- Конвертація часу: `2027-12-24T18:00` (Київ) → `2027-12-24T16:00:00Z`, літній час → `+3`.
- Публічний GET 200, POST 303.
