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

  for (const line of note.body.split('\n')) {
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
