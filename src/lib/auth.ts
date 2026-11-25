/**
 * Authentication: scrypt salt:hash passwords, random 32-byte session tokens
 * (SHA-256 hashed in SQLite), HttpOnly + SameSite=Lax cookies and a durable
 * D1 login rate limiter (10 failures -> 429). KDF path is runtime-aware.
 */
// @ts-ignore -- node builtins are provided by the Node runtime
import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDb, newId, nowIso, type UserRow } from './db';
import {
  LOGIN_WINDOW_MS,
  MAX_LOGIN_ATTEMPTS,
  SESSION_COOKIE_NAMES,
  SESSION_SECRET,
  SESSION_TTL_SECONDS,
  SECURE_COOKIES,
  env
} from './env';

export const SESSION_COOKIE_NAME = env.sessionCookieName;
export const SCRYPT_N = 16_384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_KEYLEN = 64;
export const MAX_LOGIN_FAILURES = MAX_LOGIN_ATTEMPTS;
export const RATE_LIMIT_WINDOW_MS = LOGIN_WINDOW_MS;
export const RATE_LIMIT_MAX = MAX_LOGIN_ATTEMPTS;
export const LOGIN_LIMIT_MESSAGE = 'Забагато спроб. Зачекайте хвилину.';

export type PublicUser = Pick<UserRow, 'id' | 'email' | 'name' | 'created_at'>;

export interface CookieJar {
  get(name: string): unknown;
  set(name: string, value: string, options?: Record<string, unknown>): unknown;
  delete(name: string, options?: Record<string, unknown>): unknown;
  getAll?(): unknown;
}

export interface SessionRecord {
  token_hash: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export class AuthError extends Error {
  readonly code: string;
  constructor(message: string, code = 'auth_error') {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

declare global {
  namespace App {
    interface Locals {
      user?: any;
      sessionToken?: any;
      invites?: any;
      [key: string]: any;
    }
  }
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const length = Math.floor(clean.length / 2);
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function sha256(value: string | Uint8Array): string {
  const hash = createHash('sha256');
  hash.update(value as any);
  return hash.digest('hex');
}

function derive(password: string, salt: Uint8Array, n = SCRYPT_N, r = SCRYPT_R, p = SCRYPT_P): Uint8Array {
  const result = scryptSync(password, salt as any, SCRYPT_KEYLEN, {
    N: n,
    r,
    p,
    maxmem: 128 * 1024 * 1024
  });
  return new Uint8Array(result);
}

/**
 * Workers runs `scryptSync` as native code outside the metered JS CPU budget,
 * so async `node:crypto.scrypt` (a JS polyfill there) would hang under load.
 * Node/dev uses real async scrypt to keep the event loop responsive.
 */
export const IS_WORKERS_RUNTIME = typeof (globalThis as any).WebSocketPair === 'function';
const IS_DEV_NODE = !IS_WORKERS_RUNTIME && typeof (globalThis as any).process?.release?.name === 'string';

export const SCRYPT_CONCURRENCY = 4;
let activeScrypt = 0;
const scryptWaiters: Array<() => void> = [];

function acquireScryptSlot(): Promise<void> {
  if (activeScrypt < SCRYPT_CONCURRENCY) {
    activeScrypt += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => scryptWaiters.push(resolve));
}

function releaseScryptSlot(): void {
  const next = scryptWaiters.shift();
  if (next) next();
  else activeScrypt -= 1;
}

async function deriveAsync(
  password: string,
  salt: Uint8Array,
  n = SCRYPT_N,
  r = SCRYPT_R,
  p = SCRYPT_P
): Promise<Uint8Array> {
  await acquireScryptSlot();
  try {
    if (!IS_DEV_NODE) return derive(password, salt, n, r, p);

    return await new Promise<Uint8Array>((resolve, reject) => {
      scrypt(password, salt as any, SCRYPT_KEYLEN, { N: n, r, p, maxmem: 128 * 1024 * 1024 }, (error, key) => {
        if (error || !key) reject(error ?? new Error('scrypt failed'));
        else resolve(new Uint8Array(key));
      });
    });
  } finally {
    releaseScryptSlot();
  }
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  try {
    return Boolean(timingSafeEqual(a as any, b as any));
  } catch {
    return false;
  }
}

interface StoredPassword {
  salt: Uint8Array;
  expected: Uint8Array;
  n: number;
  r: number;
  p: number;
}

function parseStoredPassword(stored: string): StoredPassword | null {
  if (typeof stored !== 'string' || stored.length === 0) return null;
  try {
    if (stored.startsWith('scrypt$')) {
      const parts = stored.split('$');
      if (parts.length !== 6) return null;
      const n = Number(parts[1]);
      const r = Number(parts[2]);
      const p = Number(parts[3]);
      if (![n, r, p].every((value) => Number.isInteger(value) && value > 0)) return null;
      const salt = fromHex(parts[4]);
      const expected = fromHex(parts[5]);
      if (salt.length === 0 || expected.length === 0) return null;
      return { salt, expected, n, r, p };
    }
    if (stored.includes(':')) {
      const [saltHex, hashHex] = stored.split(':');
      const salt = fromHex(saltHex);
      const expected = fromHex(hashHex);
      if (salt.length === 0 || expected.length === 0) return null;
      return { salt, expected, n: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P };
    }
  } catch {
    return null;
  }
  return null;
}

/** `scrypt$16384$8$1$<salt-hex>$<hash-hex>` — never returns the raw password. */
export function hashPassword(password: string): string {
  const salt = new Uint8Array(randomBytes(16));
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${toHex(salt)}$${toHex(derive(password, salt))}`;
}

/** Async registration hashing; keeps the event loop free for other requests. */
export async function hashPasswordAsync(password: string): Promise<string> {
  const salt = new Uint8Array(randomBytes(16));
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${toHex(salt)}$${toHex(await deriveAsync(password, salt))}`;
}

/** Constant-time verification; accepts legacy `salt:hash` records too. */
export function verifyPassword(password: string, stored: string): boolean {
  const parsed = parseStoredPassword(stored);
  if (!parsed) return false;
  try {
    return equalBytes(derive(password, parsed.salt, parsed.n, parsed.r, parsed.p), parsed.expected);
  } catch {
    return false;
  }
}

/** Async login verification; never blocks the event loop while hashing. */
export async function verifyPasswordAsync(password: string, stored: string): Promise<boolean> {
  const parsed = parseStoredPassword(stored);
  if (!parsed) return false;
  try {
    return equalBytes(await deriveAsync(password, parsed.salt, parsed.n, parsed.r, parsed.p), parsed.expected);
  } catch {
    return false;
  }
}

export const checkPassword = verifyPassword;
export const comparePassword = verifyPassword;

export function hashSessionToken(token: string): string {
  return sha256(token);
}
export const sessionTokenHash = hashSessionToken;

function randomSessionToken(): string {
  return toHex(new Uint8Array(randomBytes(32)));
}

export function toPublicUser(user: UserRow | null | undefined): PublicUser | null {
  if (!user) return null;
  return {
    id: String(user.id),
    email: String(user.email).toLowerCase(),
    name: String(user.name),
    created_at: String(user.created_at)
  };
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  if (!id) return null;
  const db = await getDb();
  const row = (await db.prepare('SELECT * FROM Users WHERE id = ?').get(id)) as UserRow | undefined;
  return toPublicUser(row);
}

export async function getUserByEmail(email: string): Promise<PublicUser | null> {
  if (!email) return null;
  const db = await getDb();
  const row = (await db
    .prepare('SELECT * FROM Users WHERE email = ? COLLATE NOCASE')
    .get(String(email).trim().toLowerCase())) as UserRow | undefined;
  return toPublicUser(row);
}

/** Full row including password_hash — server-side authentication only. */
export async function getUserRecordByEmail(email: string): Promise<UserRow | null> {
  if (!email) return null;
  const db = await getDb();
  return ((await db
    .prepare('SELECT * FROM Users WHERE email = ? COLLATE NOCASE')
    .get(String(email).trim().toLowerCase())) as UserRow | undefined) ?? null;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  const email = String(input?.email ?? '').trim().toLowerCase();
  const name = String(input?.name ?? '').trim();
  const password = String(input?.password ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError('Некоректний email', 'invalid_email');
  if (name.length < 1 || name.length > 80) throw new AuthError('Ім’я має бути від 1 до 80 символів', 'invalid_name');
  if (password.length < 8 || password.length > 128) {
    throw new AuthError('Пароль має бути від 8 до 128 символів', 'invalid_password');
  }
  if (await getUserByEmail(email)) throw new AuthError('Цей email уже зареєстровано', 'email_taken');

  const user: UserRow = {
    id: newId(),
    email,
    name,
    password_hash: await hashPasswordAsync(password),
    created_at: nowIso()
  };
  const db = await getDb();
  await db
    .prepare('INSERT INTO Users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(user.id, user.email, user.name, user.password_hash, user.created_at);
  return toPublicUser(user)!;
}
export const createUser = registerUser;

/** Returns a public user or null; does not touch the rate limiter. */
export async function authenticateUser(email: string, password: string): Promise<PublicUser | null> {
  const row = await getUserRecordByEmail(email);
  if (!row) return null;
  if (!await verifyPasswordAsync(String(password ?? ''), row.password_hash)) return null;
  return toPublicUser(row);
}

export interface CreatedSession {
  token: string;
  tokenHash: string;
  expiresAt: string;
  userId: string;
}

export async function createSession(userId: string): Promise<CreatedSession> {
  if (!userId) throw new AuthError('Немає користувача', 'missing_user');
  const token = randomSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  const db = await getDb();
  await db
    .prepare('INSERT INTO Sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(tokenHash, userId, expiresAt, nowIso());
  return { token, tokenHash, expiresAt, userId };
}

export async function getSession(token: string): Promise<SessionRecord | null> {
  if (!token) return null;
  const db = await getDb();
  const row = (await db
    .prepare('SELECT token_hash, user_id, expires_at, created_at FROM Sessions WHERE token_hash = ?')
    .get(hashSessionToken(token))) as SessionRecord | undefined;
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    await deleteSession(token);
    return null;
  }
  return row;
}

export async function getSessionUser(token: string): Promise<PublicUser | null> {
  const session = await getSession(token);
  if (!session) return null;
  return getUserById(session.user_id);
}

export async function deleteSession(token: string): Promise<void> {
  if (!token) return;
  try {
    const db = await getDb();
    await db.prepare('DELETE FROM Sessions WHERE token_hash = ?').run(hashSessionToken(token));
  } catch { /* best effort */ }
}
export const invalidateSession = deleteSession;

export async function deleteUserSessions(userId: string): Promise<void> {
  if (!userId) return;
  const db = await getDb();
  await db.prepare('DELETE FROM Sessions WHERE user_id = ?').run(userId);
}

export async function cleanupExpiredSessions(): Promise<void> {
  const db = await getDb();
  await db.prepare('DELETE FROM Sessions WHERE expires_at <= ?').run(nowIso());
}

/* ------------------------------- cookies -------------------------------- */

export const SESSION_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: SECURE_COOKIES,
  path: '/',
  maxAge: SESSION_TTL_SECONDS
});

function cookieValue(cookies: any, name: string): string | undefined {
  try {
    const value = cookies?.get?.(name);
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && typeof value.value === 'string') return value.value;
  } catch { /* cookie jar unavailable */ }
  return undefined;
}

function tokenFromCookieHeader(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (SESSION_COOKIE_NAMES.includes(name)) {
      try { return decodeURIComponent(part.slice(index + 1).trim()); }
      catch { return part.slice(index + 1).trim(); }
    }
  }
  return undefined;
}

/** Accepts an Astro context, a cookie jar, a Request, or a plain cookie header. */
export function readSessionToken(source: any): string | null {
  if (!source) return null;
  if (typeof source === 'string') {
    if (/^[0-9a-fA-F]{64}$/.test(source)) return source;
    return tokenFromCookieHeader(source) ?? null;
  }
  if (source.locals && typeof source.locals.sessionToken === 'string') return source.locals.sessionToken;
  const jar = source.cookies ?? (typeof source.get === 'function' ? source : undefined);
  if (jar) {
    for (const name of SESSION_COOKIE_NAMES) {
      const value = cookieValue(jar, name);
      if (value) return value;
    }
  }
  const headers = source.request?.headers ?? source.headers;
  if (headers && typeof headers.get === 'function') {
    return tokenFromCookieHeader(headers.get('cookie')) ?? null;
  }
  return null;
}
export const getSessionToken = readSessionToken;

export function setSessionCookie(cookies: CookieJar, token: string): void {
  if (!cookies || !token) return;
  cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS as unknown as Record<string, unknown>);
}

export function clearSessionCookie(cookies: CookieJar): void {
  if (!cookies) return;
  for (const name of SESSION_COOKIE_NAMES) {
    try { cookies.delete(name, { path: '/', httpOnly: true, sameSite: 'lax' }); }
    catch { try { cookies.delete(name); } catch { /* no cookie */ } }
  }
}
export const deleteSessionCookie = clearSessionCookie;

/**
 * Returns the signed-in user or null. Never throws a redirect response:
 * callers decide between 302, 401 or a rendered page.
 */
export async function requireUser(context: any): Promise<PublicUser | null> {
  if (!context) return null;
  const fromLocals = context.locals?.user;
  if (fromLocals && typeof fromLocals === 'object' && fromLocals.id) {
    return toPublicUser(fromLocals as UserRow);
  }
  const token = readSessionToken(context);
  return token ? await getSessionUser(token) : null;
}
export const getCurrentUser = requireUser;
export const getUser = requireUser;

export async function requireUserOrRedirect(context: any, path = '/login'): Promise<PublicUser | Response> {
  const user = await requireUser(context);
  if (user) return user;
  return new Response(null, { status: 302, headers: { Location: path, 'Cache-Control': 'no-store' } });
}

/* ----------------------------- rate limiting ---------------------------- */

/** Shared, durable login-attempt counter. Isolate-local Maps do not work on Workers. */
async function attemptsFor(key: string, now: number): Promise<number[]> {
  const db = await getDb();
  const rows = (await db.prepare(
    'SELECT created_at FROM LoginAttempts WHERE attempt_key = ? AND created_at > ? ORDER BY created_at ASC'
  ).all(key, new Date(now - LOGIN_WINDOW_MS).toISOString())) as { created_at: string }[];
  return rows.map((row) => Date.parse(String(row.created_at))).filter((time) => Number.isFinite(time) && now - time < LOGIN_WINDOW_MS);
}

export async function isRateLimited(key: string, now = Date.now()): Promise<boolean> {
  return !(await checkLoginRateLimit(key, now)).allowed;
}

export async function recordFailedLogin(key: string, now = Date.now()): Promise<number> {
  const db = await getDb();
  await db.prepare('DELETE FROM LoginAttempts WHERE attempt_key = ? AND created_at <= ?')
    .run(key, new Date(now - LOGIN_WINDOW_MS).toISOString());
  await db.prepare('INSERT INTO LoginAttempts (attempt_key, created_at) VALUES (?, ?)').run(key, new Date(now).toISOString());
  return (await attemptsFor(key, now)).length;
}
export const registerLoginFailure = recordFailedLogin;

export async function clearLoginFailures(key: string): Promise<void> {
  const db = await getDb();
  await db.prepare('DELETE FROM LoginAttempts WHERE attempt_key = ?').run(key);
}
export const resetLoginAttempts = clearLoginFailures;

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
  attempts: number;
}

export async function checkLoginRateLimit(key: string, now = Date.now()): Promise<RateLimitResult> {
  const timestamps = await attemptsFor(key, now);
  if (timestamps.length < MAX_LOGIN_ATTEMPTS) {
    return { allowed: true, retryAfter: 0, attempts: timestamps.length };
  }
  return {
    allowed: false,
    retryAfter: Math.max(1, Math.ceil((LOGIN_WINDOW_MS - (now - timestamps[0])) / 1000)),
    attempts: timestamps.length
  };
}

export function clientKey(request: Request | { headers?: Headers } | undefined): string {
  const headers = (request as any)?.headers;
  const forwarded = typeof headers?.get === 'function' ? headers.get('x-forwarded-for') : null;
  const ip = forwarded ? forwarded.split(',')[0].trim() : (typeof headers?.get === 'function' ? headers.get('x-real-ip') : null);
  return ip || 'local';
}
export const rateLimitKey = clientKey;

/** Convenience login flow used by route handlers and tests. */
export interface LoginResult {
  user: PublicUser;
  token: string;
  expiresAt: string;
}

export async function loginUser(email: string, password: string, key = 'local'): Promise<LoginResult> {
  if (await isRateLimited(key)) throw new AuthError(LOGIN_LIMIT_MESSAGE, 'rate_limited');
  const user = await authenticateUser(email, password);
  if (!user) {
    await recordFailedLogin(key);
    throw new AuthError('Невірний email або пароль', 'invalid_credentials');
  }
  await clearLoginFailures(key);
  const session = await createSession(user.id);
  return { user, token: session.token, expiresAt: session.expiresAt };
}

export interface OriginCheckResult {
  allowed: boolean;
  reason?: 'missing' | 'invalid' | 'mismatch';
}

/** Origin must match the request origin exactly; absent Origin is treated as same-origin. */
export function checkOrigin(request: Request): OriginCheckResult {
  const origin = request?.headers?.get?.('origin');
  if (!origin || origin === 'null') {
    if (origin === 'null') {
      const site = request?.headers?.get?.('sec-fetch-site');
      if (site === 'cross-site' || site === 'same-site') return { allowed: false, reason: 'invalid' };
    }
    return { allowed: true, reason: 'missing' };
  }
  let parsed: URL;
  try { parsed = new URL(origin); }
  catch { return { allowed: false, reason: 'invalid' }; }
  try {
    const expected = new URL(request.url);
    if (parsed.origin === expected.origin) return { allowed: true };
    // Advanced proxies may forward the public origin via a trusted header.
    const forwarded = request.headers.get('x-forwarded-host');
    if (forwarded && parsed.host === forwarded.split(',')[0].trim()) return { allowed: true };
    // Tunnels (cloudflared etc.) keep request.url local but forward the public Host header.
    const host = request.headers.get('host');
    if (host && parsed.host === host.split(',')[0].trim()) {
      const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
      if (!proto || proto === parsed.protocol.replace(':', '')) return { allowed: true };
    }
  } catch { /* invalid request URL */ }
  return { allowed: false, reason: 'mismatch' };
}
export const isOriginAllowed = (request: Request): boolean => checkOrigin(request).allowed;

export const SESSION_SECRET_USED = SESSION_SECRET;
