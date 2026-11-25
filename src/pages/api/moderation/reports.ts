import type { APIRoute } from 'astro';
import { currentUser, friendly } from '../../invite/_check';
import { getDb } from '../../../lib/db';
import { isModerator, listOpenReports } from '../../../lib/moderation';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const user = await currentUser(ctx as any);
  if (!user) return friendly(401, 'Потрібен вхід у акаунт');
  if (!isModerator(user.email)) return friendly(403, 'Доступ лише для модераторів');
  return new Response(JSON.stringify({ reports: listOpenReports(getDb()) }, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
};
