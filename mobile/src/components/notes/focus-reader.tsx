import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, Text, View, type NativeScrollEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReadAloudButton, ReadAloudPlayer, type ReadAloud } from '@/components/notes/read-aloud';
import { RichText } from '@/components/ui/rich-text';
import { Icon, IconButton, useColors } from '@/components/ui';
import { getNoteFocusSize, NOTE_FOCUS_SIZES, setNoteFocusSize, type NoteFocusSize } from '@/data/settings';
import type { Note } from '@/data/types';
import { bodyWithoutTitle } from '@/lib/notes';

const TITLE_SIZE: Record<NoteFocusSize, string> = {
  base: 'text-2xl',
  lg: 'text-3xl',
  xl: 'text-4xl',
};

const CUE_SIZE: Record<NoteFocusSize, string> = {
  base: 'text-lg',
  lg: 'text-xl',
  xl: 'text-2xl',
};

/**
 * Focus mode: just the note, nothing else on screen. Bigger text that can be
 * resized, a thin progress line while scrolling, and for Cornell notes a way to
 * cover the notes and test yourself from the cues. It can also read the note
 * aloud, and step to the previous or next note in the folder (`footer`).
 */
export function FocusReader({
  note,
  onExit,
  readAloud,
  footer,
  after,
}: {
  note: Note;
  onExit: () => void;
  readAloud?: ReadAloud;
  footer?: ReactNode;
  /** Shown after the note, e.g. its images that the text doesn't place itself. */
  after?: ReactNode;
}) {
  const colors = useColors();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<NoteFocusSize>('lg');
  const [progress, setProgress] = useState(0);
  const [covered, setCovered] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const cornell = note.style === 'cornell';
  const step = NOTE_FOCUS_SIZES.indexOf(size);

  useEffect(() => {
    getNoteFocusSize(db)
      .then(setSize)
      .catch(() => {}); // keep the default if settings can't be read
  }, [db]);

  // Android back button and Escape on the web leave focus mode, not the note.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onExit();
      return true;
    });
    let onKey: ((e: KeyboardEvent) => void) | undefined;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      onKey = (e) => {
        if (e.key === 'Escape') onExit();
      };
      document.addEventListener('keydown', onKey);
    }
    return () => {
      sub.remove();
      if (onKey) document.removeEventListener('keydown', onKey);
    };
  }, [onExit]);

  function resize(by: number) {
    const next = NOTE_FOCUS_SIZES[step + by];
    if (!next) return;
    setSize(next);
    setNoteFocusSize(db, next).catch(() => {});
  }

  function toggleCovered() {
    setCovered((c) => !c);
    setRevealed(new Set());
  }

  function reveal(i: number) {
    setRevealed((prev) => new Set(prev).add(i));
  }

  function onScroll({ nativeEvent }: { nativeEvent: NativeScrollEvent }) {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
    const room = contentSize.height - layoutMeasurement.height;
    setProgress(room > 0 ? Math.min(1, Math.max(0, contentOffset.y / room)) : 1);
  }

  return (
    <View className="flex-1 bg-card" style={{ paddingTop: insets.top }}>
      <View className="w-full max-w-3xl flex-row items-center self-center px-2">
        <IconButton icon="close" label="Exit focus mode" onPress={onExit} />
        <View className="flex-1" />
        {readAloud ? <ReadAloudButton speaking={readAloud.open} onPress={readAloud.toggle} /> : null}
        {cornell && note.rows.length > 0 ? (
          <Pressable
            onPress={toggleCovered}
            accessibilityRole="switch"
            accessibilityState={{ checked: covered }}
            accessibilityLabel="Cover notes to test yourself"
            className={`mr-1 flex-row items-center gap-1.5 rounded-full px-3 py-2 ${
              covered ? 'bg-calm' : 'bg-surface active:bg-line'
            }`}
          >
            <Icon name={covered ? 'eye-off-outline' : 'eye-outline'} size={18} color={covered ? colors.white : colors.muted} />
            <Text className={`text-sm font-semibold ${covered ? 'text-white' : 'text-muted'}`}>
              {covered ? 'Notes covered' : 'Cover notes'}
            </Text>
          </Pressable>
        ) : null}
        <SizeButton label="Smaller text" glyph="A" small disabled={step === 0} onPress={() => resize(-1)} />
        <SizeButton
          label="Larger text"
          glyph="A"
          disabled={step === NOTE_FOCUS_SIZES.length - 1}
          onPress={() => resize(1)}
        />
      </View>

      <View className="h-0.5 w-full bg-surface" accessibilityLabel={`Read ${Math.round(progress * 100)}%`}>
        <View className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
      </View>

      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerClassName="w-full max-w-2xl self-center gap-6 px-7 pt-8"
        contentContainerStyle={{ paddingBottom: footer ? 32 : Math.max(insets.bottom, 16) + 48 }}
      >
        <Text className={`${TITLE_SIZE[size]} font-extrabold text-ink`}>{note.title}</Text>

        {cornell ? (
          <>
            {note.rows.map((row, i) => {
              const hidden = covered && !revealed.has(i);
              return (
                <View key={i} className="gap-2">
                  <Text className={`${CUE_SIZE[size]} font-bold text-primary`}>{row.cue}</Text>
                  {hidden ? (
                    <Pressable
                      onPress={() => reveal(i)}
                      accessibilityRole="button"
                      accessibilityLabel={`Show notes for ${row.cue}`}
                      className="rounded-2xl border border-dashed border-line bg-surface p-5 active:bg-line"
                    >
                      <Text className="text-center text-base text-muted">Recall it, then tap to check</Text>
                    </Pressable>
                  ) : (
                    <RichText text={row.notes} size={size} />
                  )}
                </View>
              );
            })}
            {note.summary ? (
              <View className="gap-2 border-t border-line pt-6">
                <Text className="text-sm font-bold uppercase tracking-wider text-calm">Summary</Text>
                <RichText text={note.summary} size={size} />
              </View>
            ) : null}
          </>
        ) : (
          <RichText text={bodyWithoutTitle(note.body, note.title)} size={size} />
        )}
        {after}
      </ScrollView>

      {footer || readAloud?.open ? (
        <View className="gap-3 border-t border-line px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          {readAloud ? <ReadAloudPlayer readAloud={readAloud} /> : null}
          {footer}
        </View>
      ) : null}
    </View>
  );
}

function SizeButton({
  label,
  glyph,
  small = false,
  disabled,
  onPress,
}: {
  label: string;
  glyph: string;
  small?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className="h-12 w-12 items-center justify-center rounded-full active:bg-surface"
    >
      <Text className={`font-bold ${small ? 'text-base' : 'text-2xl'} ${disabled ? 'text-line' : 'text-muted'}`}>
        {glyph}
      </Text>
    </Pressable>
  );
}
