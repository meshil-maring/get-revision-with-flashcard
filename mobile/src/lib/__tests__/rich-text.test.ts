import { parseInline, parseRichText, toggleLinePrefix, toPlainText, wrapSelection } from '@/lib/rich-text';

describe('parseInline', () => {
  it('reads bold, italic, underline and highlight', () => {
    expect(parseInline('a **b** *c* __d__ ==e==')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', italic: true },
      { text: ' ' },
      { text: 'd', underline: true },
      { text: ' ' },
      { text: 'e', highlight: true },
    ]);
  });

  it('handles nested marks', () => {
    expect(parseInline('**bold ==both==**')).toEqual([
      { text: 'bold ', bold: true },
      { text: 'both', bold: true, highlight: true },
    ]);
  });

  it('leaves lone or unmatched marks as text', () => {
    expect(parseInline('2 * 3 = 6')).toEqual([{ text: '2 * 3 = 6' }]);
    expect(parseInline('**open')).toEqual([{ text: '**open' }]);
  });
});

describe('parseRichText', () => {
  it('reads headings, lists, paragraphs and blank lines', () => {
    const blocks = parseRichText('# Title\n## Sub\n- one\n2. two\n\nplain');
    expect(blocks.map((b) => b.type)).toEqual(['h1', 'h2', 'bullet', 'number', 'blank', 'paragraph']);
    expect(blocks[3].number).toBe(2);
    expect(blocks[0].spans).toEqual([{ text: 'Title' }]);
  });

  it('gives plain text for previews', () => {
    expect(toPlainText('# **Mitosis**\n- one ==key== point\n1. step')).toBe('Mitosis\n• one key point\n1. step');
  });
});

describe('wrapSelection', () => {
  it('wraps the selected text and keeps it selected', () => {
    expect(wrapSelection('make bold now', { start: 5, end: 9 }, '**')).toEqual({
      text: 'make **bold** now',
      selection: { start: 7, end: 11 },
    });
  });

  it('removes the marks when the selection is already wrapped', () => {
    expect(wrapSelection('make **bold** now', { start: 7, end: 11 }, '**')).toEqual({
      text: 'make bold now',
      selection: { start: 5, end: 9 },
    });
  });

  it('puts the cursor between new marks when nothing is selected', () => {
    expect(wrapSelection('ab', { start: 1, end: 1 }, '__')).toEqual({
      text: 'a____b',
      selection: { start: 3, end: 3 },
    });
  });
});

describe('toggleLinePrefix', () => {
  it('turns the current line into a heading and back', () => {
    const on = toggleLinePrefix('first\nsecond', { start: 8, end: 8 }, '# ');
    expect(on.text).toBe('first\n# second');
    expect(toggleLinePrefix(on.text, { start: 9, end: 9 }, '# ').text).toBe('first\nsecond');
  });

  it('numbers every selected line, replacing other prefixes', () => {
    expect(toggleLinePrefix('- a\nb\n# c', { start: 0, end: 9 }, '1. ').text).toBe('1. a\n2. b\n3. c');
  });

  it('makes bullets from several lines', () => {
    expect(toggleLinePrefix('a\nb', { start: 0, end: 3 }, '- ').text).toBe('- a\n- b');
  });
});
