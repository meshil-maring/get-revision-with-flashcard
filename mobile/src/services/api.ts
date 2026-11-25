import { Platform } from 'react-native';

/**
 * The NoteMe server (backend/). Set EXPO_PUBLIC_API_URL in mobile/.env.
 * Defaults: the Android emulator reaches the computer at 10.0.2.2; web and iOS use localhost.
 * A real phone needs the computer's LAN address, e.g. http://192.168.1.5:4000.
 */
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000')
).replace(/\/$/, '');

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
