import { insertTable, parseInline, parseRichText, toggleLinePrefix, toPlainText, tableColumnSizes, wrapSelection } from '@/lib/rich-text';

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

  it('reads heading 3 and heading 4', () => {
    const blocks = parseRichText('### Three\n#### Four\n##### not a heading');
    expect(blocks.map((b) => b.type)).toEqual(['h3', 'h4', 'paragraph']);
    expect(blocks[0].spans).toEqual([{ text: 'Three' }]);
    expect(blocks[1].spans).toEqual([{ text: 'Four' }]);
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

describe('tables', () => {
  const TABLE = [
    '## Capacity vs LOS',
    '| Highway Capacity | Level of Service |',
    '|---|:---:|',
    '| How many **vehicles** | Quality of flow |',
    '| Vehicles per hour | Grades A to F |',
    'After the table',
  ].join('\n');

  it('reads "|" lines as a table, with the row above |---| as the header', () => {
    const blocks = parseRichText(TABLE);
    expect(blocks.map((b) => b.type)).toEqual(['h2', 'table', 'paragraph']);
    const table = blocks[1];
    expect(table.header).toEqual([[{ text: 'Highway Capacity' }], [{ text: 'Level of Service' }]]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows?.[0][0]).toEqual([{ text: 'How many ' }, { text: 'vehicles', bold: true }]);
  });

  it('makes a table without a header when there is no |---| line', () => {
    const [table] = parseRichText('| a | b |\n| c | d |');
    expect(table.type).toBe('table');
    expect(table.header).toBeUndefined();
    expect(table.rows).toHaveLength(2);
  });

  it('keeps a single "|" line as a paragraph', () => {
    expect(parseRichText('| just one line |').map((b) => b.type)).toEqual(['paragraph']);
  });

  it('turns a table into plain lines for previews and reading aloud', () => {
    expect(toPlainText(TABLE)).toBe(
      'Capacity vs LOS\nHighway Capacity · Level of Service\nHow many vehicles · Quality of flow\nVehicles per hour · Grades A to F\nAfter the table',
    );
  });

  it('inserts a starter table on its own lines, with the first heading selected', () => {
    const edit = insertTable('Intro', { start: 5, end: 5 });
    expect(edit.text).toBe('Intro\n\n| Column 1 | Column 2 |\n|---|---|\n| | |\n| | |');
    expect(edit.text.slice(edit.selection.start, edit.selection.end)).toBe('Column 1');
    expect(parseRichText(edit.text)[2].type).toBe('table');
  });

  it('leaves a blank line before the text that follows', () => {
    const edit = insertTable('Intro\nMore', { start: 5, end: 5 });
    expect(edit.text).toBe('Intro\n\n| Column 1 | Column 2 |\n|---|---|\n| | |\n| | |\n\nMore');
  });
});

describe('tableColumnSizes', () => {
  it('gives short columns less room than long ones', () => {
    const [table] = parseRichText(
      '| LOS | Traffic condition | Driver freedom |\n|---|---|---|\n| A | Free flow | Very high |\n| F | Forced or breakdown flow | Almost none |',
    );
    expect(tableColumnSizes(table)).toEqual([
      { text: 3, word: 3 },
      { text: 24, word: 9 },
      { text: 14, word: 7 },
    ]);
  });

  it('caps very long cells and counts missing cells as empty', () => {
    const [table] = parseRichText(`| a | b |\n| ${'x'.repeat(80)} |`);
    expect(tableColumnSizes(table)).toEqual([
      { text: 40, word: 40 },
      { text: 1, word: 1 },
    ]);
  });
});
