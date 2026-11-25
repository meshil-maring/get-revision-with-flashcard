import '../global.css';

import { Drawer } from 'expo-router/drawer';
import { SQLiteProvider } from 'expo-sqlite';

import { DATABASE_NAME, migrateDbIfNeeded } from '@/data/db';
import { useWideScreen } from '@/lib/use-wide-screen';

// Left sidebar navigation. To add a section: create a route in src/app/
// (a file like notes.tsx, or a group folder with its own Stack like (revision)/)
// and add a <Drawer.Screen> for it below.
export default function RootLayout() {
  const wide = useWideScreen();

  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
      <Drawer
        screenOptions={{
          drawerType: wide ? 'permanent' : 'front',
          drawerActiveTintColor: '#4f46e5',
          drawerActiveBackgroundColor: '#eef2ff',
          drawerInactiveTintColor: '#334155',
          drawerStyle: { width: 240 },
          // Hide the menu button when the sidebar is always visible.
          headerLeft: wide ? () => null : undefined,
        }}
      >
        <Drawer.Screen
          name="(revision)"
          options={{
            title: 'Revision',
            // The revision section has its own Stack header.
            headerShown: false,
          }}
        />
        <Drawer.Screen name="notes" options={{ title: 'Notes' }} />
      </Drawer>
    </SQLiteProvider>
  );
}
