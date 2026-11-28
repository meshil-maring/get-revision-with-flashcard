/**
 * The textbook reader's page, rendered to HTML as the web (and the Android web view) gets it.
 * @jest-environment node
 */
import { renderToStaticMarkup } from 'react-dom/server';

import { renderMath } from '@/components/textbook/math';
import { TEXTBOOK_CSS } from '@/components/textbook/textbook-styles';
import { themeVariables } from '@/components/textbook/textbook-theme';
import { TextbookView } from '@/components/textbook/textbook-view';
import { DEFAULT_PREFS, type TextbookReaderProps } from '@/components/textbook/types';
import { SAMPLE_CHAPTER } from '@/test-utils/sample-chapter';

function page(body: string, overrides: Partial<TextbookReaderProps> = {}): string {
  return renderToStaticMarkup(
    <TextbookView
      chapter={{ id: 'n-1', title: 'Chapter 2: Calculus', body, path: ['Year 12', 'Mathematics'], tags: [], createdBy: null }}
      images={{}}
      extraImages={[]}
      appTheme="light"
      prefs={DEFAULT_PREFS}
      bookmarks={[]}
      previous={null}
      next={null}
      {...overrides}
    />,
  );
}

/** Whether KaTeX typeset it: its markup is there and no error fallback is shown. */
function typeset(html: string) {
  expect(html).toContain('class="katex"');
  expect(html).not.toContain('tb-math-error');
  expect(html).not.toContain('tb-eq-error');
}

describe('maths', () => {
  it('typesets inline maths inside the sentence, with MathML for screen readers', () => {
    const html = page('Pythagoras says $x^2 + y^2 = z^2$ for right triangles.');
    typeset(html);
    expect(html).toMatch(/Pythagoras says <span class="tb-math-inline"><span class="katex">/);
    expect(html).toContain('<math');
    expect(html).toContain('for right triangles.');
  });

  it('typesets displayed equations, centred in their own sideways-scrolling box, and numbers them', () => {
    const html = page('## Integrals\n$$\\int_a^b f(x)\\,dx = F(b)-F(a)$$');
    typeset(html);
    expect(html).toContain('class="katex-display"');
    expect(html).toMatch(/<div class="tb-eq" id="eq-2-1"><div class="tb-eq-body" tabindex="0">/);
    expect(html).toContain('<span class="tb-eq-num" aria-label="Equation 2.1">(2.1)</span>');
  });

  it.each([
    ['fractions and roots', 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a} + \\sqrt[3]{8}'],
    ['double and triple integrals', '\\iint_D f\\,dA + \\iiint_V g\\,dV'],
    ['limits and sums', '\\lim_{n\\to\\infty}\\sum_{k=1}^{n}\\frac{1}{k^2}=\\frac{\\pi^2}{6}'],
    ['matrices and determinants', '\\det\\begin{pmatrix}a & b\\\\ c & d\\end{pmatrix} = \\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}'],
    ['derivatives and partial derivatives', "\\frac{dy}{dx}, \\frac{\\partial^2 u}{\\partial x^2}, f''(x)"],
    ['differential equations', "y'' + 3y' + 2y = 0,\\quad \\frac{\\partial u}{\\partial t}=k\\nabla^2u"],
    ['piecewise functions', '|x| = \\begin{cases} x & x\\ge0 \\\\ -x & x<0 \\end{cases}'],
    ['vectors and Greek letters', '\\vec{F}=m\\vec{a},\\ \\mathbf{v}\\cdot\\hat{n},\\ \\alpha\\beta\\Gamma\\Omega'],
    ['trigonometry', '\\sin^2\\theta+\\cos^2\\theta=1,\\ \\tan\\theta=\\frac{\\sin\\theta}{\\cos\\theta}'],
    ['aligned equations', '\\begin{aligned} f(x) &= x^2 \\\\ f\'(x) &= 2x \\end{aligned}'],
    ['a boxed answer', '\\boxed{x=2\\quad\\text{or}\\quad x=\\frac12}'],
    ['chemistry', '\\ce{2H2 + O2 -> 2H2O}'],
    ['the shorthand macros', '\\R, \\N, \\abs{x}, \\dd x'],
  ])('typesets %s', (_, latex) => {
    expect(renderMath(latex, true)).toHaveProperty('html');
    typeset(page(`$$${latex}$$`));
  });

  it('typesets an align environment written straight into the note as one numbered equation', () => {
    const html = page('\\begin{align}\na &= b + c \\\\\nd &= e\n\\end{align}');
    typeset(html);
    expect(html).toContain('(2.1)');
  });

  it('shows broken LaTeX as marked source with the reason, and keeps the rest of the page', () => {
    const html = page('Before $\\frac{1}{$ middle\n$$\\begin{matrix} a & b$$\nAfter');
    expect(html).toContain('<code class="tb-math-error" title="This formula could not be shown:');
    expect(html).toContain('\\frac{1}{</code>');
    expect(html).toContain('<b>This equation could not be shown');
    expect(html).toContain('<pre>\\begin{matrix} a &amp; b</pre>');
    expect(html).toContain('<p>After</p>');
  });

  it('never runs or links what is written in a note', () => {
    const html = page(
      [
        '<img src=x onerror=alert(1)> **<script>alert(2)</script>**',
        '$\\href{javascript:alert(3)}{click}$',
        '$\\htmlClass{x}{y}$',
        '| <b onclick=x>cell</b> |',
        '| - |',
      ].join('\n'),
    );
    // No tag from the note made it in, and no tag has an event handler or a link.
    expect(html).not.toMatch(/<(script|img src=x|b onclick|a)[\s>]/i);
    expect(html).not.toMatch(/<[^>]*\s(on[a-z]+|href)=/i);
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    // \href and \htmlClass need trust, which is off: KaTeX shows them as red source, not as a link.
    expect(html).toContain('<span class="mord" style="color:#cc0000;">\\href</span>');
    expect(html).toContain('<span class="mord" style="color:#cc0000;">\\htmlClass</span>');
  });
});

describe('textbook structure', () => {
  it('shows the chapter heading: subject, chapter number, title and reading time', () => {
    const html = page('Calculus studies change.\n## Limits\nText');
    expect(html).toContain('<p class="tb-eyebrow">Mathematics</p>');
    expect(html).toContain('<span class="tb-chapter-num">Chapter 2</span>Calculus</h1>');
    expect(html).toContain('1 min read');
    // The text before the first section introduces the chapter.
    expect(html).toContain('<p class="tb-lead">Calculus studies change.</p>');
    expect(html).toContain('<h2 id="sec-2-1" class="tb-h tb-h1" data-section="sec-2-1"><span class="tb-num">2.1</span>Limits</h2>');
  });

  it('sets definitions, theorems, proofs and remarks apart, each numbered as in a book', () => {
    const html = page(
      ':::definition Derivative\nThe rate of change.\n:::\n:::theorem Mean value\nThere is a $c$.\n:::\n:::proof\nBy Rolle.\n:::\n:::remark\nNote.\n:::',
    );
    expect(html).toContain('class="tb-env tb-definition"');
    expect(html).toMatch(/<span>Definition 2\.1<\/span><span class="tb-label-title">— Derivative<\/span>/);
    expect(html).toContain('class="tb-env tb-theorem"');
    expect(html).toContain('<span>Theorem 2.2</span>');
    expect(html).toContain('class="tb-env tb-proof"');
    expect(html).toContain('∎');
    expect(html).toContain('<span>Remark 2.3</span>');
  });

  it('lays out a worked example as question, numbered steps and a boxed final answer', () => {
    const html = page(
      [
        ':::example Solving a quadratic equation',
        'Question:',
        '$$2x^2-5x+2=0$$',
        'Step 1: Identify coefficients.',
        '$$a=2,\\quad b=-5,\\quad c=2$$',
        'Step 2: Apply the quadratic formula.',
        '$$x=\\frac{5\\pm\\sqrt{25-16}}{4}$$',
        'Step 3: Simplify.',
        '$$x=\\frac{5\\pm3}{4}$$',
        'Final answer:',
        '$$\\boxed{x=2\\quad\\text{or}\\quad x=\\frac12}$$',
        ':::',
      ].join('\n'),
    );
    typeset(html);
    expect(html).toContain('<span>Example 2.1</span><span class="tb-label-title">— Solving a quadratic equation</span>');
    expect(html).toContain('<div class="tb-part tb-question"><div class="tb-part-label">Question</div>');
    expect(html.match(/<li class="tb-step">/g)).toHaveLength(3);
    expect(html).toContain('<p class="tb-step-title">Identify coefficients.</p>');
    expect(html).toContain('<div class="tb-part tb-answer" role="group" aria-label="Final answer"><div class="tb-part-label">Final answer</div>');
    // Working isn't numbered.
    expect(html).not.toContain('tb-eq-num');
  });

  it('shows exercises with difficulty, and hints, solutions and answers folded until opened', () => {
    const html = page(':::exercise [medium] Derivatives\n1. Differentiate $x^3$.\n:::hint\nPower rule.\n:::\n:::solution\n$3x^2$\n:::\n:::');
    expect(html).toContain('<span>Exercise 2.1</span>');
    expect(html).toContain('<span class="tb-level tb-level-medium">medium</span>');
    expect(html).toContain('<details class="tb-fold tb-fold-hint"');
    expect(html).toContain('<summary>Hint</summary>');
    expect(html).toContain('<details class="tb-fold tb-fold-solution"');
    expect(html).not.toContain('<details open');
  });

  it('shows a summary and references at the end of a chapter', () => {
    const html = page(':::summary\n- Limits\n:::\n:::references\n1. Stewart, *Calculus*.\n:::');
    expect(html).toContain('<aside class="tb-env tb-summary"');
    expect(html).toContain('<section class="tb-env tb-references"');
    expect(html).toContain('<em>Calculus</em>');
  });

  it('lists the sections in the contents, with bookmarks', () => {
    const html = page('# One\n## One A\n# Two', { bookmarks: ['sec-2-2'] });
    expect(html).toContain('<nav class="tb-toc" aria-label="Contents">');
    expect(html).toContain('<span class="tb-toc-num">2.1.1</span><span>One A</span>');
    expect(html).toContain('aria-label="Remove bookmark from Two"');
    expect(html).toContain('<h2>Bookmarks</h2>');
  });

  it('offers the previous and next chapters at the end', () => {
    const html = page('Text', { previous: null, next: { title: 'Chapter 3: Integrals' } });
    expect(html).toContain('<nav class="tb-pager" aria-label="Chapters">');
    expect(html).toContain('<span>Chapter 3: Integrals</span>');
  });
});

describe('tables, code, diagrams and images (as in standard notes)', () => {
  it('rules tables like a book, scrolling sideways when wide, with maths in cells', () => {
    const html = page('| $x$ | $|x|$ |\n|---|---|\n| $-2$ | 2 |');
    typeset(html);
    expect(html).toContain('<div class="tb-table-wrap" tabindex="0" role="region" aria-label="Table with 2 columns"><table class="tb-table"><thead>');
    expect(html.match(/<th scope="col">/g)).toHaveLength(2);
  });

  it('shows code exactly as written, in its own scrolling box', () => {
    const html = page('```python\nif a < b and c**2:\n    print("**x**")\n```');
    expect(html).toContain('<div class="tb-code-lang">python</div>');
    expect(html).toContain('<pre tabindex="0"><code>if a &lt; b and c**2:\n    print(&quot;**x**&quot;)</code></pre>');
  });

  it('draws diagrams as images (never inline SVG), numbered with their caption', () => {
    const html = page(':::diagram Forces on a block\n<svg viewBox="0 0 200 100"><script>alert(1)</script><rect width="10" height="10"/></svg>\n:::');
    expect(html).toMatch(/<img src="data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+" alt="Figure 2\.1: Forces on a block"\/>/);
    expect(html).not.toContain('<svg viewBox="0 0 200 100"');
    expect(html).toContain('<b>Figure 2.1</b>Forces on a block');
  });

  it('places attached images where the text says, and the others at the end', () => {
    const images = {
      'img-1': { uri: 'data:image/png;base64,AAAA', caption: 'A crossroads', alt: 'Two roads crossing', name: 'a.png' },
      'img-2': { uri: '', caption: null, alt: null, name: 'b.png' },
    };
    const html = page('Intro\n:::image img-1\n:::image missing', { images, extraImages: ['img-2'] });
    expect(html).toContain('<img src="data:image/png;base64,AAAA" alt="Two roads crossing" loading="lazy" decoding="async"/>');
    expect(html).toContain('<b>Figure 2.1</b>A crossroads');
    expect(html).toContain('This image is still downloading.');
  });
});

describe('themes and layout', () => {
  it('uses the light theme tokens, or the dark ones', () => {
    const light = page('x');
    expect(light).toContain('data-theme="light"');
    expect(light).toContain('--tb-page:#FAF9F6');
    expect(light).toContain('--tb-heading:#243B5A');
    const dark = page('x', { appTheme: 'dark' });
    expect(dark).toContain('data-theme="dark"');
    expect(dark).toContain('--tb-page:#151719');
    expect(dark).toContain('--tb-formula:#222831');
    expect(dark).toContain('color-scheme:dark');
  });

  it('can use its own theme instead of the app’s', () => {
    expect(page('x', { appTheme: 'light', prefs: { ...DEFAULT_PREFS, theme: 'dark' } })).toContain('data-theme="dark"');
  });

  it('applies the text size and column width', () => {
    const html = page('x', { prefs: { size: 3, width: 'wide', theme: 'app' } });
    expect(html).toContain('data-width="wide"');
    expect(html).toContain('--tb-scale:1.22');
  });

  it('has the phone and wide-screen layouts, and keeps wide content from widening the page', () => {
    expect(TEXTBOOK_CSS).toContain('@media (min-width:1100px){\n  .tb-layout{display:grid;grid-template-columns:232px minmax(0,var(--tb-measure)) 232px');
    expect(TEXTBOOK_CSS).toContain('.tb-scroll{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden');
    expect(TEXTBOOK_CSS).toContain('.tb-eq-body{flex:1;min-width:0;overflow-x:auto');
    expect(TEXTBOOK_CSS).toContain('.tb-table-wrap{margin:1.3em 0 1.5em;overflow-x:auto');
    expect(TEXTBOOK_CSS).toContain('.tb-figure img{display:block;max-width:100%');
    // Everything is under .tb- so it can't change the rest of the web app.
    const selectors = TEXTBOOK_CSS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{[^{}]*\}/g, '').replace(/@media[^{]*\{/g, '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    expect(selectors.filter((s) => s !== '}' && !s.includes('.tb'))).toEqual([]);
  });

  it('writes theme tokens as CSS variables', () => {
    expect(themeVariables('dark')).toContain('--tb-example-fill:#1A1F27');
  });
});

describe('a whole chapter', () => {
  it('typesets the sample chapter, with only its deliberately broken formula shown as an error', () => {
    const html = page(SAMPLE_CHAPTER);
    expect(html.match(/tb-math-error|tb-eq-error/g)).toHaveLength(1);
    expect(html.match(/class="katex"/g)?.length).toBeGreaterThan(40);
    expect(html.match(/class="tb-eq-num"/g)).toHaveLength(6);
  });
});

describe('focus mode', () => {
  it('offers focus mode from the toolbar', () => {
    const html = page('x');
    expect(html).toContain('data-focus="false"');
    expect(html).toContain('aria-label="Focus mode"');
  });

  it('shows one column on every screen size, with contents and settings in the toolbar, and a way out', () => {
    const html = page('# One\nText', { focus: true });
    expect(html).toContain('data-focus="true"');
    expect(html).toContain('aria-label="Exit focus mode"');
    expect(html).toContain('aria-label="Contents"');
    expect(html).toContain('aria-label="Reading settings"');
    // Outside any media query, so it applies at every width.
    const outsideMedia = TEXTBOOK_CSS.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    expect(outsideMedia).toContain('.tb-shell[data-focus=true] .tb-side{display:none !important}');
    expect(outsideMedia).toContain('.tb-shell[data-focus=true] .tb-icon-btn.tb-only-narrow{display:inline-flex !important}');
  });
});

describe('lists', () => {
  it('keep their markers even under the web app’s base styles', () => {
    expect(TEXTBOOK_CSS).toContain('.tb-article ul{list-style:disc outside}');
    expect(TEXTBOOK_CSS).toContain('.tb-article ol{list-style:decimal outside}');
  });
});
