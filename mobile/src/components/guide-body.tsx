import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { colors, Icon, ratingColors, ratingIcons, type IconName } from '@/components/ui';
import { parseRichText, type Block, type Span } from '@/lib/rich-text';

// Lays out a help topic (see src/lib/guide.ts) as a page rather than plain text:
//   text before the first ## heading -> a blue intro box
//   each ## heading                  -> a white card with an icon
//   1. 2. 3. lines                   -> numbered steps joined by a line
//   - **Label**: text                -> a row with an icon, the label and its meaning
//   ==Tip:== text                    -> an amber tip box
//   **bold** words                   -> tinted chips (Hard / OK / Easy in their rating colours)
// The topics themselves stay plain text, so search and the AI can still read them.

type Section = { title: string; blocks: Block[] };

function splitSections(text: string): { intro: Block[]; sections: Section[] } {
  const intro: Block[] = [];
  const sections: Section[] = [];
  for (const block of parseRichText(text)) {
    if (block.type === 'h2' || block.type === 'h1') {
      sections.push({ title: plain(block.spans), blocks: [] });
    } else if (block.type !== 'blank') {
      (sections.at(-1)?.blocks ?? intro).push(block);
    }
  }
  return { intro, sections };
}

const plain = (spans: Span[]) => spans.map((s) => s.text).join('');

// --- Icons, picked from the words so new topics get sensible ones too ------------

const SECTION_ICONS: [RegExp, IconName][] = [
  [/first|minutes/i, 'timer-outline'],
  [/finding your way/i, 'compass-outline'],
  [/how it works/i, 'list-outline'],
  [/^(make|add)/i, 'add-circle-outline'],
  [/format/i, 'text-outline'],
  [/change|edit/i, 'create-outline'],
  [/hidden/i, 'eye-off-outline'],
  [/inside/i, 'albums-outline'],
  [/time per card/i, 'timer-outline'],
  [/colou?r/i, 'color-palette-outline'],
  [/control/i, 'options-outline'],
  [/revise|again/i, 'refresh-outline'],
  [/favourite/i, 'star-outline'],
  [/coming soon/i, 'time-outline'],
  [/study/i, 'play-circle-outline'],
  [/\?$/, 'chatbubble-ellipses-outline'],
];

function sectionIcon(title: string): IconName {
  return SECTION_ICONS.find(([pattern]) => pattern.test(title))?.[1] ?? 'bookmark-outline';
}

const LABEL_ICONS: Record<string, IconName> = {
  home: 'home-outline',
  flashcards: 'layers-outline',
  '+ button': 'flash-outline',
  more: 'grid-outline',
  image: 'image-outline',
  pdf: 'document-text-outline',
  record: 'mic-outline',
  'audio file': 'musical-notes-outline',
  'h1 / h2': 'text-outline',
  b: 'text-outline',
  marker: 'color-fill-outline',
  lists: 'list-outline',
  star: 'star-outline',
  pencil: 'create-outline',
  bin: 'trash-outline',
  shuffle: 'shuffle-outline',
  timer: 'timer-outline',
  cards: 'copy-outline',
  studied: 'time-outline',
  'rating bar': 'bar-chart-outline',
  study: 'play-outline',
  prev: 'arrow-back',
  next: 'arrow-forward',
  back: 'arrow-back',
  streak: 'flame-outline',
  best: 'trophy-outline',
  grid: 'apps-outline',
  'sign in': 'log-in-outline',
  ai: 'sparkles-outline',
  notes: 'document-outline',
  'study all again': 'refresh-outline',
};

const RATING_WORDS: Record<string, keyof typeof ratingColors> = { hard: 'hard', ok: 'ok', easy: 'easy', new: 'new' };

// --- Page ----------------------------------------------------------------------

export function GuideBody({ text }: { text: string }) {
  const { intro, sections } = splitSections(text);
  return (
    <View className="gap-4">
      {intro.length > 0 ? <Intro blocks={intro} /> : null}
      {sections.map((section, i) => (
        <View key={i} className="rounded-3xl border border-line bg-white p-5 shadow-sm">
          <View className="mb-3 flex-row items-center gap-2.5">
            <Icon name={sectionIcon(section.title)} size={30} color={colors.calm} />
            <Text className="flex-1 text-xl font-extrabold text-ink" accessibilityRole="header">
              {section.title}
            </Text>
          </View>
          <Blocks blocks={section.blocks} />
        </View>
      ))}
    </View>
  );
}

/** The opening lines, in a soft blue box with a little flashcard drawing. */
function Intro({ blocks }: { blocks: Block[] }) {
  return (
    <View className="flex-row items-center gap-4 rounded-3xl bg-primary-soft p-4">
      <View className="h-16 w-16 items-center justify-center" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View
          style={{ transform: [{ rotate: '-12deg' }] }}
          className="absolute left-0 top-1 h-10 w-10 items-center justify-center rounded-xl border-2 border-primary bg-white">
          <Text className="text-lg font-extrabold text-primary">?</Text>
        </View>
        <View
          style={{ transform: [{ rotate: '6deg' }] }}
          className="absolute bottom-0 right-0 h-10 w-10 items-center justify-center rounded-xl bg-calm">
          <Icon name="checkmark" size={26} color={colors.white} />
        </View>
      </View>
      <View className="flex-1 gap-2 border-l border-primary/30 pl-4">
        <Blocks blocks={blocks} intro />
      </View>
    </View>
  );
}

/** Groups numbered lines into one list of steps, and bullets into one list of rows. */
function Blocks({ blocks, intro = false }: { blocks: Block[]; intro?: boolean }) {
  const groups: { type: Block['type']; blocks: Block[] }[] = [];
  for (const block of blocks) {
    const last = groups.at(-1);
    const listy = block.type === 'number' || block.type === 'bullet';
    if (last && listy && last.type === block.type) last.blocks.push(block);
    else groups.push({ type: block.type, blocks: [block] });
  }

  return (
    <View className="gap-3">
      {groups.map((group, i) => {
        if (group.type === 'number') return <Steps key={i} blocks={group.blocks} />;
        if (group.type === 'bullet') return <Rows key={i} blocks={group.blocks} />;
        const block = group.blocks[0];
        if (isTip(block)) return <Tip key={i} block={block} />;
        return (
          <Text key={i} className="text-base leading-6 text-ink">
            <Spans spans={block.spans} chips={!intro} />
          </Text>
        );
      })}
    </View>
  );
}

function Steps({ blocks }: { blocks: Block[] }) {
  return (
    <View>
      {blocks.map((block, i) => {
        const last = i === blocks.length - 1;
        return (
          <View key={i} className="flex-row gap-3">
            <View className="items-center">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-primary">
                <Text className="text-sm font-extrabold text-white">{block.number}</Text>
              </View>
              {last ? null : <View className="w-0.5 flex-1 bg-primary/25" />}
            </View>
            <Text className={`flex-1 pt-1 text-base leading-6 text-ink ${last ? '' : 'pb-4'}`}>
              <Spans spans={block.spans} chips />
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** "- **Label**: meaning" becomes a labelled row; other bullets stay as bullets. */
function Rows({ blocks }: { blocks: Block[] }) {
  return (
    <View>
      {blocks.map((block, i) => {
        const divider = i < blocks.length - 1 ? 'border-b border-line' : '';
        const [first, second, ...rest] = block.spans;
        const labelled = first?.bold && second?.text.startsWith(':');
        if (!labelled) {
          return (
            <View key={i} className={`flex-row gap-3 py-2.5 ${divider}`}>
              <View className="h-11 w-11 items-center justify-center">
                <View className="h-2 w-2 rounded-full bg-primary" />
              </View>
              <Text className="flex-1 self-center text-base leading-6 text-ink">
                <Spans spans={block.spans} chips />
              </Text>
            </View>
          );
        }

        const label = first.text;
        const rating = RATING_WORDS[label.toLowerCase()];
        const icon = rating ? ratingIcons[rating] : (LABEL_ICONS[label.toLowerCase()] ?? 'ellipse-outline');
        const tint = rating ? ratingColors[rating] : colors.primary;
        const meaning = [{ ...second, text: capitalize(second.text.replace(/^:\s*/, '')) }, ...rest];
        return (
          <View key={i} className={`flex-row items-center gap-3 py-2.5 ${divider}`}>
            <View className="h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: `${tint}1a` }}>
              <Icon name={icon} size={24} color={tint} />
            </View>
            <Text className="w-24 text-base font-bold" style={{ color: tint }}>
              {label}
            </Text>
            <Text className="flex-1 border-l border-line pl-3 text-sm leading-5 text-ink">
              <Spans spans={meaning} chips />
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** A paragraph that starts with a highlighted label ending in ":", like ==Tip:==. */
function isTip(block: Block) {
  const first = block.spans[0];
  return block.type === 'paragraph' && Boolean(first?.highlight) && first.text.trim().endsWith(':');
}

function Tip({ block }: { block: Block }) {
  const [label, ...rest] = block.spans;
  if (rest[0]) rest[0] = { ...rest[0], text: capitalize(rest[0].text.trimStart()) };
  return (
    <View className="mt-1 flex-row gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4">
      <Icon name="bulb-outline" size={28} color={colors.cta} />
      <Text className="flex-1 text-base leading-6 text-ink">
        <Text className="font-extrabold text-cta-dark">{label.text} </Text>
        <Spans spans={rest} chips />
      </Text>
    </View>
  );
}

/** Bold words become tinted chips; Hard / OK / Easy / New use their rating colours. */
function Spans({ spans, chips }: { spans: Span[]; chips: boolean }): ReactNode {
  return spans.map((span, i) => {
    const style = [span.italic ? 'italic' : '', span.underline ? 'underline' : ''].join(' ');
    if (span.bold) {
      if (!chips) {
        return (
          <Text key={i} className={`font-extrabold text-primary ${style}`}>
            {span.text}
          </Text>
        );
      }
      const rating = RATING_WORDS[span.text.toLowerCase()];
      const tint = rating ? ratingColors[rating] : colors.primary;
      return (
        <Text key={i} className={`font-bold ${style}`} style={{ color: tint, backgroundColor: `${tint}1f` }}>
          {` ${span.text} `}
        </Text>
      );
    }
    if (span.highlight) {
      return (
        <Text key={i} className={`bg-warning/40 ${style}`}>
          {span.text}
        </Text>
      );
    }
    return (
      <Text key={i} className={style}>
        {span.text}
      </Text>
    );
  });
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
