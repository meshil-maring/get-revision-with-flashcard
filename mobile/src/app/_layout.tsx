import '../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { DatabaseGate } from '@/components/database-gate';
import { colors } from '@/components/ui';
import { AccountProvider } from '@/providers/account';
import { QueryProvider } from '@/providers/query';
import { headerOptions } from '@/lib/header-options';
import { moveToLocalhostIfNeeded } from '@/lib/dev-host';

// Development on the web: 127.0.0.1 can't reach the localhost server, so switch (lib/dev-host.ts).
moveToLocalhostIfNeeded();

// The bottom tabs (Home, Notes, Flashcards, More) live in (tabs)/.
// Screens opened from them (a deck, a study session…) are stacked on top here,
// so the tab bar is hidden while studying.
export default function RootLayout() {
  return (
    // The local database (data/db.ts); copes with it being open in another browser tab.
    <DatabaseGate>
      {/* Cache for server data — not for decks and notes, which are local (services/queries.ts). */}
      <QueryProvider>
        {/* Signed-in user and sync with their account (providers/account.tsx). */}
        <AccountProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ ...headerOptions, contentStyle: { backgroundColor: colors.page } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="new-revision" options={{ title: 'Create Revision' }} />
            <Stack.Screen
              name="welcome"
              options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
            />
            <Stack.Screen name="help" options={{ title: 'Help & guide' }} />
            <Stack.Screen name="help/[topic]" options={{ title: 'Help' }} />
            <Stack.Screen name="favorites" options={{ title: 'Favourites' }} />
            <Stack.Screen name="card-editor" options={{ title: '', presentation: 'modal' }} />
            <Stack.Screen name="coming-soon" options={{ title: '' }} />
            <Stack.Screen name="account" options={{ title: 'Account' }} />
            <Stack.Screen name="connect-ai" options={{ title: 'Connect AI' }} />
            <Stack.Screen name="folder/[id]" options={{ title: '' }} />
            <Stack.Screen name="note/[id]" options={{ title: '' }} />
            <Stack.Screen name="tag/[id]" options={{ title: '' }} />
            <Stack.Screen name="note-editor" options={{ title: '', presentation: 'modal' }} />
            <Stack.Screen name="note-cards" options={{ title: 'Make flashcards', presentation: 'modal' }} />
          </Stack>
        </AccountProvider>
      </QueryProvider>
    </DatabaseGate>
  );
}
