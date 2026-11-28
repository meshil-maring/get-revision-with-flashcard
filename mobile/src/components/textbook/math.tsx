// Typesetting formulas with KaTeX.
//
// Safety: note text (often written by an AI app) is never turned into HTML directly. KaTeX
// builds the markup from the LaTeX and escapes all text in it; with trust off, commands that
// could add links, classes, styles or pictures (\href, \url, \htmlClass, \includegraphics…)
// are refused. That markup is the only HTML the reader inserts.
import katex from 'katex';
import 'katex/contrib/mhchem'; // \ce{H2O} and \pu{…} for chemistry
import { memo } from 'react';

/** Shorthands common in course notes. Copied for every formula, so a \def can't leak between them. */
const MACROS: Record<string, string> = {
  '\\R': '\\mathbb{R}',
  '\\N': '\\mathbb{N}',
  '\\Z': '\\mathbb{Z}',
  '\\Q': '\\mathbb{Q}',
  '\\C': '\\mathbb{C}',
  '\\dd': '\\mathrm{d}',
  '\\abs': '\\left\\lvert #1 \\right\\rvert',
  '\\norm': '\\left\\lVert #1 \\right\\rVert',
};

export type MathResult = { html: string } | { error: string };

// Long chapters show the same formulas again (and React may render twice): typeset each once.
const cache = new Map<string, MathResult>();
const CACHE_LIMIT = 800;

/** A formula as KaTeX markup, or the reason it couldn't be typeset. */
export function renderMath(latex: string, display: boolean): MathResult {
  const key = `${display ? 'D' : 'I'}${latex}`;
  const cached = cache.get(key);
  if (cached) return cached;
  let result: MathResult;
  try {
    result = {
      html: katex.renderToString(latex, {
        displayMode: display,
        throwOnError: true,
        trust: false,
        strict: 'ignore',
        output: 'htmlAndMathml', // MathML for screen readers
        maxSize: 40,
        maxExpand: 500,
        macros: { ...MACROS },
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/^KaTeX parse error:\s*/, '') : 'Unknown problem';
    result = { error: message };
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, result);
  return result;
}

/** A formula inside a line of text. One that can't be typeset shows its LaTeX, marked. */
export const MathInline = memo(function MathInline({ latex, display = false }: { latex: string; display?: boolean }) {
  const result = renderMath(display ? `\\displaystyle ${latex}` : latex, false);
  if ('error' in result) {
    return (
      <code className="tb-math-error" title={`This formula could not be shown: ${result.error}`}>
        {latex}
      </code>
    );
  }
  return <span className="tb-math-inline" dangerouslySetInnerHTML={{ __html: result.html }} />;
});

/**
 * A displayed equation, centred, with its number on the right. Wide ones scroll sideways
 * inside their own box, so the page never does.
 */
export const MathBlock = memo(function MathBlock({ latex, number }: { latex: string; number: string | null }) {
  const result = renderMath(latex, true);
  if ('error' in result) {
    return (
      <div className="tb-eq-error" role="note">
        <b>This equation could not be shown ({result.error})</b>
        <pre>{latex}</pre>
      </div>
    );
  }
  return (
    <div className="tb-eq" id={number ? `eq-${number.replace(/\./g, '-')}` : undefined}>
      <div className="tb-eq-body" tabIndex={0} dangerouslySetInnerHTML={{ __html: result.html }} />
      {number ? (
        <span className="tb-eq-num" aria-label={`Equation ${number}`}>
          ({number})
        </span>
      ) : null}
    </div>
  );
});
