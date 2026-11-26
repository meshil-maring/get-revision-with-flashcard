import type { Note } from '@/data/types';
import { noteSpeechText, splitForSpeech } from '@/lib/read-aloud';

const NOW = '2026-01-01T00:00:00.000Z';

function note(overrides: Partial<Note>): Note {
  return {
    id: 'n-1',
    folderId: null,
    title: 'Speed',
    style: 'plain',
    body: '',
    rows: [],
    summary: '',
    createdBy: null,
    favoritedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

describe('noteSpeechText', () => {
  it('reads the title, then the body without formatting marks or bullets', () => {
    const text = noteSpeechText(note({ body: '# Motion\n**Speed** is ==fast==\n\n- one\n2. two' }));
    expect(text).toBe('Speed\nMotion\nSpeed is fast\none\n2. two');
  });

  it('reads Cornell notes cue by cue, then the summary', () => {
    const text = noteSpeechText(
      note({ style: 'cornell', rows: [{ cue: 'What is speed?', notes: '*Distance* over time' }], summary: 'Fast things' }),
    );
    expect(text).toBe('Speed\nWhat is speed?\nDistance over time\nSummary.\nFast things');
  });
});

describe('splitForSpeech', () => {
  it('keeps short text in one piece', () => {
    expect(splitForSpeech('one\ntwo', 100)).toEqual(['one\ntwo']);
  });

  it('breaks between lines, then sentences, then words, never over the limit', () => {
    const pieces = splitForSpeech('aaaa bbbb\nOne two. Three four five six.\nxxxxxxxxxxxxxxxxxxxxxxxx', 12);
    expect(pieces.every((p) => p.length <= 12)).toBe(true);
    expect(pieces.join(' ').replace(/\s+/g, ' ')).toBe('aaaa bbbb One two. Three four five six. xxxxxxxxxxxx xxxxxxxxxxxx');
  });

  it('returns nothing for empty text', () => {
    expect(splitForSpeech('')).toEqual([]);
  });
});
