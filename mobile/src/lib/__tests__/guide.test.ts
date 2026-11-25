import { findTopic, GUIDE_SECTIONS, GUIDE_TOPICS, searchGuide } from '@/lib/guide';
import { parseRichText } from '@/lib/rich-text';

describe('guide content', () => {
  it('has unique ids and every topic in a known section', () => {
    const ids = GUIDE_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(GUIDE_TOPICS.every((t) => GUIDE_SECTIONS.includes(t.section))).toBe(true);
  });

  it('leaves no formatting marks unread in any topic', () => {
    for (const topic of GUIDE_TOPICS) {
      const text = parseRichText(topic.body)
        .flatMap((block) => block.spans.map((s) => s.text))
        .join('');
      expect({ id: topic.id, leftover: /\*\*|==|__/.test(text) }).toEqual({ id: topic.id, leftover: false });
    }
  });

  it('finds a topic by id', () => {
    expect(findTopic('favourites')?.title).toBe('Favourites');
    expect(findTopic('nope')).toBeUndefined();
  });
});

describe('searchGuide', () => {
  it('returns every topic for an empty search', () => {
    expect(searchGuide('  ')).toEqual(GUIDE_TOPICS);
  });

  it('matches all words, ignoring case and formatting', () => {
    expect(searchGuide('PDF').map((t) => t.id)).toEqual(expect.arrayContaining(['attachments', 'faq']));
    expect(searchGuide('microphone permission').map((t) => t.id)).toEqual(['faq']);
    expect(searchGuide('zebra')).toEqual([]);
  });
});
