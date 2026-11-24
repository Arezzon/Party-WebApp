import type { APIRoute } from 'astro';
import { canViewEventFromRequest, coverResponse, getEvent } from '../../../lib/events.ts';

export const prerender = false;

export const GET: APIRoute = ({ params, cookies, url }) => {
  const event = getEvent(String(params.id ?? ''));
  if (!event || !canViewEventFromRequest(event, cookies, url)) {
    return new Response('Подію не знайдено.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }
    });
  }
  return coverResponse(event);
};
