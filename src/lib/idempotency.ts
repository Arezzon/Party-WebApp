/**
 * Idempotency keys for entity-creating mutations. A UNIQUE(user_id, key, kind)
 * row is claimed synchronously before the operation runs, so two concurrent
 * requests can never both create an entity. The claim is a single conditional
 * INSERT: the UNIQUE index decides the winner and `changes` tells us who won.
 */
import { getDb, nowIso, type IdempotencyRow } from './db';

export type IdempotencyKind = 'event' | 'comment' | 'rsvp' | 'user' | 'report' | (string & {});

export class IdempotencyError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'IdempotencyError';
    this.status = status;
  }
}

export interface IdempotencyResult {
  id: string;
  created: boolean;
}

function assertKey(key: string): string {
  const value = String(key ?? '').trim();
  if (!value || value.length > 200) throw new IdempotencyError('Недійсний Idempotency-Key');
  return value;
}

function resultOf<T>(value: T): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as any).id === 'string') return (value as any).id;
  if (value && typeof value === 'object' && typeof (value as any).result_id === 'string') return (value as any).result_id;
  return '';
}

interface Claim {
  claimed: boolean;
  resultId?: string;
}

async function claimKey(userId: string, key: string, kind: string): Promise<Claim> {
  const db = await getDb();
  // INSERT OR IGNORE + UNIQUE(user_id, key, kind) is our atomic claim. Exactly
  // one concurrent caller gets changes > 0; everyone else reads its result id.
  const inserted = await db
    .prepare('INSERT OR IGNORE INTO IdempotencyKey (key, user_id, kind, result_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(key, userId, kind, '', nowIso());
  if (Number(inserted?.changes ?? 0) > 0) return { claimed: true };
  const existing = (await db
    .prepare('SELECT result_id FROM IdempotencyKey WHERE user_id = ? AND key = ? AND kind = ?')
    .get(userId, key, kind)) as Pick<IdempotencyRow, 'result_id'> | undefined;
  return { claimed: false, resultId: existing?.result_id ?? '' };
}

async function storeResult(userId: string, key: string, kind: string, resultId: string): Promise<void> {
  const db = await getDb();
  await db
    .prepare('UPDATE IdempotencyKey SET result_id = ? WHERE user_id = ? AND key = ? AND kind = ?')
    .run(resultId, userId, key, kind);
}

async function releaseKey(userId: string, key: string, kind: string): Promise<void> {
  try {
    const db = await getDb();
    await db.prepare('DELETE FROM IdempotencyKey WHERE user_id = ? AND key = ? AND kind = ?').run(userId, key, kind);
  } catch { /* best effort */ }
}

export async function getIdempotentResult(userId: string, key: string, kind: IdempotencyKind): Promise<string | null> {
  const db = await getDb();
  const row = (await db
    .prepare('SELECT result_id FROM IdempotencyKey WHERE user_id = ? AND key = ? AND kind = ?')
    .get(userId, assertKey(key), kind)) as Pick<IdempotencyRow, 'result_id'> | undefined;
  return row?.result_id || null;
}

/**
 * Returns the cached result on replay; otherwise runs `fn` once and stores its
 * id. `fn` should return an id string or an object with an `id` property.
 */
export async function withIdempotency<T>(
  userId: string,
  key: string,
  kind: IdempotencyKind,
  fn: () => T | Promise<T>
): Promise<T> {
  if (!userId) throw new IdempotencyError('Потрібен вхід у акаунт', 401);
  const normalizedKey = assertKey(key);
  const normalizedKind = String(kind ?? '').trim();
  if (!normalizedKind) throw new IdempotencyError('Недійсний тип операції');

  const claim = await claimKey(userId, normalizedKey, normalizedKind);
  if (!claim.claimed) return claim.resultId as T;

  try {
    const result = await fn();
    await storeResult(userId, normalizedKey, normalizedKind, resultOf(result));
    return result;
  } catch (error) {
    await releaseKey(userId, normalizedKey, normalizedKind);
    throw error;
  }
}

/** Detailed variant: tells the caller whether the entity was newly created. */
export async function withIdempotencyDetailed<T>(
  userId: string,
  key: string,
  kind: IdempotencyKind,
  fn: () => T | Promise<T>
): Promise<IdempotencyResult & { value: T }> {
  if (!userId) throw new IdempotencyError('Потрібен вхід у акаунт', 401);
  const normalizedKey = assertKey(key);
  const claim = await claimKey(userId, normalizedKey, String(kind));
  if (!claim.claimed) {
    return { id: claim.resultId ?? '', created: false, value: claim.resultId as T };
  }
  try {
    const value = await fn();
    const id = resultOf(value);
    await storeResult(userId, normalizedKey, String(kind), id);
    return { id, created: true, value };
  } catch (error) {
    await releaseKey(userId, normalizedKey, String(kind));
    throw error;
  }
}

export async function forgetIdempotencyKey(userId: string, key: string, kind: IdempotencyKind): Promise<void> {
  const db = await getDb();
  await db.prepare('DELETE FROM IdempotencyKey WHERE user_id = ? AND key = ? AND kind = ?').run(userId, assertKey(key), String(kind));
}

export const idempotent = withIdempotency;
export const runIdempotent = withIdempotency;
export const isIdempotentReplay = async (userId: string, key: string, kind: IdempotencyKind): Promise<boolean> =>
  (await getIdempotentResult(userId, key, kind)) !== null;
