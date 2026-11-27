// Checking images that AI apps upload (MCP upload_image, or the upload page it links to).
// The type comes from the file's own bytes, never from its name or the type the caller says.

/** The image types AI apps may upload, with the extension each is saved under. */
export const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;
export type ImageType = keyof typeof IMAGE_TYPES;

/** Wider or taller than this is refused: a tiny file can claim a huge picture and stall a phone. */
export const MAX_IMAGE_SIDE = 12_000;

/** A problem with an image that the caller can fix; `status` is the HTTP status for the upload page. */
export class ImageError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 410 | 413 | 415 | 429 | 502 = 400,
  ) {
    super(message);
  }
}

export const mb = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

/** "image/JPG; charset=x" → "image/jpeg"; null for anything that isn't a type we take. */
export function normaliseImageType(value: string | null | undefined): ImageType | null {
  const type = (value ?? '').split(';')[0].trim().toLowerCase();
  const aliased = type === 'image/jpg' || type === 'image/pjpeg' ? 'image/jpeg' : type;
  return aliased in IMAGE_TYPES ? (aliased as ImageType) : null;
}

const startsWith = (bytes: Uint8Array, signature: number[], at = 0) =>
  bytes.length >= at + signature.length && signature.every((b, i) => bytes[at + i] === b);
const ascii = (text: string) => [...text].map((ch) => ch.charCodeAt(0));

/** What the bytes really are, from their signature ("magic number"). */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);

/** The picture's size in pixels, read from its header; null when the header is broken. */
export function imageDimensions(bytes: Uint8Array, type: ImageType): { width: number; height: number } | null {
  if (type === 'image/png') {
    // 8-byte signature, then the IHDR chunk: length (4), "IHDR" (4), width (4), height (4).
    if (bytes.length < 24 || !startsWith(bytes, ascii('IHDR'), 12)) return null;
    return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (type === 'image/jpeg') {
    // Walk the segments to the first "start of frame", which holds the size.
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      if (marker === 0xff) {
        i += 1; // fill byte
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2; // markers without a length
        continue;
      }
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return { height: u16be(bytes, i + 5), width: u16be(bytes, i + 7) };
      if (marker === 0xd9 || marker === 0xda) return null; // end of image / pixel data before any frame
      i += 2 + u16be(bytes, i + 2);
    }
    return null;
  }
  // WebP: "RIFF" size "WEBP", then the first chunk's four-letter name at 12.
  if (bytes.length < 30) return null;
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === 'VP8 ' && startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) {
    return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const [b0, b1, b2, b3] = bytes.subarray(21, 25);
    return { width: 1 + (b0 | ((b1 & 0x3f) << 8)), height: 1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) };
  }
  if (chunk === 'VP8X') return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) };
  return null;
}

export type CheckedImage = { type: ImageType; width: number; height: number; size: number };

/**
 * Makes sure the bytes are a PNG, JPEG or WebP image within the limits. A type the caller
 * gave (`declaredType`, e.g. from a file name or upload) must agree with what the bytes are.
 */
export function checkImage(bytes: Uint8Array, maxBytes: number, declaredType?: string | null): CheckedImage {
  if (bytes.length === 0) throw new ImageError('The image is empty.');
  if (bytes.length > maxBytes) throw new ImageError(`Images can be up to ${mb(maxBytes)}; this one is ${mb(bytes.length)}.`, 413);
  if (declaredType && !normaliseImageType(declaredType)) {
    throw new ImageError(`Only PNG, JPEG and WebP images can be uploaded, not ${declaredType.slice(0, 50)}.`, 415);
  }
  const type = sniffImageType(bytes);
  if (!type) throw new ImageError('This is not a PNG, JPEG or WebP image (its contents do not match).', 415);
  const declared = normaliseImageType(declaredType);
  if (declared && declared !== type) {
    throw new ImageError(`The file says it is ${declared} but it is really ${type}.`, 415);
  }
  const size = imageDimensions(bytes, type);
  if (!size || size.width < 1 || size.height < 1) throw new ImageError('The image is damaged: its size could not be read.', 415);
  if (size.width > MAX_IMAGE_SIDE || size.height > MAX_IMAGE_SIDE) {
    throw new ImageError(`Images can be at most ${MAX_IMAGE_SIDE} pixels wide or tall.`, 413);
  }
  return { type, ...size, size: bytes.length };
}

/**
 * A file name that is safe to show and download: no folders, control characters or odd
 * symbols, at most 80 characters, ending in the extension the bytes really have.
 */
export function safeFileName(name: string | null | undefined, type: ImageType): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} ._()-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.(png|jpe?g|webp|gif|heic|bmp|svg)$/i, '')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 80)
    .trim();
  return `${cleaned || 'image'}.${IMAGE_TYPES[type]}`;
}
