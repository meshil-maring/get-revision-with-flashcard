// Turns a note into plain text for the phone's voice to read out.
// Formatting marks are dropped (the voice would read "star star" otherwise), and
// long notes are cut into pieces, because Android only speaks so much at once.

import type { Note } from '@/data/types';
import { bodyWithoutTitle } from '@/lib/notes';
import { toPlainText } from '@/lib/rich-text';

/** Android's limit is about 4000 characters per piece; stay a little under it. */
const DEFAULT_LIMIT = 3900;

/** What the note says, in reading order: title, then the body (or cues, notes and summary). */
export function noteSpeechText(note: Note): string {
  const parts = [note.title.trim()];
  if (note.style === 'handwritten') return parts[0]; // a drawing can't be read out
  if (note.style === 'cornell') {
    for (const row of note.rows) {
      parts.push(row.cue.trim(), speakable(row.notes));
    }
    if (note.summary.trim()) parts.push('Summary.', speakable(note.summary));
  } else {
    parts.push(speakable(bodyWithoutTitle(note.body, note.title)));
  }
  return parts.filter(Boolean).join('\n');
}

/** Plain text without bullets, which some voices read out as "bullet". */
function speakable(text: string): string {
  return toPlainText(text)
    .split('\n')
    .map((line) => line.replace(/^• /, '').trim())
    .filter(Boolean)
    .join('\n');
}

/** Splits text into pieces no longer than `limit`, breaking between lines, then sentences, then words. */
export function splitForSpeech(text: string, limit = DEFAULT_LIMIT): string[] {
  const pieces: string[] = [];
  let current = '';
  const add = (part: string, joiner: string) => {
    if (!current) current = part;
    else if (current.length + joiner.length + part.length <= limit) current += joiner + part;
    else {
      pieces.push(current);
      current = part;
    }
  };

  for (const line of text.split('\n')) {
    if (line.length <= limit) {
      add(line, '\n');
      continue;
    }
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      if (sentence.length <= limit) {
        add(sentence, ' ');
        continue;
      }
      for (const word of sentence.split(/\s+/)) {
        // A single "word" longer than the limit (a pasted link, say) is cut where it must be.
        for (let i = 0; i < word.length; i += limit) add(word.slice(i, i + limit), ' ');
      }
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * The note as short parts to read one at a time: each line, cut into sentences
 * (and long sentences cut under the limit). Reading part by part is what lets the
 * player show the sentence being read, skip back and forward, and pause.
 */
export function speechParts(note: Note, limit = DEFAULT_LIMIT): string[] {
  return noteSpeechText(note)
    .split('\n')
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .flatMap((sentence) => splitForSpeech(sentence.trim(), limit))
    .filter((part) => part.trim().length > 0);
}
