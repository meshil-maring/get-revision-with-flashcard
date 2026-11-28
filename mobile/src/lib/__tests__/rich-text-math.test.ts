// Maths, code and textbook blocks in the note format (rich-text.ts), and that what was there
// before reads as it always did.
import { parseInline, parseRichText, toPlainText } from '@/lib/rich-text';

describe('inline maths', () => {
  it('becomes its own piece, with a plain reading in text', () => {
    expect(parseInline('Area $A=\\pi r^2$ here')).toEqual([
      { text: 'Area ' },
      { text: 'A=π r²', math: 'A=\\pi r^2' },
      { text: ' here' },
    ]);
  });

  it('is not broken up by * or _ inside it, and keeps the marks around it', () => {
    expect(parseInline('**so $a*b*c$ and $x_1$**')).toEqual([
      { bold: true, text: 'so ' },
      { bold: true, text: 'a*b*c', math: 'a*b*c' },
      { bold: true, text: ' and ' },
      { bold: true, text: 'x₁', math: 'x_1' },
    ]);
  });

  it('leaves lines without maths exactly as before', () => {
    expect(parseInline('**bold** and *italic* cost $5')).toEqual([
      { bold: true, text: 'bold' },
      { text: ' and ' },
      { italic: true, text: 'italic' },
      { text: ' cost $5' },
    ]);
  });
});

describe('displayed equations', () => {
  it('reads $$…$$ on one line or over several', () => {
    expect(parseRichText('$$E=mc^2$$')).toMatchObject([{ type: 'math', math: 'E=mc^2' }]);
    expect(parseRichText('$$\n\\int_a^b f(x)\\,dx\n= F(b)-F(a)\n$$\nAfter')).toMatchObject([
      { type: 'math', math: '\\int_a^b f(x)\\,dx\n= F(b)-F(a)' },
      { type: 'paragraph', spans: [{ text: 'After' }] },
    ]);
  });

  it('reads \\[…\\], ```math fences and align environments', () => {
    expect(parseRichText('\\[\nx=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}\n\\]')).toMatchObject([
      { type: 'math', math: 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}' },
    ]);
    expect(parseRichText('```math\na^2+b^2=c^2\n```')).toMatchObject([{ type: 'math', math: 'a^2+b^2=c^2' }]);
    expect(parseRichText('\\begin{align}\nf(x) &= x^2 \\\\\nf\'(x) &= 2x\n\\end{align}')).toMatchObject([
      { type: 'math', math: "\\begin{aligned}f(x) &= x^2 \\\\\nf'(x) &= 2x\\end{aligned}" },
    ]);
    expect(parseRichText('\\begin{align*}\na &= b\n\\end{align*}')[0].math).toMatch(/\\notag$/);
  });

  it('keeps a stray $$ that never closes as text, so the rest of the note still shows', () => {
    const blocks = parseRichText('$$ oops\n# Heading\nText');
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'h1', 'paragraph']);
  });

  it('reads two formulas on one line as text with inline maths', () => {
    const [block] = parseRichText('$$a$$ and $$b$$');
    expect(block.type).toBe('paragraph');
    expect(block.spans.filter((s) => s.math !== undefined)).toHaveLength(2);
  });
});

describe('code', () => {
  it('reads ``` fences with or without a language', () => {
    expect(parseRichText('```python\nprint("**hi**")\n```')).toMatchObject([{ type: 'code', lang: 'python', code: 'print("**hi**")' }]);
    expect(parseRichText('```\nx = 1\n```')[0]).toMatchObject({ type: 'code', code: 'x = 1' });
  });

  it('still reads ```svg fences as diagrams', () => {
    expect(parseRichText('```svg\n<svg viewBox="0 0 1 1"></svg>\n```')[0].type).toBe('diagram');
  });
});

describe('textbook blocks', () => {
  it('reads definitions, theorems and proofs with their content', () => {
    const [def] = parseRichText(':::definition Derivative\nThe rate of change $f\'(x)$.\n:::');
    expect(def).toMatchObject({ type: 'env', env: 'definition', spans: [{ text: 'Derivative' }] });
    expect(def.children?.[0].spans[1]).toMatchObject({ math: "f'(x)" });
    expect(parseRichText(':::thm Pythagoras\n$$a^2+b^2=c^2$$\n:::')[0]).toMatchObject({ env: 'theorem', children: [{ type: 'math' }] });
  });

  it('reads an exercise with its difficulty, and hints and solutions inside it', () => {
    const [exercise] = parseRichText(':::exercise [hard] Limits\n1. Find $\\lim_{x\\to0}x$.\n:::hint\nSubstitute.\n:::\n:::solution\n0\n:::\n:::');
    expect(exercise).toMatchObject({ type: 'env', env: 'exercise', difficulty: 'hard', spans: [{ text: 'Limits' }] });
    expect(exercise.children?.map((c) => c.env ?? c.type)).toEqual(['number', 'hint', 'solution']);
    expect(parseRichText(':::problem Rates (Easy)\nx\n:::')[0]).toMatchObject({ env: 'exercise', difficulty: 'easy', spans: [{ text: 'Rates' }] });
  });

  it('leaves the existing boxes and diagrams as they were', () => {
    expect(parseRichText(':::good Advantages\n- Fast\n:::')[0]).toMatchObject({ type: 'box', box: 'good' });
    expect(parseRichText(':::note Key\nx\n:::')[0]).toMatchObject({ type: 'box', box: 'note' });
    expect(parseRichText(':::image abc-123')[0]).toMatchObject({ type: 'image', imageRef: 'abc-123' });
  });
});

describe('tables with maths', () => {
  it('does not split a cell at a | inside a formula', () => {
    const [table] = parseRichText('| f | Value |\n|---|---|\n| $|x|$ | $\\sqrt{2}$ |');
    expect(table.rows?.[0].map((cell) => cell.map((s) => s.math ?? s.text).join(''))).toEqual(['|x|', '\\sqrt{2}']);
  });
});

describe('toPlainText', () => {
  it('reads formulas and textbook blocks as plain text', () => {
    expect(toPlainText(':::definition Speed\n$v=\\frac{d}{t}$\n:::\n$$a^2$$\n```\ncode\n```')).toBe('Speed\nv=d/t\na²\ncode');
  });
});
