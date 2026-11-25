import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, Icon, scaled, type IconName } from '@/components/ui';
import { comingSoonHref } from '@/lib/coming-soon';

type MenuItem = { icon: IconName; title: string; subtitle: string; href: Href; soon?: boolean };

// The More tab. Add new pages here as the app grows.
const SECTIONS: { title: string; items: MenuItem[] }[] = [
  {
    title: 'Account',
    items: [
      {
        icon: 'person-outline',
        title: 'Account',
        subtitle: 'Sign in, back up and sync your decks and notes',
        href: '/account',
      },
      {
        icon: 'sparkles-outline',
        title: 'Connect AI',
        subtitle: 'Let ChatGPT or Claude make notes and flashcards for you',
        href: '/connect-ai',
      },
    ],
  },
  {
    title: 'Study',
    items: [
      {
        icon: 'git-merge-outline',
        title: 'Create revision',
        subtitle: 'Mix several decks into one session',
        href: '/new-revision',
      },
      {
        icon: 'star-outline',
        title: 'Favourite cards',
        subtitle: 'Cards you starred, grouped by deck',
        href: '/favorites',
      },
      {
        icon: 'chatbubble-ellipses-outline',
        title: 'AI Study',
        subtitle: 'An AI tutor that quizzes you',
        href: comingSoonHref('ai-study'),
        soon: true,
      },
    ],
  },
  {
    title: 'Help',
    items: [
      {
        icon: 'book-outline',
        title: 'Help & guide',
        subtitle: 'Read how every feature works',
        href: '/help',
      },
      {
        icon: 'compass-outline',
        title: 'App tour',
        subtitle: 'A quick walk through how NoteMe works',
        href: '/welcome',
      },
    ],
  },
  {
    title: 'App',
    items: [
      {
        icon: 'notifications-outline',
        title: 'Notifications',
        subtitle: 'Reminders to keep your streak',
        href: comingSoonHref('notifications'),
        soon: true,
      },
      {
        icon: 'settings-outline',
        title: 'Settings',
        subtitle: 'Study options and appearance',
        href: comingSoonHref('settings'),
        soon: true,
      },
    ],
  },
];

export default function MoreScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="w-full max-w-3xl self-center px-5 pb-8"
      contentContainerStyle={{ paddingTop: insets.top + scaled(16) }}
    >
      <Text className="mb-6 text-3xl font-extrabold text-ink">More</Text>

      {SECTIONS.map((section) => (
        <View key={section.title} className="mb-6">
          <Text className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">
            {section.title}
          </Text>
          <View className="overflow-hidden rounded-3xl bg-surface">
            {section.items.map((item, i) => (
              <Pressable
                key={item.title}
                onPress={() => router.push(item.href)}
                accessibilityRole="button"
                className={`flex-row items-center gap-4 p-4 active:bg-line ${
                  i > 0 ? 'border-t border-line' : ''
                }`}
              >
                <View className="h-11 w-11 items-center justify-center rounded-xl bg-primary">
                  <Icon name={item.icon} size={22} color={colors.white} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-base font-bold text-ink">{item.title}</Text>
                    {item.soon ? (
                      <View className="rounded-full bg-calm-soft px-2 py-0.5">
                        <Text className="text-xs font-semibold text-calm">Soon</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="text-sm text-muted">{item.subtitle}</Text>
                </View>
                <Icon name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
