import { suggestCards } from '@/lib/notes';
import { insertBox, parseRichText, toPlainText } from '@/lib/rich-text';
import { cleanSvg, svgAspectRatio, svgDataUri } from '@/lib/svg';

const SVG = '<svg viewBox="0 0 400 300"><text x="10" y="20">Entry: road in</text></svg>';

describe('boxes and diagrams in note text', () => {
  it('reads :::good / :::bad boxes with their points', () => {
    const [good, , bad] = parseRichText(':::good Advantages\n- Smooth flow\n:::\n\n:::cons Limitations\n- Needs land\n:::');
    expect(good).toMatchObject({ type: 'box', box: 'good', spans: [{ text: 'Advantages' }] });
    expect(good.children?.map((b) => b.type)).toEqual(['bullet']);
    expect(bad).toMatchObject({ type: 'box', box: 'bad' });
    expect(bad.children?.[0].spans[0].text).toBe('Needs land');
  });

  it('reads a diagram in a :::diagram fence, a ```svg fence, or bare', () => {
    expect(parseRichText(`:::diagram The layout\n${SVG}\n:::`)).toEqual([
      { type: 'diagram', spans: [{ text: 'The layout' }], svg: SVG },
    ]);
    expect(parseRichText(`\`\`\`svg\n${SVG}\n\`\`\``)[0]).toMatchObject({ type: 'diagram', svg: SVG });
    expect(parseRichText(`Before\n<svg viewBox="0 0 4 3">\n<circle r="1"/>\n</svg>\nAfter`).map((b) => b.type)).toEqual([
      'paragraph',
      'diagram',
      'paragraph',
    ]);
  });

  it('keeps a diagram inside a box, and the box closes after it', () => {
    const blocks = parseRichText(`:::note Layout\n:::diagram Rotary\n${SVG}\n:::\n- Splitter island\n:::\nAfter`);
    expect(blocks.map((b) => b.type)).toEqual(['box', 'paragraph']);
    expect(blocks[0].children?.map((b) => b.type)).toEqual(['diagram', 'bullet']);
  });

  it('reads only the caption of a diagram aloud, and the points of a box', () => {
    expect(toPlainText(`:::diagram A rotary\n${SVG}\n:::\n:::good Advantages\n- Smooth flow\n:::`)).toBe(
      'Diagram: A rotary\nAdvantages\n• Smooth flow',
    );
  });

  it('does not turn SVG labels into flashcards', () => {
    const cards = suggestCards({ style: 'plain', rows: [], body: `## Layout\n:::diagram\n${SVG}\n:::\nSpeed: 30 km/h` });
    expect(cards.map((c) => c.front)).toEqual(['Speed', 'Layout']);
    expect(cards[1].back).toContain('<svg');
  });

  it('adds a box with its title selected', () => {
    const edit = insertBox('Intro', { start: 5, end: 5 }, 'bad');
    expect(edit.text).toBe('Intro\n\n:::bad Limitations\n- \n:::');
    expect(edit.text.slice(edit.selection.start, edit.selection.end)).toBe('Limitations');
  });
});

describe('svg', () => {
  it('removes anything that could run or load from elsewhere', () => {
    const clean = cleanSvg('<svg onload="x()"><script>y()</script><image href="http://a.b/c.png"/><use href="#m"/></svg>');
    expect(clean).toBe('<svg><use href="#m"/></svg>');
  });

  it('works out the shape from the viewBox, or width and height', () => {
    expect(svgAspectRatio(SVG)).toBeCloseTo(4 / 3);
    expect(svgAspectRatio('<svg width="200" height="100"></svg>')).toBe(2);
    expect(svgAspectRatio('<svg></svg>')).toBeCloseTo(4 / 3);
  });

  it('makes a data URL with the SVG namespace, and none for a missing diagram', () => {
    const uri = svgDataUri('<svg><text>Île ✓</text></svg>')!;
    expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const decoded = Buffer.from(uri.split(',')[1], 'base64').toString('utf8');
    expect(decoded).toBe('<svg xmlns="http://www.w3.org/2000/svg"><text>Île ✓</text></svg>');
    expect(svgDataUri('')).toBeNull();
  });
});
