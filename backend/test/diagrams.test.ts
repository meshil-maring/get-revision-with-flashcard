import { describe, expect, it } from 'vitest';

import { cleanDiagrams, cleanSvg, MAX_SVG_LENGTH } from '../src/mcp/diagrams.ts';
import { ToolError } from '../src/mcp/store.ts';

const ROTARY =
  '<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">' +
  '<defs><marker id="a"><path d="M0,0 L6,3 L0,6z"/></marker></defs>' +
  '<circle cx="200" cy="150" r="50" fill="#dcfce7"/>' +
  '<path d="M100 150 A100 100 0 0 1 300 150" marker-end="url(#a)"/>' +
  '<use href="#a"/>' +
  '<text x="200" y="155" font-family="sans-serif">Central Island</text></svg>';

describe('cleanSvg', () => {
  it('keeps an ordinary drawing as it is', () => {
    expect(cleanSvg(ROTARY)).toBe(ROTARY);
  });

  it('removes scripts, handlers, embedded HTML, outside links and images', () => {
    const dirty =
      '<svg onload="alert(1)"><script>alert(2)</script><foreignObject><div>hi</div></foreignObject>' +
      '<a href="https://evil.example"><text>x</text></a><image href="https://evil.example/a.png"/>' +
      '<rect style="fill:url(https://evil.example/x)" onclick=\'go()\'/><use xlink:href="https://e.example#x"/></svg>';
    const clean = cleanSvg(dirty);
    expect(clean).not.toMatch(/script|onload|onclick|foreignObject|evil|e\.example|<image/i);
    expect(clean).toContain('<text>x</text>');
  });
});

describe('cleanDiagrams', () => {
  it('cleans each SVG in note text and leaves the rest alone', () => {
    const text = `## Layout\n:::diagram A rotary\n<svg onload="x()"><circle r="5"/></svg>\n:::\n- Entry`;
    expect(cleanDiagrams(text, 'body')).toBe('## Layout\n:::diagram A rotary\n<svg><circle r="5"/></svg>\n:::\n- Entry');
  });

  it('tells the AI when a :::diagram has no whole SVG', () => {
    expect(() => cleanDiagrams(':::diagram Rotary\n<svg><circle/>\n:::', 'cornell_rows[2]')).toThrow(ToolError);
    expect(() => cleanDiagrams(':::diagram Rotary\n:::', 'body')).toThrow(/cornell_rows|body/);
  });

  it('turns away a diagram that is too big', () => {
    const huge = `<svg>${'<circle r="1"/>'.repeat(MAX_SVG_LENGTH / 10)}</svg>`;
    expect(() => cleanDiagrams(huge, 'body')).toThrow(/Draw it more simply/);
  });

  it('passes text without diagrams through', () => {
    expect(cleanDiagrams(undefined, 'body')).toBeUndefined();
    expect(cleanDiagrams(':::good Advantages\n- Smooth flow\n:::', 'body')).toBe(':::good Advantages\n- Smooth flow\n:::');
  });
});
