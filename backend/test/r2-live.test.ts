import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { readEnv } from '../src/env.ts';
import { r2Storage } from '../src/files/storage.ts';
import { PNG_1X1 } from './image-fixtures.ts';

// Against the real Cloudflare R2 bucket in .env. Off by default; run with
//   R2_INTEGRATION=1 npx vitest run test/r2-live.test.ts
// It stores one tiny image under u/integration-test/, reads it back and deletes it.

const live = process.env.R2_INTEGRATION === '1';
if (live) process.loadEnvFile('.env');

describe.runIf(live)('Cloudflare R2 (live)', () => {
  it('stores an image from the server, serves it through a signed link, then deletes it', async () => {
    const config = readEnv({ ...process.env, NODE_ENV: 'test' }).files.r2;
    expect(config, 'R2_* must be set in .env').toBeDefined();
    const storage = r2Storage(config!);
    const key = `u/integration-test/${randomUUID()}`;
    try {
      await storage.put(key, PNG_1X1, 'image/png');
      expect(await storage.size(key)).toBe(PNG_1X1.length);

      const res = await fetch(await storage.downloadUrl(key, 'image/png'));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array(PNG_1X1));

      // Private bucket: the object can't be read without a signature.
      const unsigned = await fetch(`https://${config!.accountId}.r2.cloudflarestorage.com/${config!.bucket}/${key}`);
      expect(unsigned.status).toBeGreaterThanOrEqual(400);
    } finally {
      await storage.remove(key);
    }
    expect(await storage.size(key)).toBeNull();
  });
});
