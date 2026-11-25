import '../global.css';

import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/components/ui';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/data/db';
import { AccountProvider } from '@/providers/account';
import { headerOptions } from '@/lib/header-options';

// The bottom tabs (Home, Notes, Flashcards, More) live in (tabs)/.
// Screens opened from them (a deck, a study session…) are stacked on top here,
// so the tab bar is hidden while studying.
export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
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
          <Stack.Screen name="folder/[id]" options={{ title: '' }} />
          <Stack.Screen name="note/[id]" options={{ title: '' }} />
          <Stack.Screen name="tag/[id]" options={{ title: '' }} />
          <Stack.Screen name="note-editor" options={{ title: '', presentation: 'modal' }} />
          <Stack.Screen name="note-cards" options={{ title: 'Make flashcards', presentation: 'modal' }} />
        </Stack>
      </AccountProvider>
    </SQLiteProvider>
  );
}
