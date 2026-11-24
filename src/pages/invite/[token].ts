import type { APIRoute } from 'astro';
import { INVITE_TOKEN_RE, database, friendly, redirectTo } from './_check';

/** GET /invite/:token — 32 випадкові байти (64 hex), cookie invite_<eventId>, 303 на подію. */

export const prerender = false;

export const GET: APIRoute = async ({ params, cookies, redirect }) => {
  const token = params?.token ?? '';
  if (!INVITE_TOKEN_RE.test(token)) return friendly(404, 'Запрошення не знайдено');

  const db = await database();
  const event = db
    .prepare('SELECT id, invite_token FROM events WHERE invite_token = ?')
    .get(token.toLowerCase()) as any;
  if (!event) return friendly(404, 'Запрошення не знайдено');

  cookies.set(`invite_${event.id}`, token.toLowerCase(), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30
  });

  return redirectTo({ cookies, redirect }, `/events/${event.id}`, 303);
};
