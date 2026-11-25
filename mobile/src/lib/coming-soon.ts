import type { Href } from 'expo-router';

import type { IconName } from '@/components/ui';

// Features in the design that aren't built yet. Each opens a "Coming soon" screen.
export const COMING_SOON = {
  ai: {
    title: 'Ask AI',
    icon: 'sparkles-outline',
    text: 'Soon you can ask AI to write notes or make flashcards for any topic.',
  },
  'ai-study': {
    title: 'AI Study',
    icon: 'chatbubble-ellipses-outline',
    text: 'Soon an AI tutor will quiz you and explain what you got wrong.',
  },
  notes: {
    title: 'Notes',
    icon: 'document-text-outline',
    text: 'Soon you can write study notes here and turn them into flashcards.',
  },
  notifications: {
    title: 'Notifications',
    icon: 'notifications-outline',
    text: 'Soon you’ll get reminders when it’s time to revise.',
  },
  profile: {
    title: 'Profile',
    icon: 'person-outline',
    text: 'Soon you can sign in to back up your decks and use them on any device.',
  },
} satisfies Record<string, { title: string; icon: IconName; text: string }>;

export type ComingSoonFeature = keyof typeof COMING_SOON;

export function comingSoonHref(feature: ComingSoonFeature): Href {
  return { pathname: '/coming-soon', params: { feature } };
}
