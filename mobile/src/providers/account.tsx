import { useSQLiteContext } from 'expo-sqlite';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { clearAccountData, countPendingChanges, getLastSyncedAt, runSync } from '@/data/sync';

import { authClient } from '@/services/auth-client';
import { queryKeys } from '@/services/queries';
import { postSync } from '@/services/sync-api';

/** How often to sync while the app is open. */
const SYNC_EVERY_MS = 2 * 60 * 1000;

export type AccountUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};
export type SyncStatus = 'idle' | 'syncing' | 'error';

type AccountContextValue = {
  /** null = guest */
  user: AccountUser | null;
  /** true while the saved session is being checked on start-up */
  isPending: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSyncedAt: string | null;
  syncNow: () => Promise<void>;
  /**
   * Syncs, removes the account's data from this device and signs out. If some changes
   * could not be sent, nothing happens and their count is returned, unless `force` is set.
   */
  signOut: (options?: { force?: boolean }) => Promise<{ unsynced: number } | null>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { data: session, isPending } = authClient.useSession();
  const user = (session?.user as AccountUser | undefined) ?? null;
  const userId = user?.id ?? null;

  const queryClient = useQueryClient();

  // When the last sync finished, read from the local database.
  const lastSynced = useQuery({
    queryKey: queryKeys.sync.lastSyncedAt(userId),
    queryFn: () => getLastSyncedAt(db),
    enabled: userId !== null,
    networkMode: 'always', // local read, works offline
    staleTime: Infinity, // refreshed by the sync below
  });

  // A sync sends local changes and pulls the account's. 'always' so that, offline, it fails
  // at once with an error to show instead of waiting (signing out waits for it).
  const sync = useMutation({
    mutationKey: queryKeys.sync.all,
    mutationFn: (id: string) => runSync(db, id, postSync),
    networkMode: 'always',
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.sync.all }),
  });
  const { mutateAsync, reset: resetSync } = sync;
  const syncStatus: SyncStatus = sync.isPending ? 'syncing' : sync.isError ? 'error' : 'idle';
  const syncError = sync.error ? sync.error.message || 'Sync failed.' : null;
  const lastSyncedAt = userId ? (lastSynced.data ?? null) : null;

  const running = useRef<Promise<void> | null>(null);
  const syncNow = useCallback(async () => {
    if (!userId) return;
    // One sync at a time; a second request waits for the running one.
    if (running.current) return running.current;
    const task = mutateAsync(userId)
      .then(() => undefined)
      .catch(() => undefined) // shown through syncStatus / syncError
      .finally(() => {
        running.current = null;
      });
    running.current = task;
    return task;
  }, [userId, mutateAsync]);

  // Sync when someone signs in, when the app comes back to the front, and every few minutes.
  useEffect(() => {
    if (!userId) return;
    void syncNow();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNow();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void syncNow();
    }, SYNC_EVERY_MS);
    return () => {
      appState.remove();
      clearInterval(timer);
    };
  }, [userId, syncNow]);

  const signOut = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (userId) {
        await syncNow();
        const unsynced = await countPendingChanges(db);
        if (unsynced > 0 && !force) return { unsynced };
      }
      await authClient.signOut();
      await clearAccountData(db);
      // Nothing from this account may be shown to whoever uses the app next.
      queryClient.removeQueries({ queryKey: queryKeys.sync.all });
      resetSync();
      return null;
    },
    [db, userId, syncNow, queryClient, resetSync],
  );

  const value = useMemo(
    () => ({
      user,
      isPending,
      syncStatus,
      syncError,
      lastSyncedAt,
      syncNow,
      signOut,
    }),
    [user, isPending, syncStatus, syncError, lastSyncedAt, syncNow, signOut],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used inside <AccountProvider>.');
  return value;
}
