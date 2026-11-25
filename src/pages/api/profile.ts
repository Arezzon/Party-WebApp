import type { APIRoute } from 'astro';
import { currentUser, database, friendly, payloadText, readPayload, redirectTo } from '../invite/_check';

/** Валідація імені: 1..80 символів після trim. */
function normalizeName(raw: string): string | null {
  const name = raw.trim();
  if (!name || name.length > 80) return null;
  return name;
}

/** POST/PATCH /api/profile — зміна імені, 303 на профіль. */

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const user = await currentUser(ctx as any);
  if (!user) return friendly(401, 'Потрібен вхід у акаунт');

  let payload: Record<string, any>;
  try {
    payload = await readPayload(ctx.request);
  } catch {
    return friendly(400, 'Некоректні дані запиту');
  }
  const name = normalizeName(payloadText(payload, 'name', 'displayName'));
  if (!name) return friendly(400, 'Ім’я має бути від 1 до 80 символів');

  const db = await database();
  await db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id);
  // Коментарі показують актуальне ім’я; знеособлення зберігає знімок на момент видалення.
  try {
    await db.prepare('UPDATE comments SET author_name_snapshot = ? WHERE author_id = ?').run(name, user.id);
  } catch {
    // колонка знімка може бути відсутня у старій схемі
  }
  return redirectTo(ctx as any, '/profile', 303);
};

export const PATCH = POST;
