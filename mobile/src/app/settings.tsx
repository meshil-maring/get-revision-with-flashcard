import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Icon, type IconName, useColors } from '@/components/ui';
import { RichText } from '@/components/ui/rich-text';
import {
  getNoteViewDefault,
  setNoteViewDefault,
  type NoteViewDefault,
  type ReadingSize,
  type ThemePreference,
} from '@/data/settings';
import { useReadingSizeSetting } from '@/providers/reading-size';
import { useThemePreference } from '@/providers/theme';

const THEMES: { value: ThemePreference; icon: IconName; title: string; subtitle: string }[] = [
  { value: 'system', icon: 'phone-portrait-outline', title: 'Same as phone', subtitle: "Follows your phone's light or dark mode" },
  { value: 'light', icon: 'sunny-outline', title: 'Light', subtitle: 'Dark text on a light background' },
  { value: 'dark', icon: 'moon-outline', title: 'Dark', subtitle: 'Light text on a dark background, easier at night' },
];

const NOTE_VIEWS: { value: NoteViewDefault; icon: IconName; title: string; subtitle: string }[] = [
  { value: 'auto', icon: 'sparkles-outline', title: 'Automatic', subtitle: 'As a textbook when the note has maths, definitions or exercises' },
  { value: 'standard', icon: 'document-text-outline', title: 'Standard', subtitle: 'The usual note view' },
  { value: 'textbook', icon: 'school-outline', title: 'Textbook', subtitle: 'Numbered sections, typeset maths, contents' },
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
      <NoteViewSection />
    </ScrollView>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text className="px-1 text-xs font-bold uppercase tracking-wider text-muted">{children}</Text>;
}

function ThemeSection() {
  const { preference, setPreference } = useThemePreference();
  return (
    <View className="gap-2">
      <SectionTitle>Appearance</SectionTitle>
      <Choices label="Theme" options={THEMES} value={preference} onChange={(v) => void setPreference(v)} />
    </View>
  );
}

/** How notes open; each note can still be switched with the Textbook button at its top. */
function NoteViewSection() {
  const db = useSQLiteContext();
  const [value, setValue] = useState<NoteViewDefault>('auto');
  useEffect(() => {
    getNoteViewDefault(db)
      .then(setValue)
      .catch(() => {});
  }, [db]);
  const change = (next: NoteViewDefault) => {
    setValue(next);
    void setNoteViewDefault(db, next);
  };
  return (
    <View className="gap-2">
      <SectionTitle>Notes open as</SectionTitle>
      <Choices label="Notes open as" options={NOTE_VIEWS} value={value} onChange={change} />
      <Text className="px-1 text-sm text-muted">Switch any note with the Textbook button at its top; it remembers.</Text>
    </View>
  );
}

/** One choice from a list, as rows with an icon, a title and a radio button. */
function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; icon: IconName; title: string; subtitle: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const colors = useColors();
  return (
    <View className="overflow-hidden rounded-3xl bg-surface" accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option, i) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.title}
            className={`flex-row items-center gap-4 p-4 active:bg-line ${i > 0 ? 'border-t border-line' : ''}`}
          >
            <View
              className={`h-11 w-11 items-center justify-center rounded-xl ${selected ? 'bg-primary' : 'bg-card'}`}
            >
              <Icon name={option.icon} size={22} color={selected ? colors.white : colors.muted} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-ink">{option.title}</Text>
              <Text className="text-sm text-muted">{option.subtitle}</Text>
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
