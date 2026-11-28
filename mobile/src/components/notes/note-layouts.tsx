import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useColors } from '@/components/ui';
import { RichText, scaledText, useNoteFont, useReadingSize } from '@/components/ui/rich-text';
import type { Note } from '@/data/types';
import { noteSections, readingMinutes } from '@/lib/notes';
import { buildTextbook, pageKey } from '@/lib/textbook';

// How the two kinds of note look when reading them:
// - plain notes read like a clean article: big title, a short accent line, reading time,
//   a contents list for longer notes, and headings marked with a coloured bar (rich-text.tsx);
// - Cornell notes look like a classic printed Cornell sheet: ruled paper, cues on the left of a
//   red margin line, the title and date at the top, and the summary boxed at the bottom.

/** A contents list is shown from this many sections. */
const CONTENTS_FROM = 3;

/** The plain note's title, accent line and "4 min read · 3 sections". */
export function ArticleHeader({ title, body }: { title: string; body: string }) {
  const sections = noteSections(body).filter((s) => s.heading !== null).length;
  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="text-4xl font-extrabold leading-tight text-ink">
        {title}
      </Text>
      <View className="h-1 w-14 rounded-full bg-primary" />
      {body.trim() ? (
        <Text className="text-sm text-muted">
          {readingMinutes(body)} min read{sections > 0 ? ` · ${sections} ${sections === 1 ? 'section' : 'sections'}` : ''}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A plain note's text, section by section, with a contents list for longer notes. Tapping a
 * contents entry calls `onJump` with that section's place in the parent ScrollView's content
 * (this view must be a direct child of it).
 */
export function ArticleNote({
  body,
  onJump,
  writtenPages,
  onOpenPage,
}: {
  body: string;
  onJump?: (y: number) => void;
  /** Handwriting pages with writing on them (by key). */
  writtenPages?: ReadonlySet<string>;
  /** Tapping a heading (or its pen) opens its handwriting page. */
  onOpenPage?: (page: string, title: string) => void;
}) {
  const colors = useColors();
  const sections = noteSections(body);
  const pages = useSectionPages(body, onOpenPage !== undefined);
  const headed = sections.map((s, i) => ({ ...s, index: i })).filter((s) => s.heading !== null);
  // Where each part sits, to scroll to a section: this view in the ScrollView, the sections
  // inside this view, and each section inside those.
  const rootY = useRef(0);
  const listY = useRef(0);
  const sectionY = useRef<number[]>([]);

  return (
    <View className="gap-6" onLayout={(e) => (rootY.current = e.nativeEvent.layout.y)}>
      {headed.length >= CONTENTS_FROM ? (
        <View
          className="gap-1 rounded-2xl border-l-4 bg-card px-4 py-3"
          style={{ borderLeftColor: colors.headingBar }}
          accessibilityRole="summary"
        >
          <Text className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Contents</Text>
          {headed.map((s, n) => (
            <Pressable
              key={s.index}
              onPress={() => onJump?.(rootY.current + listY.current + (sectionY.current[s.index] ?? 0))}
              accessibilityRole="link"
              accessibilityLabel={`Go to ${s.heading}`}
              className="flex-row gap-2.5 rounded-lg py-1.5 active:bg-surface"
            >
              <Text className="w-5 text-right text-base font-bold text-primary">{n + 1}</Text>
              <Text className="flex-1 text-base text-ink" numberOfLines={2}>
                {s.heading}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View onLayout={(e) => (listY.current = e.nativeEvent.layout.y)}>
        {sections.map((s, i) => (
          <View
            key={i}
            onLayout={(e) => {
              sectionY.current[i] = e.nativeEvent.layout.y;
            }}
          >
            {pages?.[i] && onOpenPage ? (
              <HeadingWithPage
                text={s.text}
                title={s.heading ?? ''}
                written={writtenPages?.has(pages[i]!) ?? false}
                onOpen={() => onOpenPage(pages[i]!, s.heading ?? '')}
              />
            ) : (
              <RichText text={s.text} />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Each section heading's handwriting page key, the same as the textbook view gives it (so a page
 * written in one view opens from the other). Null for sections without a heading.
 */
function useSectionPages(body: string, enabled: boolean): (string | null)[] | null {
  return useMemo(() => {
    if (!enabled) return null;
    const sections = noteSections(body);
    const headingPages = buildTextbook(body).nodes.flatMap((n) => (n.kind === 'heading' && n.page ? [n.page] : []));
    let from = 0;
    return sections.map((s) => {
      if (s.heading === null) return null;
      const key = pageKey('h', s.heading);
      // The next heading with the same words; "h:example~2" is the second "Example".
      const at = headingPages.findIndex((p, i) => i >= from && (p === key || p.startsWith(`${key}~`)));
      if (at === -1) return key;
      from = at + 1;
      return headingPages[at];
    });
  }, [body, enabled]);
}

/** A section whose heading opens its handwriting page: tap the heading, or the pen beside it. */
function HeadingWithPage({ text, title, written, onOpen }: { text: string; title: string; written: boolean; onOpen: () => void }) {
  const colors = useColors();
  const newline = text.indexOf('\n');
  const headingLine = newline === -1 ? text : text.slice(0, newline);
  const rest = newline === -1 ? '' : text.slice(newline + 1);
  const label = written ? `Open your handwritten notes for ${title}` : `Write notes by hand for ${title}`;
  return (
    <>
      <View className="flex-row items-start gap-1">
        <Pressable onPress={onOpen} accessibilityHint="Opens a page to write notes by hand" className="flex-1 active:opacity-70">
          <RichText text={headingLine} />
        </Pressable>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={label}
          hitSlop={6}
          className="mt-1 h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: written ? colors.primary : 'transparent' }}
        >
          <MaterialCommunityIcons name="pencil-outline" size={20} color={written ? colors.white : colors.faint} />
        </Pressable>
      </View>
      {rest.trim() ? <RichText text={rest} /> : null}
    </>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A label above a column or the summary, in small blue-ink capitals. */
function SheetLabel({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.inkBlue }}>
      {children}
    </Text>
  );
}

/**
 * A Cornell note as a classic Cornell sheet: the title and date across the top, cues in the
 * left column, a red margin line, the notes on the right with a ruled line under each row,
 * and the summary in a box along the bottom.
 */
export function CornellPaper({ note }: { note: Note }) {
  // The paper and lines of the Cornell sheet, light or dark with the theme.
  const colors = useColors();
  // Cues grow and shrink with the notes (text size from Settings).
  const size = useReadingSize();
  const font = useNoteFont();
  const date = formatDate(note.updatedAt);
  return (
    <View
      className="overflow-hidden rounded-2xl border"
      style={{
        backgroundColor: colors.paper,
        borderColor: colors.paperEdge,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
      }}
    >
      {/* The top of the sheet: title and date over a double ink line. */}
      <View className="flex-row flex-wrap items-end gap-x-3 gap-y-1 px-4 pb-2.5 pt-4">
        <Text accessibilityRole="header" className="min-w-40 flex-1 text-3xl font-extrabold text-ink" style={font}>
          {note.title}
        </Text>
        {date ? (
          <Text className="pb-1 text-sm text-muted" style={font}>
            {date}
          </Text>
        ) : null}
      </View>
      <View style={{ height: 2, backgroundColor: colors.inkBlue }} />
      <View style={{ height: 1, marginTop: 2, backgroundColor: colors.inkBlue, opacity: 0.5 }} />

      {/* Column labels. */}
      <View className="flex-row" style={{ borderBottomWidth: 1, borderColor: colors.paperRule }}>
        <View className="w-1/3 px-3 py-1.5">
          <SheetLabel>Cues</SheetLabel>
        </View>
        <View className="flex-1 px-3 py-1.5" style={{ borderLeftWidth: 2, borderColor: colors.marginRed }}>
          <SheetLabel>Notes</SheetLabel>
        </View>
      </View>

      {note.rows.map((row, i) => (
        <View key={i} className="flex-row" style={{ borderBottomWidth: 1, borderColor: colors.paperRule }}>
          <View className="w-1/3 px-3 py-3">
            {row.cue.trim() ? (
              <Text className={`${scaledText('text-base', size)} font-semibold`} style={[{ color: colors.inkBlue }, font]}>
                {row.cue}
              </Text>
            ) : null}
          </View>
          <View className="flex-1 px-3 py-3" style={{ borderLeftWidth: 2, borderColor: colors.marginRed }}>
            <RichText text={row.notes} />
          </View>
        </View>
      ))}

      {/* The summary area along the bottom of the sheet. */}
      <View className="gap-1.5 px-4 pb-4 pt-3" style={{ borderTopWidth: 2, borderColor: colors.inkBlue, backgroundColor: colors.paperSummary }}>
        <SheetLabel>Summary</SheetLabel>
        {note.summary ? (
          <RichText text={note.summary} />
        ) : (
          <Text className="text-sm text-muted" style={font}>
            No summary yet. Sum up the page in a few lines.
          </Text>
        )}
      </View>
    </View>
  );
}
