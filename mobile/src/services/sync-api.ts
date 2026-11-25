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

/** Sign-in providers the app knows how to show. */
export const SOCIAL_PROVIDERS = ['google', 'microsoft', 'facebook'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

/** Which sign-in providers the server has set up (unknown ones are left out). */
export async function fetchServerConfig(): Promise<{ providers: SocialProvider[] }> {
  const res = await fetch(`${API_URL}/api/config`);
  if (!res.ok) throw new Error(`The server said ${res.status}.`);
  const body = (await res.json()) as { providers?: string[] };
  return {
    providers: SOCIAL_PROVIDERS.filter((provider) => body.providers?.includes(provider)),
  };
}
