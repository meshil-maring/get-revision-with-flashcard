import { Pressable, TextInput, View, type TextStyle } from 'react-native';

import { Icon, useColors } from '@/components/ui';

const NO_WEB_FOCUS_RING = { outlineStyle: 'none' } as unknown as TextStyle;

/** A rounded search field with a clear (×) button once something is typed. */
export function SearchBox({
  value,
  onChangeText,
  placeholder,
  className = '',
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  className?: string;
}) {
  const colors = useColors();
  return (
    <View className={`flex-row items-center gap-2 rounded-2xl bg-surface px-4 ${className}`}>
      <Icon name="search" size={22} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        style={NO_WEB_FOCUS_RING}
        className="flex-1 py-3.5 text-base text-ink"
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
          <Icon name="close-circle" size={22} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
