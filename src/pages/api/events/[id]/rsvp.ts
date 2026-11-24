export const prerender = false;

// @ts-ignore -- Node-builtin, у проєкті немає @types/node
import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import {
  canViewEvent,
  columns,
  currentUser,
  database,
  friendly,
  readPayload,
  redirectTo,
} from '../../../invite/_check';

/**
 * POST /api/events/:id/rsvp — «Іду».
 *
 * Гонка за останнє місце вирішується всередині однієї транзакції SQLite з
 * BEGIN IMMEDIATE: перевірка лічильника й INSERT відбуваються під виключним
 * write-lock, тому з 20 паралельних запитів успішним буде рівно один.
 * Унікальний індекс (event_id, user_id) і IdempotencyKey дають ідемпотентність.
 */

export type RsvpOutcome = { ok: boolean; status: number; message: string };

function idemKey(request: Request | undefined, body: Record<string, any>): string | null {
  const fromHeader =
    request?.headers.get('idempotency-key') ?? request?.headers.get('x-idempotency-key') ?? '';
  if (fromHeader.trim()) return fromHeader.trim();
  const fromBody = body?.idempotencyKey ?? body?.idempotency_key ?? body?.key;
  return typeof fromBody === 'string' && fromBody.trim() ? fromBody.trim() : null;
}

/** Читає подію, перевіряє інвайт і виконує Atomic RSVP. */
export async function registerRsvp(
  ctx: any,
  eventId: string,
  userId: string,
  key: string | null
): Promise<RsvpOutcome> {
  const db = await database();

  const event = db
    .prepare(
      `SELECT id, starts_at, places, visibility, invite_token, author_id
         FROM events WHERE id = ?`
    )
    .get(eventId) as any;
  if (!event) return { ok: false, status: 404, message: 'Подію не знайдено' };
  if (!(await canViewEvent(ctx, event))) {
    return { ok: false, status: 404, message: 'Подію не знайдено' };
  }

  const idemCols = columns(db, 'idempotencykey');
  const hasIdem = idemCols.includes('key') && idemCols.includes('user_id');
  const tableName = 'idempotencykey';

  const run = (): RsvpOutcome => {
    if (key && hasIdem) {
      const replay = db
        .prepare(`SELECT result_id FROM ${tableName} WHERE user_id = ? AND key = ? AND kind = 'rsvp'`)
        .get(userId, key) as any;
      if (replay) return { ok: true, status: 303, message: 'Ви вже записані' };
    }

    const existing = db
      .prepare('SELECT 1 FROM rsvp WHERE event_id = ? AND user_id = ?')
      .get(eventId, userId);
    if (existing) return { ok: true, status: 303, message: 'Ви вже записані' };

    if (event.starts_at && Date.parse(String(event.starts_at)) <= Date.now()) {
      return { ok: false, status: 400, message: 'Реєстрацію завершено' };
    }

    const row = db.prepare('SELECT COUNT(*) AS n FROM rsvp WHERE event_id = ?').get(eventId) as any;
    const taken = Number(row?.n ?? 0);
    const places = Number(event.places ?? 0);
    if (taken >= places) {
      return { ok: false, status: 400, message: 'Немає вільних місць' };
    }

    const result = db
      .prepare('INSERT OR IGNORE INTO rsvp (event_id, user_id, created_at) VALUES (?, ?, ?)')
      .run(eventId, userId, new Date().toISOString());
    // Якщо паралельний процес встиг зайняти місце між COUNT і INSERT — повідомляємо відмову.
    if (!result || Number(result.changes ?? 0) === 0) {
      return { ok: false, status: 400, message: 'Немає вільних місць' };
    }

    if (key && hasIdem) {
      try {
        db.prepare(
          `INSERT OR IGNORE INTO ${tableName} (key, user_id, kind, result_id, created_at)
           VALUES (?, ?, 'rsvp', ?, ?)`
        ).run(key, userId, eventId, new Date().toISOString());
      } catch {
        // запис ідемпотентності не повинен скасовувати вже створений RSVP
      }
    }
    return { ok: true, status: 303, message: 'Ви записані на подію' };
  };

  if (typeof db.transaction === 'function') {
    try {
      const tx = db.transaction(run);
      return typeof tx.immediate === 'function' ? tx.immediate() : tx();
    } catch (error) {
      // Помилка блокування/конфлікту = місце зайняте іншим запитом.
      const message = error instanceof Error ? error.message : '';
      if (/locked|busy|constraint/i.test(message)) {
        return { ok: false, status: 400, message: 'Немає вільних місць' };
      }
      throw error;
    }
  }
  return run();
}

export const POST: APIRoute = async (ctx) => {
  const user = await currentUser(ctx as any);
  if (!user) return friendly(401, 'Потрібен вхід у акаунт');

  const eventId = ctx.params?.id ?? '';
  if (!eventId) return friendly(404, 'Подію не знайдено');

  let body: Record<string, any> = {};
  try {
    body = await readPayload(ctx.request);
  } catch {
    // Тіло для RSVP не обов’язкове — ключ може бути в заголовку.
  }

  const key = idemKey(ctx.request, body) ?? randomUUID();
  const outcome = await registerRsvp(ctx as any, eventId, String(user.id || user.user_id), key);
  if (!outcome.ok) return friendly(outcome.status, outcome.message);
  return redirectTo(ctx as any, `/events/${encodeURIComponent(eventId)}`, 303);
};
