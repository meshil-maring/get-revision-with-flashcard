import { Platform } from 'react-native';

/**
 * Picks the server's address (mobile/.env, see .env.example):
 * - EXPO_PUBLIC_PHONE_API_URL, on a phone or emulator: usually an https tunnel (ngrok), since a phone
 *   can't reach "localhost" on the computer and Google sign-in needs https;
 * - else EXPO_PUBLIC_API_URL, everywhere (the web keeps using it while phones use the tunnel);
 * - else the computer itself: localhost, or 10.0.2.2 from the Android emulator.
 */
export function chooseApiUrl(os: string, apiUrl?: string, phoneApiUrl?: string): string {
  const fallback = os === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
  const chosen = (os !== 'web' && phoneApiUrl) || apiUrl || fallback;
  return chosen.trim().replace(/\/+$/, '');
}

// Written out in full: Expo only fills in EXPO_PUBLIC_ values that appear exactly like this.
export const API_URL = chooseApiUrl(
  Platform.OS,
  process.env.EXPO_PUBLIC_API_URL,
  process.env.EXPO_PUBLIC_PHONE_API_URL,
);

/** The MCP server that AI apps (ChatGPT, Claude) connect to; see app/connect-ai.tsx. */
export const MCP_URL = `${API_URL}/mcp`;

/** ChatGPT and Claude reach the server from the internet, so a local address won't work for them. */
export function isReachableFromInternet(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    return !(
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)
    );
  } catch {
    return false;
  }
}
