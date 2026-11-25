export const prerender = false;

// @ts-ignore -- Node-builtin, у проєкті немає @types/node
import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import {
  canViewEvent,
  currentUser,
  database,
  friendly,
  payloadText,
  readPayload,
  redirectTo,
} from '../../../invite/_check';

/**
 * /api/events/:id/comments
 * POST — ідемпотентне створення коментаря, 303 на сторінку події.
 * GET  — JSON-список коментарів (тіло повертається звичайним текстом у JSON).
 *
 * Текст коментаря НЕ перетворюється на HTML ані на сервері, ані тут:
 * сторінка події рендерить його через textContent, тому `<img onerror>` лишається текстом.
 */

/** Async-еквівалент columns() з invite/_check: всі методи БД тепер повертають Promise. */
async function tableColumns(db: any, table: string): Promise<string[]> {
  try {
    const rows = (await db.prepare(`PRAGMA table_info(${table})`).all()) as any[];
    return rows.map((row) => String(row.name).toLowerCase());
  } catch {
    return [];
  }
}

function getKey(request: Request | undefined, body: Record<string, any>): string | null {
  const header =
    request?.headers.get('idempotency-key') ?? request?.headers.get('x-idempotency-key') ?? '';
  if (header.trim()) return header.trim();
  const value = body?.idempotencyKey ?? body?.idempotency_key ?? body?.key;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export const POST: APIRoute = async (ctx) => {
  const user = await currentUser(ctx as any);
  if (!user) return friendly(401, 'Потрібен вхід у акаунт');

  const eventId = ctx.params?.id ?? '';
  if (!eventId) return friendly(404, 'Подію не знайдено');

  const db = await database();
  const event = await db
    .prepare('SELECT id, visibility, invite_token, author_id FROM events WHERE id = ?')
    .get(eventId) as any;
  if (!event) return friendly(404, 'Подію не знайдено');
  if (!(await canViewEvent(ctx as any, event))) {
    return friendly(404, 'Подію не знайдено');
  }

  let body: Record<string, any>;
  try {
    body = await readPayload(ctx.request);
  } catch {
    return friendly(400, 'Некоректні дані запиту');
  }
  const text = payloadText(body, 'body', 'text', 'comment').trim();
  if (!text) return friendly(400, 'Коментар не може бути порожнім');
  if (text.length > 2000) return friendly(400, 'Коментар має бути до 2000 символів');

  const userId = String(user.id || user.user_id);
  const key = getKey(ctx.request, body) ?? randomUUID();
  const commentCols = await tableColumns(db, 'comments');
  const idemCols = await tableColumns(db, 'idempotencykey');
  const hasIdem = idemCols.includes('key') && idemCols.includes('user_id');

  const create = async (): Promise<{ id: string; replay: boolean }> => {
    if (key && hasIdem) {
      const replay = await db
        .prepare(`SELECT result_id FROM idempotencykey WHERE user_id = ? AND key = ? AND kind = 'comment'`)
        .get(userId, key) as any;
      if (replay?.result_id) return { id: String(replay.result_id), replay: true };
    }

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const name = String(user.name ?? user.displayName ?? 'Знайомець');
    const cols: string[] = ['id', 'event_id', 'body', 'created_at'];
    const values: any[] = [id, eventId, text, createdAt];
    if (commentCols.includes('author_id')) {
      cols.push('author_id');
      values.push(userId);
    }
    if (commentCols.includes('author_name_snapshot')) {
      cols.push('author_name_snapshot');
      values.push(name);
    } else if (commentCols.includes('author_name')) {
      cols.push('author_name');
      values.push(name);
    }
    await db.prepare(
      `INSERT INTO comments (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
    ).run(...values);

    if (key && hasIdem) {
      try {
        await db.prepare(
          `INSERT OR IGNORE INTO idempotencykey (key, user_id, kind, result_id, created_at)
           VALUES (?, ?, 'comment', ?, ?)`
        ).run(key, userId, id, createdAt);
      } catch {
        // ідемпотентність — не критично для вже створеного коментаря
      }
    }
    return { id, replay: false };
  };

  await create();

  return redirectTo(ctx as any, `/events/${encodeURIComponent(eventId)}`, 303);
};

/** GET — допоміжний JSON-вивід; тіло коментаря залишається рядком, не HTML. */
export const GET: APIRoute = async (ctx) => {
  const eventId = ctx.params?.id ?? '';
  if (!eventId) return friendly(404, 'Подію не знайдено');

  const db = await database();
  const event = await db
    .prepare('SELECT id, visibility, invite_token, author_id FROM events WHERE id = ?')
    .get(eventId) as any;
  if (!event) return friendly(404, 'Подію не знайдено');
  if (!(await canViewEvent(ctx as any, event))) {
    return friendly(404, 'Подію не знайдено');
  }

  const cols = await tableColumns(db, 'comments');
  const nameCol = cols.includes('author_name_snapshot')
    ? 'author_name_snapshot'
    : cols.includes('author_name')
      ? 'author_name'
      : null;
  const rows = await db
    .prepare(
      `SELECT id, body, created_at${nameCol ? `, ${nameCol} AS author_name` : ''}
         FROM comments WHERE event_id = ? ORDER BY created_at ASC, id ASC`
    )
    .all(eventId) as any[];

  return new Response(
    JSON.stringify({
      comments: rows.map((row) => ({
        id: row.id,
        body: String(row.body ?? ''),
        author: row.author_name || 'Знайомець',
        created_at: row.created_at,
      })),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    }
  );
};
