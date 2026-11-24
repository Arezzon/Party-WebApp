/**
 * UTC storage <-> Europe/Kyiv presentation. Intl only, no external packages.
 * `datetime-local` values are interpreted as Kyiv wall time and converted to
 * UTC with a two-step DST-safe offset calculation.
 */
import { MAX_EVENT_YEARS } from './env';

export const KYIV_TIMEZONE = 'Europe/Kyiv';
export const KYIV_LABEL = 'за Києвом';
export const MAX_EVENT_YEARS_AHEAD = MAX_EVENT_YEARS;

const dateTimeFormatter = new Intl.DateTimeFormat('uk-UA', {
  timeZone: KYIV_TIMEZONE,
  dateStyle: 'medium',
  timeStyle: 'short'
});
const timeFormatter = new Intl.DateTimeFormat('uk-UA', {
  timeZone: KYIV_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});
const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: KYIV_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

export interface KyivParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function partsInKyiv(date: Date): KyivParts {
  const result: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
  }
  return {
    year: result.year ?? date.getUTCFullYear(),
    month: result.month ?? date.getUTCMonth() + 1,
    day: result.day ?? date.getUTCDate(),
    hour: result.hour ?? 0,
    minute: result.minute ?? 0,
    second: result.second ?? 0
  };
}

/** Milliseconds that must be added to Kyiv wall time to get UTC at `date`. */
function offsetMsAt(date: Date): number {
  const parts = partsInKyiv(date);
  const wallAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return wallAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** `2027-07-15T19:30` (Kyiv) -> ISO UTC, correct on both sides of DST. */
export function kyivInputToDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;

  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  // Detect invalid calendar days (e.g. 2027-02-30 rolls over to March).
  const check = new Date(guess);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;

  let utc = guess - offsetMsAt(new Date(guess));
  utc = guess - offsetMsAt(new Date(utc));
  const result = new Date(utc);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function kyivInputToUtc(value: string): string | null {
  const date = kyivInputToDate(value);
  return date ? date.toISOString() : null;
}

/** ISO UTC -> value suitable for `<input type="datetime-local">` (Kyiv time). */
export function utcToKyivInput(value: string | number | Date): string {
  const date = toDate(value);
  if (!date) return '';
  const parts = partsInKyiv(date);
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}
export const toKyivInput = utcToKyivInput;
export const formatForForm = utcToKyivInput;
export const utcToLocalInput = utcToKyivInput;

/** e.g. «15 січня 2027, 19:30 (за Києвом)». */
export function formatKyiv(value: string | number | Date): string {
  const date = toDate(value);
  if (!date) return '';
  return `${dateTimeFormatter.format(date)} (${KYIV_LABEL})`;
}
export const formatKyivDateTime = formatKyiv;
export const formatEventDate = formatKyiv;
export const formatInKyiv = formatKyiv;

export function formatKyivTime(value: string | number | Date): string {
  const date = toDate(value);
  if (!date) return '';
  return `${timeFormatter.format(date)} (${KYIV_LABEL})`;
}

/** Upper bound: same calendar date two years later, in UTC. */
export function maxEventDate(now: string | number | Date = new Date()): Date {
  const base = toDate(now) ?? new Date();
  const result = new Date(base.getTime());
  result.setUTCFullYear(result.getUTCFullYear() + MAX_EVENT_YEARS);
  return result;
}

export function maxEventDateInput(now: string | number | Date = new Date()): string {
  return utcToKyivInput(maxEventDate(now));
}

/** True when starts_at is in the future and at most two years ahead. */
export function isWithinEventRange(value: string | number | Date, now: string | number | Date = new Date()): boolean {
  const date = toDate(value);
  const reference = toDate(now);
  if (!date || !reference) return false;
  const time = date.getTime();
  return time > reference.getTime() && time <= maxEventDate(reference).getTime();
}

export function isPastEvent(value: string | number | Date, now: string | number | Date = new Date()): boolean {
  const date = toDate(value);
  const reference = toDate(now);
  return Boolean(date && reference && date.getTime() <= reference.getTime());
}

export function kyivNowInput(): string {
  return utcToKyivInput(new Date());
}
