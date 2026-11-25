/**
 * Global middleware: Origin/CSRF guard for mutations, session lookup,
 * invite cookie exposure and security headers on every response.
 */
import { defineMiddleware } from 'astro:middleware';
// @ts-ignore -- virtual module only exists in the Workers build
import { bindCloudflareEnv } from './lib/cf-env';
import {
  LOGIN_LIMIT_MESSAGE,
  checkOrigin,
  clientKey,
  isRateLimited,
  readSessionToken,
  requireUser
} from './lib/auth';
import { INVITE_COOKIE_PREFIX } from './lib/env';

export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"
});

export const MUTATING_METHODS: readonly string[] = Object.freeze(['POST', 'PUT', 'PATCH', 'DELETE']);

export function withSecurityHeaders(response: Response): Response {
  try {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
}

export function isMutation(request: Request): boolean {
  return MUTATING_METHODS.includes(String(request?.method ?? 'GET').toUpperCase());
}

export function friendlyError(status: number, message: string): Response {
  return withSecurityHeaders(new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  }));
}

function readInvites(cookies: any): Record<string, string> {
  const invites: Record<string, string> = {};
  try {
    for (const cookie of cookies?.getAll?.() ?? []) {
      const name = typeof cookie === 'string' ? cookie : String(cookie?.name ?? '');
      if (!name.startsWith(INVITE_COOKIE_PREFIX)) continue;
      const value = typeof cookie === 'string' ? '' : cookie?.value;
      if (typeof value === 'string' && value) invites[name.slice(INVITE_COOKIE_PREFIX.length)] = value;
    }
  } catch { /* no cookie jar */ }
  return invites;
}

export const onRequest = defineMiddleware(async (context, next) => {
  bindCloudflareEnv();
  const request = context.request;

  if (isMutation(request)) {
    const origin = checkOrigin(request);
    if (!origin.allowed) return friendlyError(400, 'Недозволений Origin запиту');

    let pathname = '';
    try { pathname = new URL(request.url).pathname; } catch { /* ignore */ }
    if (pathname === '/login' && await isRateLimited(`login:${clientKey(request)}`)) {
      return friendlyError(429, LOGIN_LIMIT_MESSAGE);
    }
  }

  const token = readSessionToken(context);
  context.locals.sessionToken = token;
  context.locals.user = token ? await requireUser(context) : null;
  context.locals.invites = readInvites(context.cookies);

  const response = await next();
  return withSecurityHeaders(response);
});

export default onRequest;
