// Helpers for notes that don't touch the database.
import type { CornellRow, Note, NoteStyle } from '@/data/types';
import { toPlainText } from '@/lib/rich-text';

export type SuggestedCard = { front: string; back: string };

const LIST_PREFIX = /^(?:[-•] |\d+\. )/;
// "Term: definition" or "Term — definition". The term is short and has no sentence in it.
const TERM_LINE = /^(?:[-•] |\d+\. )?(.{1,80}?)\s*(?::|—|–)\s+(.+)$/;

/** Strips formatting marks from one line, e.g. "**Speed**" → "Speed". */
function plainLine(text: string): string {
  return toPlainText(text).replace(LIST_PREFIX, '').trim();
}

/**
 * Flashcards a note could become, for the user to check before saving:
 * - Cornell notes: each cue is a question, the notes next to it the answer.
 * - Plain notes: "Term: definition" lines become cards, and so does each heading
 *   with the text under it.
 */
export function suggestCards(note: Pick<Note, 'style' | 'body' | 'rows'>): SuggestedCard[] {
  if (note.style === 'cornell') {
    return note.rows
      .filter((r) => r.cue.trim() && r.notes.trim())
      .map((r) => ({ front: plainLine(r.cue), back: r.notes.trim() }));
  }

  const cards: SuggestedCard[] = [];
  let heading: string | null = null;
  let under: string[] = [];

  const closeSection = () => {
    const back = under.join('\n').trim();
    if (heading && back) cards.push({ front: heading, back });
    heading = null;
    under = [];
  };

  // Lines of a diagram's SVG are kept with the section they're in, but never read as terms.
  let inDiagram: 'fence' | 'backticks' | 'svg' | null = null;
  for (const line of note.body.split('\n')) {
    const trimmed = line.trim();
    if (!inDiagram) {
      if (/^:::\s*(diagram|svg)\b/i.test(trimmed)) inDiagram = 'fence';
      else if (/^```\s*svg\b/i.test(trimmed)) inDiagram = 'backticks';
      else if (/^<svg[\s>]/i.test(trimmed) && !/<\/svg>/i.test(trimmed)) inDiagram = 'svg';
    } else if (
      (inDiagram === 'fence' && trimmed === ':::') ||
      (inDiagram === 'backticks' && trimmed.startsWith('```')) ||
      (inDiagram === 'svg' && /<\/svg>/i.test(trimmed))
    ) {
      inDiagram = null;
      if (heading) under.push(line);
      continue;
    }
    if (inDiagram || /^<svg[\s>]/i.test(trimmed)) {
      if (heading) under.push(line);
      continue;
    }
    if (/^#{1,2} /.test(line)) {
      closeSection();
      heading = plainLine(line.replace(/^#{1,2} /, ''));
      continue;
    }
    const term = TERM_LINE.exec(line);
    if (term && !/^https?$/i.test(term[1].trim())) {
      cards.push({ front: plainLine(term[1]), back: term[2].trim() });
      continue;
    }
    if (heading) under.push(line);
  }
  closeSection();

  return cards.filter((c) => c.front && c.back);
}

/**
 * Moves a note's text over when it switches between plain and Cornell, so nothing is lost:
 * Cornell → plain writes each cue as a subheading with its notes under it;
 * plain → Cornell puts each subheading back as a cue (or the whole text in one row).
 */
export function convertNote(
  note: { body: string; rows: CornellRow[]; summary: string },
  to: NoteStyle,
): { body: string; rows: CornellRow[]; summary: string } {
  if (to === 'plain') {
    const parts = note.rows
      .filter((r) => r.cue.trim() || r.notes.trim())
      .map((r) => (r.cue.trim() ? `## ${r.cue.trim()}\n${r.notes.trim()}` : r.notes.trim()));
    if (note.summary.trim()) parts.push(`## Summary\n${note.summary.trim()}`);
    const body = [note.body.trim(), ...parts].filter(Boolean).join('\n\n');
    return { body, rows: [], summary: '' };
  }

  const rows: CornellRow[] = [];
  let summary = note.summary;
  let current: CornellRow | null = null;
  const lead: string[] = [];
  for (const line of note.body.split('\n')) {
    const heading = /^## (.*)$/.exec(line);
    if (heading) {
      current = { cue: heading[1].trim(), notes: '' };
      rows.push(current);
    } else if (current) {
      current.notes += `${line}\n`;
    } else {
      lead.push(line);
    }
  }
  const leadText = lead.join('\n').trim();
  if (leadText) rows.unshift({ cue: '', notes: leadText });
  const cleaned = rows.map((r) => ({ cue: r.cue, notes: r.notes.trim() }));
  // A "Summary" section goes back into the summary box.
  const summaryIndex = cleaned.findIndex((r) => r.cue.toLowerCase() === 'summary');
  if (summaryIndex !== -1) {
    summary = [summary.trim(), cleaned[summaryIndex].notes].filter(Boolean).join('\n');
    cleaned.splice(summaryIndex, 1);
  }
  return { body: '', rows: cleaned.length > 0 ? cleaned : [{ cue: '', notes: '' }], summary };
}

/** A short line of plain text around the first match, for search results. */
export function snippet(text: string, query: string, length = 90): string {
  const plain = toPlainText(text).replace(/\s+/g, ' ').trim();
  const q = query.trim().toLowerCase();
  const at = q ? plain.toLowerCase().indexOf(q) : -1;
  if (at === -1 || plain.length <= length) {
    return plain.length > length ? `${plain.slice(0, length).trimEnd()}…` : plain;
  }
  const start = Math.max(0, at - Math.floor((length - q.length) / 2));
  const end = Math.min(plain.length, start + length);
  return `${start > 0 ? '…' : ''}${plain.slice(start, end).trim()}${end < plain.length ? '…' : ''}`;
}

/** The first bit of a note's content, for showing under its title in a list. */
export function notePreview(note: Pick<Note, 'style' | 'body' | 'rows' | 'summary'>): string {
  const text =
    note.style === 'cornell'
      ? [...note.rows.map((r) => [r.cue, r.notes].filter(Boolean).join(': ')), note.summary].filter(Boolean).join(' · ')
      : note.body;
  return snippet(text, '', 90);
}

/**
 * The note's text without a first heading that only repeats the title. AI apps often
 * start a note with "# <title>", and the screen already shows the title above it.
 * Only for showing and reading the note; the saved text is left as it is.
 */
export function bodyWithoutTitle(body: string, title: string): string {
  const lines = body.split('\n');
  const first = lines.findIndex((line) => line.trim() !== '');
  if (first === -1) return body;
  const heading = /^#{1,4} (.*)$/.exec(lines[first].trim());
  if (!heading || simplify(toPlainText(heading[1])) !== simplify(title)) return body;
  const rest = lines.slice(first + 1);
  while (rest.length > 0 && rest[0].trim() === '') rest.shift();
  return rest.join('\n');
}

const simplify = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

/** A part of a plain note: from one "# " or "## " heading to the next (the first may have none). */
export type NoteSection = { heading: string | null; text: string };

/**
 * Splits a plain note at its top two heading levels, for the article look's contents list.
 * Headings inside ::: boxes, diagrams or ``` fences don't count. Joined back together, the
 * sections are the original text.
 */
export function noteSections(body: string): NoteSection[] {
  const sections: NoteSection[] = [];
  let current: string[] = [];
  let heading: string | null = null;
  let depth = 0;
  let inCode = false;
  const flush = () => {
    if (current.length > 0 && (heading !== null || current.some((l) => l.trim() !== ''))) {
      sections.push({ heading, text: current.join('\n') });
    }
  };
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) inCode = !inCode;
    else if (!inCode && trimmed === ':::') depth = Math.max(0, depth - 1);
    else if (!inCode && /^:::\s*[a-z]/i.test(trimmed) && !/^:::\s*image\s/i.test(trimmed)) depth++;
    const top = /^#{1,2} (.+)$/.exec(line);
    if (top && depth === 0 && !inCode) {
      flush();
      current = [];
      heading = plainLine(top[1]) || top[1].trim();
    }
    current.push(line);
  }
  flush();
  return sections;
}

/** About how long reading a text takes, in whole minutes (at least 1). */
export function readingMinutes(text: string): number {
  const words = toPlainText(text).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * The note an AI app keeps in each folder with the key points of the other notes
 * there (see create_note in backend/src/mcp/tools.ts). It is listed last in its folder.
 */
export const GOOD_TO_KNOW_TITLE = 'Good to know';

export function isGoodToKnow(note: Pick<Note, 'title'>): boolean {
  return note.title.trim().toLowerCase() === GOOD_TO_KNOW_TITLE.toLowerCase();
}
