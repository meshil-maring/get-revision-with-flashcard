import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';

import { TabBar } from '@/components/ui/tab-bar';
import { colors } from '@/components/ui';
import { hasSeenWelcome } from '@/data/settings';

// Bottom tabs. The order here is the order in the tab bar; "create" is the
// round + button in the middle (it opens a menu instead of a screen).
export default function TabsLayout() {
  const db = useSQLiteContext();

  // First launch: show the welcome tour once.
  useEffect(() => {
    hasSeenWelcome(db).then((seen) => {
      if (!seen) router.push('/welcome');
    });
  }, [db]);

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.page } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="notes" options={{ title: 'Notes' }} />
      <Tabs.Screen name="create" options={{ title: 'Create' }} />
      <Tabs.Screen name="flashcards" options={{ title: 'Flashcards' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
