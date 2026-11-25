import { Text, View } from 'react-native';

import { colors, Icon } from '@/components/ui';
import { COMING_SOON, type ComingSoonFeature } from '@/lib/coming-soon';

/** Placeholder for a feature in the design that isn't built yet. */
export function ComingSoon({ feature }: { feature: ComingSoonFeature }) {
  const { title, icon, text } = COMING_SOON[feature];
  return (
    <View className="flex-1 items-center justify-center bg-page px-8">
      <View className="mb-6 h-24 w-24 items-center justify-center rounded-3xl bg-brand">
        <Icon name={icon} size={44} color={colors.white} />
      </View>
      <Text className="mb-2 text-center text-2xl font-bold text-ink">{title}</Text>
      <View className="mb-4 rounded-full bg-peach px-3 py-1">
        <Text className="text-xs font-bold uppercase tracking-wider text-brand">Coming soon</Text>
      </View>
      <Text className="max-w-xs text-center text-base leading-6 text-muted">{text}</Text>
    </View>
  );
}
