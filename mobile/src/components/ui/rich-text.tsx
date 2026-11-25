import { Text, View } from 'react-native';

import { parseRichText, type Block, type Span } from '@/lib/rich-text';

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
    return <Text className={`${align} ${ink} mb-1 mt-1 text-3xl font-extrabold`}>{spans}</Text>;
  }
  if (block.type === 'h2') {
    return <Text className={`${align} ${ink} mt-1 text-2xl font-bold`}>{spans}</Text>;
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
