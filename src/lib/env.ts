/**
 * App configuration. Node reads process.env; Workers bindings are injected by
 * middleware via bindAppEnv(). Exported bindings are `let` so ESM live bindings
 * update for every module that imported them.
 */
type EnvSource = Record<string, string | undefined>;
type RuntimeGlobal = { process?: { env?: EnvSource } };

const runtimeGlobal = globalThis as unknown as RuntimeGlobal;
let source: EnvSource = runtimeGlobal.process?.env ?? {};

function readString(name: string, fallback: string): string {
  const value = source[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function readNumber(name: string, fallback: number, min = 1): number {
  const value = source[name];
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = source[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

export interface AppEnv {
  databasePath: string;
  sessionSecret: string;
  sessionCookieName: string;
  sessionTtlDays: number;
  sessionTtlSeconds: number;
  secureCookies: boolean;
  maxUploadBytes: number;
  maxLoginAttempts: number;
  loginWindowMs: number;
  inviteCookiePrefix: string;
  maxEventYears: number;
  appName: string;
  moderatorEmails: string[];
}

function build(): AppEnv {
  return Object.freeze({
    databasePath: readString('DATABASE_PATH', './data/tusivka.db'),
    sessionSecret: readString('SESSION_SECRET', 'tusivka-dev-secret-change-me'),
    sessionCookieName: readString('SESSION_COOKIE_NAME', 'session'),
    sessionTtlDays: readNumber('SESSION_TTL_DAYS', 30),
    sessionTtlSeconds: readNumber('SESSION_TTL_DAYS', 30) * 24 * 60 * 60,
    secureCookies: readBoolean('SECURE_COOKIES', false),
    maxUploadBytes: readNumber('MAX_UPLOAD_BYTES', 1_500_000),
    maxLoginAttempts: readNumber('MAX_LOGIN_ATTEMPTS', 10),
    loginWindowMs: readNumber('LOGIN_WINDOW_MS', 60_000),
    inviteCookiePrefix: readString('INVITE_COOKIE_PREFIX', 'invite_'),
    maxEventYears: readNumber('MAX_EVENT_YEARS', 2),
    appName: 'Тусовка',
    moderatorEmails: readString('MODERATOR_EMAILS', 'arsen@tusivka.local')
      .split(',')
      .map((value) => value.trim().toLocaleLowerCase())
      .filter(Boolean)
  });
}

let current = build();

export let env: AppEnv = current;
export let DATABASE_PATH = current.databasePath;
export let SESSION_SECRET = current.sessionSecret;
export let SESSION_COOKIE_NAME = current.sessionCookieName;
export const COOKIE_NAME = 'session';
export const SESSION_COOKIE = 'session';
export let SESSION_TTL_DAYS = current.sessionTtlDays;
export let SESSION_TTL_SECONDS = current.sessionTtlSeconds;
export let SECURE_COOKIES = current.secureCookies;
export let MAX_UPLOAD_BYTES = current.maxUploadBytes;
export let MAX_LOGIN_ATTEMPTS = current.maxLoginAttempts;
export let LOGIN_WINDOW_MS = current.loginWindowMs;
export let INVITE_COOKIE_PREFIX = current.inviteCookiePrefix;
export let MAX_EVENT_YEARS = current.maxEventYears;

/** Injected by `src/lib/cf-env.ts` from Workers bindings. */
export function bindAppEnv(values: Record<string, unknown>): void {
  const next: EnvSource = { ...source };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      next[key] = String(value);
    }
  }
  source = next;
  current = build();
  env = current;
  DATABASE_PATH = current.databasePath;
  SESSION_SECRET = current.sessionSecret;
  SESSION_COOKIE_NAME = current.sessionCookieName;
  SESSION_TTL_DAYS = current.sessionTtlDays;
  SESSION_TTL_SECONDS = current.sessionTtlSeconds;
  SECURE_COOKIES = current.secureCookies;
  MAX_UPLOAD_BYTES = current.maxUploadBytes;
  MAX_LOGIN_ATTEMPTS = current.maxLoginAttempts;
  LOGIN_WINDOW_MS = current.loginWindowMs;
  INVITE_COOKIE_PREFIX = current.inviteCookiePrefix;
  MAX_EVENT_YEARS = current.maxEventYears;
}

export const getEnv = (): AppEnv => current;

/** Alternative names accepted when reading a session cookie (legacy clients). */
export const SESSION_COOKIE_NAMES: readonly string[] = Object.freeze([
  SESSION_COOKIE_NAME,
  'session',
  'session_token',
  'auth_session',
  'sid',
  'tusivka_session'
]);

export default env;
