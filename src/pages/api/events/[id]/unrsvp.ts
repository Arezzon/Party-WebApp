export const prerender = false;

import type { APIRoute } from 'astro';
import { canViewEvent, currentUser, database, friendly, redirectTo } from '../../../invite/_check';

/** POST /api/events/:id/unrsvp — «Скасувати». Повторний виклик успішний (ідемпотентний). */
export const POST: APIRoute = async (ctx) => {
  const user = await currentUser(ctx as any);
  if (!user) return friendly(401, 'Потрібен вхід у акаунт');

  const eventId = ctx.params?.id ?? '';
  if (!eventId) return friendly(404, 'Подію не знайдено');

  const db = await database();
  const event = db
    .prepare('SELECT id, visibility, invite_token, author_id FROM events WHERE id = ?')
    .get(eventId) as any;
  if (!event) return friendly(404, 'Подію не знайдено');
  if (!(await canViewEvent(ctx as any, event))) {
    return friendly(404, 'Подію не знайдено');
  }

  const userId = String(user.id || user.user_id);
  const remove = () => db.prepare('DELETE FROM rsvp WHERE event_id = ? AND user_id = ?').run(eventId, userId);
  if (typeof db.transaction === 'function') db.transaction(remove)();
  else remove();

  return redirectTo(ctx as any, `/events/${encodeURIComponent(eventId)}`, 303);
};
