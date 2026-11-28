import { Pressable, Text, View } from 'react-native';

import { Icon, type IconName, useColors } from '@/components/ui';

/** The tick circle on a row in select mode. */
export function Tick({ picked }: { picked: boolean }) {
  const colors = useColors();
  return (
    <View className="h-11 w-11 items-center justify-center">
      <Icon name={picked ? 'checkmark-circle' : 'ellipse-outline'} size={30} color={picked ? colors.primary : colors.faint} />
    </View>
  );
}

/** A button in the bar at the bottom of select mode. */
export function SelectBarButton({
  icon,
  label,
  onPress,
  disabled,
  danger = false,
  accessibilityLabel,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled: boolean;
  danger?: boolean;
  /** When the label alone isn't clear, e.g. "Study selected cards". */
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const color = disabled ? colors.faint : danger ? colors.alert : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      className="flex-1 items-center gap-1 rounded-2xl bg-surface py-2.5 active:bg-line"
    >
      <Icon name={icon} size={24} color={color} />
      <Text className="text-sm font-semibold" style={{ color }}>
        {label}
      </Text>
    </Pressable>
  );
}
