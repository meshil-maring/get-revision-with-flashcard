import {
  emptyInk,
  inkToSvg,
  isBlankInk,
  lowestPoint,
  MAX_SHEETS,
  PAGE_HEIGHT,
  parseInk,
  parseSheets,
  serializeInk,
  serializeSheets,
  strokeHit,
  strokePath,
  type Ink,
} from '@/lib/ink';

const page = (strokes: Ink['strokes'], extra: Partial<Ink> = {}): Ink => ({ ...emptyInk(), strokes, ...extra });

describe('parseInk', () => {
  it('reads back what was saved', () => {
    const ink = page([{ c: '#1f3f8f', w: 5, p: [10, 20, 30, 40] }, { c: '#f5d90a', w: 28, h: 1, p: [1, 2] }], {
      paper: 'grid',
      height: 2114,
    });
    expect(parseInk(serializeInk(ink))).toEqual(ink);
  });

  it('gives an empty page for text or broken data', () => {
    expect(parseInk('Some typed notes')).toEqual(emptyInk());
    expect(parseInk('')).toEqual(emptyInk());
    expect(parseInk('null')).toEqual(emptyInk());
  });

  it('drops bad lines and fixes bad values', () => {
    const ink = parseInk(
      JSON.stringify({
        paper: 'wallpaper',
        height: 99,
        strokes: [
          { c: 'javascript:alert(1)', w: 5, p: [1, 2, 3, 4] },
          { c: '#000000', w: 5, p: [1, 2, 3] }, // an x without a y
          { c: '#000000', w: -1, p: ['a', 'b'] },
          'nonsense',
        ],
      }),
    );
    expect(ink.paper).toBe('lined');
    expect(ink.height).toBe(PAGE_HEIGHT);
    expect(ink.strokes).toEqual([{ c: '#1f2933', w: 5, p: [1, 2, 3, 4] }]);
  });

  it('knows a page with nothing on it', () => {
    expect(isBlankInk(serializeInk(emptyInk()))).toBe(true);
    expect(isBlankInk(serializeInk(page([{ c: '#000000', w: 5, p: [1, 1] }])))).toBe(false);
  });
});

describe('strokeHit', () => {
  const line = { c: '#000000', w: 4, p: [0, 0, 100, 0] };
  it('touches a line the eraser passes over, not one it misses', () => {
    expect(strokeHit(line, 50, 8, 10)).toBe(true);
    expect(strokeHit(line, 50, 30, 10)).toBe(false);
    expect(strokeHit(line, 120, 0, 10)).toBe(false);
  });
  it('touches a dot', () => {
    expect(strokeHit({ c: '#000000', w: 4, p: [5, 5] }, 8, 8, 5)).toBe(true);
  });
});

describe('drawing', () => {
  it('makes a smooth path through the points', () => {
    expect(strokePath([0, 0])).toBe('M0 0l0.1 0');
    expect(strokePath([0, 0, 10, 10])).toBe('M0 0L10 10');
    expect(strokePath([0, 0, 10, 0, 20, 10])).toBe('M0 0Q10 0 15 5L20 10');
  });

  it('draws highlighter under the ink, on the chosen paper', () => {
    const svg = inkToSvg(
      page([
        { c: '#1f2933', w: 5, p: [0, 0, 10, 10] },
        { c: '#f5d90a', w: 28, h: 1, p: [0, 5, 50, 5] },
      ]),
    );
    expect(svg.indexOf('#f5d90a')).toBeLessThan(svg.indexOf('#1f2933'));
    expect(svg).toContain('stroke-opacity="0.35"');
    expect(svg).toContain(`viewBox="0 0 1000 ${PAGE_HEIGHT}"`);
  });

  it('finds the lowest writing, so a page is never trimmed above it', () => {
    expect(lowestPoint(page([{ c: '#000000', w: 10, p: [0, 100, 0, 1800] }]))).toBe(1805);
  });
});

describe('more than one page', () => {
  const one = page([{ c: '#1f2933', w: 5, p: [1, 2] }]);
  const two = page([{ c: '#d64545', w: 5, p: [3, 4] }], { paper: 'grid' });

  it('saves one page as a plain drawing, so older versions of the app still read it', () => {
    expect(JSON.parse(serializeSheets([one]))).toEqual(one);
    expect(parseSheets(serializeSheets([one]))).toEqual([one]);
  });

  it('saves and reads back several pages in order', () => {
    expect(parseSheets(serializeSheets([one, emptyInk(), two]))).toEqual([one, emptyInk(), two]);
    expect(parseInk(serializeSheets([one, two]))).toEqual(one);
  });

  it('always has at least one page, and no more than the most allowed', () => {
    expect(parseSheets('')).toEqual([emptyInk()]);
    expect(parseSheets(JSON.stringify({ v: 2, sheets: [] }))).toEqual([emptyInk()]);
    expect(parseSheets(JSON.stringify({ v: 2, sheets: Array(30).fill(one) }))).toHaveLength(MAX_SHEETS);
  });

  it('counts writing on any page', () => {
    expect(isBlankInk(serializeSheets([emptyInk(), two]))).toBe(false);
    expect(isBlankInk(serializeSheets([emptyInk(), emptyInk()]))).toBe(true);
  });
});
