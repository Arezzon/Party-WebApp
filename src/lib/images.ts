/**
 * Cover images in Workers: magic-byte validation only, no native encoder.
 * D1 caps rows/BLOBs at 2 MB, so covers are limited to 1.5 MB and stored as-is.
 * Filenames are never inspected or used.
 */
import { MAX_UPLOAD_BYTES } from './env';
import { detectImageMime, ValidationError, type AllowedImageMime } from './validation';

export const WEBP_MIME = 'image/webp';
export const WEBP_CONTENT_TYPE = WEBP_MIME;
export const WEBP_QUALITY = 80;
export const D1_MAX_COVER_BYTES = 1_500_000;
export const MAX_COVER_BYTES = Math.min(MAX_UPLOAD_BYTES, D1_MAX_COVER_BYTES);

export class ImageError extends ValidationError {}

export interface EncodedCover {
  blob: Uint8Array;
  mime: AllowedImageMime;
  size: number;
  sourceMime: AllowedImageMime;
}

export function coverHeaders(mime: AllowedImageMime): Readonly<Record<string, string>> {
  return Object.freeze({
    'Content-Type': mime,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'private, max-age=3600'
  });
}

function asUint8Array(input: unknown): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input && typeof input === 'object' && typeof (input as any).byteLength === 'number') {
    return new Uint8Array(input as ArrayBuffer);
  }
  throw new ImageError('Недозволений формат зображення');
}

export async function readUploadBytes(input: unknown): Promise<Uint8Array> {
  if (input instanceof Uint8Array || input instanceof ArrayBuffer) return asUint8Array(input);
  if (input && typeof (input as any).arrayBuffer === 'function') {
    const buffer = await (input as { arrayBuffer(): Promise<ArrayBuffer> }).arrayBuffer();
    return asUint8Array(buffer);
  }
  throw new ImageError('Недозволений формат зображення');
}

export interface EncodeOptions {
  quality?: number;
  maxBytes?: number;
}

/** Validates and returns the original bytes; re-encoding needs native libvips. */
export async function encodeWebP(input: unknown, options: EncodeOptions = {}): Promise<Uint8Array> {
  const bytes = asUint8Array(input);
  const maxBytes = Math.min(options.maxBytes ?? MAX_UPLOAD_BYTES, MAX_COVER_BYTES);
  if (bytes.byteLength > maxBytes) throw new ImageError('Файл завеликий', 413);
  if (bytes.byteLength === 0) throw new ImageError('Порожній файл');
  if (!detectImageMime(bytes)) throw new ImageError('Недозволений формат зображення');
  return bytes;
}

export const convertToWebP = encodeWebP;
export const toWebP = encodeWebP;
export const encodeWebp = encodeWebP;

/** Full upload pipeline: read -> validate magic bytes and size -> keep bytes. */
export async function processCover(input: unknown, options: EncodeOptions = {}): Promise<EncodedCover> {
  const bytes = await readUploadBytes(input);
  const sourceMime = detectImageMime(bytes);
  if (!sourceMime) throw new ImageError('Недозволений формат зображення');
  const blob = await encodeWebP(bytes, options);
  return { blob, mime: sourceMime, size: blob.byteLength, sourceMime };
}

export const processCoverFile = processCover;
export const processUpload = processCover;
export const validateAndConvertImage = processCover;

/** Response for GET /events/:id/cover using the stored MIME type. */
export function webpResponse(blob: Uint8Array | ArrayBuffer, mime: AllowedImageMime = 'image/webp'): Response {
  const body = asUint8Array(blob);
  const headers = new Headers();
  for (const [name, value] of Object.entries(coverHeaders(mime))) headers.set(name, value);
  return new Response(body as BodyInit, { status: 200, headers });
}

export const coverResponse = webpResponse;
export const imageResponse = webpResponse;

export function isWebpBlob(blob: unknown): boolean {
  if (!blob || !(blob instanceof Uint8Array)) return false;
  return detectImageMime(blob) === 'image/webp';
}
