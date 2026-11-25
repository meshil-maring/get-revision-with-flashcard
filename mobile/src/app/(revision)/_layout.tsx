import { Stack } from 'expo-router';
import { DrawerToggleButton } from 'expo-router/drawer';

import { useWideScreen } from '@/lib/use-wide-screen';

// Flashcard revision: decks → deck → study.
export default function RevisionLayout() {
  const wide = useWideScreen();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'My Decks',
          headerLeft: wide ? undefined : () => <DrawerToggleButton />,
        }}
      />
    </Stack>
  );
}
