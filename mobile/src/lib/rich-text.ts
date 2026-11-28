// Light formatting for card answers, stored as plain text with simple marks
// (a small part of Markdown, so it stays readable and the AI can write it too):
//
//   # Heading        ## Subheading      ### Heading 3      #### Heading 4
//   - bullet         1. numbered
//   **bold**   *italic*   __underline__   ==highlight==
//   | Name | Meaning |      a table: lines starting with "|";
//   |---|---|               a |---| line under the first row makes it the header
//   | cell | cell |
//
//   :::good Advantages      a box: "good" (green ✓ list), "bad" (red ✗ list) or "note" (purple).
//   - point                 Its bullets show as ✓ or ✗. Boxes next to each other sit side by side
//   :::                     on wide screens.
//
//   :::diagram Caption      a diagram drawn as SVG (usually written by an AI app).
//   <svg viewBox="0 0 600 400">…</svg>       A bare <svg>…</svg> or a ```svg fence works too.
//   :::
//
//   :::image 1b2c…          one of the note's attached images, shown right here (one line, no
//                           closing :::). The id is the attachment's (as AI apps get it from upload_image).
//
// Maths and textbook structure (typeset by the textbook reader, components/textbook):
//
//   $x^2$  \(x^2\)            inline maths (see math-text.ts for the $ rules)
//   $$ … $$   \[ … \]         a displayed equation, on its own lines; ```math fences and
//                             \begin{align}…\end{align} (or gather, equation) work too
//   ```python … ```           code
//
//   :::definition Derivative  academic blocks: definition, theorem, lemma, proposition,
//   …                         corollary, remark, proof, example (a worked example), exercise
//   :::                       ("[easy]", "[medium]" or "[hard]" before its title), hint,
//                             solution, answer, summary and references.

import { latexToText, splitInlineMath } from '@/lib/math-text';

export type SpanStyle = { bold?: boolean; italic?: boolean; underline?: boolean; highlight?: boolean };
/**
 * A piece of a line. Inline maths has its LaTeX in `math` (and `display` for $$…$$ inside a
 * line); its `text` is a plain-text reading of it, for places that can't typeset.
 */
export type Span = SpanStyle & { text: string; math?: string; display?: boolean };

export type BlockType =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'bullet'
  | 'number'
  | 'paragraph'
  | 'blank'
  | 'table'
  | 'box'
  | 'diagram'
  | 'image'
  | 'math'
  | 'code'
  | 'env';
/** Textbook blocks (":::definition …"). */
export type EnvKind =
  | 'definition'
  | 'theorem'
  | 'lemma'
  | 'proposition'
  | 'corollary'
  | 'remark'
  | 'proof'
  | 'example'
  | 'exercise'
  | 'hint'
  | 'solution'
  | 'answer'
  | 'summary'
  | 'references';
export type Difficulty = 'easy' | 'medium' | 'hard';
/** good = advantages (✓), bad = limitations (✗), note = anything else worth boxing. */
export type BoxKind = 'good' | 'bad' | 'note';
/** One table row: each cell is a list of styled pieces, like a line of text. */
export type TableRow = Span[][];
export type Block = {
  type: BlockType;
  spans: Span[];
  number?: number;
  /** Tables only: the header row (when there is a |---| line), then the other rows. */
  header?: TableRow;
  rows?: TableRow[];
  /** Boxes only: which kind, and what's inside. Its title is in `spans`. */
  box?: BoxKind;
  children?: Block[];
  /** Diagrams only: the SVG as written (cleaned before it is shown), and its caption in `spans`. */
  svg?: string;
  /** Images only: the attached image's id. */
  imageRef?: string;
  /** Displayed equations only: the LaTeX. */
  math?: string;
  /** Code only: the code as written, and its language if named. */
  code?: string;
  lang?: string;
  /** Textbook blocks only: which kind (title in `spans`, content in `children`). */
  env?: EnvKind;
  /** Exercises only, when the title says. */
  difficulty?: Difficulty;
};

const ENV_KINDS: Record<string, EnvKind> = {
  definition: 'definition',
  defn: 'definition',
  theorem: 'theorem',
  thm: 'theorem',
  lemma: 'lemma',
  proposition: 'proposition',
  prop: 'proposition',
  corollary: 'corollary',
  remark: 'remark',
  proof: 'proof',
  example: 'example',
  exercise: 'exercise',
  exercises: 'exercise',
  problem: 'exercise',
  problems: 'exercise',
  practice: 'exercise',
  hint: 'hint',
  solution: 'solution',
  answer: 'answer',
  answers: 'answer',
  summary: 'summary',
  references: 'references',
  bibliography: 'references',
};

/** "[hard] Limits" → { difficulty: 'hard', title: 'Limits' }; "(Easy)" at the end works too. */
function splitDifficulty(title: string): { difficulty?: Difficulty; title: string } {
  const named = (word: string): Difficulty => {
    const w = word.toLowerCase();
    return w === 'easy' ? 'easy' : w === 'medium' ? 'medium' : 'hard';
  };
  const front = /^\[(easy|medium|hard|challenging|challenge)\]\s*(.*)$/i.exec(title);
  if (front) return { difficulty: named(front[1]), title: front[2] };
  const back = /^(.*?)\s*[([](easy|medium|hard|challenging|challenge)[)\]]$/i.exec(title);
  if (back) return { difficulty: named(back[2]), title: back[1] };
  return { title };
}

const BOX_KINDS: Record<string, BoxKind> = {
  good: 'good',
  pros: 'good',
  advantages: 'good',
  bad: 'bad',
  cons: 'bad',
  limitations: 'bad',
  note: 'note',
  info: 'note',
  key: 'note',
  tip: 'note',
};

/** ":::good Advantages" → { name: 'good', title: 'Advantages' }. */
const FENCE_OPEN = /^:::\s*([a-z]+)\b\s*(.*)$/i;
const isFenceClose = (line: string) => line.trim() === ':::';

/** ":::image <id>": a whole line naming one of the note's images. */
const IMAGE_LINE = /^:::\s*image\s+([A-Za-z0-9-]{1,100})\s*$/i;
const imageRefOf = (line: string) => IMAGE_LINE.exec(line.trim())?.[1] ?? null;

/** The image ids the text shows in place (":::image <id>" lines), in order. */
export function imageRefs(text: string): string[] {
  return text
    .split('\n')
    .map(imageRefOf)
    .filter((ref): ref is string => ref !== null);
}

/** The text without the ":::image" lines for these ids (when the images are taken off the note). */
export function removeImageRefs(text: string, refs: string[]): string {
  if (refs.length === 0) return text;
  const gone = new Set(refs);
  return text
    .split('\n')
    .filter((line) => {
      const ref = imageRefOf(line);
      return ref === null || !gone.has(ref);
    })
    .join('\n');
}

/** The <svg>…</svg> part of some text, or null if there isn't a whole one. */
export function extractSvg(text: string): string | null {
  const start = text.search(/<svg[\s>]/i);
  const end = text.toLowerCase().lastIndexOf('</svg>');
  if (start === -1 || end < start) return null;
  return text.slice(start, end + '</svg>'.length);
}

// Order matters: ** before *, so bold isn't read as two italics.
const INLINE = /\*\*(.+?)\*\*|__(.+?)__|==(.+?)==|\*([^*\s][^*]*?)\*/;

// While marks are read, each formula stands in as \u0001<n>\u0002, so a "*" or "_" inside the
// maths can't be taken for a mark.
const FORMULA = /\u0001(\d+)\u0002/;
type Formula = { math: string; display?: boolean };

/**
 * Splits one line into styled pieces. Marks can be nested, e.g. **bold ==and highlighted==**.
 * Inline maths ($…$, \(…\)) becomes its own piece, keeping the styles around it.
 */
export function parseInline(text: string, style: SpanStyle = {}): Span[] {
  if (!text.includes('$') && !text.includes('\\(')) return parseMarks(text, style, []);
  const formulas: Formula[] = [];
  let masked = '';
  for (const piece of splitInlineMath(text)) {
    if ('math' in piece) {
      masked += `\u0001${formulas.length}\u0002`;
      formulas.push(piece);
    } else {
      masked += piece.text;
    }
  }
  return parseMarks(masked, style, formulas);
}

function parseMarks(text: string, style: SpanStyle, formulas: Formula[]): Span[] {
  const spans: Span[] = [];
  const plain = (part: string) => {
    let rest = part;
    for (let m = FORMULA.exec(rest); m && formulas.length > 0; m = FORMULA.exec(rest)) {
      if (m.index > 0) spans.push({ ...style, text: rest.slice(0, m.index) });
      const formula = formulas[Number(m[1])];
      spans.push({ ...style, text: latexToText(formula.math), math: formula.math, ...(formula.display ? { display: true } : {}) });
      rest = rest.slice(m.index + m[0].length);
    }
    if (rest) spans.push({ ...style, text: rest });
  };
  let rest = text;
  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match) {
      plain(rest);
      break;
    }
    if (match.index > 0) plain(rest.slice(0, match.index));
    const [, bold, underline, highlight, italic] = match;
    if (bold !== undefined) spans.push(...parseMarks(bold, { ...style, bold: true }, formulas));
    else if (underline !== undefined) spans.push(...parseMarks(underline, { ...style, underline: true }, formulas));
    else if (highlight !== undefined) spans.push(...parseMarks(highlight, { ...style, highlight: true }, formulas));
    else spans.push(...parseMarks(italic, { ...style, italic: true }, formulas));
    rest = rest.slice(match.index + match[0].length);
  }
  return spans;
}

const BLOCK_PREFIX = /^(#{1,4} |- |• |\d+\. )/;

const isTableLine = (line: string) => line.trim().startsWith('|');

/** The |---|:---:| line under a table's header. */
function isTableDivider(line: string): boolean {
  const t = line.trim();
  return t.includes('|') && t.includes('-') && /^[\s|:-]+$/.test(t);
}

/** "| a | b |" -> ["a", "b"]. A "|" inside a formula ("$|x|$") doesn't split cells. */
function tableCells(line: string): string[] {
  let inner = line.trim();
  if (inner.startsWith('|')) inner = inner.slice(1);
  if (inner.endsWith('|')) inner = inner.slice(0, -1);
  if (!inner.includes('$') && !inner.includes('\\(')) return inner.split('|').map((cell) => cell.trim());
  // Hide the formulas while splitting, then put them back as written.
  const raw: string[] = [];
  const masked = splitInlineMath(inner)
    .map((piece) => {
      if (!('math' in piece)) return piece.text.replace(/\$/g, '\\$');
      raw.push(piece.display ? `$$${piece.math}$$` : `$${piece.math}$`);
      return `\u0003${raw.length - 1}\u0004`;
    })
    .join('');
  return masked.split('|').map((cell) => cell.trim().replace(/\u0003(\d+)\u0004/g, (_, n: string) => raw[Number(n)]));
}

/** A run of "|" lines. A |---| line under the first one makes it the header row. */
function parseTable(lines: string[]): Block {
  const hasHeader = lines.length > 1 && isTableDivider(lines[1]);
  const rows: TableRow[] = lines
    .filter((line) => !isTableDivider(line))
    .map((line) => tableCells(line).map((cell) => parseInline(cell)));
  return hasHeader
    ? { type: 'table', spans: [], header: rows[0], rows: rows.slice(1) }
    : { type: 'table', spans: [], rows };
}

export function parseRichText(text: string): Block[] {
  return parseLines(text.split('\n'));
}

/**
 * Where a ":::" fence opened at `start` closes. Fences inside it (a diagram in a box) are
 * skipped over. Without a closing line, it runs to the end.
 */
function fenceEnd(lines: string[], start: number): number {
  let depth = 0;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (isFenceClose(line)) {
      if (depth === 0) return i;
      depth--;
    } else if (FENCE_OPEN.test(line) && !imageRefOf(line)) {
      depth++;
    }
  }
  return lines.length;
}

/** Environments that number their lines; shown as one displayed equation (the reader numbers it). */
const MATH_ENVIRONMENT = /^\\begin\{(equation|align|gather|multline|alignat|flalign)(\*?)\}/;

/**
 * A displayed equation starting at line `i` ($$…$$, \[…\], ```math, or \begin{align}…), as its
 * LaTeX and the line it ends on, or null. An unclosed one is not an equation, so a stray "$$"
 * can't swallow the rest of the note.
 */
function displayMathAt(lines: string[], i: number): { math: string; end: number } | null {
  const first = lines[i].trim();
  const closedBy = (open: string, close: string) => {
    const rest = first.slice(open.length);
    // All on one line: $$ x $$ (but not "$$a$$ and $$b$$", which is text with two formulas).
    if (rest.trimEnd().endsWith(close) && rest.trim().length > close.length) {
      const math = rest.trimEnd().slice(0, -close.length);
      return math.includes(open) || math.includes(close) ? null : { math: math.trim(), end: i };
    }
    const body = [rest];
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j].trimEnd();
      if (t.endsWith(close)) {
        body.push(t.slice(0, -close.length));
        return { math: body.join('\n').trim(), end: j };
      }
      body.push(lines[j]);
    }
    return null;
  };
  if (first.startsWith('$$')) return closedBy('$$', '$$');
  if (first.startsWith('\\[')) return closedBy('\\[', '\\]');
  if (/^```\s*(math|latex|tex|katex)\s*$/i.test(first)) {
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim().startsWith('```')) return { math: lines.slice(i + 1, j).join('\n').trim(), end: j };
    }
    return null;
  }
  const env = MATH_ENVIRONMENT.exec(first);
  if (env) {
    const begin = `\\begin{${env[1]}${env[2]}}`;
    const close = `\\end{${env[1]}${env[2]}}`;
    for (let j = i; j < lines.length; j++) {
      if (!lines[j].includes(close)) continue;
      // One block, numbered as a whole by the reader (or not at all, when starred).
      const all = lines.slice(i, j + 1).join('\n').trim();
      const body = all.slice(begin.length, all.lastIndexOf(close)).trim();
      const inner = env[1] === 'gather' ? 'gathered' : 'aligned';
      const math = env[1] === 'equation' ? body : `\\begin{${inner}}${body}\\end{${inner}}`;
      return { math: env[2] ? `${math} \\notag` : math, end: j };
    }
  }
  return null;
}

function diagramBlock(source: string, caption: string): Block {
  return { type: 'diagram', spans: parseInline(caption.trim()), svg: extractSvg(source) ?? '' };
}

function parseLines(lines: string[]): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // :::image <id>: an attached image, on its own line.
    const imageRef = imageRefOf(trimmed);
    if (imageRef) {
      blocks.push({ type: 'image', spans: [], imageRef });
      continue;
    }

    // :::good / :::bad / :::note boxes, :::diagram, and textbook blocks (:::definition …).
    const fence = FENCE_OPEN.exec(trimmed);
    const kind = fence ? fence[1].toLowerCase() : '';
    if (fence && ENV_KINDS[kind]) {
      const end = fenceEnd(lines, i);
      const { difficulty, title } = splitDifficulty(fence[2].trim());
      blocks.push({
        type: 'env',
        env: ENV_KINDS[kind],
        spans: parseInline(title.trim()),
        children: parseLines(lines.slice(i + 1, end)),
        ...(difficulty ? { difficulty } : {}),
      });
      i = end;
      continue;
    }
    if (fence && (kind === 'diagram' || kind === 'svg' || BOX_KINDS[kind])) {
      const end = fenceEnd(lines, i);
      const inside = lines.slice(i + 1, end);
      blocks.push(
        BOX_KINDS[kind]
          ? { type: 'box', box: BOX_KINDS[kind], spans: parseInline(fence[2].trim()), children: parseLines(inside) }
          : diagramBlock(inside.join('\n'), fence[2]),
      );
      i = end;
      continue;
    }

    // ```svg … ``` fences.
    if (/^```\s*svg\b/i.test(trimmed)) {
      let end = i + 1;
      while (end < lines.length && !lines[end].trim().startsWith('```')) end++;
      blocks.push(diagramBlock(lines.slice(i + 1, end).join('\n'), ''));
      i = end;
      continue;
    }

    // Displayed equations.
    const display = displayMathAt(lines, i);
    if (display) {
      blocks.push({ type: 'math', spans: [{ text: latexToText(display.math) }], math: display.math });
      i = display.end;
      continue;
    }

    // ```lang … ``` code (an unclosed fence runs to the end of the note, as in Markdown).
    const codeFence = /^```\s*([\w+#.-]*)\s*$/.exec(trimmed);
    if (codeFence) {
      let end = i + 1;
      while (end < lines.length && !lines[end].trim().startsWith('```')) end++;
      const code = lines.slice(i + 1, end).join('\n');
      blocks.push({ type: 'code', spans: [{ text: code }], code, ...(codeFence[1] ? { lang: codeFence[1] } : {}) });
      i = end;
      continue;
    }

    // A bare <svg>…</svg>, up to the line that closes it.
    if (/^<svg[\s>]/i.test(trimmed)) {
      let end = i;
      while (end < lines.length && !/<\/svg>/i.test(lines[end])) end++;
      if (end < lines.length) {
        blocks.push(diagramBlock(lines.slice(i, end + 1).join('\n'), ''));
        i = end;
        continue;
      }
    }

    // Two or more "|" lines in a row make a table; a lone one stays a paragraph.
    if (isTableLine(lines[i])) {
      let end = i;
      while (end + 1 < lines.length && isTableLine(lines[end + 1])) end++;
      if (end > i) {
        blocks.push(parseTable(lines.slice(i, end + 1)));
        i = end;
        continue;
      }
    }
    blocks.push(parseLine(lines[i]));
  }
  return blocks;
}

function parseLine(line: string): Block {
  if (line.trim() === '') return { type: 'blank', spans: [] };
  if (line.startsWith('#### ')) return { type: 'h4', spans: parseInline(line.slice(5)) };
  if (line.startsWith('### ')) return { type: 'h3', spans: parseInline(line.slice(4)) };
  if (line.startsWith('## ')) return { type: 'h2', spans: parseInline(line.slice(3)) };
  if (line.startsWith('# ')) return { type: 'h1', spans: parseInline(line.slice(2)) };
  if (line.startsWith('- ') || line.startsWith('• ')) return { type: 'bullet', spans: parseInline(line.slice(2)) };
  const numbered = /^(\d+)\. (.*)$/.exec(line);
  if (numbered) return { type: 'number', number: Number(numbered[1]), spans: parseInline(numbered[2]) };
  return { type: 'paragraph', spans: parseInline(line) };
}

/** The text without formatting marks, for short previews. */
export function toPlainText(text: string): string {
  return blocksToPlainText(parseRichText(text));
}

function blocksToPlainText(blocks: Block[]): string {
  return blocks
    .map((block) => {
      const line = block.spans.map((s) => s.text).join('');
      // A diagram has nothing to read but its caption.
      if (block.type === 'diagram') return line ? `Diagram: ${line}` : '';
      if (block.type === 'image') return '';
      if (block.type === 'box' || block.type === 'env') {
        return [line, blocksToPlainText(block.children ?? [])].filter(Boolean).join('\n');
      }
      if (block.type === 'bullet') return `• ${line}`;
      if (block.type === 'number') return `${block.number}. ${line}`;
      if (block.type === 'table') {
        const plain = (row: TableRow) => row.map((cell) => cell.map((s) => s.text).join('')).join(' · ');
        return [...(block.header ? [block.header] : []), ...(block.rows ?? [])].map(plain).join('\n');
      }
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
 * Turns the selected lines into headings or list items ("# " … "#### ", "- ", "1. ").
 * If every selected line already has that kind of prefix, it is removed instead.
 */
export function toggleLinePrefix(text: string, selection: Selection, prefix: '# ' | '## ' | '### ' | '#### ' | '- ' | '1. '): Edit {
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

const TABLE_TEMPLATE = '| Column 1 | Column 2 |\n|---|---|\n| | |\n| | |';

/**
 * Adds a small table (header row and two empty rows) on its own lines at the cursor,
 * with "Column 1" selected so typing replaces it.
 */
export function insertTable(text: string, selection: Selection): Edit {
  return insertOnOwnLines(text, selection, TABLE_TEMPLATE, 'Column 1');
}

/**
 * Adds a box (":::good Advantages", a bullet, ":::") on its own lines at the cursor,
 * with its title selected so typing replaces it.
 */
export function insertBox(text: string, selection: Selection, kind: BoxKind): Edit {
  const title = kind === 'good' ? 'Advantages' : kind === 'bad' ? 'Limitations' : 'Key points';
  return insertOnOwnLines(text, selection, `:::${kind} ${title}\n- \n:::`, title);
}

/** Puts `template` on its own lines at the cursor (blank line before and after) and selects `select` in it. */
function insertOnOwnLines(text: string, selection: Selection, template: string, select: string): Edit {
  const at = selection.end;
  const before = text.slice(0, at);
  const after = text.slice(at);
  const lead = before === '' ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const rest = after.replace(/^\n{1,2}/, '');
  const tail = rest ? '\n\n' : '';
  const start = before.length + lead.length + template.indexOf(select);
  return {
    text: before + lead + template + tail + rest,
    selection: { start, end: start + select.length },
  };
}

export type ColumnSize = {
  /** Characters in the column's longest cell, capped so one long cell can't take the whole table. */
  text: number;
  /** Characters in its longest single word: the narrowest the column can be without breaking words. */
  word: number;
};

const MAX_COLUMN_CHARS = 40;

/** How much room each column of a table needs, from what is written in it. */
export function tableColumnSizes(block: Pick<Block, 'header' | 'rows'>): ColumnSize[] {
  const rows = [...(block.header ? [block.header] : []), ...(block.rows ?? [])];
  const columns = Math.max(0, ...rows.map((row) => row.length));
  return Array.from({ length: columns }, (_, c) => {
    let text = 1;
    let word = 1;
    for (const row of rows) {
      const cell = (row[c] ?? []).map((s) => s.text).join('').trim();
      text = Math.max(text, Math.min(cell.length, MAX_COLUMN_CHARS));
      for (const w of cell.split(/\s+/)) word = Math.max(word, Math.min(w.length, MAX_COLUMN_CHARS));
    }
    return { text, word };
  });
}
