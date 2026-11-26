import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/** A fresh query cache per test: no retries (failures show at once) and no clean-up timers left running. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
}

export function TestQueryProvider({ client, children }: { client?: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client ?? createTestQueryClient()}>{children}</QueryClientProvider>;
}
