import { createContext, useContext } from 'react';

// The signed-in account as screens see it. Kept apart from the provider (account.tsx) so a
// screen can read it without loading the sign-in client.

export type AccountUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};
export type SyncStatus = 'idle' | 'syncing' | 'error';

export type AccountContextValue = {
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

export const AccountContext = createContext<AccountContextValue | null>(null);

/** The account, or null outside <AccountProvider> (for parts that only add to the screen when it is there). */
export function useOptionalAccount(): AccountContextValue | null {
  return useContext(AccountContext);
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used inside <AccountProvider>.');
  return value;
}
