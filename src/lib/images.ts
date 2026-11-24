/**
 * Cover images: magic-byte check -> sharp -> WebP (quality 80) -> BLOB in DB.
 * Filenames are never inspected or used. Responses are image/webp + nosniff.
 */
import sharp from 'sharp';
import { MAX_UPLOAD_BYTES } from './env';
import { detectImageMime, ValidationError, type AllowedImageMime } from './validation';

export const WEBP_MIME = 'image/webp';
export const WEBP_CONTENT_TYPE = WEBP_MIME;
export const WEBP_QUALITY = 80;
export const MAX_COVER_BYTES = MAX_UPLOAD_BYTES;

export class ImageError extends ValidationError {}

export interface EncodedCover {
  blob: Uint8Array;
  mime: 'image/webp';
  size: number;
  sourceMime: AllowedImageMime;
}

export const COVER_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Content-Type': WEBP_MIME,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'private, max-age=3600'
});

function asUint8Array(input: unknown): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input && typeof input === 'object' && typeof (input as any).byteLength === 'number') {
    return new Uint8Array(input as ArrayBuffer);
  }
  throw new ImageError('Недозволений формат зображення');
}

/** Reads a File/Blob-like object without ever looking at its filename. */
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

/** Encodes a validated PNG/JPEG/WebP upload into a WebP BLOB. */
export async function encodeWebP(input: unknown, options: EncodeOptions = {}): Promise<Uint8Array> {
  const bytes = asUint8Array(input);
  const maxBytes = options.maxBytes ?? MAX_UPLOAD_BYTES;
  if (bytes.byteLength > maxBytes) throw new ImageError('Файл завеликий', 413);
  if (bytes.byteLength === 0) throw new ImageError('Порожній файл');
  const sourceMime = detectImageMime(bytes);
  if (!sourceMime) throw new ImageError('Недозволений формат зображення');

  const output = await sharp(bytes)
    .rotate()
    .webp({ quality: options.quality ?? WEBP_QUALITY })
    .toBuffer();
  return new Uint8Array(output);
}

export const convertToWebP = encodeWebP;
export const toWebP = encodeWebP;
export const encodeWebp = encodeWebP;

/** Full upload pipeline: read -> validate magic bytes/size -> re-encode. */
export async function processCover(input: unknown, options: EncodeOptions = {}): Promise<EncodedCover> {
  const bytes = await readUploadBytes(input);
  const maxBytes = options.maxBytes ?? MAX_UPLOAD_BYTES;
  if (bytes.byteLength > maxBytes) throw new ImageError('Файл завеликий', 413);
  const sourceMime = detectImageMime(bytes);
  if (!sourceMime) throw new ImageError('Недозволений формат зображення');
  const blob = await encodeWebP(bytes, options);
  return { blob, mime: WEBP_MIME, size: blob.byteLength, sourceMime };
}

export const processCoverFile = processCover;
export const processUpload = processCover;
export const validateAndConvertImage = processCover;

/** Response for GET /events/:id/cover. */
export function webpResponse(blob: Uint8Array | ArrayBuffer): Response {
  const body = asUint8Array(blob);
  const headers = new Headers();
  for (const [name, value] of Object.entries(COVER_HEADERS)) headers.set(name, value);
  return new Response(body as BodyInit, { status: 200, headers });
}

export const coverResponse = webpResponse;
export const imageResponse = webpResponse;

export function isWebpBlob(blob: unknown): boolean {
  if (!blob || !(blob instanceof Uint8Array)) return false;
  return detectImageMime(blob) === 'image/webp';
}
