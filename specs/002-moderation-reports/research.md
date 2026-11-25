# Research: Модерація скарг

## Decision 1: Роль модератора через конфігурацію, а не нову таблицю ролей

- **Decision**: `MODERATOR_EMAILS` (comma-separated), за замовчуванням `arsen@tusivka.local`.
- **Rationale**: мінімальна зміна моделі користувачів; не потрібна публічна рольова адміністрація.
- **Alternatives considered**: колонка `Users.role` (потрібна міграція + UI призначення); жорстко зашитий email (не гнучко).

## Decision 2: Частковий унікальний індекс для відкритих скарг

- **Decision**: `CREATE UNIQUE INDEX ... ON Reports(comment_id, reporter_id) WHERE status = 'open'`
  плюс явна перевірка в застосунку; старі дублі помічаються як `dismissed`.
- **Rationale**: захищає й від послідовних, і від паралельних повторів; зберігає історію закритих скарг.
- **Alternatives considered**: `INSERT OR IGNORE` без індесу (не працює без унікальності); видаляти стару скаргу (губиться історія).

## Decision 3: Статусна модель замість фізичного видалення скарг

- **Decision**: `status` = `open` / `dismissed` / `comment_deleted`, поля `resolved_at`, `resolved_by`.
- **Rationale**: черга показує тільки `open`, історія лишається доступною без окремого звіту.
- **Alternatives considered**: видаляти скаргу після розгляду (немає сліду); таблиця черги окремо (дублювання даних).

## Decision 4: Окремий запис підстави модерації

- **Decision**: таблиця `ModerationActions` з полями без FK на `Comments`, щоб пережити каскадне видалення коментаря.
- **Rationale**: provides audit trail для дій модератора й для видалення автором події з прапорцем `report`.
- **Alternatives considered**: покладатися тільки на `Reports` (рядки зникають разом із коментарем через ON DELETE CASCADE).
