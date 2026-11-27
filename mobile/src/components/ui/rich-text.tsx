import { createContext, useContext, useState, type ReactNode } from 'react';
import { ScrollView, Text, View, type TextStyle } from 'react-native';

import { Diagram } from '@/components/ui/diagram';
import { type Colors, Icon, type IconName, useColors } from '@/components/ui';
import { parseRichText, tableColumnSizes, type Block, type BoxKind, type Span, type TableRow } from '@/lib/rich-text';

type Props = {
  text: string;
  /** 'onDark' = white text, for the blue answer side of a flashcard. */
  tone?: 'default' | 'onDark';
  /** Centre short answers on a flashcard; lists and headings stay readable either way. */
  center?: boolean;
  /** Text size; without it, the size picked in Settings (see ReadingSizeContext). */
  size?: RichTextSize;
};

/** sm/base/lg/xl = Small, Medium, Large, Extra large in Settings. Focus mode uses base to xl. */
export type RichTextSize = 'sm' | 'base' | 'lg' | 'xl';
const SIZES: RichTextSize[] = ['sm', 'base', 'lg', 'xl'];

/** The text size for notes and flashcards from Settings; RichText uses it unless given a size. */
export const ReadingSizeContext = createContext<RichTextSize>('base');

export function useReadingSize(): RichTextSize {
  return useContext(ReadingSizeContext);
}

/** The size `steps` sizes up from `size` (or down, if negative), within Small to Extra large. */
export function stepSize(size: RichTextSize, steps: number): RichTextSize {
  return SIZES[Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf(size) + steps))];
}

// Heading sizes go up and down a step with the text size. Whole class names, so Tailwind sees them.
const TEXT_LADDER = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl'];
const SIZE_STEP: Record<RichTextSize, number> = { sm: -1, base: 0, lg: 1, xl: 2 };

/** A text class for something that is `medium` at Medium size, scaled to `size`. */
export function scaledText(medium: string, size: RichTextSize): string {
  const at = TEXT_LADDER.indexOf(medium) + SIZE_STEP[size];
  return TEXT_LADDER[Math.min(TEXT_LADDER.length - 1, Math.max(0, at))];
}

// Note colours (heading blues, blue ink, purple bullets, highlighter yellow, boxes) are in the
// light and dark palettes in components/ui/theme.ts.

/** Heading 1 on the blue answer side of a flashcard: a light blue that still reads. */
const LIGHT_BLUE = '#bfdbfe';

/**
 * How notes look, set by the screen showing them:
 * - `font`: a font family for all the text (the handwritten font of Cornell notes), or undefined
 * - `cornell`: headings underlined in blue ink and purple bullets, like a paper Cornell sheet
 * - `article`: plain notes; the top two heading levels get a coloured bar, like an article
 */
export type NoteLook = { font?: string; cornell?: boolean; article?: boolean };
const NoteLookContext = createContext<NoteLook>({});

export function NoteLookProvider({ look, children }: { look: NoteLook; children: ReactNode }) {
  return <NoteLookContext.Provider value={look}>{children}</NoteLookContext.Provider>;
}

/**
 * Draws a ":::image <id>" line: the screen showing a note passes how to show its attached
 * images. Elsewhere (or for an id the note doesn't have) the line shows nothing.
 */
export type NoteImageRenderer = (ref: string) => ReactNode;
const NoteImageContext = createContext<NoteImageRenderer | null>(null);

export function NoteImageProvider({ render, children }: { render: NoteImageRenderer; children: ReactNode }) {
  return <NoteImageContext.Provider value={render}>{children}</NoteImageContext.Provider>;
}

function InlineImage({ imageRef }: { imageRef: string }) {
  const render = useContext(NoteImageContext);
  const image = render?.(imageRef);
  return image ? <View className="my-2">{image}</View> : null;
}

/** The note font as a style, for text outside RichText that should match (titles, cues). */
export function useNoteFont(): TextStyle | undefined {
  const { font } = useContext(NoteLookContext);
  return font ? { fontFamily: font } : undefined;
}

/** Below this width, boxes next to each other are stacked instead of side by side. */
const SIDE_BY_SIDE_WIDTH = 520;

/** Shows text written with the formatting toolbar (headings, bold, lists…), boxes and diagrams. */
export function RichText({ text, tone = 'default', center = false, size }: Props) {
  const readingSize = useReadingSize();
  return <Blocks blocks={parseRichText(text)} tone={tone} center={center} size={size ?? readingSize} />;
}

/** Boxes one after another (blank lines between them don't count) are put together, to share a row. */
function groupBoxes(blocks: Block[]): (Block | Block[])[] {
  const items: (Block | Block[])[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type !== 'box') {
      items.push(blocks[i]);
      continue;
    }
    const group = [blocks[i]];
    let next = i + 1;
    for (;;) {
      let k = next;
      while (k < blocks.length && blocks[k].type === 'blank') k++;
      if (k >= blocks.length || blocks[k].type !== 'box') break;
      group.push(blocks[k]);
      next = k + 1;
    }
    items.push(group.length > 1 ? group : blocks[i]);
    i = next - 1;
  }
  return items;
}

function Blocks({
  blocks,
  tone,
  center = false,
  size,
  boxKind,
}: {
  blocks: Block[];
  tone: 'default' | 'onDark';
  center?: boolean;
  size: RichTextSize;
  boxKind?: BoxKind;
}) {
  const [width, setWidth] = useState(0);
  const hasList = blocks.some((b) => b.type === 'bullet' || b.type === 'number');
  // Lists read badly when centred, so left-align the whole answer if it has one.
  const align = center && !hasList ? 'text-center' : 'text-left';
  const ink = tone === 'onDark' ? 'text-white' : 'text-ink';
  const one = (block: Block, key: number) => (
    <BlockView key={key} block={block} align={align} ink={ink} size={size} tone={tone} boxKind={boxKind} />
  );

  return (
    <View className="w-full gap-1" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {groupBoxes(blocks).map((item, i) =>
        !Array.isArray(item) ? (
          one(item, i)
        ) : width >= SIDE_BY_SIDE_WIDTH ? (
          <View key={i} className="flex-row gap-3">
            {item.map((box, j) => (
              <View key={j} className="flex-1">
                {one(box, j)}
              </View>
            ))}
          </View>
        ) : (
          <View key={i} className="gap-1">
            {item.map((box, j) => one(box, j))}
          </View>
        ),
      )}
    </View>
  );
}

function boxStyle(
  colors: Colors,
  kind: BoxKind,
): { border: string; background: string; icon?: IconName; iconColor?: string } {
  if (kind === 'good') {
    return { border: colors.goodBorder, background: colors.goodFill, icon: 'checkmark-circle-outline', iconColor: colors.goodIcon };
  }
  if (kind === 'bad') {
    return { border: colors.badBorder, background: colors.badFill, icon: 'close-circle-outline', iconColor: colors.badIcon };
  }
  return { border: colors.noteBorder, background: colors.noteFill };
}

/** A box of points: ✓ for advantages, ✗ for limitations, or a plain purple box. */
function BoxView({ block, size, tone }: { block: Block; size: RichTextSize; tone: 'default' | 'onDark' }) {
  const colors = useColors();
  const kind = block.box ?? 'note';
  const style = boxStyle(colors, kind);
  const font = useNoteFont();
  const title = block.spans.map((s) => s.text).join('').trim();
  return (
    <View
      className="my-1 gap-1.5 rounded-2xl border-2 p-3"
      style={{ borderColor: style.border, backgroundColor: style.background }}
    >
      {title ? (
        <View className="flex-row">
          <Text
            accessibilityRole="header"
            className={`rounded-md px-2 py-0.5 ${scaledText('text-xl', size)} font-bold`}
            style={[{ backgroundColor: colors.highlight, color: colors.highlightInk }, font]}
          >
            <Spans spans={block.spans} tone="default" />
          </Text>
        </View>
      ) : null}
      <Blocks blocks={block.children ?? []} tone={tone} size={size} boxKind={kind} />
    </View>
  );
}

function BlockView({
  block,
  align,
  ink,
  size,
  tone,
  boxKind,
}: {
  block: Block;
  align: string;
  ink: string;
  size: RichTextSize;
  tone: 'default' | 'onDark';
  boxKind?: BoxKind;
}) {
  const colors = useColors();
  const { cornell, article } = useContext(NoteLookContext);
  const font = useNoteFont();
  if (block.type === 'blank') return <View className="h-2" />;

  const body = BODY_TEXT[size];
  const heading = (medium: string) => scaledText(medium, size);
  const spans = <Spans spans={block.spans} tone={tone} />;

  if (block.type === 'diagram') {
    const label = block.spans.map((s) => s.text).join('').trim();
    return <Diagram svg={block.svg ?? ''} caption={<Text style={font}>{spans}</Text>} label={label} />;
  }
  if (block.type === 'box') {
    return <BoxView block={block} size={size} tone={tone} />;
  }
  if (block.type === 'image') {
    return <InlineImage imageRef={block.imageRef ?? ''} />;
  }
  // The Cornell look (a paper Cornell sheet): headings underlined in blue ink, as if with a pen.
  if (cornell && tone === 'default' && (block.type === 'h1' || block.type === 'h2' || block.type === 'h3')) {
    const text = heading(block.type === 'h1' ? 'text-2xl' : block.type === 'h2' ? 'text-xl' : 'text-lg');
    return (
      <View className="mt-1.5 flex-row">
        <Text
          accessibilityRole="header"
          className={`${text} pb-0.5 font-bold text-ink`}
          style={[{ borderBottomWidth: block.type === 'h3' ? 1 : 2, borderColor: colors.inkBlue }, font]}
        >
          {spans}
        </Text>
      </View>
    );
  }
  // The article look (plain notes): a coloured bar beside the top two heading levels.
  if (article && tone === 'default' && (block.type === 'h1' || block.type === 'h2')) {
    const h1 = block.type === 'h1';
    return (
      <View className={`flex-row gap-3 ${h1 ? 'mb-1 mt-4' : 'mb-0.5 mt-3'}`}>
        <View className="w-1 rounded-full" style={{ backgroundColor: h1 ? colors.headingBlue : colors.headingBar }} />
        <Text
          accessibilityRole="header"
          className={`flex-1 ${h1 ? `${heading('text-2xl')} font-extrabold` : `${heading('text-xl')} font-bold`}`}
          style={[{ color: h1 ? colors.headingInk : colors.headingNavy }, font]}
        >
          {spans}
        </Text>
      </View>
    );
  }
  if (block.type === 'h1') {
    return (
      <Text
        accessibilityRole="header"
        className={`${align} mb-1 mt-1 ${heading('text-3xl')} font-extrabold`}
        style={[{ color: tone === 'onDark' ? LIGHT_BLUE : colors.headingBlue }, font]}
      >
        {spans}
      </Text>
    );
  }
  if (block.type === 'h2') {
    // On the blue answer side, navy wouldn't show, so it stays white there.
    return (
      <Text
        accessibilityRole="header"
        className={`${align} ${tone === 'onDark' ? ink : ''} mt-1 ${heading('text-2xl')} font-bold`}
        style={[tone === 'onDark' ? undefined : { color: colors.headingNavy }, font]}
      >
        {spans}
      </Text>
    );
  }
  if (block.type === 'h3') {
    return (
      <Text accessibilityRole="header" className={`${align} ${ink} mt-1 ${heading('text-xl')} font-bold`} style={font}>
        {spans}
      </Text>
    );
  }
  if (block.type === 'h4') {
    return (
      <Text accessibilityRole="header" className={`${align} ${ink} mt-0.5 ${heading('text-lg')} font-semibold`} style={font}>
        {spans}
      </Text>
    );
  }
  if (block.type === 'table') {
    return <TableView block={block} body={body} size={size} tone={tone} />;
  }
  if (block.type === 'bullet' || block.type === 'number') {
    const box = boxKind ? boxStyle(colors, boxKind) : undefined;
    // Purple bullets in the Cornell look and in purple boxes (not on the blue side of a flashcard).
    const purple = (cornell || boxKind === 'note') && tone === 'default';
    return (
      <View className="flex-row gap-2 pl-1">
        {box?.icon && block.type === 'bullet' ? (
          <View className="pt-0.5">
            <Icon name={box.icon} size={26} color={box.iconColor} />
          </View>
        ) : (
          <Text className={`${ink} ${body} font-semibold`} style={[purple ? { color: colors.notePurple } : undefined, font]}>
            {block.type === 'bullet' ? '•' : `${block.number}.`}
          </Text>
        )}
        <Text className={`${ink} ${body} flex-1`} style={font}>
          {spans}
        </Text>
      </View>
    );
  }
  return (
    <Text className={`${align} ${ink} ${body} font-medium`} style={font}>
      {spans}
    </Text>
  );
}

/** Paragraph and list text at each size. */
const BODY_TEXT: Record<RichTextSize, string> = {
  sm: 'text-sm leading-5',
  base: 'text-base leading-6',
  lg: 'text-xl leading-7',
  xl: 'text-2xl leading-9',
};

/** Up to 3 columns share the screen width; wider tables scroll sideways. */
const MAX_FITTED_COLUMNS = 3;
/** Rough width of one character at each text size, for sizing columns before layout. */
const CHAR_WIDTH: Record<RichTextSize, number> = { sm: 8, base: 9, lg: 11, xl: 13 };
const CELL_PADDING = 22; // px-2.5 on both sides, plus the border
const SCROLL_COLUMN_MAX = 220;

function TableView({
  block,
  body,
  size,
  tone,
}: {
  block: Block;
  body: string;
  size: RichTextSize;
  tone: 'default' | 'onDark';
}) {
  const font = useNoteFont();
  // The width the table has: narrow in a Cornell note's notes column.
  const [available, setAvailable] = useState(0);
  const rows = block.rows ?? [];
  const sizes = tableColumnSizes(block);
  const columns = sizes.length;
  if (columns === 0) return null;
  const charWidth = CHAR_WIDTH[size];
  // Tables scroll sideways when they have many columns, or when their longest words
  // can't fit side by side in the space there is (otherwise the right side is cut off).
  const narrowest = sizes.reduce((sum, { word }) => sum + word * charWidth + CELL_PADDING, 0);
  const scrolls = columns > MAX_FITTED_COLUMNS || (available > 0 && narrowest > available);
  // Each column is at least as wide as its longest word. Fitted tables share the
  // rest of the width by how much each column has to say; scrolling tables give
  // each column its natural width, up to a limit, and wrap the rest.
  const columnStyle = sizes.map(({ text, word }) => {
    const minWidth = word * charWidth + CELL_PADDING;
    return scrolls
      ? { width: Math.max(minWidth, Math.min(text * charWidth + CELL_PADDING, SCROLL_COLUMN_MAX)) }
      : { flexGrow: text, flexShrink: 1, flexBasis: 0, minWidth };
  });
  const dark = tone === 'onDark';
  const border = dark ? 'border-white/40' : 'border-line';

  const renderRow = (row: TableRow, kind: 'header' | 'body', key: number, last: boolean) => (
    <View
      key={key}
      className={`flex-row ${last ? '' : `border-b ${border}`} ${kind === 'header' ? (dark ? 'bg-white/15' : 'bg-primary-soft') : ''}`}
    >
      {Array.from({ length: columns }, (_, c) => (
        <View
          key={c}
          className={`px-2.5 py-2 ${c > 0 ? `border-l ${border}` : ''}`}
          style={columnStyle[c]}
        >
          <Text
            className={`${dark ? 'text-white' : 'text-ink'} ${body} ${kind === 'header' ? 'font-bold' : ''}`}
            style={font}
          >
            <Spans spans={row[c] ?? []} tone={tone} />
          </Text>
        </View>
      ))}
    </View>
  );

  const table = (
    <View className={`overflow-hidden rounded-xl border ${border}`} style={scrolls ? undefined : { width: '100%' }}>
      {block.header ? renderRow(block.header, 'header', -1, rows.length === 0) : null}
      {rows.map((row, i) => renderRow(row, 'body', i, i === rows.length - 1))}
    </View>
  );

  return (
    <View
      className="my-1"
      accessibilityLabel={`Table with ${columns} columns`}
      onLayout={(e) => setAvailable(Math.round(e.nativeEvent.layout.width))}
    >
      {scrolls ? (
        <ScrollView horizontal showsHorizontalScrollIndicator testID="table-scroll">
          {table}
        </ScrollView>
      ) : (
        table
      )}
    </View>
  );
}

function Spans({ spans, tone }: { spans: Span[]; tone: 'default' | 'onDark' }) {
  const colors = useColors();
  return spans.map((span, i) => {
    const classes = [
      span.bold ? 'font-extrabold' : '',
      span.italic ? 'italic' : '',
      span.underline ? 'underline' : '',
      // Highlighter yellow.
      span.highlight ? 'bg-warning/60' : '',
    ].join(' ');
    // Dark text on the highlight on the blue answer side, so it stays readable in both themes.
    const style = span.highlight && tone === 'onDark' ? { color: colors.highlightInk } : undefined;
    return (
      <Text key={i} className={classes} style={style}>
        {span.text}
      </Text>
    );
  });
}
