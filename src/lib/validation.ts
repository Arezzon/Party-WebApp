/**
 * Server-side zod validation. Rejects hostile values (0, -1, 1.5, "7abc",
 * 1e20, year 9999, HTML/SVG/EXE disguised as images) with friendly errors.
 */
import { z } from 'zod';
import { MAX_UPLOAD_BYTES } from './env';
import { isWithinEventRange, kyivInputToDate, maxEventDate } from './timezone';

export const MAX_PLACES = 10_000;
export const MAX_TITLE_LENGTH = 120;
export const MAX_BODY_LENGTH = 2000;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_NAME_LENGTH = 80;
export const MAX_REASON_LENGTH = 500;
export { MAX_UPLOAD_BYTES };

export type AllowedImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export const placesSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return Number.NaN;
    return Number(trimmed);
  }
  return value;
}, z.number().int().min(1, 'Місць має бути щонайменше 1').max(MAX_PLACES, `Місць не може бути більше ${MAX_PLACES}`));

export const titleSchema = z.string().trim().min(1, 'Назва не може бути порожньою').max(MAX_TITLE_LENGTH);
export const bodySchema = z.string().trim().min(1, 'Коментар не може бути порожнім').max(MAX_BODY_LENGTH);
export const descriptionSchema = z.string().max(MAX_DESCRIPTION_LENGTH).default('');
export const nameSchema = z.string().trim().min(1, 'Ім’я не може бути порожнім').max(MAX_NAME_LENGTH);
export const emailSchema = z.string().trim().toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Некоректний email');
export const passwordSchema = z.string().min(8, 'Пароль має бути від 8 символів').max(128);
export const reasonSchema = z.string().trim().min(1, 'Вкажіть причину').max(MAX_REASON_LENGTH);
export const reportReasonSchema = reasonSchema;
export const visibilitySchema = z.enum(['public', 'private']);
export const idempotencyKeySchema = z.string().trim().min(1).max(200);
export const inviteTokenSchema = z.string().regex(/^[0-9a-fA-F]{64}$/, 'Недійсне запрошення');
export const uuidSchema = z.string().uuid();

export const startsAtSchema = z.preprocess((value) => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value.trim())) {
    const converted = kyivInputToDate(value.trim());
    return converted ? converted.toISOString() : value;
  }
  return value;
}, z
  .string()
  .refine(
    (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value)),
    'Некоректна дата та час'
  )
  .refine(
    (value) => isWithinEventRange(value),
    'Дата має бути у майбутньому й не далі ніж через 2 роки'
  ));

export const dateSchema = startsAtSchema;
export const startsAtInputSchema = startsAtSchema;

export const eventSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  starts_at: startsAtSchema,
  places: placesSchema,
  visibility: visibilitySchema.default('public'),
  cover: z.unknown().optional()
});

export const eventCreateSchema = eventSchema;
export const createEventSchema = eventSchema;
export const eventInputSchema = eventSchema;

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1)
});

export const commentSchema = z.object({ body: bodySchema });
export const reportSchema = z.object({ reason: reasonSchema });
export const profileSchema = z.object({ name: nameSchema });

/** Magic-byte sniffing. Filename and declared MIME are deliberately ignored. */
export function detectImageMime(bytes: Uint8Array | ArrayBuffer): AllowedImageMime | null {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.length >= 8 &&
      view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4e && view[3] === 0x47 &&
      view[4] === 0x0d && view[5] === 0x0a && view[6] === 0x1a && view[7] === 0x0a) {
    return 'image/png';
  }
  if (view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) {
    return 'image/jpeg';
  }
  if (view.length >= 12 &&
      view[0] === 0x52 && view[1] === 0x49 && view[2] === 0x46 && view[3] === 0x46 &&
      view[8] === 0x57 && view[9] === 0x45 && view[10] === 0x42 && view[11] === 0x50) {
    return 'image/webp';
  }
  return null;
}

export const isAllowedImageMime = (mime: string): mime is AllowedImageMime =>
  mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp';

export class ValidationError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ValidationError';
    this.status = status;
  }
}

export interface ValidatedUpload {
  mime: AllowedImageMime;
  bytes: Uint8Array;
  size: number;
}

export function validateUploadBytes(
  value: unknown,
  declaredSize?: number
): ValidatedUpload {
  let bytes: Uint8Array;
  if (value instanceof Uint8Array) bytes = value;
  else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
  else if (value && typeof value === 'object' && 'byteLength' in value && typeof (value as any).byteLength === 'number') {
    bytes = new Uint8Array(value as ArrayBuffer);
  } else {
    throw new ValidationError('Недозволений формат зображення');
  }
  const size = typeof declaredSize === 'number' && Number.isFinite(declaredSize) ? declaredSize : bytes.byteLength;
  if (size > MAX_UPLOAD_BYTES) throw new ValidationError('Файл завеликий', 413);
  if (size <= 0) throw new ValidationError('Порожній файл');
  const mime = detectImageMime(bytes);
  if (!mime) throw new ValidationError('Недозволений формат зображення');
  return { mime, bytes, size };
}

export const validateImageBytes = validateUploadBytes;
export const assertValidUpload = validateUploadBytes;

/**
 * Accepts raw bytes or a File/Blob-like object. Async blobs are checked in
 * images.ts after reading; this schema only gates the synchronous shapes.
 */
export const uploadSchema = z.custom<unknown>((value) => {
  try {
    if (value && typeof (value as any).arrayBuffer === 'function') return true;
    validateUploadBytes(value);
    return true;
  } catch {
    return false;
  }
}, 'Недозволений формат зображення');

export const imageUploadSchema = uploadSchema;

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

export function validate<T>(schema: { safeParse(value: unknown): { success: boolean; data?: T; error?: unknown } }, value: unknown): ValidationResult<T> {
  const result = schema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  const issue = result.error as { issues?: Array<{ message?: string }> } | undefined;
  return { success: false, errors: (issue?.issues ?? []).map((item) => String(item.message ?? 'Некоректне значення')) };
}

export function formatZodError(error: unknown): string {
  const issue = error as { issues?: Array<{ message?: string }> };
  return issue?.issues?.map((item) => String(item.message ?? '')).filter(Boolean).join('; ') || 'Некоректні дані';
}

export function parseOrThrow<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try { return schema.parse(value); }
  catch (error) { throw new ValidationError(formatZodError(error)); }
}

export { maxEventDate };
