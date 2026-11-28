import { hasInlineMath, latexToText, splitInlineMath } from '@/lib/math-text';

describe('splitInlineMath', () => {
  it('finds $…$ and \\(…\\) formulas in a line', () => {
    expect(splitInlineMath('Since $x^2 + y^2 = z^2$ and \\(a>0\\).')).toEqual([
      { text: 'Since ' },
      { math: 'x^2 + y^2 = z^2' },
      { text: ' and ' },
      { math: 'a>0' },
      { text: '.' },
    ]);
  });

  it('leaves prices alone (Pandoc rules: no space inside the $, no digit after the closing one)', () => {
    expect(hasInlineMath('It costs $5 and $10.')).toBe(false);
    expect(hasInlineMath('Between $ 5 and 6 $')).toBe(false);
    expect(splitInlineMath('Pay $5, then $x$ more')).toEqual([{ text: 'Pay $5, then ' }, { math: 'x' }, { text: ' more' }]);
  });

  it('reads \\$ as a dollar sign', () => {
    expect(splitInlineMath('A \\$20 note')).toEqual([{ text: 'A $20 note' }]);
    expect(splitInlineMath('$\\$5 + x$')).toEqual([{ math: '\\$5 + x' }]);
  });

  it('reads $$…$$ inside a line as a formula in display style', () => {
    expect(splitInlineMath('so $$\\sum_{k=1}^n k$$ grows')).toEqual([
      { text: 'so ' },
      { math: '\\sum_{k=1}^n k', display: true },
      { text: ' grows' },
    ]);
  });

  it('keeps an unclosed $ as text', () => {
    expect(splitInlineMath('half $x')).toEqual([{ text: 'half $x' }]);
  });
});

describe('latexToText', () => {
  it('reads fractions, roots, powers and Greek letters', () => {
    expect(latexToText('x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}')).toBe('x=(-b±√(b²-4ac))/(2a)');
    expect(latexToText('\\alpha + \\beta = \\pi')).toBe('α + β = π');
    expect(latexToText('a_1')).toBe('a₁');
    expect(latexToText('e^{i\\pi}')).toBe('e^(iπ)');
  });

  it('reads integrals, sums, limits and sets', () => {
    expect(latexToText('\\int_a^b f(x)\\,dx')).toBe('∫ₐ^b f(x) dx'.replace('ₐ', '_a'));
    expect(latexToText('\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1')).toBe('lim_(x → 0) (sin x)/x = 1');
    expect(latexToText('x \\in \\mathbb{R}')).toBe('x ∈ ℝ');
  });

  it('keeps text and drops layout commands', () => {
    expect(latexToText('\\boxed{x=2\\quad\\text{or}\\quad x=\\frac12}')).toBe('x=2 or x=1/2');
    expect(latexToText('\\left( x \\right)')).toBe('( x )');
  });
});
