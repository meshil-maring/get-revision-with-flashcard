import { createContext, useContext, useState, type ReactNode } from 'react';
import { ScrollView, Text, View, type TextStyle } from 'react-native';

import { Diagram } from '@/components/ui/diagram';
import { Icon, type IconName } from '@/components/ui';
import { parseRichText, tableColumnSizes, type Block, type BoxKind, type Span, type TableRow } from '@/lib/rich-text';

type Props = {
  text: string;
  /** 'onDark' = white text, for the blue answer side of a flashcard. */
  tone?: 'default' | 'onDark';
  /** Centre short answers on a flashcard; lists and headings stay readable either way. */
  center?: boolean;
  /** 'xl' is for focus reading, where the note fills the screen. */
  size?: RichTextSize;
};

export type RichTextSize = 'base' | 'lg' | 'xl';

/** Heading 1: a bright blue. On the blue answer side, a light blue that still reads. */
const H1_BLUE = '#2b7fff';
const LIGHT_BLUE = '#bfdbfe';
/** Heading 2: a deep navy, so it reads as a step below Heading 1. */
const H2_NAVY = '#1e3a8a';

/** Purple for bullets and the cue markers of the Cornell look. */
export const NOTE_PURPLE = '#7c5cd6';
/** Highlighter yellow behind headings in the Cornell look. */
export const CHIP_YELLOW = '#fdeb8f';

/**
 * How notes look, set by the screen showing them:
 * - `font`: a font family for all the text (the handwritten font of Cornell notes), or undefined
 * - `cornell`: headings on a yellow highlight and purple bullets, like a hand-made Cornell page
 */
export type NoteLook = { font?: string; cornell?: boolean };
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
export function RichText({ text, tone = 'default', center = false, size = 'base' }: Props) {
  return <Blocks blocks={parseRichText(text)} tone={tone} center={center} size={size} />;
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

const BOX_STYLE: Record<BoxKind, { border: string; background: string; icon?: IconName; iconColor?: string }> = {
  good: { border: '#9fd5ae', background: '#f3fbf5', icon: 'checkmark-circle-outline', iconColor: '#2e9d4f' },
  bad: { border: '#f1a7a7', background: '#fff5f5', icon: 'close-circle-outline', iconColor: '#d64545' },
  note: { border: '#c9bdf0', background: '#f8f5ff' },
};

/** A box of points: ✓ for advantages, ✗ for limitations, or a plain purple box. */
function BoxView({ block, size, tone }: { block: Block; size: RichTextSize; tone: 'default' | 'onDark' }) {
  const kind = block.box ?? 'note';
  const style = BOX_STYLE[kind];
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
            className="rounded-md px-2 py-0.5 text-xl font-bold text-ink"
            style={[{ backgroundColor: CHIP_YELLOW }, font]}
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
  const { cornell } = useContext(NoteLookContext);
  const font = useNoteFont();
  if (block.type === 'blank') return <View className="h-2" />;

  const body = size === 'xl' ? 'text-2xl leading-9' : size === 'lg' ? 'text-xl leading-7' : 'text-base leading-6';
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
  // The Cornell look: headings sit on a yellow highlight, like the section titles of a hand-made page.
  if (cornell && tone === 'default' && (block.type === 'h1' || block.type === 'h2' || block.type === 'h3')) {
    const text = block.type === 'h1' ? 'text-3xl' : block.type === 'h2' ? 'text-2xl' : 'text-xl';
    return (
      <View className="mt-1.5 flex-row">
        <Text
          accessibilityRole="header"
          className={`${text} rounded-md px-2 py-0.5 font-bold text-ink`}
          style={[{ backgroundColor: CHIP_YELLOW }, font]}
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
        className={`${align} mb-1 mt-1 text-3xl font-extrabold`}
        style={[{ color: tone === 'onDark' ? LIGHT_BLUE : H1_BLUE }, font]}
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
        className={`${align} ${tone === 'onDark' ? ink : ''} mt-1 text-2xl font-bold`}
        style={[tone === 'onDark' ? undefined : { color: H2_NAVY }, font]}
      >
        {spans}
      </Text>
    );
  }
  if (block.type === 'h3') {
    return (
      <Text accessibilityRole="header" className={`${align} ${ink} mt-1 text-xl font-bold`} style={font}>
        {spans}
      </Text>
    );
  }
  if (block.type === 'h4') {
    return (
      <Text accessibilityRole="header" className={`${align} ${ink} mt-0.5 text-lg font-semibold`} style={font}>
        {spans}
      </Text>
    );
  }
  if (block.type === 'table') {
    return <TableView block={block} body={body} size={size} tone={tone} />;
  }
  if (block.type === 'bullet' || block.type === 'number') {
    const boxStyle = boxKind ? BOX_STYLE[boxKind] : undefined;
    // Purple bullets in the Cornell look and in purple boxes (not on the blue side of a flashcard).
    const purple = (cornell || boxKind === 'note') && tone === 'default';
    return (
      <View className="flex-row gap-2 pl-1">
        {boxStyle?.icon && block.type === 'bullet' ? (
          <View className="pt-0.5">
            <Icon name={boxStyle.icon} size={26} color={boxStyle.iconColor} />
          </View>
        ) : (
          <Text className={`${ink} ${body} font-semibold`} style={[purple ? { color: NOTE_PURPLE } : undefined, font]}>
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

/** Up to 3 columns share the screen width; wider tables scroll sideways. */
const MAX_FITTED_COLUMNS = 3;
/** Rough width of one character at each text size, for sizing columns before layout. */
const CHAR_WIDTH: Record<RichTextSize, number> = { base: 9, lg: 11, xl: 13 };
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
  const rows = block.rows ?? [];
  const sizes = tableColumnSizes(block);
  const columns = sizes.length;
  if (columns === 0) return null;
  const scrolls = columns > MAX_FITTED_COLUMNS;
  const charWidth = CHAR_WIDTH[size];
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
    <View className="my-1" accessibilityLabel={`Table with ${columns} columns`}>
      {scrolls ? (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          {table}
        </ScrollView>
      ) : (
        table
      )}
    </View>
  );
}

function Spans({ spans, tone }: { spans: Span[]; tone: 'default' | 'onDark' }) {
  return spans.map((span, i) => {
    const classes = [
      span.bold ? 'font-extrabold' : '',
      span.italic ? 'italic' : '',
      span.underline ? 'underline' : '',
      // Highlighter yellow; dark text on it so it stays readable on the blue answer side.
      span.highlight ? `bg-warning/60 ${tone === 'onDark' ? 'text-ink' : ''}` : '',
    ].join(' ');
    return (
      <Text key={i} className={classes}>
        {span.text}
      </Text>
    );
  });
}
