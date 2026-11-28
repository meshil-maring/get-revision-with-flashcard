import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InkCanvas, InkToolbar, useFullScreen, useInkEditor, useInkSheets } from '@/components/notes/handwriting';
import { textbookBody } from '@/components/notes/textbook-note';
import { Icon, useColors } from '@/components/ui';
import { getNote } from '@/data/notes';
import { getNotePage, saveNotePage } from '@/data/note-pages';
import type { Note } from '@/data/types';
import { emptyInk, serializeSheets, type Ink } from '@/lib/ink';
import { buildTextbook, notePages, parseChapterTitle } from '@/lib/textbook';

/** Writing is saved this long after the pen stops. */
const SAVE_AFTER_MS = 700;

/**
 * A handwriting page for one heading or question of a note (tap "1 Learning objectives" in the
 * textbook view). URL: /note-page?noteId=…&page=…&title=… Saves as you write; Previous / Next
 * go to the pages of the headings and questions around it.
 */
export default function NotePageScreen() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const { noteId, page, title } = useLocalSearchParams<{ noteId: string; page: string; title?: string }>();
  const editor = useInkEditor();
  const sheets = useInkSheets(editor);
  const loadSheets = sheets.load;
  const fullScreen = useFullScreen();
  const full = fullScreen.on;
  const [note, setNote] = useState<Note | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(true);

  // What was last saved, and what is on the page now, so leaving the screen can save the rest.
  const lastSaved = useRef('');
  const latest = useRef<{ sheets: Ink[]; title: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [n, saved] = await Promise.all([getNote(db, noteId), getNotePage(db, noteId, page)]);
      if (cancelled) return;
      const start = saved ?? [emptyInk()];
      loadSheets(start);
      lastSaved.current = serializeSheets(start);
      setNote(n);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, noteId, page, loadSheets]);

  // The note's headings and questions, in order, for Previous / Next.
  const siblings = useMemo(() => {
    if (!note) return [];
    return notePages(buildTextbook(textbookBody(note), { chapter: parseChapterTitle(note.title).number }));
  }, [note]);
  const index = siblings.findIndex((s) => s.page === page);
  const here = index >= 0 ? siblings[index] : null;
  const heading = here?.title ?? title ?? 'Notes';
  const previous = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;

  // Save a moment after each change, and whatever is left when leaving.
  const all = sheets.all;
  const text = serializeSheets(all);
  useEffect(() => {
    if (!loaded) return;
    latest.current = { sheets: all, title: heading };
    if (text === lastSaved.current) return;
    setSaved(false);
    const timer = setTimeout(() => {
      lastSaved.current = text;
      void saveNotePage(db, noteId, page, heading, all).then(() => setSaved(true));
    }, SAVE_AFTER_MS);
    return () => clearTimeout(timer);
    // `all` changes whenever `text` does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, loaded, db, noteId, page, heading]);

  useEffect(
    () => () => {
      const now = latest.current;
      if (now && serializeSheets(now.sheets) !== lastSaved.current) void saveNotePage(db, noteId, page, now.title, now.sheets);
    },
    [db, noteId, page],
  );

  const go = (to: { page: string; title: string }) =>
    router.replace({ pathname: '/note-page', params: { noteId, page: to.page, title: to.title } });

  return (
    <View className="flex-1 bg-page" style={full ? { paddingTop: insets.top } : undefined}>
      {/* Full screen: just the tools and the page, without the header, titles or Previous / Next. */}
      <Stack.Screen options={{ title: heading, headerShown: !full }} />
      {full ? <StatusBar hidden /> : null}
      {loaded ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName={full ? 'w-full gap-2 px-2 pb-6' : 'w-full max-w-3xl self-center gap-3 px-4 pb-8 pt-1'}
          // While writing, touches on the page draw instead of scrolling; the hand tool scrolls.
          scrollEnabled={editor.tool === 'hand'}
          stickyHeaderIndices={[full ? 0 : 1]}
        >
          {full ? null : (
            <View className="gap-0.5 px-1">
              {note ? (
                <Text className="text-xs font-bold uppercase tracking-wider text-muted" numberOfLines={1}>
                  {note.title}
                </Text>
              ) : null}
              <Text accessibilityRole="header" className="text-xl font-extrabold text-ink" numberOfLines={3}>
                {heading}
              </Text>
            </View>
          )}
          <View className="bg-page py-1">
            <InkToolbar editor={editor} sheets={sheets} fullScreen={fullScreen} />
          </View>
          <InkCanvas editor={editor} />
          <Text className="text-center text-xs text-muted" accessibilityLiveRegion="polite">
            {saved ? 'Saved' : 'Saving…'}
          </Text>
        </ScrollView>
      ) : null}

      {!full && (previous || next) ? (
        <View className="border-t border-line bg-card px-4 pt-2" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
          <View className="w-full max-w-3xl flex-row items-center gap-2 self-center">
            <PageStep label="Previous" target={previous} onPress={go} />
            <Text className="text-xs font-semibold text-muted">
              {index + 1} / {siblings.length}
            </Text>
            <PageStep label="Next" target={next} onPress={go} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PageStep({
  label,
  target,
  onPress,
}: {
  label: 'Previous' | 'Next';
  target: { page: string; title: string } | null;
  onPress: (to: { page: string; title: string }) => void;
}) {
  const colors = useColors();
  const forward = label === 'Next';
  return (
    <Pressable
      onPress={target ? () => onPress(target) : undefined}
      disabled={!target}
      accessibilityRole="button"
      accessibilityLabel={target ? `${label}: ${target.title}` : `No ${label.toLowerCase()} heading`}
      accessibilityState={{ disabled: !target }}
      className={`min-h-11 flex-1 flex-row items-center gap-1 rounded-xl px-2 active:bg-surface ${target ? '' : 'opacity-30'}`}
    >
      {forward ? null : <Icon name="chevron-back" size={22} color={colors.primary} />}
      <View className={`flex-1 ${forward ? 'items-end' : ''}`}>
        <Text className="text-xs font-bold uppercase tracking-wider text-muted">{label}</Text>
        <Text className={`text-sm font-semibold text-ink ${forward ? 'text-right' : ''}`} numberOfLines={1}>
          {target?.title ?? '—'}
        </Text>
      </View>
      {forward ? <Icon name="chevron-forward" size={22} color={colors.primary} /> : null}
    </Pressable>
  );
}
