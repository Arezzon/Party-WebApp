export const prerender = false;

// @ts-ignore -- Node-builtin, у проєкті немає @types/node
import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import {
  canViewEvent,
  currentUser,
  database,
  friendly,
  readPayload,
  redirectTo,
} from '../../../invite/_check';

/**
 * POST /api/events/:id/rsvp — «Іду».
 *
 * Гонка за останнє місце вирішується однією умовною INSERT ... SELECT ... WHERE:
 * перевірка лічильника й вставка відбуваються в межах одного запису, тому
 * з 20 паралельних запитів успішним буде рівно один. Результат перевіряється
 * через meta.changes. Унікальний індекс (event_id, user_id) і IdempotencyKey
 * дають ідемпотентність.
 */

export type RsvpOutcome = { ok: boolean; status: number; message: string };

/** Async-еквівалент columns() з invite/_check: всі методи БД тепер повертають Promise. */
async function tableColumns(db: any, table: string): Promise<string[]> {
  try {
    const rows = (await db.prepare(`PRAGMA table_info(${table})`).all()) as any[];
    return rows.map((row) => String(row.name).toLowerCase());
  } catch {
    return [];
  }
}

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

  const event = await db
    .prepare(
      `SELECT id, starts_at, places, visibility, invite_token, author_id
         FROM events WHERE id = ?`
    )
    .get(eventId) as any;
  if (!event) return { ok: false, status: 404, message: 'Подію не знайдено' };
  if (!(await canViewEvent(ctx, event))) {
    return { ok: false, status: 404, message: 'Подію не знайдено' };
  }

  const idemCols = await tableColumns(db, 'idempotencykey');
  const hasIdem = idemCols.includes('key') && idemCols.includes('user_id');
  const tableName = 'idempotencykey';

  if (key && hasIdem) {
    const replay = await db
      .prepare(`SELECT result_id FROM ${tableName} WHERE user_id = ? AND key = ? AND kind = 'rsvp'`)
      .get(userId, key) as any;
    if (replay) return { ok: true, status: 303, message: 'Ви вже записані' };
  }

  const existing = await db
    .prepare('SELECT 1 FROM rsvp WHERE event_id = ? AND user_id = ?')
    .get(eventId, userId);
  if (existing) return { ok: true, status: 303, message: 'Ви вже записані' };

  if (event.starts_at && Date.parse(String(event.starts_at)) <= Date.now()) {
    return { ok: false, status: 400, message: 'Реєстрацію завершено' };
  }

  const places = Number(event.places ?? 0);
  const createdAt = new Date().toISOString();

  // Атомарне захоплення місця: COUNT і INSERT в одному записі, під write-lock.
  // При одночасних запитах перший вставляє рядок, решта бачать заповнені місця.
  let claim: any;
  try {
    claim = await db.prepare(
      `INSERT INTO rsvp (event_id, user_id, created_at)
       SELECT ?, ?, ?
        WHERE (SELECT COUNT(*) FROM rsvp WHERE event_id = ?) < ?`
    ).run(eventId, userId, createdAt, eventId, places);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/locked|busy|constraint/i.test(message)) {
      return { ok: false, status: 400, message: 'Немає вільних місць' };
    }
    throw error;
  }
  const changes = Number(claim?.changes ?? claim?.meta?.changes ?? 0);
  if (!changes) {
    // Можливо, паралельний запит щойно записав саме цього користувача.
    const nowExisting = await db
      .prepare('SELECT 1 FROM rsvp WHERE event_id = ? AND user_id = ?')
      .get(eventId, userId);
    if (nowExisting) return { ok: true, status: 303, message: 'Ви вже записані' };
    return { ok: false, status: 400, message: 'Немає вільних місць' };
  }

  if (key && hasIdem) {
    try {
      await db.prepare(
        `INSERT OR IGNORE INTO ${tableName} (key, user_id, kind, result_id, created_at)
         VALUES (?, ?, 'rsvp', ?, ?)`
      ).run(key, userId, eventId, new Date().toISOString());
    } catch {
      // запис ідемпотентності не повинен скасовувати вже створений RSVP
    }
  }
  return { ok: true, status: 303, message: 'Ви записані на подію' };
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
