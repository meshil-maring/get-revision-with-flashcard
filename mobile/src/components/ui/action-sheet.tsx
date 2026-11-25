import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, Icon, scaled, type IconName } from '@/components/ui';

export type SheetAction = { icon: IconName; label: string; onPress: () => void; tone?: 'default' | 'danger' };

/** A short list of actions that slides up from the bottom, e.g. Rename / Delete for a folder. */
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} accessibilityLabel="Close menu" />
      <View className="rounded-t-3xl bg-page px-5 pt-3" style={{ paddingBottom: insets.bottom + scaled(16) }}>
        <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-line" />
        <Text className="mb-3 text-xl font-bold text-ink" numberOfLines={1}>
          {title}
        </Text>
        <View className="gap-2">
          {actions.map((action) => {
            const danger = action.tone === 'danger';
            return (
              <Pressable
                key={action.label}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
                accessibilityRole="button"
                className="flex-row items-center gap-4 rounded-2xl bg-surface p-4 active:bg-line"
              >
                <Icon name={action.icon} size={24} color={danger ? colors.alert : colors.ink} />
                <Text className={`text-base font-semibold ${danger ? 'text-alert' : 'text-ink'}`}>{action.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}
