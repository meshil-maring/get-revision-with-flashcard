import {
  buildTextbook,
  exampleParts,
  isQuestion,
  looksLikeTextbook,
  notePages,
  pageKey,
  parseChapterTitle,
  splitStepLabel,
  withoutHeadingNumber,
  type TextbookNode,
} from '@/lib/textbook';

const kinds = (nodes: TextbookNode[]) => nodes.map((n) => (n.kind === 'env' ? `env:${n.env}` : n.kind));

describe('parseChapterTitle', () => {
  it('reads a chapter number from the title', () => {
    expect(parseChapterTitle('Chapter 3: Derivatives')).toEqual({ number: 3, title: 'Derivatives' });
    expect(parseChapterTitle('Unit 12 — Waves')).toEqual({ number: 12, title: 'Waves' });
    expect(parseChapterTitle('2. Limits')).toEqual({ number: 2, title: 'Limits' });
    expect(parseChapterTitle('Derivatives')).toEqual({ number: null, title: 'Derivatives' });
    expect(parseChapterTitle('2024 exam notes')).toEqual({ number: null, title: '2024 exam notes' });
  });
});

describe('looksLikeTextbook', () => {
  it('is true for maths and textbook blocks, false for ordinary notes', () => {
    expect(looksLikeTextbook('Area is $\\pi r^2$')).toBe(true);
    expect(looksLikeTextbook('$$x$$')).toBe(true);
    expect(looksLikeTextbook(':::theorem\nx\n:::')).toBe(true);
    expect(looksLikeTextbook('| $|x|$ | y |\n| a | b |')).toBe(true);
    expect(looksLikeTextbook('# Waves\nIt costs $5 and $10.\n:::good Pros\n- cheap\n:::')).toBe(false);
  });
});

describe('buildTextbook numbering', () => {
  const body = [
    '## Introduction',
    ':::definition Derivative',
    'The rate of change.',
    ':::',
    '$$f\'(x)=\\lim_{h\\to0}\\frac{f(x+h)-f(x)}{h}$$',
    '### Notation',
    ':::theorem Power rule',
    '$$\\frac{d}{dx}x^n = nx^{n-1}$$',
    ':::',
    '## Applications',
    ':::example Tangent line',
    '$$y = 2x - 1$$',
    ':::',
    '$$v = \\frac{ds}{dt} \\notag$$',
    '$$a = \\frac{dv}{dt}$$',
  ].join('\n');

  it('numbers sections from the top heading level used, and things within each section', () => {
    const book = buildTextbook(body);
    expect(book.toc).toEqual([
      { id: 'sec-1', level: 1, number: '1', title: 'Introduction' },
      { id: 'sec-1-1', level: 2, number: '1.1', title: 'Notation' },
      { id: 'sec-2', level: 1, number: '2', title: 'Applications' },
    ]);
    const numbers = book.nodes.map((n) => ('number' in n ? `${n.kind}:${n.number}` : n.kind));
    expect(numbers).toEqual([
      'heading:1',
      'env:1.1', // Definition 1.1
      'math:1.1', // equation (1.1)
      'heading:1.1',
      'env:1.2', // Theorem 1.2 shares the counter with definitions
      'heading:2',
      'env:2.1', // Example 2.1
      'math:null', // \notag
      'math:2.1',
    ]);
    // Equations in a theorem are numbered; working in an example is not.
    const theorem = book.nodes[4] as Extract<TextbookNode, { kind: 'env' }>;
    expect(theorem.children[0]).toMatchObject({ kind: 'math', number: '1.2' });
    const example = book.nodes[6] as Extract<TextbookNode, { kind: 'env' }>;
    expect(example.children[0]).toMatchObject({ kind: 'math', number: null });
    // \notag is taken out before typesetting.
    expect(book.nodes[7]).toMatchObject({ latex: 'v = \\frac{ds}{dt}' });
  });

  it('prefixes everything with the chapter number when there is one', () => {
    const book = buildTextbook(body, { chapter: 4 });
    expect(book.toc.map((e) => e.number)).toEqual(['4.1', '4.1.1', '4.2']);
    expect(book.nodes[1]).toMatchObject({ env: 'definition', number: '4.1' });
    expect(book.nodes[6]).toMatchObject({ env: 'example', number: '4.1' });
    expect(book.nodes[8]).toMatchObject({ kind: 'math', number: '4.3' });
  });

  it('groups list items, skips blank lines and numbers figures', () => {
    const book = buildTextbook('1. One\n\n2. Two\n- a\n- b\n\n:::diagram Forces\n<svg viewBox="0 0 2 1"></svg>\n:::\n:::image img-1');
    expect(kinds(book.nodes)).toEqual(['list', 'list', 'figure', 'figure']);
    expect(book.nodes[0]).toMatchObject({ ordered: true, start: 1, items: [[{ text: 'One' }], [{ text: 'Two' }]] });
    expect(book.nodes.slice(2).map((n) => (n.kind === 'figure' ? n.number : null))).toEqual(['1', '2']);
  });

  it('gives headings unique ids when they repeat without numbers', () => {
    const book = buildTextbook(':::example\n#### Note\n:::\n:::example\n#### Note\n:::');
    const ids = book.nodes.map((n) => (n.kind === 'env' && n.children[0].kind === 'heading' ? n.children[0].id : ''));
    expect(new Set(ids).size).toBe(2);
  });

  it('counts reading time, with equations taking a little longer', () => {
    expect(buildTextbook('word '.repeat(400)).minutes).toBe(2);
    expect(buildTextbook('').minutes).toBe(1);
  });
});

describe('worked examples', () => {
  it('reads step labels, bold or not, and keeps what follows', () => {
    const [p] = buildTextbook('**Step 2:** Apply the *formula*.').nodes;
    if (p.kind !== 'paragraph') throw new Error('expected a paragraph');
    expect(splitStepLabel(p.spans)).toEqual({ role: 'step', label: 'Step 2', rest: [{ text: 'Apply the ' }, { italic: true, text: 'formula' }, { text: '.' }] });
    expect(splitStepLabel([{ text: 'Final answer:' }])).toMatchObject({ role: 'answer', label: 'Final answer', rest: [] });
    expect(splitStepLabel([{ text: 'Stepping back, we see' }])).toBeNull();
  });

  it('splits a labelled example into question, steps and answer', () => {
    const book = buildTextbook(
      [
        ':::example Solving a quadratic equation',
        'Question:',
        '$$2x^2-5x+2=0$$',
        'Step 1: Identify coefficients.',
        '$$a=2,\\quad b=-5,\\quad c=2$$',
        'Step 2: Apply the quadratic formula.',
        '$$x=\\frac{5\\pm\\sqrt{25-16}}{4}$$',
        'Final answer:',
        '$$\\boxed{x=2\\quad\\text{or}\\quad x=\\frac12}$$',
        ':::',
      ].join('\n'),
    );
    const example = book.nodes[0] as Extract<TextbookNode, { kind: 'env' }>;
    expect(example.number).toBe('1');
    expect(example.parts?.map((p) => [p.role, p.label, kinds(p.nodes)])).toEqual([
      ['question', 'Question', ['math']],
      ['step', 'Step 1', ['paragraph', 'math']],
      ['step', 'Step 2', ['paragraph', 'math']],
      ['answer', 'Final answer', ['math']],
    ]);
  });

  it('leaves an unlabelled example as it is', () => {
    expect(exampleParts([{ kind: 'paragraph', spans: [{ text: 'Just text.' }] }])).toBeNull();
  });
});


describe('numbers written in headings', () => {
  it('drops them when the reader numbers the section, so they don’t show twice', () => {
    const book = buildTextbook('## 1. Learning objectives\n## 4. Methods\n### 4.1 Factorisation\n### 4.2. Formula');
    expect(book.toc.map((e) => `${e.number} ${e.title}`)).toEqual(['1 Learning objectives', '2 Methods', '2.1 Factorisation', '2.2 Formula']);
  });

  it('keeps numbers that are part of the heading', () => {
    expect(withoutHeadingNumber([{ text: '3 laws of motion' }])).toEqual([{ text: '3 laws of motion' }]);
    expect(withoutHeadingNumber([{ text: '1990s economy' }])).toEqual([{ text: '1990s economy' }]);
    expect(withoutHeadingNumber([{ text: '2) ' }, { bold: true, text: 'Limits' }])).toEqual([{ bold: true, text: 'Limits' }]);
  });

  it('leaves unnumbered headings (inside blocks) as written', () => {
    const book = buildTextbook(':::example\n#### 1. First\n:::');
    const example = book.nodes[0] as Extract<TextbookNode, { kind: 'env' }>;
    expect(example.children[0]).toMatchObject({ kind: 'heading', number: null, text: '1. First' });
  });
});

describe('handwriting pages', () => {
  const pagesOf = (body: string) => notePages(buildTextbook(body));

  it('gives every heading, question and exercise its own page, in reading order', () => {
    const body = [
      '## 1 Learning objectives',
      'By the end of this chapter, you should be able to:',
      '- Recognise a quadratic equation.',
      '## 2 Introduction',
      'Q1. Solve $x^2 = 4$.',
      '1. Q2) Factorise $x^2 - 9$.',
      '2. Not a question',
      ':::exercise Roots',
      'Find the roots.',
      ':::',
      ':::example',
      '### Inside an example',
      ':::',
    ].join('\n');
    expect(pagesOf(body)).toEqual([
      { page: 'h:learning-objectives', title: '1 Learning objectives' },
      { page: 'h:introduction', title: '2 Introduction' },
      { page: 'q:q1-solve-x²-4', title: 'Q1. Solve x² = 4.' },
      { page: 'q:q2-factorise-x²-9', title: 'Q2) Factorise x² - 9.' },
      { page: 'ex:roots', title: 'Exercise 2.1' },
    ]);
  });

  it('keeps a page with its heading when sections are added or renumbered', () => {
    const before = pagesOf('## 1 Learning objectives\ntext');
    const after = pagesOf('## Warm up\n## 2 Learning objectives\ntext');
    expect(after[1].page).toBe(before[0].page);
  });

  it('tells apart headings with the same words, and works in any alphabet', () => {
    expect(pagesOf('## Example\n## Example\n## উদাহরণ').map((p) => p.page)).toEqual(['h:example', 'h:example~2', 'h:উদাহরণ']);
  });

  it('knows a question line', () => {
    for (const q of ['Q1. Solve', 'q 2) x', 'Q3a: why', 'Question 4 - prove']) expect(isQuestion(q)).toBe(true);
    for (const q of ['Quadratics are fun', 'Q. what', 'Questions about 4 things']) expect(isQuestion(q)).toBe(false);
  });

  it('makes keys from the words alone', () => {
    expect(pageKey('h', '4.1 Factorisation')).toBe('h:factorisation');
    expect(pageKey('q', '!!!')).toBe('q:untitled');
  });
});
