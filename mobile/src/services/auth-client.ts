import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { API_URL } from '@/services/api';

// Sign-in with the StudyMe server. On phones the session is kept in the secure store.
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: 'studyme',
      storagePrefix: 'studyme',
      storage: SecureStore,
    }),
  ],
});

/** Fetch options that send the signed-in session to our own API. */
export async function authFetchOptions(): Promise<Pick<RequestInit, 'credentials' | 'headers'>> {
  if (Platform.OS === 'web') return { credentials: 'include', headers: {} };
  const cookie = await authClient.getCookie();
  return { credentials: 'omit', headers: cookie ? { Cookie: cookie } : {} };
}
