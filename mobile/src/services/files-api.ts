import type { FileTransport } from '@/data/sync';
import { downloadToDevice, mimeTypeFor, putFile, readFileBlob } from '@/lib/attachment-files';

import { API_URL } from '@/services/api';
import { authFetchOptions } from '@/services/auth-client';

// Attachment files go straight to the account's file storage (Cloudflare R2): the server only
// hands out short-lived upload and download links (see backend/src/files/routes.ts).

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const { credentials, headers } = await authFetchOptions();
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const message = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new Error(message ?? `The server said ${res.status}.`);
  }
  return (await res.json()) as T;
}

export const filesApi: FileTransport = {
  async upload(file) {
    const mimeType = mimeTypeFor(file);
    const { size } = await readFileBlob(file.uri);
    const { url } = await postJson<{ key: string; url: string }>('/api/files/uploads', { id: file.id, size, mimeType });
    await putFile(url, file.uri, mimeType);
    const { key } = await postJson<{ key: string }>('/api/files/uploads/complete', { id: file.id });
    return key;
  },
  async downloadUrls(keys) {
    return (await postJson<{ urls: Record<string, string> }>('/api/files/download-urls', { keys })).urls;
  },
  download: downloadToDevice,
};
