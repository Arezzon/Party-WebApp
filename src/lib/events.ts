// @ts-ignore -- Node builtin; the project has no @types/node package
import { randomBytes, randomUUID } from 'node:crypto';
import { getDb } from './db';
import { processCover } from './images';
import { eventSchema } from './validation';
import { withIdempotency } from './idempotency';

/** Friendly HTTP error: routes turn this into a short, stack-trace-free response. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export type EventVisibility = 'public' | 'private';

export interface EventRecord {
  id: string;
  authorId: string;
  title: string;
  description: string;
  startsAt: string;
  places: number;
  coverBlob: Uint8Array | null;
  coverMime: string;
  visibility: EventVisibility;
  inviteToken: string;
  createdAt: string;
  authorName?: string;
}

export interface EventInput {
  authorId?: string;
  title: string;
  description?: string;
  startsAt: string;
  places: number | string;
  cover?: Blob | File | null;
  visibility?: EventVisibility | string;
}

export interface EventPatch {
  title?: string;
  description?: string;
  startsAt?: string;
  places?: number | string;
  cover?: Blob | File | null;
  visibility?: EventVisibility | string;
}

/* ---------- small schema-compatibility helpers -------------------------- */

type DbLike = Awaited<ReturnType<typeof getDb>>;

function quote(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

async function tableOf(db: DbLike, base: string): Promise<string> {
  const wanted = base.toLowerCase().replace(/_/g, '');
  const rows = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) as { name: string }[];
  const found = rows.find((r) => r.name.toLowerCase().replace(/_/g, '') === wanted)
    ?? rows.find((r) => r.name.toLowerCase().replace(/_/g, '') === `${wanted}s`);
  return found?.name ?? base;
}

async function columnOf(db: DbLike, table: string, logical: string): Promise<string> {
  const normalized = logical.toLowerCase().replace(/_/g, '');
  const info = (await db.prepare(`PRAGMA table_info(${quote(table)})`).all()) as { name: string }[];
  const found = info.find((c) => c.name === logical)
    ?? info.find((c) => c.name.toLowerCase().replace(/_/g, '') === normalized);
  return found?.name ?? logical;
}

interface Schema {
  db: DbLike;
  events: string;
  users: string;
  rsvps: string;
  ec: Record<string, string>;
  uc: Record<string, string>;
  rc: Record<string, string>;
}

async function schema(): Promise<Schema> {
  const db = await getDb();
  const events = await tableOf(db, 'Event');
  const users = await tableOf(db, 'User');
  const rsvps = await tableOf(db, 'RSVP');
  const ec: Record<string, string> = {};
  for (const key of ['id', 'author_id', 'title', 'description', 'starts_at', 'places', 'cover_blob', 'cover_mime', 'visibility', 'invite_token', 'created_at']) {
    ec[key] = await columnOf(db, events, key);
  }
  const uc: Record<string, string> = {};
  for (const key of ['id', 'name', 'email']) uc[key] = await columnOf(db, users, key);
  const rc: Record<string, string> = {};
  for (const key of ['event_id', 'user_id']) rc[key] = await columnOf(db, rsvps, key);
  return { db, events, users, rsvps, ec, uc, rc };
}

/* ---------- validation & conversion ------------------------------------ */

/** Convert a `datetime-local` value in Europe/Kyiv to a UTC ISO string. */
export function kyivLocalToUtc(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) throw new HttpError(400, 'Некоректна дата події.');
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const hh = Number(match[4]);
  const mm = Number(match[5]);
  const ss = Number(match[6] ?? 0);
  if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) {
    throw new HttpError(400, 'Некоректна дата події.');
  }
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  let offset = 180;
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Kyiv',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      })
        .formatToParts(new Date(guess))
        .map((p) => [p.type, p.value])
    );
    const back = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour) % 24, Number(parts.minute)
    );
    offset = Math.round((back - guess) / 60000);
  } catch {
    /* Intl always knows Europe/Kyiv on Node >= 22 */
  }
  const result = new Date(guess - offset * 60000);
  if (Number.isNaN(result.getTime())) throw new HttpError(400, 'Некоректна дата події.');
  return result.toISOString();
}

function normalizeStartsAt(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, 'Вкажіть дату події.');
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) {
    return kyivLocalToUtc(raw);
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Некоректна дата події.');
  return date.toISOString();
}

function normalizePlaces(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new HttpError(400, 'Кількість місць має бути цілим числом.');
  }
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    throw new HttpError(400, 'Кількість місць має бути цілим числом від 1 до 10000.');
  }
  const places = Number(text);
  if (!Number.isSafeInteger(places) || places < 1 || places > 10000) {
    throw new HttpError(400, 'Кількість місць має бути цілим числом від 1 до 10000.');
  }
  return places;
}

function validateInput(input: EventInput | EventPatch, partial: boolean): void {
  const candidate: Record<string, unknown> = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.startsAt !== undefined ? { starts_at: normalizeStartsAt(input.startsAt) } : {}),
    ...(input.places !== undefined ? { places: normalizePlaces(input.places) } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {})
  };
  if (!partial) {
    if (!candidate.title) throw new HttpError(400, 'Вкажіть назву події.');
    if (!candidate.starts_at) throw new HttpError(400, 'Вкажіть дату події.');
    if (candidate.places === undefined) throw new HttpError(400, 'Вкажіть кількість місць.');
  }
  const parsed = eventSchema.partial().safeParse(candidate);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(400, first?.message ?? 'Некоректні дані події.');
  }
  if (candidate.places !== undefined) normalizePlaces(candidate.places);
  if (candidate.starts_at !== undefined) {
    const date = new Date(String(candidate.starts_at));
    const now = Date.now();
    if (date.getTime() <= now) throw new HttpError(400, 'Дата події має бути в майбутньому.');
    if (date.getTime() > now + 2 * 365.25 * 24 * 3600 * 1000) {
      throw new HttpError(400, 'Подію можна запланувати не пізніше ніж через 2 роки.');
    }
  }
}

async function coverBytes(cover: Blob | File): Promise<{ bytes: Uint8Array; mime: string }> {
  const processed = await processCover(cover);
  const bytes = processed.blob;
  if (bytes.length > 10 * 1024 * 1024) throw new HttpError(413, 'Файл завеликий.');
  return { bytes, mime: processed.mime };
}

/* ---------- row mapping ------------------------------------------------- */

async function mapEvent(row: Record<string, unknown> | undefined): Promise<EventRecord | null> {
  if (!row) return null;
  const s = await schema();
  const get = (key: string) => row[s.ec[key]];
  const blob = get('cover_blob') as Uint8Array | null | undefined;
  return {
    id: String(get('id')),
    authorId: String(get('author_id')),
    title: String(get('title')),
    description: String(get('description') ?? ''),
    startsAt: String(get('starts_at')),
    places: Number(get('places')),
    coverBlob: blob ?? null,
    coverMime: String(get('cover_mime') ?? 'image/webp'),
    visibility: (get('visibility') === 'private' ? 'private' : 'public') as EventVisibility,
    inviteToken: String(get('invite_token') ?? ''),
    createdAt: String(get('created_at') ?? ''),
    ...(row[s.uc.name] !== undefined ? { authorName: String(row[s.uc.name]) } : {})
  };
}

/* ---------- public API -------------------------------------------------- */

export async function getEvent(id: string): Promise<EventRecord | null> {
  const s = await schema();
  const row = (await s.db.prepare(`SELECT * FROM ${quote(s.events)} WHERE ${quote(s.ec.id)} = ?`).get(id)) as Record<string, unknown> | undefined;
  return mapEvent(row);
}

export async function listPublicEvents(search = ''): Promise<EventRecord[]> {
  const s = await schema();
  const now = new Date().toISOString();
  const rows = (await s.db.prepare(
    `SELECT * FROM ${quote(s.events)} WHERE ${quote(s.ec.visibility)} = 'public' AND ${quote(s.ec.starts_at)} > ? ORDER BY ${quote(s.ec.starts_at)} ASC`
  ).all(now)) as Record<string, unknown>[];
  const safe = search.replace(/[\\%_]/g, (ch) => `\\${ch}`).toLocaleLowerCase('uk');
  const mapped = await Promise.all(rows.map(async (row) => {
    const event = await mapEvent(row);
    if (!event) return null;
    const authorName = row[s.uc.name];
    if (authorName !== undefined && event.authorName === undefined) event.authorName = String(authorName);
    return event;
  }));
  return mapped
    .filter((event): event is EventRecord => Boolean(event))
    .filter((event) => !safe || event.title.toLocaleLowerCase('uk').includes(safe));
}

export async function listUserEvents(userId: string): Promise<EventRecord[]> {
  const s = await schema();
  const rows = (await s.db.prepare(
    `SELECT * FROM ${quote(s.events)} WHERE ${quote(s.ec.author_id)} = ? ORDER BY ${quote(s.ec.starts_at)} ASC`
  ).all(userId)) as Record<string, unknown>[];
  const mapped = await Promise.all(rows.map((row) => mapEvent(row)));
  return mapped.filter((e): e is EventRecord => Boolean(e));
}

export async function getAttendees(eventId: string): Promise<{ id: string; name: string; email: string }[]> {
  const s = await schema();
  const rows = (await s.db.prepare(
    `SELECT u.* FROM ${quote(s.rsvps)} r JOIN ${quote(s.users)} u ON u.${quote(s.uc.id)} = r.${quote(s.rc.user_id)} WHERE r.${quote(s.rc.event_id)} = ?`
  ).all(eventId)) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row[s.uc.id]),
    name: String(row[s.uc.name] ?? 'Знайомець'),
    email: String(row[s.uc.email] ?? '')
  }));
}

export async function rsvpCount(eventId: string): Promise<number> {
  const s = await schema();
  const row = (await s.db.prepare(
    `SELECT COUNT(*) AS n FROM ${quote(s.rsvps)} WHERE ${quote(s.rc.event_id)} = ?`
  ).get(eventId)) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

/** Private events are visible only with a matching invite cookie or token query. */
export function canViewEvent(event: EventRecord, inviteToken?: string | null): boolean {
  if (event.visibility !== 'private') return true;
  return Boolean(inviteToken) && inviteToken === event.inviteToken;
}

function inviteFromCookies(cookies: { get?: (name: string) => { value?: string } | undefined } | undefined, eventId: string): string | undefined {
  try {
    return cookies?.get?.(`invite_${eventId}`)?.value;
  } catch {
    return undefined;
  }
}

export function canViewEventFromRequest(event: EventRecord, cookies: unknown, url?: URL): boolean {
  let token: string | undefined;
  try {
    const apiCookies = cookies as { get?: (name: string) => { value?: string } | undefined } | undefined;
    token = inviteFromCookies(apiCookies, event.id) ?? apiCookies?.get?.('invite')?.value;
  } catch {
    /* ignore */
  }
  if (!token && url) token = url.searchParams.get('token') ?? undefined;
  return canViewEvent(event, token);
}

async function insertEvent(input: EventInput): Promise<EventRecord> {
  validateInput(input, false);
  const s = await schema();
  const id = randomUUID();
  const startsAt = normalizeStartsAt(input.startsAt);
  let cover: { bytes: Uint8Array; mime: string } | null = null;
  if (input.cover) cover = await coverBytes(input.cover);
  const inviteToken = randomBytes(32).toString('hex');
  const createdAt = new Date().toISOString();
  const columns = [s.ec.id, s.ec.author_id, s.ec.title, s.ec.description, s.ec.starts_at, s.ec.places, s.ec.cover_blob, s.ec.cover_mime, s.ec.visibility, s.ec.invite_token, s.ec.created_at];
  const values = [id, input.authorId, String(input.title).trim(), String(input.description ?? '').trim(), startsAt, normalizePlaces(input.places), cover?.bytes ?? null, cover?.mime ?? null, input.visibility === 'private' ? 'private' : 'public', inviteToken, createdAt];
  await s.db.prepare(
    `INSERT INTO ${quote(s.events)} (${columns.map(quote).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
  ).run(...values);
  return (await getEvent(id))!;
}

async function unwrapEventResult(result: unknown): Promise<EventRecord | null> {
  if (!result) return null;
  if (typeof result === 'string') return getEvent(result);
  if (typeof result === 'object') {
    const record = result as Record<string, unknown>;
    if ('id' in record) return result as EventRecord;
    const id = record.resultId ?? record.eventId ?? record.idempotentResult;
    if (typeof id === 'string') return getEvent(id);
  }
  return null;
}

export async function createEvent(input: EventInput & { authorId: string; idempotencyKey?: string | null }): Promise<EventRecord> {
  const { authorId, idempotencyKey, ...payload } = input;
  let result: unknown;
  if (idempotencyKey) {
    result = await withIdempotency(authorId, idempotencyKey, 'event', async () => insertEvent({ ...payload, authorId }));
  } else {
    result = await insertEvent({ ...payload, authorId });
  }
  const event = await unwrapEventResult(result);
  if (!event) throw new HttpError(400, 'Не вдалося створити подію.');
  return event;
}

export async function updateEvent(id: string, userId: string, patch: EventPatch): Promise<EventRecord> {
  const current = await getEvent(id);
  if (!current) throw new HttpError(404, 'Подію не знайдено.');
  if (current.authorId !== userId) throw new HttpError(403, 'Редагувати подію може лише автор.');
  validateInput(patch, true);

  const s = await schema();
  const sets: string[] = [];
  const values: unknown[] = [];
  const put = (column: string, value: unknown) => {
    sets.push(`${quote(column)} = ?`);
    values.push(value);
  };

  if (patch.title !== undefined) put(s.ec.title, String(patch.title).trim());
  if (patch.description !== undefined) put(s.ec.description, String(patch.description).trim());
  if (patch.startsAt !== undefined) put(s.ec.starts_at, normalizeStartsAt(patch.startsAt));
  if (patch.places !== undefined) {
    const places = normalizePlaces(patch.places);
    if (places < await rsvpCount(id)) {
      throw new HttpError(400, 'Не можна зменшити кількість місць нижче кількості записаних учасників.');
    }
    put(s.ec.places, places);
  }
  if (patch.visibility !== undefined) put(s.ec.visibility, patch.visibility === 'private' ? 'private' : 'public');
  if (patch.cover) {
    const cover = await coverBytes(patch.cover);
    put(s.ec.cover_blob, cover.bytes);
    put(s.ec.cover_mime, cover.mime);
  }
  if (!sets.length) return current;
  values.push(id);
  await s.db.prepare(`UPDATE ${quote(s.events)} SET ${sets.join(', ')} WHERE ${quote(s.ec.id)} = ?`).run(...values);
  return (await getEvent(id))!;
}

export async function deleteEvent(id: string, userId: string): Promise<void> {
  const current = await getEvent(id);
  if (!current) throw new HttpError(404, 'Подію не знайдено.');
  if (current.authorId !== userId) throw new HttpError(403, 'Видаляти подію може лише автор.');
  const s = await schema();
  await s.db.prepare(`DELETE FROM ${quote(s.events)} WHERE ${quote(s.ec.id)} = ?`).run(id);
}

export function coverResponse(event: EventRecord): Response {
  if (!event.coverBlob) return new Response(null, { status: 404 });
  const bytes = event.coverBlob instanceof Uint8Array ? event.coverBlob : new Uint8Array(event.coverBlob);
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': event.coverMime || 'image/png',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

export function toKyivInput(iso: string): string {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(new Date(iso)).map((p) => [p.type, p.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  } catch {
    return iso.slice(0, 16);
  }
}

export function formatKyiv(iso: string): string {
  try {
    return new Intl.DateTimeFormat('uk-UA', {
      timeZone: 'Europe/Kyiv', dateStyle: 'long', timeStyle: 'short'
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function asHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  const message = error instanceof Error ? error.message : 'Некоректний запит.';
  const status = (error as { status?: unknown })?.status;
  return new HttpError(typeof status === 'number' && status >= 400 && status < 600 ? status : 400, message);
}
