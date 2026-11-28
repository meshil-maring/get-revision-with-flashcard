// Maths in note text, written the way LaTeX and most AI apps write it:
//
//   inline:   $x^2 + y^2 = z^2$      or  \(x^2\)
//   display:  $$\int_a^b f(x)\,dx$$  or  \[ … \]  (on their own lines; see rich-text.ts)
//
// "$" follows the Pandoc rule so prices still read as text: an opening $ must have a
// non-space right after it, a closing $ a non-space right before it and no digit right after
// it. "\$" is a plain dollar sign.

export type MathPiece = { text: string } | { math: string; display?: boolean };

/** Where the next inline formula starts and ends in `text`, from `from`, or null. */
function nextInlineMath(text: string, from: number): { start: number; end: number; math: string; display: boolean } | null {
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') {
      if (text[i + 1] === '(') {
        const close = text.indexOf('\\)', i + 2);
        if (close !== -1 && close > i + 2) return { start: i, end: close + 2, math: text.slice(i + 2, close), display: false };
      }
      i++; // skip the escaped character (e.g. \$)
      continue;
    }
    if (c !== '$') continue;
    // $$…$$ inside a line: a formula in display style.
    if (text[i + 1] === '$') {
      const close = text.indexOf('$$', i + 2);
      if (close !== -1 && text.slice(i + 2, close).trim()) {
        return { start: i, end: close + 2, math: text.slice(i + 2, close).trim(), display: true };
      }
      i++;
      continue;
    }
    const after = text[i + 1];
    if (after === undefined || /\s/.test(after)) continue;
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === '\\') {
        j++;
        continue;
      }
      if (text[j] !== '$') continue;
      // The next $ must close it; if it can't ("$5, then $x$"), this $ was not maths.
      if (/\s/.test(text[j - 1]) || /\d/.test(text[j + 1] ?? '')) break;
      return { start: i, end: j + 1, math: text.slice(i + 1, j), display: false };
    }
  }
  return null;
}

/** Splits a line into text and inline formulas. "\$" in the text becomes "$". */
export function splitInlineMath(text: string): MathPiece[] {
  const pieces: MathPiece[] = [];
  let at = 0;
  for (;;) {
    const found = nextInlineMath(text, at);
    if (!found) break;
    if (found.start > at) pieces.push({ text: unescapeDollars(text.slice(at, found.start)) });
    pieces.push(found.display ? { math: found.math, display: true } : { math: found.math });
    at = found.end;
  }
  if (at < text.length) pieces.push({ text: unescapeDollars(text.slice(at)) });
  return pieces;
}

/** Whether a line has any inline formula. */
export function hasInlineMath(text: string): boolean {
  return nextInlineMath(text, 0) !== null;
}

const unescapeDollars = (text: string) => text.replace(/\\\$/g, '$');

// --- Maths as plain text --------------------------------------------------------
// For places that can't typeset (the standard note view, previews, flashcards, reading
// aloud): "\frac{a}{b}" → "a/b", "\alpha" → "α", "x^2" → "x²". It is a readable
// approximation, not a full LaTeX reader.

const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
  varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'φ',
  varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ',
  Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠',
  neq: '≠', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝', infty: '∞',
  to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔',
  Leftrightarrow: '⇔', implies: '⇒', iff: '⇔', mapsto: '↦', gets: '←',
  sum: 'Σ', prod: 'Π', int: '∫', iint: '∬', iiint: '∭', oint: '∮', partial: '∂', nabla: '∇',
  in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇', cup: '∪', cap: '∩',
  emptyset: '∅', varnothing: '∅', forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨', wedge: '∧',
  vee: '∨', angle: '∠', perp: '⊥', parallel: '∥', circ: '∘', degree: '°', ldots: '…', cdots: '⋯',
  dots: '…', vdots: '⋮', ddots: '⋱', prime: '′', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ',
  mathbb: '', langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉',
  quad: ' ', qquad: '  ', ',': ' ', ';': ' ', ':': ' ', '!': '', ' ': ' ', '\\': '; ',
  sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc', log: 'log', ln: 'ln',
  exp: 'exp', lim: 'lim', max: 'max', min: 'min', det: 'det', arcsin: 'arcsin', arccos: 'arccos',
  arctan: 'arctan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', gcd: 'gcd', deg: 'deg',
  left: '', right: '', big: '', Big: '', bigg: '', Bigg: '', displaystyle: '', textstyle: '',
  nonumber: '', notag: '', limits: '', nolimits: '',
};

const BLACKBOARD: Record<string, string> = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ' };
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ',
};
const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
};

/** Reads one {…} group (or one character) at `i`: its content and where it ends. */
function readGroup(s: string, i: number): { body: string; end: number } {
  while (s[i] === ' ') i++;
  if (s[i] !== '{') {
    if (s[i] === '\\') {
      const name = /^\\([A-Za-z]+|.)/.exec(s.slice(i))?.[0] ?? '\\';
      return { body: name, end: i + name.length };
    }
    return { body: s[i] ?? '', end: i + 1 };
  }
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}' && --depth === 0) return { body: s.slice(i + 1, j), end: j + 1 };
  }
  return { body: s.slice(i + 1), end: s.length };
}

/** Wraps a part in brackets unless it is one symbol or number, e.g. a/(b+c), 1/(2a), 1/2. */
const grouped = (text: string) => (/^(?:.|\d+(?:\.\d+)?|\(.*\))$/u.test(text) ? text : `(${text})`);

function scripted(text: string, map: Record<string, string>, mark: string): string {
  const chars = [...text];
  return chars.every((c) => map[c]) ? chars.map((c) => map[c]).join('') : `${mark}${grouped(text)}`;
}

/** A readable plain-text version of a formula. */
export function latexToText(latex: string): string {
  let out = '';
  const s = latex.replace(/\\begin\{[a-z*]+\}(\{[^}]*\})?|\\end\{[a-z*]+\}/g, ' ').replace(/&/g, ' ');
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === '\\') {
      const name = /^\\([A-Za-z]+|.)/.exec(s.slice(i))?.[1] ?? '';
      i += name.length + 1;
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const top = readGroup(s, i);
        const bottom = readGroup(s, top.end);
        out += `${grouped(latexToText(top.body))}/${grouped(latexToText(bottom.body))}`;
        i = bottom.end;
      } else if (name === 'sqrt') {
        let index = '';
        if (s[i] === '[') {
          const close = s.indexOf(']', i);
          index = s.slice(i + 1, close);
          i = close + 1;
        }
        const arg = readGroup(s, i);
        out += `${index === '3' ? '∛' : index === '4' ? '∜' : index ? scripted(index, SUPERSCRIPT, '') : ''}√${grouped(latexToText(arg.body))}`;
        i = arg.end;
      } else if (name === 'mathbb') {
        const arg = readGroup(s, i);
        out += BLACKBOARD[arg.body] ?? arg.body;
        i = arg.end;
      } else if (['text', 'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathcal', 'operatorname', 'boxed', 'vec', 'overline', 'hat', 'bar', 'textbf', 'textit', 'ce', 'pu', 'tag'].includes(name)) {
        const arg = readGroup(s, i);
        const inner = name.startsWith('text') || name === 'operatorname' ? arg.body : latexToText(arg.body);
        out += name === 'vec' ? `${inner}⃗` : name === 'hat' ? `${inner}̂` : name === 'bar' || name === 'overline' ? `${inner}̄` : name === 'tag' ? ` (${inner})` : inner;
        i = arg.end;
      } else if (name in SYMBOLS) {
        const symbol = SYMBOLS[name];
        // Keep words apart: "\sin x" → "sin x", "\pi r" → "π r".
        out += /^[a-z]{2,}$/i.test(symbol) && /\w$/.test(out) ? ` ${symbol}` : symbol;
      } else if (name === '{' || name === '}' || name === '$' || name === '%' || name === '#' || name === '_') {
        out += name;
      }
      // Anything else (\label, \mathstrut…) is left out.
      continue;
    }
    if (c === '^' || c === '_') {
      const arg = readGroup(s, i + 1);
      out += scripted(latexToText(arg.body), c === '^' ? SUPERSCRIPT : SUBSCRIPT, c);
      i = arg.end;
      continue;
    }
    if (c === '{' || c === '}') {
      i++;
      continue;
    }
    out += c === '~' ? ' ' : c;
    i++;
  }
  return out.replace(/\s+/g, ' ').trim();
}
