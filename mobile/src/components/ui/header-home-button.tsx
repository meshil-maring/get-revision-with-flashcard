import { router } from 'expo-router';
import { Platform, Pressable } from 'react-native';

import { Icon, useColors } from '@/components/ui';

/**
 * The header's back button for a screen with nothing behind it: on the web, one opened from a
 * link, refreshed, or returned to after Google sign-in (which reloads the page). Goes Home.
 */
export function HeaderHomeButton() {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => router.replace('/')}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Back to Home"
      className="h-11 w-11 items-center justify-center rounded-full active:bg-surface"
      style={Platform.OS === 'web' ? { marginLeft: 4 } : undefined}
    >
      <Icon name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} size={24} color={colors.ink} />
    </Pressable>
  );
}
