# Data Model: Сервіс подій «Тусовка»

**Feature**: 001-tusivka-events

## Сутності

### User
| Поле | Тип | Валідація | Примітка |
|------|-----|-----------|----------|
| id | TEXT PK | UUID v4 | |
| email | TEXT UNIQUE | нижній регістр, формат email | |
| name | TEXT | 1..80, не порожній після trim | змінюється в профілі |
| password_hash | TEXT | `scrypt$N$r$p$salt$hash` | never повертається клієнту |
| created_at | TEXT | ISO UTC | |

### Session
| Поле | Тип | Валідація |
|------|-----|-----------|
| token_hash | TEXT PK | sha256(raw token) |
| user_id | TEXT FK → User.id ON DELETE CASCADE | |
| expires_at | TEXT ISO UTC | 30 днів |
| created_at | TEXT ISO UTC | |

### Event
| Поле | Тип | Валідація |
|------|-----|-----------|
| id | TEXT PK | UUID v4 |
| author_id | TEXT FK → User.id ON DELETE CASCADE | |
| title | TEXT | 1..120, trim, не порожня |
| description | TEXT | 0..5000 |
| starts_at | TEXT ISO UTC | > now, ≤ now+2years |
| places | INTEGER | >0, ціле, ≤10000 |
| cover_blob | BLOB | WebP, ≤~2MB після перекодування |
| cover_mime | TEXT | завжди `image/webp` |
| visibility | TEXT | `public` \| `private` |
| invite_token | TEXT UNIQUE | 32 random bytes hex (64 chars) |
| created_at | TEXT ISO UTC | |

### RSVP
| Поле | Тип | Валідація |
|------|-----|-----------|
| event_id | TEXT FK → Event.id ON DELETE CASCADE | |
| user_id | TEXT FK → User.id ON DELETE CASCADE | |
| created_at | TEXT ISO UTC | |
| **UNIQUE** | (event_id, user_id) | ідемпотентність «Іду» |

### Comment
| Поле | Тип | Валідація |
|------|-----|-----------|
| id | TEXT PK | UUID v4 |
| event_id | TEXT FK → Event.id ON DELETE CASCADE | |
| author_id | TEXT FK → User.id ON DELETE SET NULL | null після видалення акаунта → «Знайомець» |
| author_name_snapshot | TEXT | ім'я на момент створення (для знеособлення) |
| body | TEXT | 1..2000, екранується при рендері |
| created_at | TEXT ISO UTC | |

### IdempotencyKey
| Поле | Тип | Валідація |
|------|-----|-----------|
| key | TEXT | UUID від клієнта |
| user_id | TEXT FK → User.id ON DELETE CASCADE | |
| kind | TEXT | `event` \| `comment` \| `rsvp` |
| result_id | TEXT | id створеної сутності |
| created_at | TEXT ISO UTC | |
| **UNIQUE** | (key, user_id, kind) | повтор → повернути result_id |

### Report
| Поле | Тип | Валідація |
|------|-----|-----------|
| id | TEXT PK | UUID |
| comment_id | TEXT FK → Comment.id ON DELETE CASCADE | |
| reporter_id | TEXT FK → User.id | |
| reason | TEXT | 1..500 |
| created_at | TEXT ISO UTC | |

## Індекси
```sql
CREATE INDEX idx_events_public_future ON Events(visibility, starts_at);
CREATE INDEX idx_comments_event ON Comments(event_id, created_at);
CREATE UNIQUE INDEX idx_rsvp ON RSVP(event_id, user_id);
CREATE UNIQUE INDEX idx_idem ON IdempotencyKey(user_id, key, kind);
CREATE UNIQUE INDEX idx_invite ON Events(invite_token);
```

## Валідації (server-side, zod)
- `places`: integer, 1..10000 (відхиляє 0, -1, 1.5, 7abc, 1e20).
- `title`: trim().min(1).max(120).
- `starts_at`: ISO date, > now(), ≤ now+2r.
- `body`: trim().min(1).max(2000).
- upload: magic bytes PNG/JPEG/WebP, ≤10MB, інакше 400/413.

## State transitions
- Event: `upcoming` → (starts_at < now) `past` → запис заборонений (400 «Реєстрацію завершено»).
- RSVP: none → created → deleted; ідемпотентно.
- User: active → deleted (каскад сесій/подій/RSVP, коментарі author_id=NULL).
