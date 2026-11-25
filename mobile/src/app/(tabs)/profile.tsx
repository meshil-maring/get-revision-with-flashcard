import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComingSoon } from '@/components/coming-soon';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-page" style={{ paddingTop: insets.top }}>
      <ComingSoon feature="profile" />
    </View>
  );
}
