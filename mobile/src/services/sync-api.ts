import type { SyncRequest, SyncResponse } from '@/data/sync';

import { API_URL } from '@/services/api';
import { authFetchOptions } from '@/services/auth-client';

export class SyncHttpError extends Error {
  constructor(readonly status: number) {
    super(status === 401 ? 'Your session ended. Please sign in again.' : `The server said ${status}.`);
  }
}

/** Calls the server's /api/sync with the signed-in session. */
export async function postSync(request: SyncRequest): Promise<SyncResponse> {
  const { credentials, headers } = await authFetchOptions();
  const res = await fetch(`${API_URL}/api/sync`, {
    method: 'POST',
    credentials,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new SyncHttpError(res.status);
  return (await res.json()) as SyncResponse;
}

/** Whether the server offers Google sign-in. */
export async function fetchServerConfig(): Promise<{ google: boolean }> {
  const res = await fetch(`${API_URL}/api/config`);
  if (!res.ok) throw new Error(`The server said ${res.status}.`);
  return (await res.json()) as { google: boolean };
}
