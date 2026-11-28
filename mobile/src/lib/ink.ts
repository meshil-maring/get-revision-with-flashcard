// Handwritten notes: what was drawn with a finger or a digital pen, and turning it into a
// picture. A handwritten note keeps its drawing in the note's `body` as JSON (see `Ink`),
// so it is saved and synced like any other note.
//
// Points are in page units: the page is always PAGE_WIDTH wide, whatever the screen, so a
// note written on a phone looks the same on a tablet or the web.

import { utf8ToBase64 } from '@/lib/svg';

export const PAGE_WIDTH = 1000;
/** A new page is about A4-shaped. */
export const PAGE_HEIGHT = 1414;
/** "More space" adds this much to the bottom of the page. */
export const MORE_SPACE = 700;
/** A page can't get longer than this. */
export const MAX_PAGE_HEIGHT = PAGE_HEIGHT * 8;
/**
 * The most a drawing may take up once saved. Notes sync in batches, so a huge one would
 * slow every sync; this is many pages of dense writing.
 */
export const MAX_INK_LENGTH = 400_000;

export type Paper = 'lined' | 'grid' | 'plain';

/** One line drawn without lifting the pen. `p` is x, y, x, y, … in page units. */
export type Stroke = {
  /** Colour, e.g. "#1f2933". */
  c: string;
  /** Width in page units. */
  w: number;
  /** 1 = highlighter (see-through, drawn under the ink). */
  h?: 1;
  p: number[];
};

export type Ink = { v: 1; paper: Paper; height: number; strokes: Stroke[] };

export const emptyInk = (paper: Paper = 'lined'): Ink => ({ v: 1, paper, height: PAGE_HEIGHT, strokes: [] });

const PAPERS: Paper[] = ['lined', 'grid', 'plain'];
const HEX = /^#[0-9a-f]{6}$/i;

/** Reads one page of a handwritten note's body. Anything that isn't a drawing gives an empty page. */
export function parseInk(body: string): Ink {
  return parseSheets(body)[0];
}

/** A handwritten note (or a heading's notes) can have this many pages. */
export const MAX_SHEETS = 20;

/**
 * Reads every page. One page is saved as a plain drawing (`Ink`); more as { v: 2, sheets: [...] }.
 * There is always at least one page.
 */
export function parseSheets(body: string): Ink[] {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return [emptyInk()];
  }
  const sheets = (value as { sheets?: unknown } | null)?.sheets;
  if (Array.isArray(sheets)) {
    const pages = sheets.slice(0, MAX_SHEETS).map(inkFrom);
    return pages.length > 0 ? pages : [emptyInk()];
  }
  return [inkFrom(value)];
}

/** Saves the pages: a single page as a plain drawing, so older versions of the app still read it. */
export function serializeSheets(sheets: Ink[]): string {
  return sheets.length === 1 ? serializeInk(sheets[0]) : JSON.stringify({ v: 2, sheets });
}

export const sheetsHaveInk = (sheets: Ink[]) => sheets.some(hasInk);

function inkFrom(value: unknown): Ink {
  if (!value || typeof value !== 'object') return emptyInk();
  const raw = value as { paper?: unknown; height?: unknown; strokes?: unknown };
  const paper = PAPERS.includes(raw.paper as Paper) ? (raw.paper as Paper) : 'lined';
  const height =
    typeof raw.height === 'number' && raw.height > 0 ? Math.min(MAX_PAGE_HEIGHT, Math.max(PAGE_HEIGHT, raw.height)) : PAGE_HEIGHT;
  const strokes: Stroke[] = [];
  for (const s of Array.isArray(raw.strokes) ? raw.strokes : []) {
    if (!s || typeof s !== 'object') continue;
    const { c, w, h, p } = s as Record<string, unknown>;
    if (!Array.isArray(p) || p.length < 2) continue;
    const points = p.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    if (points.length < 2 || points.length % 2 !== 0) continue;
    strokes.push({
      c: typeof c === 'string' && HEX.test(c) ? c : '#1f2933',
      w: typeof w === 'number' && w > 0 && w <= 100 ? w : 5,
      ...(h === 1 ? { h: 1 as const } : {}),
      p: points,
    });
  }
  return { v: 1, paper, height, strokes };
}

export function serializeInk(ink: Ink): string {
  return JSON.stringify(ink);
}

export const hasInk = (ink: Ink) => ink.strokes.length > 0;

/** A handwritten note's body has nothing drawn on any page. */
export function isBlankInk(body: string): boolean {
  return !sheetsHaveInk(parseSheets(body));
}

/** How far down anything is drawn, so a page isn't made shorter than its writing. */
export function lowestPoint(ink: Ink): number {
  let lowest = 0;
  for (const s of ink.strokes) {
    for (let i = 1; i < s.p.length; i += 2) lowest = Math.max(lowest, s.p[i] + s.w / 2);
  }
  return lowest;
}

// --- Erasing --------------------------------------------------------------------

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Whether the eraser at (x, y), `radius` wide, touches the stroke. */
export function strokeHit(stroke: Stroke, x: number, y: number, radius: number): boolean {
  const reach = radius + stroke.w / 2;
  const p = stroke.p;
  if (p.length === 2) return Math.hypot(x - p[0], y - p[1]) <= reach;
  for (let i = 0; i + 3 < p.length; i += 2) {
    if (distanceToSegment(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= reach) return true;
  }
  return false;
}

// --- Drawing -----------------------------------------------------------------------

const round = (n: number) => Math.round(n * 10) / 10;

/** A smooth SVG path through the points (curves through the middle of each step). */
export function strokePath(p: number[]): string {
  if (p.length === 2) return `M${round(p[0])} ${round(p[1])}l0.1 0`; // a dot
  if (p.length === 4) return `M${round(p[0])} ${round(p[1])}L${round(p[2])} ${round(p[3])}`;
  let d = `M${round(p[0])} ${round(p[1])}`;
  for (let i = 2; i + 3 < p.length; i += 2) {
    const midX = (p[i] + p[i + 2]) / 2;
    const midY = (p[i + 1] + p[i + 3]) / 2;
    d += `Q${round(p[i])} ${round(p[i + 1])} ${round(midX)} ${round(midY)}`;
  }
  return `${d}L${round(p[p.length - 2])} ${round(p[p.length - 1])}`;
}

export const PAPER_COLORS = { sheet: '#fffdf6', rule: '#d5e3f3', margin: '#e0786d' };
/** Gap between the lines of lined paper and the squares of grid paper. */
export const LINE_GAP = 56;
export const GRID_GAP = 40;
export const MARGIN_X = 96;

function paperLines(paper: Paper, height: number): string {
  if (paper === 'plain') return '';
  const lines: string[] = [];
  if (paper === 'lined') {
    for (let y = LINE_GAP * 2; y < height; y += LINE_GAP) lines.push(`M0 ${y}H${PAGE_WIDTH}`);
    return (
      `<path d="${lines.join('')}" stroke="${PAPER_COLORS.rule}" stroke-width="2" fill="none"/>` +
      `<path d="M${MARGIN_X} 0V${height}" stroke="${PAPER_COLORS.margin}" stroke-width="2" fill="none"/>`
    );
  }
  for (let y = GRID_GAP; y < height; y += GRID_GAP) lines.push(`M0 ${y}H${PAGE_WIDTH}`);
  for (let x = GRID_GAP; x < PAGE_WIDTH; x += GRID_GAP) lines.push(`M${x} 0V${height}`);
  return `<path d="${lines.join('')}" stroke="${PAPER_COLORS.rule}" stroke-width="1.5" fill="none"/>`;
}

/** The page as an SVG picture: paper, then highlighter, then ink. */
export function inkToSvg(ink: Ink, { paper = true }: { paper?: boolean } = {}): string {
  const path = (s: Stroke) =>
    `<path d="${strokePath(s.p)}" stroke="${s.c}" stroke-width="${s.w}"${s.h ? ' stroke-opacity="0.35"' : ''}/>`;
  const highlights = ink.strokes.filter((s) => s.h).map(path).join('');
  const lines = ink.strokes.filter((s) => !s.h).map(path).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_WIDTH} ${ink.height}" width="${PAGE_WIDTH}" height="${ink.height}">` +
    (paper ? `<rect width="${PAGE_WIDTH}" height="${ink.height}" fill="${PAPER_COLORS.sheet}"/>${paperLines(ink.paper, ink.height)}` : '') +
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${highlights}${lines}</g></svg>`
  );
}

/** The page as a data: URL an image can show. */
export function inkDataUri(ink: Ink, options?: { paper?: boolean }): string {
  return `data:image/svg+xml;base64,${utf8ToBase64(inkToSvg(ink, options))}`;
}
