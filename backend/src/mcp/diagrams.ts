import { ToolError } from './store.ts';

// Diagrams in notes are SVG written by the AI app, inside the note's text (see
// mobile/src/lib/rich-text.ts). The app cleans them again before showing them, and
// shows them as images, which never run scripts; this cleans them on the way in too,
// and tells the AI when a diagram can't be used, so it can fix it.

/** Same limit as the app (mobile/src/lib/svg.ts): bigger diagrams are not shown. */
export const MAX_SVG_LENGTH = 60_000;

/** Removes anything that could run code or load something from elsewhere. Kept the same as the app's. */
export function cleanSvg(svg: string): string {
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script[^>]*\/>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/<(iframe|object|embed|image|use)\b[\s\S]*?(\/>|<\/\1\s*>)/gi, (tag) =>
      /^<use\b/i.test(tag) && !/(?:xlink:)?href\s*=\s*["'](?!#)/i.test(tag) ? tag : '',
    )
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '')
    .replace(/url\(\s*(['"]?)(?!#)[^)]*\)/gi, 'none')
    .replace(/@import[^;]*;?/gi, '');
}

/**
 * Cleans every <svg>…</svg> in a piece of note text. Throws a ToolError the AI can act on
 * when a diagram is too big, or a ":::diagram" has no whole <svg>…</svg> in it.
 */
export function cleanDiagrams(text: string | undefined, where: string): string | undefined {
  if (!text) return text;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*:::\s*diagram\b/i.test(lines[i])) continue;
    let end = i + 1;
    while (end < lines.length && lines[end].trim() !== ':::') end++;
    const inside = lines.slice(i + 1, end).join('\n');
    if (!/<svg[\s>][\s\S]*<\/svg>/i.test(inside))
      throw new ToolError(`A ":::diagram" in ${where} has no complete <svg>…</svg> before its closing ":::".`);
  }
  return text.replace(/<svg[\s>][\s\S]*?<\/svg>/gi, (svg) => {
    if (svg.length > MAX_SVG_LENGTH)
      throw new ToolError(
        `A diagram in ${where} is ${svg.length} characters; the most is ${MAX_SVG_LENGTH}. Draw it more simply.`,
      );
    return cleanSvg(svg);
  });
}
