import { Platform } from 'react-native';

import { API_URL } from '@/services/api';

/**
 * In development on the web, the server is at localhost (EXPO_PUBLIC_API_URL). Browsers treat
 * 127.0.0.1 and localhost as different sites, so a page opened at 127.0.0.1 is blocked from the
 * server (CORS), its sign-in cookies and Google's way back. Opening the same page at localhost fixes all three.
 * Returns the address to move to, or null to stay.
 */
export function localhostAddress(pageUrl: string, apiUrl: string): string | null {
  try {
    const page = new URL(pageUrl);
    const api = new URL(apiUrl);
    if (api.hostname !== 'localhost') return null;
    if (page.hostname !== '127.0.0.1' && page.hostname !== '[::1]') return null;
    page.hostname = 'localhost';
    return page.toString();
  } catch {
    return null;
  }
}

/** Runs once when the app loads (app/_layout.tsx). */
export function moveToLocalhostIfNeeded(): void {
  if (!__DEV__ || Platform.OS !== 'web' || typeof window === 'undefined') return;
  const target = localhostAddress(window.location.href, API_URL);
  if (target) window.location.replace(target);
}
