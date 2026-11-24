import type { APIRoute } from 'astro';
import { clearSessionCookie, deleteSession, readSessionToken } from '../lib/auth.ts';

export const prerender = false;

/** POST /logout — invalidate the session row and expire every session cookie. */
export const POST: APIRoute = async ({ cookies, request }) => {
  const token = readSessionToken({ cookies, request });
  if (token) deleteSession(token);
  clearSessionCookie(cookies);
  return new Response(null, {
    status: 303,
    headers: { Location: '/', 'Cache-Control': 'no-store' }
  });
};

/** Convenience for browser clients that follow plain links. */
export const GET: APIRoute = async (context) => POST(context);
