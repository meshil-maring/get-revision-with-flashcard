import '../global.css';

import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/components/ui';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/data/db';
import { headerOptions } from '@/lib/header-options';

// The bottom tabs (Home, Notes, Flashcards, Profile) live in (tabs)/.
// Screens opened from them (a deck, a study session…) are stacked on top here,
// so the tab bar is hidden while studying.
export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ ...headerOptions, contentStyle: { backgroundColor: colors.page } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="new-revision" options={{ title: 'Create Revision' }} />
        <Stack.Screen name="coming-soon" options={{ title: '' }} />
      </Stack>
    </SQLiteProvider>
  );
}
