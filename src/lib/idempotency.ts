/**
 * Idempotency keys for entity-creating mutations. A UNIQUE(user_id, key, kind)
 * row is claimed synchronously before the operation runs, so two concurrent
 * requests can never both create an entity.
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

function claimKey(userId: string, key: string, kind: string): Claim {
  const db = getDb();
  const operation = db.transaction((): Claim => {
    const existing = db
      .prepare('SELECT result_id FROM IdempotencyKey WHERE user_id = ? AND key = ? AND kind = ?')
      .get(userId, key, kind) as Pick<IdempotencyRow, 'result_id'> | undefined;
    if (existing) return { claimed: false, resultId: existing.result_id };
    db.prepare(
      'INSERT INTO IdempotencyKey (key, user_id, kind, result_id, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(key, userId, kind, '', nowIso());
    return { claimed: true };
  });
  return operation();
}

function storeResult(userId: string, key: string, kind: string, resultId: string): void {
  getDb()
    .prepare('UPDATE IdempotencyKey SET result_id = ? WHERE user_id = ? AND key = ? AND kind = ?')
    .run(resultId, userId, key, kind);
}

function releaseKey(userId: string, key: string, kind: string): void {
  try {
    getDb().prepare('DELETE FROM IdempotencyKey WHERE user_id = ? AND key = ? AND kind = ?').run(userId, key, kind);
  } catch { /* best effort */ }
}

export function getIdempotentResult(userId: string, key: string, kind: IdempotencyKind): string | null {
  const row = getDb()
    .prepare('SELECT result_id FROM IdempotencyKey WHERE user_id = ? AND key = ? AND kind = ?')
    .get(userId, assertKey(key), kind) as Pick<IdempotencyRow, 'result_id'> | undefined;
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

  const claim = claimKey(userId, normalizedKey, normalizedKind);
  if (!claim.claimed) return claim.resultId as T;

  try {
    const result = await fn();
    storeResult(userId, normalizedKey, normalizedKind, resultOf(result));
    return result;
  } catch (error) {
    releaseKey(userId, normalizedKey, normalizedKind);
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
  const claim = claimKey(userId, normalizedKey, String(kind));
  if (!claim.claimed) {
    return { id: claim.resultId ?? '', created: false, value: claim.resultId as T };
  }
  try {
    const value = await fn();
    const id = resultOf(value);
    storeResult(userId, normalizedKey, String(kind), id);
    return { id, created: true, value };
  } catch (error) {
    releaseKey(userId, normalizedKey, String(kind));
    throw error;
  }
}

export function forgetIdempotencyKey(userId: string, key: string, kind: IdempotencyKind): void {
  getDb()
    .prepare('DELETE FROM IdempotencyKey WHERE user_id = ? AND key = ? AND kind = ?')
    .run(userId, assertKey(key), String(kind));
}

export const idempotent = withIdempotency;
export const runIdempotent = withIdempotency;
export const isIdempotentReplay = (userId: string, key: string, kind: IdempotencyKind): boolean =>
  getIdempotentResult(userId, key, kind) !== null;
