// @ts-ignore -- Node-типи не встановлені, модуль доступний у рантаймі.
import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import { canViewEvent, currentUser, database, friendly, payloadText, readPayload, redirectTo } from '../../../invite/_check';

/** POST /api/comments/:id/report — скарга на коментар; 404 для приватних подій без інвайту. */

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const user = await currentUser(ctx as any);
  if (!user) return friendly(401, 'Потрібен вхід у акаунт');

  const commentId = ctx.params?.id ?? '';
  if (!commentId) return friendly(404, 'Коментар не знайдено');
  const db = await database();
  const comment = db.prepare(
    `SELECT c.id, c.event_id, c.author_id,
            e.visibility, e.invite_token, e.author_id AS event_author_id
       FROM comments c JOIN events e ON e.id = c.event_id
      WHERE c.id = ?`
  ).get(commentId) as any;
  if (!comment) return friendly(404, 'Коментар не знайдено');

  const visible = await canViewEvent(ctx as any, {
    id: comment.event_id,
    visibility: comment.visibility,
    invite_token: comment.invite_token,
    author_id: comment.event_author_id
  });
  if (!visible) return friendly(404, 'Коментар не знайдено');

  let payload: Record<string, any>;
  try {
    payload = await readPayload(ctx.request);
  } catch {
    return friendly(400, 'Некоректні дані запиту');
  }
  const reason = payloadText(payload, 'reason', 'message').trim();
  if (!reason || reason.length > 500) return friendly(400, 'Вкажіть причину скарги (до 500 символів)');

  try {
    db.prepare('INSERT INTO reports (id, comment_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), comment.id, user.id || user.user_id, reason, new Date().toISOString());
  } catch {
    const existing = db.prepare('SELECT id FROM reports WHERE comment_id = ? AND reporter_id = ? LIMIT 1')
      .get(comment.id, user.id || user.user_id);
    if (!existing) return friendly(400, 'Не вдалося зберегти скаргу');
  }

  return redirectTo(ctx as any, `/events/${comment.event_id}`, 303);
};
