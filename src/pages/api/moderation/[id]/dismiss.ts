import type { APIRoute } from 'astro';
import { currentUser, friendly, redirectTo } from '../../../invite/_check';
import { getDb } from '../../../../lib/db';
import { isModerator, resolveReport } from '../../../../lib/moderation';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const user = await currentUser(ctx as any);
  if (!user) return friendly(401, 'Потрібен вхід у акаунт');
  if (!isModerator(user.email)) return friendly(403, 'Доступ лише для модераторів');

  const db = getDb();
  const result = resolveReport(db, ctx.params?.id ?? '', String(user.id), 'dismiss', 'Скаргу відхилено модератором');
  if (!result) return friendly(404, 'Скаргу не знайдено');
  return redirectTo(ctx as any, '/moderation', 303);
};
