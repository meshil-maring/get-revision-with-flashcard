import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readEnv } from '../src/env.ts';
import { LINK_SECONDS, r2Storage } from '../src/files/storage.ts';
import { createTestServer } from './helpers.ts';

let server: Awaited<ReturnType<typeof createTestServer>>;
beforeAll(async () => {
  server = await createTestServer({ MAX_FILE_MB: '1', FILE_QUOTA_MB: '2' });
});
afterAll(() => server.close());

const MB = 1024 * 1024;

function post(cookie: string, path: string, body: unknown) {
  return server.request(path, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify(body) });
}

/** Turns an absolute link from the server into a path for app.request. */
const pathOf = (url: string) => {
  const u = new URL(url);
  return u.pathname + u.search;
};

async function upload(cookie: string, id: string, bytes: Uint8Array<ArrayBuffer>, mimeType = 'image/png') {
  const res = await post(cookie, '/api/files/uploads', { id, size: bytes.length, mimeType });
  expect(res.status).toBe(200);
  const { key, url } = (await res.json()) as { key: string; url: string };
  const put = await server.request(pathOf(url), { method: 'PUT', body: bytes, headers: { 'Content-Type': mimeType } });
  expect(put.status).toBe(200);
  return { key, complete: await post(cookie, '/api/files/uploads/complete', { id }) };
}

async function downloadUrls(cookie: string, keys: string[]) {
  const res = await post(cookie, '/api/files/download-urls', { keys });
  expect(res.status).toBe(200);
  return ((await res.json()) as { urls: Record<string, string> }).urls;
}

describe('files', () => {
  it('needs a signed-in user', async () => {
    const res = await server.request('/api/files/uploads', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('uploads a file and downloads it again', async () => {
    const { cookie, user } = await server.signUp('files@example.com');
    const bytes = new TextEncoder().encode('a picture');
    const { key, complete } = await upload(cookie, 'att-1', bytes);
    expect(complete.status).toBe(200);
    expect(key).toBe(`u/${user.id}/att-1`);

    const urls = await downloadUrls(cookie, [key]);
    const res = await server.request(pathOf(urls[key]));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it("never gives out links to another user's files", async () => {
    const owner = await server.signUp('owner@example.com');
    const other = await server.signUp('other@example.com');
    const { key } = await upload(owner.cookie, 'private', new Uint8Array([1, 2, 3]));
    expect(await downloadUrls(other.cookie, [key])).toEqual({});
  });

  it('rejects tampered or expired links', async () => {
    const { cookie } = await server.signUp('tamper@example.com');
    const { key } = await upload(cookie, 'att-1', new Uint8Array([1]));
    const url = new URL((await downloadUrls(cookie, [key]))[key]);

    url.pathname = url.pathname.replace('att-1', 'att-2');
    expect((await server.request(pathOf(url.toString()))).status).toBe(403);

    url.pathname = url.pathname.replace('att-2', 'att-1');
    url.searchParams.set('expires', '1000');
    expect((await server.request(pathOf(url.toString()))).status).toBe(403);
  });

  it('only accepts images, PDFs and audio', async () => {
    const { cookie } = await server.signUp('types@example.com');
    const res = await post(cookie, '/api/files/uploads', { id: 'x', size: 10, mimeType: 'text/html' });
    expect(res.status).toBe(415);
  });

  it('refuses files over the size limit', async () => {
    const { cookie } = await server.signUp('big@example.com');
    const res = await post(cookie, '/api/files/uploads', { id: 'big', size: MB + 1, mimeType: 'application/pdf' });
    expect(res.status).toBe(413);
  });

  it('checks the size the file really has, not the size the app said', async () => {
    const { cookie } = await server.signUp('liar@example.com');
    const res = await post(cookie, '/api/files/uploads', { id: 'big', size: 10, mimeType: 'application/pdf' });
    const { url, key } = (await res.json()) as { url: string; key: string };
    // The dev server's own limit stops it at once; R2 would take it, so "complete" checks too.
    const put = await server.request(pathOf(url), { method: 'PUT', body: new Uint8Array(MB + 1) });
    expect(put.status).toBe(413);
    expect((await post(cookie, '/api/files/uploads/complete', { id: 'big' })).status).toBe(409);
    expect(await downloadUrls(cookie, [key])).toEqual({});
  });

  it('keeps each user within their storage quota', async () => {
    const { cookie } = await server.signUp('quota@example.com');
    expect((await upload(cookie, 'a', new Uint8Array(MB))).complete.status).toBe(200);
    expect((await upload(cookie, 'b', new Uint8Array(MB - 10))).complete.status).toBe(200);
    const res = await post(cookie, '/api/files/uploads', { id: 'c', size: 100, mimeType: 'image/png' });
    expect(res.status).toBe(413);
    // Uploading the same attachment again replaces it instead of counting twice.
    expect((await upload(cookie, 'a', new Uint8Array(MB))).complete.status).toBe(200);
  });

  it('removes the stored file once its attachment is deleted', async () => {
    const { cookie } = await server.signUp('delete@example.com');
    const { key } = await upload(cookie, 'att-1', new Uint8Array([1, 2]));
    const row = { id: 'att-1', card_id: 'c1', kind: 'image', name: 'a.png', remote_key: key, deleted_at: null as string | null };
    const sync = (data: typeof row, modifiedAt: string) =>
      post(cookie, '/api/sync', { cursor: 0, changes: [{ table: 'attachments', id: 'att-1', data, modifiedAt }] });

    await sync(row, '2026-11-26T10:00:00.000Z');
    expect(Object.keys(await downloadUrls(cookie, [key]))).toEqual([key]);

    // An older deletion loses to the newer copy, so the file stays.
    await sync({ ...row, name: 'renamed.png' }, '2026-11-26T12:00:00.000Z');
    await sync({ ...row, deleted_at: '2026-11-26T11:00:00.000Z' }, '2026-11-26T11:00:00.000Z');
    expect(Object.keys(await downloadUrls(cookie, [key]))).toEqual([key]);

    await sync({ ...row, deleted_at: '2026-11-26T13:00:00.000Z' }, '2026-11-26T13:00:00.000Z');
    expect(await downloadUrls(cookie, [key])).toEqual({});
  });
});

describe('file storage settings', () => {
  it('needs all four R2 settings or none', () => {
    expect(() => readEnv({ NODE_ENV: 'test', R2_BUCKET: 'notes' })).toThrow(/R2_ACCOUNT_ID/);
    const env = readEnv({ NODE_ENV: 'test', R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b', R2_SECRET_ACCESS_KEY: 'c', R2_BUCKET: 'd' });
    expect(env.files.r2?.bucket).toBe('d');
  });

  it('will not quietly keep files on the server disk in production', () => {
    expect(() => readEnv({ NODE_ENV: 'production', BETTER_AUTH_SECRET: 'x'.repeat(40) })).toThrow(/R2_/);
  });
});

describe('R2 links', () => {
  const r2 = r2Storage({ accountId: 'acct', accessKeyId: 'AKID', secretAccessKey: 'secret', bucket: 'studyme' });

  it('signs upload links for the bucket', async () => {
    const url = new URL(await r2.uploadUrl('u/user-1/att-1', 'image/png'));
    expect(url.origin).toBe('https://acct.r2.cloudflarestorage.com');
    expect(url.pathname).toBe('/studyme/u/user-1/att-1');
    expect(url.searchParams.get('X-Amz-Expires')).toBe(String(LINK_SECONDS));
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('makes downloads come back with the stored type', async () => {
    const url = new URL(await r2.downloadUrl('u/user-1/att-1', 'application/pdf'));
    expect(url.searchParams.get('response-content-type')).toBe('application/pdf');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });
});
