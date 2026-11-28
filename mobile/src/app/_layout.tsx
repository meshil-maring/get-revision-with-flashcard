import '../global.css';

import { Stack, useCanGoBack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useUniwind } from 'uniwind';

import { DatabaseGate } from '@/components/database-gate';
import { HeaderHomeButton } from '@/components/ui/header-home-button';
import { useColors } from '@/components/ui';
import { FocusSoundProvider } from '@/providers/focus-sound';
import { ReadingSizeProvider } from '@/providers/reading-size';
import { ThemeProvider } from '@/providers/theme';
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
  const colors = useColors();
  const { theme } = useUniwind();
  // False when the screen showing was opened straight from a link (nothing behind it).
  const canGoBack = useCanGoBack();
  return (
    // The local database (data/db.ts); copes with it being open in another browser tab.
    <DatabaseGate>
      {/* Cache for server data — not for decks and notes, which are local (services/queries.ts). */}
      <QueryProvider>
        {/* Signed-in user and sync with their account (providers/account.tsx). */}
        <AccountProvider>
          {/* Light or dark colours, from Settings → Appearance (providers/theme.tsx). */}
          <ThemeProvider>
            {/* Text size for notes and flashcards, from Settings (providers/reading-size.tsx). */}
            <ReadingSizeProvider>
              {/* Music / rain to study to; keeps playing across screens (providers/focus-sound.tsx). */}
              <FocusSoundProvider>
              <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
              <Stack
                screenOptions={{
                  ...headerOptions(colors),
                  contentStyle: { backgroundColor: colors.page },
                  // A screen opened straight from a link (or after Google sign-in on the web) has
                  // nothing to go back to, so its back button goes Home instead of disappearing.
                  ...(canGoBack ? {} : { headerLeft: () => <HeaderHomeButton /> }),
                }}
              >
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
                <Stack.Screen name="settings" options={{ title: 'Settings' }} />
                <Stack.Screen name="connect-ai" options={{ title: 'Connect AI' }} />
                <Stack.Screen name="folder/[id]" options={{ title: '' }} />
                <Stack.Screen name="note/[id]" options={{ title: '' }} />
                <Stack.Screen name="tag/[id]" options={{ title: '' }} />
                <Stack.Screen name="note-editor" options={{ title: '', presentation: 'modal' }} />
                <Stack.Screen name="note-cards" options={{ title: 'Make flashcards', presentation: 'modal' }} />
              </Stack>
              </FocusSoundProvider>
            </ReadingSizeProvider>
          </ThemeProvider>
        </AccountProvider>
      </QueryProvider>
    </DatabaseGate>
  );
}
