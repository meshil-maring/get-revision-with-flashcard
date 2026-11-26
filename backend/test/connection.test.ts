import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { explainTlsError, pgConnection } from '../src/db/connection.ts';

let dir: string;
let caFile: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'studyme-ca-'));
  caFile = join(dir, 'ca.crt');
  await writeFile(caFile, '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n');
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const supabase = 'postgresql://postgres.ref:p%40ss%2Fword@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres';

describe('pgConnection', () => {
  it('reads the parts of the URL, decoding the password', () => {
    expect(pgConnection(supabase)).toMatchObject({
      host: 'aws-1-ap-southeast-2.pooler.supabase.com',
      port: 5432,
      user: 'postgres.ref',
      password: 'p@ss/word',
      database: 'postgres',
    });
  });

  it('always uses checked TLS for a database on another machine', () => {
    expect(pgConnection(supabase).ssl).toEqual({ rejectUnauthorized: true });
    expect(pgConnection(`${supabase}?sslmode=require`).ssl).toEqual({ rejectUnauthorized: true });
  });

  it("trusts the given certificate authority (Supabase's)", () => {
    const ssl = pgConnection(supabase, caFile).ssl;
    expect(ssl).toMatchObject({ rejectUnauthorized: true, ca: expect.stringContaining('BEGIN CERTIFICATE') });
  });

  it('skips TLS for a database on this machine, or when the URL says so', () => {
    expect(pgConnection('postgres://me:pw@localhost:5432/app').ssl).toBe(false);
    expect(pgConnection('postgres://me:pw@db:5432/app?sslmode=disable').ssl).toBe(false);
  });

  it('explains a failed certificate check', () => {
    const error = Object.assign(new Error('self-signed certificate in certificate chain'), { code: 'SELF_SIGNED_CERT_IN_CHAIN' });
    expect(String(explainTlsError(error))).toMatch(/DATABASE_CA_CERT/);
    // As Drizzle reports it: wrapped in a query error.
    expect(String(explainTlsError(new Error('Failed query', { cause: error })))).toMatch(/DATABASE_CA_CERT/);
    const other = new Error('password authentication failed');
    expect(explainTlsError(other)).toBe(other);
  });
});
