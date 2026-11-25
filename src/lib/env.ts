/**
 * Configuration loaded from process.env with safe development defaults.
 * Astro SSR and node:test both run in Node, so `globalThis.process` is used
 * instead of a bare `process` identifier (the project has no @types/node).
 */

type EnvSource = Record<string, string | undefined>;

const runtimeGlobal = globalThis as unknown as {
  process?: { env?: EnvSource };
};
const source: EnvSource = runtimeGlobal.process?.env ?? {};

function readString(name: string, fallback: string): string {
  const value = source[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function readNumber(name: string, fallback: number, min = 1): number {
  const value = source[name];
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = source[name];
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
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

export const env: AppEnv = Object.freeze({
  databasePath: readString('DATABASE_PATH', './data/tusivka.db'),
  sessionSecret: readString('SESSION_SECRET', 'tusivka-dev-secret-change-me'),
  sessionCookieName: readString('SESSION_COOKIE_NAME', 'session'),
  sessionTtlDays: readNumber('SESSION_TTL_DAYS', 30),
  sessionTtlSeconds: readNumber('SESSION_TTL_DAYS', 30) * 24 * 60 * 60,
  secureCookies: readBoolean('SECURE_COOKIES', false),
  maxUploadBytes: readNumber('MAX_UPLOAD_BYTES', 10 * 1024 * 1024),
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

export const getEnv = (): AppEnv => env;

export const DATABASE_PATH = env.databasePath;
export const SESSION_SECRET = env.sessionSecret;
export const SESSION_COOKIE_NAME = env.sessionCookieName;
export const COOKIE_NAME = SESSION_COOKIE_NAME;
export const SESSION_COOKIE = SESSION_COOKIE_NAME;
export const SESSION_TTL_DAYS = env.sessionTtlDays;
export const SESSION_TTL_SECONDS = env.sessionTtlSeconds;
export const SECURE_COOKIES = env.secureCookies;
export const MAX_UPLOAD_BYTES = env.maxUploadBytes;
export const MAX_LOGIN_ATTEMPTS = env.maxLoginAttempts;
export const LOGIN_WINDOW_MS = env.loginWindowMs;
export const INVITE_COOKIE_PREFIX = env.inviteCookiePrefix;
export const MAX_EVENT_YEARS = env.maxEventYears;

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
