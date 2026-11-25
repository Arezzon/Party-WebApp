import type { APIRoute } from 'astro';
import { canViewEvent, currentUser, database, friendly, readPayload, redirectTo } from '../../../invite/_check';
import { logModerationAction } from '../../../../lib/moderation';

export const prerender = false;

/** POST /api/comments/:id/delete — видалення автором коментаря або автором події. */
export const POST: APIRoute = async (ctx) => {
  const user = await currentUser(ctx as any);
  if (!user) return friendly(401, 'Потрібен вхід у акаунт');

  const commentId = ctx.params?.id ?? '';
  if (!commentId) return friendly(404, 'Коментар не знайдено');
  const db = await database();
  const comment = await db.prepare(
    `SELECT c.id, c.event_id, c.author_id, c.body,
            e.visibility, e.invite_token, e.author_id AS event_author_id
       FROM comments c JOIN events e ON e.id = c.event_id
      WHERE c.id = ?`
  ).get(commentId) as any;
  if (!comment) return friendly(404, 'Коментар не знайдено');

  const userId = user.id || user.user_id;
  const isCommentAuthor = !!comment.author_id && comment.author_id === userId;
  const isEventAuthor = !!comment.event_author_id && comment.event_author_id === userId;
  const visible = isCommentAuthor || isEventAuthor || await canViewEvent(ctx as any, {
    id: comment.event_id,
    visibility: comment.visibility,
    invite_token: comment.invite_token,
    author_id: comment.event_author_id
  });
  // Приватний коментар без інвайту не повинен бути видимим сторонньому.
  if (!visible) return friendly(404, 'Коментар не знайдено');
  if (!isCommentAuthor && !isEventAuthor) return friendly(403, 'Коментар може видалити лише його автор або автор події');

  // Прапорець report (?:report=1 або report у тілі) додатково фіксує модераційну підставу.
  let reportFlag = false;
  try {
    const url = ctx.url instanceof URL ? ctx.url : new URL(String(ctx.url ?? 'http://localhost/'));
    reportFlag = url.searchParams.get('report') === '1';
    if (!reportFlag) {
      const body = await readPayload(ctx.request);
      reportFlag = body.report === true || body.report === '1' || body.report === 'true';
    }
  } catch {
    // тіло не обов’язкове
  }
  if (reportFlag && isEventAuthor && !isCommentAuthor) {
    try {
      await logModerationAction(db, {
        commentId: comment.id,
        eventId: comment.event_id,
        actorId: String(userId),
        action: 'event_author_delete',
        reason: 'Видалено автором події'
      });
    } catch { /* підстава не блокує видалення */ }
  }

  await db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);
  return redirectTo(ctx as any, `/events/${comment.event_id}`, 303);
};
