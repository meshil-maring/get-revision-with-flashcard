import { describe, expect, it } from 'vitest';

import { fetchImage, isPublicAddress } from '../src/files/fetch-image.ts';
import { checkImage, imageDimensions, ImageError, safeFileName, sniffImageType } from '../src/files/images.ts';
import { readUploadToken, uploadToken } from '../src/files/uploads.ts';
import { jpeg, PNG_1X1, pngClaiming, WEBP_1X1 } from './image-fixtures.ts';

const MB = 1024 * 1024;

describe('image checks', () => {
  it('knows PNG, JPEG and WebP from their bytes, and reads their size', () => {
    expect(sniffImageType(PNG_1X1)).toBe('image/png');
    expect(imageDimensions(PNG_1X1, 'image/png')).toEqual({ width: 1, height: 1 });
    expect(sniffImageType(jpeg(640, 480))).toBe('image/jpeg');
    expect(imageDimensions(jpeg(640, 480), 'image/jpeg')).toEqual({ width: 640, height: 480 });
    expect(sniffImageType(WEBP_1X1)).toBe('image/webp');
    expect(imageDimensions(WEBP_1X1, 'image/webp')).toEqual({ width: 1, height: 1 });
  });

  it('accepts a real image, with or without a matching declared type', () => {
    expect(checkImage(PNG_1X1, MB)).toMatchObject({ type: 'image/png', width: 1, height: 1, size: PNG_1X1.length });
    expect(checkImage(jpeg(10, 10), MB, 'image/jpg').type).toBe('image/jpeg');
    expect(checkImage(WEBP_1X1, MB, 'image/webp; q=1').type).toBe('image/webp');
  });

  it('turns away files that are not images, whatever they claim', () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    expect(() => checkImage(html, MB, 'image/png')).toThrow(/not a PNG, JPEG or WebP/);
    const gif = new TextEncoder().encode('GIF89a......');
    expect(() => checkImage(gif, MB, 'image/gif')).toThrow(/Only PNG, JPEG and WebP/);
    expect(() => checkImage(PNG_1X1, MB, 'text/html')).toThrow(ImageError);
  });

  it('turns away an image whose declared type does not match its bytes', () => {
    expect(() => checkImage(PNG_1X1, MB, 'image/jpeg')).toThrow(/really image\/png/);
  });

  it('turns away a broken header (right signature, nothing after)', () => {
    expect(() => checkImage(PNG_1X1.subarray(0, 12), MB)).toThrow(/damaged/);
    expect(() => checkImage(Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0]), MB)).toThrow(/damaged/);
  });

  it('enforces the file size and picture size limits', () => {
    expect(() => checkImage(PNG_1X1, 10)).toThrow(/up to/);
    try {
      checkImage(PNG_1X1, 10);
    } catch (error) {
      expect((error as ImageError).status).toBe(413);
    }
    expect(() => checkImage(pngClaiming(50_000, 50_000), MB)).toThrow(/pixels/);
    expect(() => checkImage(new Uint8Array(0), MB)).toThrow(/empty/);
  });

  it('makes file names safe and gives them the real extension', () => {
    expect(safeFileName('../../etc/passwd', 'image/png')).toBe('passwd.png');
    expect(safeFileName('C:\\Users\\me\\Traffic Diagram.JPG', 'image/jpeg')).toBe('Traffic Diagram.jpg');
    expect(safeFileName('photo.png', 'image/webp')).toBe('photo.webp');
    expect(safeFileName('<script>x</script>.png', 'image/png')).toBe('script.png') // the / in </script> ends a folder name;
    expect(safeFileName('  ', 'image/png')).toBe('image.png');
    expect(safeFileName(null, 'image/jpeg')).toBe('image.jpg');
    expect(safeFileName('Kreuzung – Übersicht.png', 'image/png')).toBe('Kreuzung Übersicht.png');
    expect(safeFileName('a'.repeat(300), 'image/png')).toHaveLength(84);
  });
});

describe('image links', () => {
  it('knows which addresses are private', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', 'not-an-ip']) {
      expect(isPublicAddress(address), address).toBe(false);
    }
    for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it('only fetches public https links', async () => {
    const options = { maxBytes: MB };
    await expect(fetchImage('http://example.com/a.png', options)).rejects.toThrow(/https/);
    await expect(fetchImage('https://127.0.0.1/a.png', options)).rejects.toThrow(/private/);
    await expect(fetchImage('https://169.254.169.254/latest/meta-data', options)).rejects.toThrow(/private/);
    await expect(fetchImage('https://[::1]/a.png', options)).rejects.toThrow(/private/);
    await expect(fetchImage('https://localhost/a.png', options)).rejects.toThrow(/private/);
    await expect(fetchImage('https://user:pw@example.com/a.png', options)).rejects.toThrow(/user name/);
    await expect(fetchImage('file:///etc/passwd', options)).rejects.toThrow(/https/);
    await expect(fetchImage('not a link', options)).rejects.toThrow(/valid link/);
  });
});

describe('upload link tokens', () => {
  const later = Math.floor(Date.now() / 1000) + 600;

  it('round-trips, and refuses a changed or expired token', () => {
    const token = uploadToken('secret', 'user-1', 'att-1', later);
    expect(readUploadToken('secret', token)).toEqual({ userId: 'user-1', attachmentId: 'att-1' });
    expect(readUploadToken('other-secret', token)).toBeNull();
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'user-2', i: 'att-1', e: later })).toString('base64url');
    expect(readUploadToken('secret', `${forged}.${signature}`)).toBeNull();
    expect(readUploadToken('secret', `${payload}.${signature}.x`)).toBeNull();
    expect(readUploadToken('secret', uploadToken('secret', 'user-1', 'att-1', 1000))).toBeNull();
  });
});
