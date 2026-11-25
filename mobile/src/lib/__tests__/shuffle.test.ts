import { shuffle } from '@/lib/shuffle';

describe('shuffle', () => {
  it('keeps every item exactly once', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const result = shuffle(items);
    expect(result).toHaveLength(items.length);
    expect([...result].sort((a, b) => a - b)).toEqual(items);
  });

  it('does not change the original array', () => {
    const items = [1, 2, 3, 4, 5];
    shuffle(items);
    expect(items).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles empty and single-item arrays', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(['only'])).toEqual(['only']);
  });

  it('produces a different order at least sometimes', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const changed = Array.from({ length: 20 }, () => shuffle(items)).some(
      (r) => r.join() !== items.join(),
    );
    expect(changed).toBe(true);
  });
});
