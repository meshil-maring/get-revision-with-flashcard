import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, Icon, scaled, type IconName } from '@/components/ui';
import { comingSoonHref } from '@/lib/coming-soon';

// Icons per tab route (outline when inactive, filled when active).
const TAB_ICONS: Record<string, { icon: IconName; activeIcon: IconName }> = {
  index: { icon: 'home-outline', activeIcon: 'home' },
  notes: { icon: 'document-text-outline', activeIcon: 'document-text' },
  flashcards: { icon: 'layers-outline', activeIcon: 'layers' },
  more: { icon: 'grid-outline', activeIcon: 'grid' },
};

/** The bottom bar: Home, Notes, [+], Flashcards, More. */
export function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <View
        className="flex-row items-center justify-around rounded-t-3xl border-t border-line bg-white px-2 pt-2"
        style={{ paddingBottom: Math.max(insets.bottom, 10) }}
      >
        {state.routes.map((route, index) => {
          if (route.name === 'create') {
            return (
              <Pressable
                key={route.key}
                onPress={() => setMenuOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Create"
                className="h-14 w-14 items-center justify-center rounded-2xl bg-cta active:bg-cta-dark"
              >
                <Icon name="add" size={32} color={colors.white} />
              </Pressable>
            );
          }

          const focused = state.index === index;
          const label = descriptors[route.key].options.title ?? route.name;
          const icons = TAB_ICONS[route.name];

          function onPress() {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              className={`min-w-16 items-center rounded-2xl px-3 py-2 ${focused ? 'bg-primary' : ''}`}
            >
              <Icon
                name={focused ? icons.activeIcon : icons.icon}
                size={32}
                color={focused ? colors.white : colors.muted}
              />
              <Text className={`mt-0.5 text-xs font-semibold ${focused ? 'text-white' : 'text-muted'}`}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <CreateMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

type MenuItem = { icon: IconName; title: string; subtitle: string; onPress: () => void };

/** The sheet that slides up from the + button. */
function CreateMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();

  const items: MenuItem[] = [
    {
      icon: 'layers-outline',
      title: 'New deck',
      subtitle: 'A set of flashcards for a subject',
      onPress: () => router.navigate({ pathname: '/flashcards', params: { new: 'deck' } }),
    },
    {
      icon: 'git-merge-outline',
      title: 'Create revision',
      subtitle: 'Mix several decks into one session',
      onPress: () => router.push('/new-revision'),
    },
    {
      icon: 'document-text-outline',
      title: 'New note',
      subtitle: 'Write study notes',
      onPress: () => router.push(comingSoonHref('notes')),
    },
    {
      icon: 'sparkles-outline',
      title: 'Ask AI',
      subtitle: 'Make notes or flashcards with AI',
      onPress: () => router.push(comingSoonHref('ai')),
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} accessibilityLabel="Close menu" />
      <View className="rounded-t-3xl bg-page px-5 pt-3" style={{ paddingBottom: insets.bottom + scaled(16) }}>
        <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-line" />
        <Text className="mb-3 text-xl font-bold text-ink">Create</Text>
        <View className="gap-2">
          {items.map((item) => (
            <Pressable
              key={item.title}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              accessibilityRole="button"
              className="flex-row items-center gap-4 rounded-2xl bg-surface p-4 active:bg-line"
            >
              <View className="h-11 w-11 items-center justify-center rounded-xl bg-primary">
                <Icon name={item.icon} size={22} color={colors.white} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-ink">{item.title}</Text>
                <Text className="text-sm text-muted">{item.subtitle}</Text>
              </View>
              <Icon name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}
