import '../global.css';

import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';

import { DATABASE_NAME, migrateDbIfNeeded } from '@/data/db';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'My Decks' }} />
      </Stack>
    </SQLiteProvider>
  );
}
