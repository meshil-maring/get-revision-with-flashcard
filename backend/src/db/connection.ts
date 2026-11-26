import { readFileSync } from 'node:fs';
import type { ConnectionOptions } from 'node:tls';

export type PgConnection = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: false | ConnectionOptions;
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * How to reach a Postgres server from a postgres:// URL. Shared by the server and drizzle-kit.
 *
 * Anything that isn't on this machine is reached over TLS with the certificate checked, so
 * passwords and data are never sent in the clear. Hosted databases whose certificate is signed
 * by their own authority (Supabase) need that authority's certificate: `caCertFile`.
 * `?sslmode=disable` in the URL turns TLS off (e.g. a database in a local container).
 */
export function pgConnection(url: string, caCertFile?: string): PgConnection {
  const u = new URL(url);
  const sslmode = u.searchParams.get('sslmode');
  const local = LOCAL_HOSTS.has(u.hostname);

  let ssl: PgConnection['ssl'];
  if (sslmode === 'disable' || (local && !caCertFile && sslmode === null)) {
    ssl = false;
  } else {
    ssl = { rejectUnauthorized: true, ...(caCertFile ? { ca: readFileSync(caCertFile, 'utf8') } : {}) };
  }

  return {
    host: u.hostname.replace(/^\[|\]$/g, ''),
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres',
    ssl,
  };
}

/** Explains a failed certificate check, which on Supabase means the CA certificate is missing. */
export function explainTlsError(error: unknown): unknown {
  // Drizzle wraps the driver's error, so look through the causes.
  let code = '';
  for (let e = error as { code?: unknown; cause?: unknown } | null, depth = 0; e && depth < 5; e = e.cause as typeof e, depth++) {
    if (typeof e.code === 'string') {
      code = e.code;
      break;
    }
  }
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code)) {
    return new Error(
      `The database's TLS certificate could not be verified (${code}). For Supabase, download the CA ` +
        'certificate (Project Settings → Database → SSL Configuration) and set DATABASE_CA_CERT to its path.',
      { cause: error },
    );
  }
  return error;
}
