import { useSQLiteContext } from 'expo-sqlite';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { clearAccountData, countPendingChanges, getLastSyncedAt, runSync } from '@/data/sync';

import { removeFile } from '@/lib/attachment-files';

import { authClient } from '@/services/auth-client';
import { filesApi } from '@/services/files-api';
import { queryKeys } from '@/services/queries';
import { postSync } from '@/services/sync-api';

import { AccountContext, type AccountUser, type SyncStatus } from './account-context';

/** How often to sync while the app is open. */
const SYNC_EVERY_MS = 2 * 60 * 1000;

export type { AccountUser, SyncStatus } from './account-context';


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
    mutationFn: (id: string) => runSync(db, id, postSync, filesApi),
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
      const files = await clearAccountData(db);
      for (const uri of files) removeFile(uri);
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

export { useAccount, useOptionalAccount } from './account-context';
