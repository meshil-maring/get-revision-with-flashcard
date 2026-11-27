import { bodyWithoutTitle, convertNote, notePreview, noteSections, readingMinutes, snippet, suggestCards } from '@/lib/notes';

describe('suggestCards', () => {
  it('turns each Cornell cue with notes into a card', () => {
    const cards = suggestCards({
      style: 'cornell',
      body: '',
      rows: [
        { cue: '**What is inertia?**', notes: 'Objects keep moving\n- unless pushed' },
        { cue: 'No notes yet', notes: '' },
        { cue: '', notes: 'Notes without a cue' },
      ],
    });
    expect(cards).toEqual([{ front: 'What is inertia?', back: 'Objects keep moving\n- unless pushed' }]);
  });

  it('turns "Term: definition" lines in plain notes into cards', () => {
    const cards = suggestCards({
      style: 'plain',
      rows: [],
      body: 'Some intro text.\n- **Speed**: distance ÷ time\nVelocity — speed with a direction\nSee https://example.com',
    });
    expect(cards).toEqual([
      { front: 'Speed', back: 'distance ÷ time' },
      { front: 'Velocity', back: 'speed with a direction' },
    ]);
  });

  it('turns each heading with text under it into a card', () => {
    const cards = suggestCards({
      style: 'plain',
      rows: [],
      body: '# Newton’s first law\nAn object stays at rest\nor keeps moving.\n\n## Empty heading\n## Second law\nF = ma',
    });
    expect(cards).toEqual([
      { front: 'Newton’s first law', back: 'An object stays at rest\nor keeps moving.' },
      { front: 'Second law', back: 'F = ma' },
    ]);
  });

  it('finds nothing in a note with no cues, headings or terms', () => {
    expect(suggestCards({ style: 'plain', rows: [], body: 'Just a sentence.' })).toEqual([]);
  });
});

describe('convertNote', () => {
  it('writes Cornell rows as subheadings when switching to plain', () => {
    const plain = convertNote(
      { body: '', rows: [{ cue: 'Inertia', notes: 'Keeps moving' }, { cue: '', notes: 'Loose notes' }], summary: 'Newton 1' },
      'plain',
    );
    expect(plain).toEqual({
      body: '## Inertia\nKeeps moving\n\nLoose notes\n\n## Summary\nNewton 1',
      rows: [],
      summary: '',
    });
  });

  it('turns subheadings back into cues, and a Summary section into the summary', () => {
    const cornell = convertNote(
      { body: 'Intro line\n## Inertia\nKeeps moving\n## Summary\nNewton 1', rows: [], summary: '' },
      'cornell',
    );
    expect(cornell).toEqual({
      body: '',
      rows: [
        { cue: '', notes: 'Intro line' },
        { cue: 'Inertia', notes: 'Keeps moving' },
      ],
      summary: 'Newton 1',
    });
  });

  it('round-trips Cornell → plain → Cornell', () => {
    const original = { body: '', rows: [{ cue: 'Q1', notes: 'A1' }, { cue: 'Q2', notes: 'A2' }], summary: 'Sum' };
    const back = convertNote(convertNote(original, 'plain'), 'cornell');
    expect(back).toEqual(original);
  });

  it('gives an empty Cornell note one empty row', () => {
    expect(convertNote({ body: '', rows: [], summary: '' }, 'cornell').rows).toEqual([{ cue: '', notes: '' }]);
  });
});

describe('snippet and notePreview', () => {
  it('shows the text around the match without formatting marks', () => {
    const text = `${'word '.repeat(40)}**velocity** matters ${'more '.repeat(40)}`;
    const result = snippet(text, 'velocity', 40);
    expect(result).toContain('velocity');
    expect(result.startsWith('…')).toBe(true);
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toContain('**');
  });

  it('previews Cornell notes as cue: notes', () => {
    expect(notePreview({ style: 'cornell', body: '', rows: [{ cue: 'Inertia', notes: 'Keeps moving' }], summary: '' })).toBe(
      'Inertia: Keeps moving',
    );
    expect(
      notePreview({ style: 'cornell', body: '', rows: [{ cue: 'Q', notes: '' }, { cue: 'R', notes: 'S' }], summary: 'Sum' }),
    ).toBe('Q · R: S · Sum');
  });
});

describe('bodyWithoutTitle', () => {
  it('drops a first heading that repeats the title, and the blank lines after it', () => {
    const body = '\n# Principles of Traffic Management\n\n## 1. Meaning\nText';
    expect(bodyWithoutTitle(body, 'Principles of  traffic management ')).toBe('## 1. Meaning\nText');
  });

  it('matches through formatting marks in the heading', () => {
    expect(bodyWithoutTitle('## **Speed**\nFast', 'Speed')).toBe('Fast');
  });

  it('keeps a first heading that says something else, or a title that is not a heading', () => {
    expect(bodyWithoutTitle('# Meaning\nText', 'Speed')).toBe('# Meaning\nText');
    expect(bodyWithoutTitle('Speed\nText', 'Speed')).toBe('Speed\nText');
    expect(bodyWithoutTitle('', 'Speed')).toBe('');
  });
});

describe('noteSections', () => {
  it('splits at the top two heading levels, keeping all the text', () => {
    const body = 'Intro line\n# Waves\nEnergy\n### Detail\nmore\n## **Types**\n- Transverse';
    const sections = noteSections(body);
    expect(sections.map((s) => s.heading)).toEqual([null, 'Waves', 'Types']);
    expect(sections.map((s) => s.text).join('\n')).toBe(body);
  });

  it('ignores headings inside boxes and code, but not after an image line', () => {
    const body = '# One\n:::note Box\n# not a section\n:::\n:::image abc\n```\n# code\n```\n## Two\nx';
    expect(noteSections(body).map((s) => s.heading)).toEqual(['One', 'Two']);
  });

  it('has no empty first section when the note starts with a heading', () => {
    expect(noteSections('\n# A\nx').map((s) => s.heading)).toEqual(['A']);
  });
});

describe('readingMinutes', () => {
  it('is at least a minute, about 200 words a minute', () => {
    expect(readingMinutes('a few words')).toBe(1);
    expect(readingMinutes(Array(1000).fill('word').join(' '))).toBe(5);
  });
});
