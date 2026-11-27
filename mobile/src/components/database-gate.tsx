import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { Component, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/data/db';

/**
 * On the web, the database file can be open in only one browser tab. A second tab (or this page
 * reopening before the last one let go, e.g. coming back from Google sign-in) fails with this.
 */
export function isDatabaseInUse(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /createSyncAccessHandle|Access Handles? cannot be created|NoModificationAllowedError/i.test(message);
}

/**
 * Tries a few times on its own before asking, as a page that is closing lets go within moments:
 * after 0.3 s, 0.6 s, 0.9 s, … then every 1.5 s, about 9 seconds in all.
 */
const AUTO_RETRIES = 8;
const RETRY_MS = 300;
const MAX_RETRY_MS = 1500;
const retryDelay = (attempt: number) => Math.min(MAX_RETRY_MS, RETRY_MS * (attempt + 1));

type Failure = { attempt: number; error: unknown };

/** Opens the app's database for everything inside it, and copes when it can't be opened. */
export function DatabaseGate({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // Failing to open is handled here, not thrown: a thrown error is reported even when the app
  // handles it (in development, as a red error screen). expo-sqlite calls this while it renders,
  // so the change waits a moment; a call left over from an earlier attempt doesn't count.
  const onError = useCallback(
    (error: Error) => {
      setTimeout(() => setFailure((f) => (f?.attempt === attempt ? f : { attempt, error })), 0);
    },
    [attempt],
  );
  const failed = failure?.attempt === attempt ? failure : null;
  return (
    <OpenFailed attempt={attempt} onRetry={retry}>
      {failed ? (
        <CannotOpen error={failed.error} attempt={attempt} onRetry={retry} />
      ) : (
        <SQLiteProvider key={attempt} databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded} onError={onError}>
          <CloseWhenLeaving />
          {children}
        </SQLiteProvider>
      )}
    </OpenFailed>
  );
}

/**
 * On the web, lets go of the database as the page goes away (reload, closing the tab, leaving
 * for Google sign-in), so the page that opens next can have it at once instead of waiting for
 * this one to be cleaned up. A page brought back from the browser's cache reloads, as its
 * database is closed.
 */
function CloseWhenLeaving() {
  const db = useSQLiteContext();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const leave = () => {
      try {
        db.closeSync();
      } catch {
        // Already closed.
      }
    };
    const back = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', back);
    return () => {
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('pageshow', back);
    };
  }, [db]);
  return null;
}

type BoundaryProps = { attempt: number; onRetry: () => void; children: ReactNode };

class OpenFailed extends Component<BoundaryProps, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidUpdate(prev: BoundaryProps) {
    // A retry remounts the database; clear the error so it can open again.
    if (prev.attempt !== this.props.attempt && this.state.error !== null) this.setState({ error: null });
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return <CannotOpen error={this.state.error} attempt={this.props.attempt} onRetry={this.props.onRetry} />;
  }
}

function CannotOpen({ error, attempt, onRetry }: { error: unknown; attempt: number; onRetry: () => void }) {
  const inUse = isDatabaseInUse(error);
  const retrying = inUse && attempt < AUTO_RETRIES;

  useEffect(() => {
    if (!retrying) return;
    const timer = setTimeout(onRetry, retryDelay(attempt));
    return () => clearTimeout(timer);
  }, [retrying, onRetry, attempt]);

  if (retrying) return null; // a moment's blank page, as while the database normally opens

  // Browsers only let a page store data at localhost or over https, not at an address like
  // http://192.168.1.5:8081 (Expo's "LAN" link).
  if (Platform.OS === 'web' && typeof window !== 'undefined' && !window.isSecureContext) {
    const here = new URL(window.location.href);
    const local = `http://localhost${here.port ? `:${here.port}` : ''}`;
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-page p-6">
        <View className="w-full max-w-md gap-2">
          <Text className="text-center text-xl font-extrabold text-ink">Open StudyMe at {local}</Text>
          <Text className="text-center text-base text-muted">
            Browsers only let StudyMe save your notes and cards at localhost or on a secure (https) address,
            not at {here.host}.
          </Text>
        </View>
        <Button label={`Open ${local}`} icon="open-outline" onPress={() => window.location.replace(`${local}${here.pathname}`)} />
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-page p-6">
      <View className="w-full max-w-md gap-2">
        <Text className="text-center text-xl font-extrabold text-ink">
          {inUse ? 'StudyMe is open in another tab' : "Your notes and cards couldn't be opened"}
        </Text>
        <Text className="text-center text-base text-muted">
          {inUse
            ? 'Your notes and cards can be open in only one tab at a time. Close the other StudyMe tab, then try again.'
            : Platform.OS === 'web'
              ? 'Reload the page to try again. If it keeps happening, close other StudyMe tabs and restart the browser.'
              : 'Close the app completely and open it again.'}
        </Text>
      </View>
      <Button label="Try again" icon="refresh" onPress={onRetry} />
    </View>
  );
}
