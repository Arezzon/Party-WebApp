import type { APIRoute } from 'astro';
import { clearAuthCookies, columns, currentUser, database, friendly, redirectTo } from '../../invite/_check';

/** POST /api/profile/delete — каскадне видалення акаунта й знеособлення коментарів. */

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const user = await currentUser(ctx as any);
  if (!user) return friendly(401, 'Потрібен вхід у акаунт');

  const db = await database();
  const userId = user.id || user.user_id;
  const commentCols = columns(db, 'comments');
  const anonymize = ['author_id = NULL'];
  if (commentCols.includes('author_name_snapshot')) anonymize.push("author_name_snapshot = 'Знайомець'");
  else if (commentCols.includes('author_name')) anonymize.push("author_name = 'Знайомець'");

  const run = (sql: string, args: any[] = []) => {
    try { db.prepare(sql).run(...args); } catch { /* таблиця/колонка може бути відсутня */ }
  };

  const deleteAccount = () => {
    // Спочатку знеособлюємо коментарі на чужих подіях: ім’я автора зникає разом з акаунтом.
    if (commentCols.length) run(`UPDATE comments SET ${anonymize.join(', ')} WHERE author_id = ?`, [userId]);
    run('DELETE FROM reports WHERE reporter_id = ?', [userId]);
    run('DELETE FROM idempotencykey WHERE user_id = ?', [userId]);
    run('DELETE FROM rsvp WHERE user_id = ?', [userId]);
    run('DELETE FROM sessions WHERE user_id = ?', [userId]);
    run('DELETE FROM events WHERE author_id = ?', [userId]);
    run('DELETE FROM users WHERE id = ?', [userId]);
  };

  try {
    if (typeof db.transaction === 'function') db.transaction(deleteAccount)();
    else deleteAccount();
  } catch {
    // Якщо транзакція не підтримується — виконуємо ті самі дії послідовно.
    deleteAccount();
  }

  // Якщо користувач ще існує (наприклад, FK перешкодив), не вдаємо успіх.
  let remaining = 0;
  try {
    remaining = Number((db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(userId) as any)?.n ?? 0);
  } catch { /* перевірка необов’язкова */ }
  if (remaining > 0) return friendly(400, 'Не вдалося видалити акаунт. Спробуйте ще раз.');

  clearAuthCookies(ctx.cookies);
  return redirectTo(ctx as any, '/', 303);
};

export const DELETE = POST;
