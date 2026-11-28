// A note as a textbook chapter: the parsed note (rich-text.ts) turned into numbered sections,
// definitions, theorems, worked examples, exercises, equations and figures, with a table of
// contents. Used by the textbook reader (components/textbook); nothing here touches React.
//
// Numbering follows printed textbooks:
// - the top heading level in the note is a section (1, 2…), the next a subsection (1.1), then
//   1.1.1; deeper headings are unnumbered. With a chapter number (from the title, e.g.
//   "Chapter 3: Derivatives"), sections are 3.1, 3.2…
// - definitions, theorems, lemmas, propositions, corollaries and remarks share one counter
//   (Definition 3.1, Theorem 3.2…), examples, exercises, equations and figures have their own.
//   They are prefixed by the chapter number, or else the section number, and start again in
//   each section when there is no chapter number.
// - displayed equations are numbered, except in examples, exercises, proofs and answers, or
//   when they say \notag, \nonumber or \tag{…} (which KaTeX shows itself).
import { latexToText } from '@/lib/math-text';
import { parseRichText, type Block, type BoxKind, type Difficulty, type EnvKind, type Span, type TableRow } from '@/lib/rich-text';

export type HeadingLevel = 1 | 2 | 3 | 4;

/** What a paragraph is in a worked example: "Question:", "Step 2:", "Answer:"… */
export type StepRole = 'question' | 'step' | 'solution' | 'answer';

/**
 * Headings, questions ("Q1. …") and exercises each have their own handwriting page. `page` is
 * its key within the note (see pageKey); null for anything that doesn't have one.
 */
export type TextbookNode =
  | { kind: 'heading'; level: HeadingLevel; number: string | null; id: string; spans: Span[]; text: string; page: string | null }
  | { kind: 'paragraph'; spans: Span[]; page?: string | null }
  | { kind: 'list'; ordered: boolean; start: number; items: Span[][]; pages?: (string | null)[] }
  | { kind: 'math'; latex: string; number: string | null }
  | { kind: 'code'; code: string; lang: string | null }
  | { kind: 'table'; header: TableRow | null; rows: TableRow[] }
  | { kind: 'figure'; number: string | null; svg: string | null; imageRef: string | null; caption: Span[] }
  | {
      kind: 'env';
      env: EnvKind;
      number: string | null;
      id: string;
      title: Span[];
      difficulty: Difficulty | null;
      children: TextbookNode[];
      /** Worked examples: the content in parts (question, steps, answer), when it is labelled so. */
      parts: ExamplePart[] | null;
      /** Exercises: their handwriting page. */
      page?: string | null;
    }
  | { kind: 'box'; box: BoxKind; title: Span[]; children: TextbookNode[] };

/** A part of a worked example: an introduction (no role), the question, a step, or the answer. */
export type ExamplePart = { role: StepRole | null; label: string | null; nodes: TextbookNode[] };

export type TocEntry = { id: string; level: 1 | 2; number: string | null; title: string };

export type Textbook = {
  nodes: TextbookNode[];
  toc: TocEntry[];
  /** About how long reading takes, in whole minutes (at least 1). Equations count extra. */
  minutes: number;
};

/** What each textbook block is called, e.g. "Definition 1.2". */
export const ENV_LABELS: Record<EnvKind, string> = {
  definition: 'Definition',
  theorem: 'Theorem',
  lemma: 'Lemma',
  proposition: 'Proposition',
  corollary: 'Corollary',
  remark: 'Remark',
  proof: 'Proof',
  example: 'Example',
  exercise: 'Exercise',
  hint: 'Hint',
  solution: 'Solution',
  answer: 'Answer',
  summary: 'Summary',
  references: 'References',
};

const THEOREM_LIKE = new Set<EnvKind>(['definition', 'theorem', 'lemma', 'proposition', 'corollary', 'remark']);
/** Inside these, displayed equations are working, not results to refer back to. */
const UNNUMBERED_MATH = new Set<EnvKind>(['example', 'exercise', 'proof', 'hint', 'solution', 'answer']);

/** "Chapter 3: Derivatives" → { number: 3, title: 'Derivatives' }; "3. Derivatives" too. */
export function parseChapterTitle(title: string): { number: number | null; title: string } {
  const t = title.trim();
  const named = /^(?:chapter|ch\.?|unit|lesson|lecture|topic)\s+(\d{1,3})\b\s*[:.\-–—]?\s*(.*)$/i.exec(t);
  if (named) return { number: Number(named[1]), title: named[2].trim() || t };
  const numbered = /^(\d{1,3})[.):]\s+(.+)$/.exec(t);
  if (numbered) return { number: Number(numbered[1]), title: numbered[2].trim() };
  return { number: null, title: t };
}

const spansText = (spans: Span[]) => spans.map((s) => s.text).join('').trim();

/** Whether a note reads best as a textbook: it has maths or textbook blocks. */
export function looksLikeTextbook(body: string): boolean {
  if (!/[$\\]|:::/.test(body)) return false;
  const visit = (blocks: Block[]): boolean =>
    blocks.some(
      (b) =>
        b.type === 'math' ||
        b.type === 'env' ||
        b.spans.some((s) => s.math !== undefined) ||
        (b.rows ?? []).some((row) => row.some((cell) => cell.some((s) => s.math !== undefined))) ||
        visit(b.children ?? []),
    );
  return visit(parseRichText(body));
}

/** Turns a note's text into a numbered textbook chapter. */
export function buildTextbook(body: string, options: { chapter?: number | null } = {}): Textbook {
  const blocks = parseRichText(body);
  const chapter = options.chapter ?? null;

  // The note's top heading level is a section. AI apps often start at "##".
  const levels = blocks.flatMap((b) => (/^h[1-4]$/.test(b.type) ? [Number(b.type[1])] : []));
  const top = levels.length > 0 ? Math.min(...levels) : 1;

  const sections = [0, 0, 0];
  const counters = new Map<string, number>();
  let prefix = chapter === null ? null : String(chapter);
  let words = 0;
  let equations = 0;
  const toc: TocEntry[] = [];
  const usedIds = new Set<string>();
  const pages = new PageKeys();

  const uniqueId = (base: string) => {
    let id = base;
    for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
    usedIds.add(id);
    return id;
  };
  const next = (counter: string) => {
    const n = (counters.get(counter) ?? 0) + 1;
    counters.set(counter, n);
    return prefix ? `${prefix}.${n}` : String(n);
  };

  const convert = (list: Block[], inside: EnvKind | null): TextbookNode[] => {
    const nodes: TextbookNode[] = [];
    for (let i = 0; i < list.length; i++) {
      const block = list[i];
      words += spansText(block.spans).split(/\s+/).filter(Boolean).length;
      switch (block.type) {
        case 'blank':
          break;
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4': {
          const level = Math.min(4, Number(block.type[1]) - top + 1) as HeadingLevel;
          let spans = block.spans;
          let number: string | null = null;
          if (inside === null && level <= 3) {
            sections[level - 1]++;
            for (let k = level; k < 3; k++) sections[k] = 0;
            number = [...(chapter === null ? [] : [chapter]), ...sections.slice(0, level)].join('.');
            // The reader numbers sections; a number the note wrote ("## 4.1 Factorisation") would show twice.
            spans = withoutHeadingNumber(spans);
            if (level === 1 && chapter === null) {
              // Without a chapter number, things are numbered within each section (2.1, 2.2…).
              prefix = String(sections[0]);
              counters.clear();
            }
          }
          const text = spansText(spans);
          const id = uniqueId(number ? `sec-${number.replace(/\./g, '-')}` : `sec-${slug(text)}`);
          // Only headings in the running text get a page (not ones inside an example or a box).
          const page = inside === null ? pages.next('h', spansText(withoutHeadingNumber(block.spans))) : null;
          nodes.push({ kind: 'heading', level, number, id, spans, text, page });
          if (inside === null && level <= 2) toc.push({ id, level: level as 1 | 2, number, title: text });
          break;
        }
        case 'bullet':
        case 'number': {
          const ordered = block.type === 'number';
          const items: Span[][] = [];
          const itemPages: (string | null)[] = [];
          const start = block.number ?? 1;
          let k = i;
          for (; k < list.length; k++) {
            const item = list[k];
            if (item.type === (ordered ? 'number' : 'bullet')) {
              items.push(item.spans);
              itemPages.push(isQuestion(spansText(item.spans)) ? pages.next('q', spansText(item.spans)) : null);
              if (k > i) words += spansText(item.spans).split(/\s+/).filter(Boolean).length;
            } else if (!(item.type === 'blank' && list[k + 1]?.type === (ordered ? 'number' : 'bullet'))) {
              break;
            }
          }
          nodes.push({ kind: 'list', ordered, start, items, ...(itemPages.some(Boolean) ? { pages: itemPages } : {}) });
          i = k - 1;
          break;
        }
        case 'math': {
          const latex = block.math ?? '';
          equations++;
          const numbered = (inside === null || !UNNUMBERED_MATH.has(inside)) && !/\\(notag|nonumber|tag\b)/.test(latex);
          nodes.push({
            kind: 'math',
            latex: latex.replace(/\\(notag|nonumber)\b/g, '').trim(),
            number: numbered ? next('equation') : null,
          });
          break;
        }
        case 'code':
          nodes.push({ kind: 'code', code: block.code ?? '', lang: block.lang ?? null });
          break;
        case 'table':
          nodes.push({ kind: 'table', header: block.header ?? null, rows: block.rows ?? [] });
          break;
        case 'diagram':
          nodes.push({ kind: 'figure', number: next('figure'), svg: block.svg ?? '', imageRef: null, caption: block.spans });
          break;
        case 'image':
          nodes.push({ kind: 'figure', number: next('figure'), svg: null, imageRef: block.imageRef ?? '', caption: [] });
          break;
        case 'box':
          nodes.push({ kind: 'box', box: block.box ?? 'note', title: block.spans, children: convert(block.children ?? [], inside) });
          break;
        case 'env': {
          const env = block.env ?? 'remark';
          const number = THEOREM_LIKE.has(env)
            ? next('theorem')
            : env === 'example'
              ? next('example')
              : env === 'exercise'
                ? next('exercise')
                : null;
          // An exercise's page is keyed by its title, or else its first words.
          const page =
            env === 'exercise'
              ? pages.next('ex', spansText(block.spans) || spansText((block.children ?? []).find((c) => spansText(c.spans))?.spans ?? []))
              : null;
          const children = convert(block.children ?? [], env);
          const id = uniqueId(`${env}-${number ? number.replace(/\./g, '-') : slug(spansText(block.spans)) || 'block'}`);
          nodes.push({
            kind: 'env',
            env,
            number,
            id,
            title: block.spans,
            difficulty: block.difficulty ?? null,
            children,
            parts: env === 'example' || env === 'solution' ? exampleParts(children) : null,
            ...(page ? { page } : {}),
          });
          break;
        }
        default: {
          const text = spansText(block.spans);
          nodes.push({ kind: 'paragraph', spans: block.spans, ...(isQuestion(text) ? { page: pages.next('q', text) } : {}) });
        }
      }
    }
    return nodes;
  };

  const nodes = convert(blocks, null);
  return { nodes, toc, minutes: Math.max(1, Math.round(words / 200 + equations * 0.25)) };
}

// --- Handwriting pages ------------------------------------------------------------------

// "Q1.", "Q 2)", "Q3a:", "Question 4 -" at the start of a paragraph or list item.
const QUESTION = /^\s*(?:q\s?\d+[a-z]?|question\s+\d+[a-z]?)\s*(?:[.):\-–—]|$)/i;

/** Whether a paragraph or list item is a numbered question, e.g. "Q1. Solve x² = 4". */
export const isQuestion = (text: string) => QUESTION.test(text);

/** Lowercase words joined by "-", in any alphabet (so Hindi or Bengali headings work too). */
function pageSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
}

/**
 * A handwriting page's key: what it is (h = heading, q = question, ex = exercise) and its
 * words, e.g. "h:learning-objectives". Section numbers are left out, so adding a section before
 * it keeps the page with its heading.
 */
export function pageKey(kind: 'h' | 'q' | 'ex', text: string): string {
  // "1 Learning objectives", "4.1. Factorisation": the number isn't part of the key.
  const plain = kind === 'h' ? text.replace(/^\s*\d+(?:\.\d+)*[.):]?\s+(?=\S)/, '') : text;
  return `${kind}:${pageSlug(plain) || 'untitled'}`;
}

/** Hands out page keys in reading order; the second "Example" heading gets "h:example~2". */
class PageKeys {
  private seen = new Map<string, number>();
  next(kind: 'h' | 'q' | 'ex', text: string): string {
    const key = pageKey(kind, text);
    const n = (this.seen.get(key) ?? 0) + 1;
    this.seen.set(key, n);
    return n === 1 ? key : `${key}~${n}`;
  }
}

/** Every heading and question in the running text that has a page, in reading order, with its words. */
export function notePages(textbook: Textbook): { page: string; title: string }[] {
  const out: { page: string; title: string }[] = [];
  const visit = (nodes: TextbookNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'heading' && node.page) out.push({ page: node.page, title: node.text });
      else if (node.kind === 'paragraph' && node.page) out.push({ page: node.page, title: spansText(node.spans) });
      else if (node.kind === 'list' && node.pages)
        node.pages.forEach((p, i) => p && out.push({ page: p, title: spansText(node.items[i]) }));
      else if (node.kind === 'env') {
        if (node.page) out.push({ page: node.page, title: `${ENV_LABELS[node.env]}${node.number ? ` ${node.number}` : ''}` });
        visit(node.children);
      } else if (node.kind === 'box') visit(node.children);
    }
  };
  visit(textbook.nodes);
  return out;
}

// "1. ", "2) ", "4.1 ", "4.1. " at the start of a heading; not "3 laws of motion" or "1990s".
const HEADING_NUMBER = /^\s*(?:\d+[.)]|\d+(?:\.\d+)+\.?)(?:\s+(?=\S)|\s*$)/;

/** A heading's spans without a section number written at its start. */
export function withoutHeadingNumber(spans: Span[]): Span[] {
  const first = spans[0];
  if (!first || first.math !== undefined) return spans;
  const match = HEADING_NUMBER.exec(first.text);
  if (!match) return spans;
  const rest = first.text.slice(match[0].length);
  return rest ? [{ ...first, text: rest }, ...spans.slice(1)] : spans.slice(1);
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

// "Question:", "**Step 2.**", "Final answer —" at the start of a paragraph.
const STEP_LABEL = /^(question|problem|given|step\s*\d+|solution|working|final\s+answer|answer|result)\s*(?:[:.\-–—]\s*|$)/i;

/** Reads a paragraph's leading label, and the spans without it. */
export function splitStepLabel(spans: Span[]): { role: StepRole; label: string; rest: Span[] } | null {
  // The label is in the text before any formula.
  let lead = '';
  for (const s of spans) {
    if (s.math !== undefined) break;
    lead += s.text;
  }
  const match = STEP_LABEL.exec(lead.trimStart());
  if (!match) return null;
  const word = match[1].toLowerCase().replace(/\s+/g, ' ');
  const role: StepRole =
    word === 'question' || word === 'problem' || word === 'given'
      ? 'question'
      : word.startsWith('step')
        ? 'step'
        : word === 'solution' || word === 'working'
          ? 'solution'
          : 'answer';
  const label = match[1].replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase());
  // Drop the label's characters (and the space before it) from the start of the spans.
  let drop = lead.length - lead.trimStart().length + match[0].length;
  const rest: Span[] = [];
  for (const s of spans) {
    if (drop <= 0 || s.math !== undefined) {
      rest.push(s);
      continue;
    }
    if (s.text.length <= drop) {
      drop -= s.text.length;
      continue;
    }
    rest.push({ ...s, text: s.text.slice(drop) });
    drop = 0;
  }
  // "**Step 1:** Identify" leaves "Identify"; "Step 1: **Identify**" keeps the bold.
  while (rest.length > 0 && rest[0].math === undefined && rest[0].text.trim() === '') rest.shift();
  if (rest[0] && rest[0].math === undefined) rest[0] = { ...rest[0], text: rest[0].text.trimStart() };
  return { role, label, rest };
}

/**
 * A worked example in parts: a labelled paragraph ("Step 1: …") starts a part, and the
 * equations and text after it belong to it until the next label. Null when nothing is labelled.
 */
export function exampleParts(nodes: TextbookNode[]): ExamplePart[] | null {
  const parts: ExamplePart[] = [];
  let labelled = false;
  for (const node of nodes) {
    const step = node.kind === 'paragraph' ? splitStepLabel(node.spans) : null;
    if (step) {
      labelled = true;
      parts.push({
        role: step.role,
        label: step.label,
        nodes: spansText(step.rest) || step.rest.some((s) => s.math !== undefined) ? [{ kind: 'paragraph', spans: step.rest }] : [],
      });
    } else if (parts.length === 0) {
      parts.push({ role: null, label: null, nodes: [node] });
    } else {
      parts[parts.length - 1].nodes.push(node);
    }
  }
  return labelled ? parts : null;
}

/** Plain-text reading of a formula, e.g. for a screen reader's fallback label. */
export const formulaText = latexToText;
