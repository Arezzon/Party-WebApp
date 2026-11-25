import type { APIRoute } from 'astro';
import {
  canViewEventFromRequest,
  coverResponse,
  getCover,
  type EventRecord
} from '../../../lib/events.ts';

export const prerender = false;

export const GET: APIRoute = async ({ params, cookies, url, request }) => {
  const id = String(params.id ?? '');
  const cover = await getCover(id);
  const viewable = cover && canViewEventFromRequest(
    {
      id,
      visibility: cover.visibility,
      inviteToken: cover.inviteToken
    } as EventRecord,
    cookies,
    url
  );
  if (!cover || !cover.blob || !viewable) {
    return new Response('Подію не знайдено.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }
    });
  }

  const publicCover = cover.visibility === 'public';
  const cache = publicCover ? (globalThis as any).caches?.default : undefined;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const response = coverResponse(
    {
      coverBlob: cover.blob,
      coverMime: cover.mime,
      visibility: cover.visibility,
      createdAt: cover.createdAt
    } as EventRecord,
    request
  );
  if (cache && response.status === 200) await cache.put(cacheKey, response.clone());
  return response;
};
