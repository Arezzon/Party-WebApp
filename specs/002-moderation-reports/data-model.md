# Data Model: Модерація скарг

## Report (Reports)

| Field | Type | Rules |
|---|---|---|
| id | TEXT UUID | PRIMARY KEY |
| comment_id | TEXT | FK → Comments(id) ON DELETE CASCADE |
| event_id | TEXT | FK → Events(id) ON DELETE CASCADE; backfill з коментаря |
| reporter_id | TEXT | FK → Users(id) ON DELETE CASCADE |
| reason | TEXT | 1–500 символів, обов'язково |
| status | TEXT | `open` \| `dismissed` \| `comment_deleted`, default `open` |
| created_at | TEXT | ISO UTC |
| resolved_at | TEXT | nullable, ISO UTC |
| resolved_by | TEXT | nullable, FK → Users(id) |

**Constraint**: не більше однієї `open` скарги на (`comment_id`, `reporter_id`).

## ModerationAction (ModerationActions)

| Field | Type | Rules |
|---|---|---|
| id | TEXT UUID | PRIMARY KEY |
| report_id | TEXT | nullable, ID скарги-підстави |
| comment_id | TEXT | ID коментаря (без FK, бо коментар може бути видалений) |
| event_id | TEXT | ID події |
| actor_id | TEXT | FK → Users(id) |
| action | TEXT | `dismiss` \| `delete_comment` \| `event_author_delete` |
| reason | TEXT | коротка підстава |
| created_at | TEXT | ISO UTC |

## Transitions

`open` → `dismissed` (модератор залишає коментар)
`open` → `comment_deleted` (модератор або автор події видаляє коментар)

Після видалення коментаря пов'язані `Reports` зникають каскадом; `ModerationAction` лишається.
