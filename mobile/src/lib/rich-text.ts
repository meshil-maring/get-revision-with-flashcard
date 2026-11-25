// Light formatting for card answers, stored as plain text with simple marks
// (a small part of Markdown, so it stays readable and the AI can write it too):
//
//   # Heading        ## Subheading
//   - bullet         1. numbered
//   **bold**   *italic*   __underline__   ==highlight==

export type SpanStyle = { bold?: boolean; italic?: boolean; underline?: boolean; highlight?: boolean };
export type Span = SpanStyle & { text: string };

export type BlockType = 'h1' | 'h2' | 'bullet' | 'number' | 'paragraph' | 'blank';
export type Block = { type: BlockType; spans: Span[]; number?: number };

// Order matters: ** before *, so bold isn't read as two italics.
const INLINE = /\*\*(.+?)\*\*|__(.+?)__|==(.+?)==|\*([^*\s][^*]*?)\*/;

/** Splits one line into styled pieces. Marks can be nested, e.g. **bold ==and highlighted==**. */
export function parseInline(text: string, style: SpanStyle = {}): Span[] {
  const spans: Span[] = [];
  let rest = text;
  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match) {
      spans.push({ ...style, text: rest });
      break;
    }
    if (match.index > 0) spans.push({ ...style, text: rest.slice(0, match.index) });
    const [, bold, underline, highlight, italic] = match;
    if (bold !== undefined) spans.push(...parseInline(bold, { ...style, bold: true }));
    else if (underline !== undefined) spans.push(...parseInline(underline, { ...style, underline: true }));
    else if (highlight !== undefined) spans.push(...parseInline(highlight, { ...style, highlight: true }));
    else spans.push(...parseInline(italic, { ...style, italic: true }));
    rest = rest.slice(match.index + match[0].length);
  }
  return spans;
}

const BLOCK_PREFIX = /^(#{1,2} |- |• |\d+\. )/;

export function parseRichText(text: string): Block[] {
  return text.split('\n').map((line): Block => {
    if (line.trim() === '') return { type: 'blank', spans: [] };
    if (line.startsWith('## ')) return { type: 'h2', spans: parseInline(line.slice(3)) };
    if (line.startsWith('# ')) return { type: 'h1', spans: parseInline(line.slice(2)) };
    if (line.startsWith('- ') || line.startsWith('• ')) return { type: 'bullet', spans: parseInline(line.slice(2)) };
    const numbered = /^(\d+)\. (.*)$/.exec(line);
    if (numbered) return { type: 'number', number: Number(numbered[1]), spans: parseInline(numbered[2]) };
    return { type: 'paragraph', spans: parseInline(line) };
  });
}

/** The text without formatting marks, for short previews. */
export function toPlainText(text: string): string {
  return parseRichText(text)
    .map((block) => {
      const line = block.spans.map((s) => s.text).join('');
      if (block.type === 'bullet') return `• ${line}`;
      if (block.type === 'number') return `${block.number}. ${line}`;
      return line;
    })
    .join('\n');
}

// --- Editing helpers (used by the formatting toolbar) ---------------------------

export type Selection = { start: number; end: number };
export type Edit = { text: string; selection: Selection };

/**
 * Puts marks around the selected text, e.g. "**" for bold. If the selection is
 * already wrapped in those marks, they are removed instead. With nothing selected,
 * inserts a pair of marks with the cursor between them, ready to type.
 */
export function wrapSelection(text: string, selection: Selection, mark: string): Edit {
  const { start, end } = selection;
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);

  if (before.endsWith(mark) && after.startsWith(mark)) {
    return {
      text: before.slice(0, -mark.length) + selected + after.slice(mark.length),
      selection: { start: start - mark.length, end: end - mark.length },
    };
  }
  return {
    text: before + mark + selected + mark + after,
    selection: { start: start + mark.length, end: end + mark.length },
  };
}

/**
 * Turns the selected lines into headings or list items ("# ", "## ", "- ", "1. ").
 * If every selected line already has that kind of prefix, it is removed instead.
 */
export function toggleLinePrefix(text: string, selection: Selection, prefix: '# ' | '## ' | '- ' | '1. '): Edit {
  const lineStart = text.lastIndexOf('\n', selection.start - 1) + 1;
  const nextBreak = text.indexOf('\n', selection.end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const lines = text.slice(lineStart, lineEnd).split('\n');

  const hasPrefix = (line: string) =>
    prefix === '1. ' ? /^\d+\. /.test(line) : line.startsWith(prefix);
  const removing = lines.every(hasPrefix);

  const changed = lines
    .map((line, i) => {
      const bare = line.replace(BLOCK_PREFIX, '');
      if (removing) return bare;
      return (prefix === '1. ' ? `${i + 1}. ` : prefix) + bare;
    })
    .join('\n');

  const newText = text.slice(0, lineStart) + changed + text.slice(lineEnd);
  const cursor = lineStart + changed.length;
  return { text: newText, selection: { start: cursor, end: cursor } };
}
