import { Stack, useLocalSearchParams } from 'expo-router';

import { ComingSoon } from '@/components/ui/coming-soon';
import { COMING_SOON, type ComingSoonFeature } from '@/lib/coming-soon';

/** URL: /coming-soon?feature=ai */
export default function ComingSoonScreen() {
  const { feature } = useLocalSearchParams<{ feature?: string }>();
  const key: ComingSoonFeature = feature && feature in COMING_SOON ? (feature as ComingSoonFeature) : 'ai';
  return (
    <>
      <Stack.Screen options={{ title: COMING_SOON[key].title }} />
      <ComingSoon feature={key} />
    </>
  );
}
