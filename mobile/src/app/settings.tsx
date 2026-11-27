import { Pressable, ScrollView, Text, View } from 'react-native';

import { Icon, type IconName, useColors } from '@/components/ui';
import { RichText } from '@/components/ui/rich-text';
import type { ReadingSize, ThemePreference } from '@/data/settings';
import { useReadingSizeSetting } from '@/providers/reading-size';
import { useThemePreference } from '@/providers/theme';

const THEMES: { value: ThemePreference; icon: IconName; title: string; subtitle: string }[] = [
  { value: 'system', icon: 'phone-portrait-outline', title: 'Same as phone', subtitle: "Follows your phone's light or dark mode" },
  { value: 'light', icon: 'sunny-outline', title: 'Light', subtitle: 'Dark text on a light background' },
  { value: 'dark', icon: 'moon-outline', title: 'Dark', subtitle: 'Light text on a dark background, easier at night' },
];

/** The text size choices; the "A" on each grows with the size. */
const TEXT_SIZES: { value: ReadingSize; label: string; glyph: string }[] = [
  { value: 'sm', label: 'Small', glyph: 'text-sm' },
  { value: 'base', label: 'Medium', glyph: 'text-lg' },
  { value: 'lg', label: 'Large', glyph: 'text-2xl' },
  { value: 'xl', label: 'Extra large', glyph: 'text-3xl' },
];

const PREVIEW = '## Photosynthesis\nPlants turn **light**, water and carbon dioxide into sugar and oxygen.';

/** URL: /settings — how the app looks. */
export default function SettingsScreen() {
  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="w-full max-w-xl self-center p-5 gap-6">
      <ThemeSection />
      <TextSizeSection />
    </ScrollView>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text className="px-1 text-xs font-bold uppercase tracking-wider text-muted">{children}</Text>;
}

function ThemeSection() {
  const colors = useColors();
  const { preference, setPreference } = useThemePreference();
  return (
    <View className="gap-2">
      <SectionTitle>Appearance</SectionTitle>
      <View className="overflow-hidden rounded-3xl bg-surface" accessibilityRole="radiogroup" accessibilityLabel="Theme">
        {THEMES.map((theme, i) => {
          const selected = preference === theme.value;
          return (
            <Pressable
              key={theme.value}
              onPress={() => void setPreference(theme.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={theme.title}
              className={`flex-row items-center gap-4 p-4 active:bg-line ${i > 0 ? 'border-t border-line' : ''}`}
            >
              <View
                className={`h-11 w-11 items-center justify-center rounded-xl ${selected ? 'bg-primary' : 'bg-card'}`}
              >
                <Icon name={theme.icon} size={22} color={selected ? colors.white : colors.muted} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-ink">{theme.title}</Text>
                <Text className="text-sm text-muted">{theme.subtitle}</Text>
              </View>
              <Icon
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={24}
                color={selected ? colors.primary : colors.faint}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TextSizeSection() {
  const { size, setSize } = useReadingSizeSetting();
  return (
    <View className="gap-2">
      <SectionTitle>Text size</SectionTitle>
      <View className="gap-4 rounded-3xl bg-surface p-4">
        <Text className="text-sm text-muted">For reading notes and flashcards. Focus mode has its own A− / A+ buttons.</Text>
        <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel="Text size">
          {TEXT_SIZES.map((option) => {
            const selected = size === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => void setSize(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={option.label}
                className={`flex-1 items-center justify-end gap-1 rounded-2xl border px-1 py-3 ${
                  selected ? 'border-primary bg-primary-soft' : 'border-line bg-card active:bg-line'
                }`}
              >
                <Text className={`${option.glyph} font-extrabold ${selected ? 'text-primary' : 'text-ink'}`}>A</Text>
                <Text
                  className={`text-center text-xs font-semibold ${selected ? 'text-primary' : 'text-muted'}`}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {/* Uses the picked size, so the change shows straight away. */}
        <View className="rounded-2xl border border-line bg-card p-4" accessibilityLabel="Preview">
          <RichText text={PREVIEW} />
        </View>
      </View>
    </View>
  );
}
