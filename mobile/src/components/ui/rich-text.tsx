import { ScrollView, Text, View } from 'react-native';

import { parseRichText, tableColumnSizes, type Block, type Span, type TableRow } from '@/lib/rich-text';

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

/** Shows text written with the formatting toolbar (headings, bold, lists…). */
export function RichText({ text, tone = 'default', center = false, size = 'base' }: Props) {
  const blocks = parseRichText(text);
  const hasList = blocks.some((b) => b.type === 'bullet' || b.type === 'number');
  // Lists read badly when centred, so left-align the whole answer if it has one.
  const align = center && !hasList ? 'text-center' : 'text-left';
  const ink = tone === 'onDark' ? 'text-white' : 'text-ink';

  return (
    <View className="w-full gap-1">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} align={align} ink={ink} size={size} tone={tone} />
      ))}
    </View>
  );
}

function BlockView({
  block,
  align,
  ink,
  size,
  tone,
}: {
  block: Block;
  align: string;
  ink: string;
  size: RichTextSize;
  tone: 'default' | 'onDark';
}) {
  if (block.type === 'blank') return <View className="h-2" />;

  const body = size === 'xl' ? 'text-2xl leading-9' : size === 'lg' ? 'text-xl leading-7' : 'text-base leading-6';
  const spans = <Spans spans={block.spans} tone={tone} />;

  if (block.type === 'h1') {
    return (
      <Text
        accessibilityRole="header"
        className={`${align} mb-1 mt-1 text-3xl font-extrabold`}
        style={{ color: tone === 'onDark' ? LIGHT_BLUE : H1_BLUE }}
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
        style={tone === 'onDark' ? undefined : { color: H2_NAVY }}
      >
        {spans}
      </Text>
    );
  }
  if (block.type === 'h3') {
    return <Text accessibilityRole="header" className={`${align} ${ink} mt-1 text-xl font-bold`}>{spans}</Text>;
  }
  if (block.type === 'h4') {
    return <Text accessibilityRole="header" className={`${align} ${ink} mt-0.5 text-lg font-semibold`}>{spans}</Text>;
  }
  if (block.type === 'table') {
    return <TableView block={block} body={body} size={size} tone={tone} />;
  }
  if (block.type === 'bullet' || block.type === 'number') {
    return (
      <View className="flex-row gap-2 pl-1">
        <Text className={`${ink} ${body} font-semibold`}>
          {block.type === 'bullet' ? '•' : `${block.number}.`}
        </Text>
        <Text className={`${ink} ${body} flex-1`}>{spans}</Text>
      </View>
    );
  }
  return <Text className={`${align} ${ink} ${body} font-medium`}>{spans}</Text>;
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
          <Text className={`${dark ? 'text-white' : 'text-ink'} ${body} ${kind === 'header' ? 'font-bold' : ''}`}>
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
