import { QueryClient, useQuery } from '@tanstack/react-query';

import { fetchServerConfig } from '@/services/sync-api';

/**
 * TanStack Query is only for data that lives on the server (account, sync, server settings).
 * Decks, cards and notes are read straight from the local SQLite database (data/), which is
 * kept up to date by the sync in providers/account.tsx — don't put them behind a query.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60 * 1000, retry: 2 },
      mutations: { retry: 0 },
    },
  });
}

/** Every query key in one place, so invalidating is easy to get right. */
export const queryKeys = {
  serverConfig: ['server-config'] as const,
  sync: {
    all: ['sync'] as const,
    lastSyncedAt: (userId: string | null) => ['sync', 'last-synced-at', userId] as const,
  },
};

/** Which sign-in providers the server offers. Rarely changes, so it is kept for a while. */
export function useServerConfig() {
  return useQuery({
    queryKey: queryKeys.serverConfig,
    queryFn: fetchServerConfig,
    staleTime: 10 * 60 * 1000,
  });
}
