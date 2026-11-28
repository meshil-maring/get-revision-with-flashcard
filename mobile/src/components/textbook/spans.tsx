// Styled pieces of a line (bold, italic, underline, highlight) with formulas typeset.
import { Fragment, type ReactNode } from 'react';

import { MathInline } from '@/components/textbook/math';
import type { Span } from '@/lib/rich-text';

/** Styled pieces of a line, with formulas typeset. */
export function Spans({ spans }: { spans: Span[] }) {
  return spans.map((span, i) => {
    let node: ReactNode = span.math !== undefined ? <MathInline latex={span.math} display={span.display} /> : span.text;
    if (span.highlight) node = <mark>{node}</mark>;
    if (span.underline) node = <u>{node}</u>;
    if (span.italic) node = <em>{node}</em>;
    if (span.bold) node = <strong>{node}</strong>;
    return <Fragment key={i}>{node}</Fragment>;
  });
}
