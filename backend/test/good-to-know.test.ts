import { describe, expect, it } from 'vitest';

import { withGoodToKnowSection } from '../src/mcp/store.ts';

describe('withGoodToKnowSection', () => {
  it('starts the page with the first topic, as bullets without doubled marks', () => {
    expect(withGoodToKnowSection('', 'Topic A', ['- First', '• Second', 'Third'])).toBe(
      '## Topic A\n- First\n- Second\n- Third',
    );
  });

  it('adds new topics at the end, in the order they were written', () => {
    const a = withGoodToKnowSection('', 'Topic A', ['One']);
    expect(withGoodToKnowSection(a, 'Topic B', ['Two'])).toBe('## Topic A\n- One\n\n## Topic B\n- Two');
  });

  it("replaces a topic's points when that topic is written again, keeping its place", () => {
    const page = '## Topic A\n- Old\n- Older\n\n## Topic B\n- Two';
    expect(withGoodToKnowSection(page, 'topic a', ['New'])).toBe('## topic a\n- New\n\n## Topic B\n- Two');
    expect(withGoodToKnowSection(page, 'Topic B', ['New'])).toBe('## Topic A\n- Old\n- Older\n\n## Topic B\n- New');
  });

  it('keeps anything the student wrote above the first topic', () => {
    expect(withGoodToKnowSection('My own line', 'Topic A', ['One'])).toBe('My own line\n\n## Topic A\n- One');
  });
});
