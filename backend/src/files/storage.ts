import { AwsClient } from 'aws4fetch';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { R2Config } from '../env.ts';

/** How long an upload or download link works. */
export const LINK_SECONDS = 15 * 60;

/**
 * Where attachment files live. The app never sends file bytes through the API: it gets a
 * short-lived link from the server and uploads to (or downloads from) the storage directly.
 */
export type FileStorage = {
  /** A link the app can PUT the file to. */
  uploadUrl(key: string, mimeType: string): Promise<string>;
  /** A link the app can GET the file from; the response has the given Content-Type. */
  downloadUrl(key: string, mimeType: string): Promise<string>;
  /** The stored file's size in bytes, or null if there is no such file. */
  size(key: string): Promise<number | null>;
  /** Removes a file. A missing file is fine. */
  remove(key: string): Promise<void>;
};

/** Keys look like `u/<user id>/<attachment id>`: no dots, so never `..`. */
const KEY_PATTERN = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;

export function isValidKey(key: string): boolean {
  return key.length <= 300 && KEY_PATTERN.test(key);
}

// --- Cloudflare R2 ------------------------------------------------------------------

/** Cloudflare R2, through its S3-compatible API. */
export function r2Storage(config: R2Config): FileStorage {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const objectUrl = (key: string) => `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key}`;

  async function presign(method: 'GET' | 'PUT', key: string, query: Record<string, string> = {}): Promise<string> {
    const url = new URL(objectUrl(key));
    url.searchParams.set('X-Amz-Expires', String(LINK_SECONDS));
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    const signed = await client.sign(url.toString(), { method, aws: { signQuery: true } });
    return signed.url;
  }

  return {
    uploadUrl: (key) => presign('PUT', key),
    downloadUrl: (key, mimeType) => presign('GET', key, { 'response-content-type': mimeType }),
    async size(key) {
      const res = await client.fetch(objectUrl(key), { method: 'HEAD' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`R2 HEAD failed: ${res.status}`);
      return Number(res.headers.get('content-length') ?? 0);
    },
    async remove(key) {
      const res = await client.fetch(objectUrl(key), { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE failed: ${res.status}`);
    },
  };
}

// --- a folder on this machine (development and tests) -----------------------------------

/** Where the disk storage's links point; served by `localFileRoutes`. */
export const LOCAL_FILES_PATH = '/api/local-files';

export type DiskStorage = FileStorage & {
  /** Checks a link's signature; true if it is valid and not expired. */
  verify(method: 'GET' | 'PUT', key: string, expires: string, signature: string): boolean;
  read(key: string): Promise<Buffer | null>;
  write(key: string, bytes: Uint8Array): Promise<void>;
};

/**
 * Keeps files in a folder and hands out signed links to this server, so the app's code is
 * the same as with R2. Links are signed with the server's secret.
 */
export function diskStorage(folder: string, baseURL: string, secret: string): DiskStorage {
  const root = resolve(folder);
  const pathOf = (key: string) => {
    if (!isValidKey(key)) throw new Error('Bad file key.');
    return join(root, ...key.split('/'));
  };
  const sign = (method: string, key: string, expires: string) =>
    createHmac('sha256', secret).update(`${method}\n${key}\n${expires}`).digest('hex');

  function link(method: 'GET' | 'PUT', key: string, query: Record<string, string> = {}): string {
    const expires = String(Math.floor(Date.now() / 1000) + LINK_SECONDS);
    const url = new URL(`${baseURL}${LOCAL_FILES_PATH}/${key}`);
    url.searchParams.set('expires', expires);
    url.searchParams.set('signature', sign(method, key, expires));
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    return url.toString();
  }

  return {
    uploadUrl: async (key) => link('PUT', key),
    downloadUrl: async (key, mimeType) => link('GET', key, { type: mimeType }),
    async size(key) {
      try {
        return (await stat(pathOf(key))).size;
      } catch {
        return null;
      }
    },
    async remove(key) {
      await rm(pathOf(key), { force: true });
    },
    verify(method, key, expires, signature) {
      if (!isValidKey(key) || !/^\d+$/.test(expires) || Number(expires) < Date.now() / 1000) return false;
      const expected = Buffer.from(sign(method, key, expires));
      const given = Buffer.from(signature);
      return expected.length === given.length && timingSafeEqual(expected, given);
    },
    async read(key) {
      try {
        return await readFile(pathOf(key));
      } catch {
        return null;
      }
    },
    async write(key, bytes) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    },
  };
}
