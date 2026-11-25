import type { APIRoute } from 'astro';
import { clearAuthCookies, currentUser, database, friendly, redirectTo } from '../../invite/_check';

/** POST /api/profile/delete — каскадне видалення акаунта й знеособлення коментарів. */

export const prerender = false;

/** Async-еквівалент columns() з invite/_check: всі методи БД тепер повертають Promise. */
async function tableColumns(db: any, table: string): Promise<string[]> {
  try {
    const rows = (await db.prepare(`PRAGMA table_info(${table})`).all()) as any[];
    return rows.map((row) => String(row.name).toLowerCase());
  } catch {
    return [];
  }
}

export const POST: APIRoute = async (ctx) => {
  const user = await currentUser(ctx as any);
  if (!user) return friendly(401, 'Потрібен вхід у акаунт');

  const db = await database();
  const userId = user.id || user.user_id;
  const commentCols = await tableColumns(db, 'comments');
  const anonymize = ['author_id = NULL'];
  if (commentCols.includes('author_name_snapshot')) anonymize.push("author_name_snapshot = 'Знайомець'");
  else if (commentCols.includes('author_name')) anonymize.push("author_name = 'Знайомець'");

  const run = async (sql: string, args: any[] = []) => {
    try { await db.prepare(sql).run(...args); } catch { /* таблиця/колонка може бути відсутня */ }
  };

  const deleteAccount = async () => {
    // Спочатку знеособлюємо коментарі на чужих подіях: ім’я автора зникає разом з акаунтом.
    if (commentCols.length) await run(`UPDATE comments SET ${anonymize.join(', ')} WHERE author_id = ?`, [userId]);
    await run('DELETE FROM reports WHERE reporter_id = ?', [userId]);
    await run('DELETE FROM idempotencykey WHERE user_id = ?', [userId]);
    await run('DELETE FROM rsvp WHERE user_id = ?', [userId]);
    await run('DELETE FROM sessions WHERE user_id = ?', [userId]);
    await run('DELETE FROM events WHERE author_id = ?', [userId]);
    await run('DELETE FROM users WHERE id = ?', [userId]);
  };

  await deleteAccount();

  // Якщо користувач ще існує (наприклад, FK перешкодив), не вдаємо успіх.
  let remaining = 0;
  try {
    remaining = Number((await db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(userId) as any)?.n ?? 0);
  } catch { /* перевірка необов’язкова */ }
  if (remaining > 0) return friendly(400, 'Не вдалося видалити акаунт. Спробуйте ще раз.');

  clearAuthCookies(ctx.cookies);
  return redirectTo(ctx as any, '/', 303);
};

export const DELETE = POST;
