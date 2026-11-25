// @ts-ignore -- Node-типи не встановлені, модуль доступний у рантаймі.
import { createHash, timingSafeEqual } from 'node:crypto';

const NodeBuffer: any = (globalThis as any).Buffer;
import { getDb } from '../../lib/db';
import { requireUser } from '../../lib/auth';

/** Спільні перевірки для приватних подій, профілю та коментарів. */

export type AnyCtx = {
  cookies?: any;
  locals?: any;
  request?: Request;
  url?: URL | string;
  params?: Record<string, string>;
  redirect?: (...args: any[]) => Response;
};

export const INVITE_TOKEN_RE = /^[0-9a-fA-F]{64}$/;
export const SESSION_COOKIE_NAMES = ['session', 'session_token', 'auth_session', 'sid', 'tusivka_session'];

export class BadRequest extends Error {}

/** Асинхронна база: кожен вираз готується й виконується з await. */
export async function database(): Promise<any> {
  return await getDb();
}

export async function columns(db: any, table: string): Promise<string[]> {
  try {
    return ((await db.prepare(`PRAGMA table_info(${table})`).all()) as any[]).map((row) => String(row.name).toLowerCase());
  } catch {
    return [];
  }
}

export function cookieValue(cookies: any, name: string): string | undefined {
  try {
    const value = cookies?.get?.(name);
    if (!value) return undefined;
    return typeof value === 'string' ? value : value.value;
  } catch {
    return undefined;
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Поточний користувач: спочатку штатний requireUser, потім локальний fallback по cookie. */
export async function currentUser(ctx: AnyCtx): Promise<any | null> {
  try {
    const result: any = await requireUser(ctx as any);
    const user = result && typeof result === 'object' ? (result.user ?? result) : null;
    if (user && (user.id || user.user_id)) return user;
  } catch {
    // fallback нижче
  }

  const fromLocals = ctx.locals?.user;
  if (fromLocals && (fromLocals.id || fromLocals.user_id)) return fromLocals;

  const token = SESSION_COOKIE_NAMES.map((name) => cookieValue(ctx.cookies, name)).find(Boolean);
  if (!token) return null;

  try {
    const db = await database();
    const cols = await columns(db, 'sessions');
    if (!cols.length) return null;
    const clauses: string[] = [];
    const args: string[] = [];
    if (cols.includes('token_hash')) {
      clauses.push('token_hash = ?');
      args.push(sha256(token));
    } else if (cols.includes('token')) {
      clauses.push('token = ?');
      args.push(token);
    }
    if (!clauses.length) return null;
    const session = (await db.prepare(`SELECT * FROM sessions WHERE ${clauses.join(' OR ')} LIMIT 1`).get(...args)) as any;
    if (!session) return null;
    if (session.expires_at && Date.parse(String(session.expires_at)) < Date.now()) return null;
    const userId = session.user_id || session.userId;
    if (!userId) return null;
    return ((await db.prepare('SELECT * FROM users WHERE id = ?').get(userId)) as any) ?? null;
  } catch {
    return null;
  }
}

/** Cookie інвайту встановлюється маршрутом /invite/:token. */
export function hasInviteCookie(ctx: AnyCtx, eventId: string, expectedToken?: string | null): boolean {
  const value = cookieValue(ctx.cookies, `invite_${eventId}`);
  if (!value || !INVITE_TOKEN_RE.test(value)) return false;
  if (!expectedToken) return true;
  const actual = NodeBuffer.from(value.toLowerCase());
  const expected = NodeBuffer.from(String(expectedToken).toLowerCase());
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** 404 для приватних подій без інвайту — приховуємо саме існування події. */
export async function canViewEvent(ctx: AnyCtx, event: any): Promise<boolean> {
  if (!event) return false;
  if (event.visibility !== 'private') return true;
  if (hasInviteCookie(ctx, String(event.id), event.invite_token)) return true;
  try {
    const url = ctx.url instanceof URL ? ctx.url : new URL(String(ctx.url ?? 'http://localhost/'));
    const queryToken = url.searchParams.get('invite');
    if (queryToken && INVITE_TOKEN_RE.test(queryToken) && queryToken.toLowerCase() === String(event.invite_token ?? '').toLowerCase()) return true;
  } catch {
    // ігноруємо битий URL
  }
  const user = await currentUser(ctx);
  if (user && event.author_id && user.id === event.author_id) return true;
  return false;
}

export function friendly(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Cache-Control': 'no-store'
    }
  });
}

export function redirectTo(ctx: AnyCtx, path: string, status = 303): Response {
  try {
    if (typeof ctx.redirect === 'function') return ctx.redirect(path, status as any);
  } catch {
    // fallback нижче
  }
  return new Response(null, { status, headers: { Location: path, 'Cache-Control': 'no-store' } });
}

/** Читає JSON або form-data; кидає BadRequest на битий JSON. */
export async function readPayload(request?: Request): Promise<Record<string, any>> {
  if (!request) return {};
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      const parsed: unknown = await request.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BadRequest('Некоректний JSON');
      return parsed as Record<string, any>;
    }
    const form = await request.formData();
    const result: Record<string, any> = {};
    for (const [key, value] of form.entries()) {
      result[key] = typeof value === 'string' ? value : '';
    }
    return result;
  } catch (error) {
    if (error instanceof BadRequest) throw error;
    throw new BadRequest('Некоректні дані запиту');
  }
}

export function payloadText(payload: Record<string, any>, ...keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
  }
  return '';
}

/** Очищення всіх сесійних cookie та інвайтів при видаленні акаунта. */
export function clearAuthCookies(cookies: any): void {
  const names = new Set<string>(SESSION_COOKIE_NAMES);
  try {
    for (const cookie of cookies?.getAll?.() ?? []) {
      const name = typeof cookie === 'string' ? cookie : cookie?.name;
      if (name && (/^invite_/.test(name) || /session|auth|sid/i.test(name))) names.add(name);
    }
  } catch {
    // ігноруємо
  }
  for (const name of names) {
    try {
      cookies?.delete?.(name, { path: '/' });
    } catch {
      try { cookies?.delete?.(name); } catch { /* cookie не існує */ }
    }
  }
}
