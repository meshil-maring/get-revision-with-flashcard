import { activityLevel, dayTitle, describeDay } from '@/components/study/activity-heatmap';

describe('activityLevel', () => {
  it('maps cards studied to a shade from 0 to 4', () => {
    expect([0, 1, 4, 5, 9, 10, 19, 20, 100].map((c) => activityLevel(c))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('also counts minutes studied, whichever is more', () => {
    expect(activityLevel(0, 30)).toBe(1);
    expect(activityLevel(1, 10 * 60)).toBe(2);
    expect(activityLevel(2, 30 * 60)).toBe(3);
    expect(activityLevel(2, 60 * 60)).toBe(4);
    expect(activityLevel(20, 60)).toBe(4);
  });
});

describe('dayTitle', () => {
  const today = new Date(2026, 10, 25);
  it('names today, yesterday, and other days', () => {
    expect(dayTitle(new Date(2026, 10, 25), today)).toBe('Today');
    expect(dayTitle(new Date(2026, 10, 24), today)).toBe('Yesterday');
    expect(dayTitle(new Date(2026, 10, 3), today)).toBe('Tue, Nov 3');
  });
});

describe('describeDay', () => {
  it('shows time and cards', () => {
    expect(describeDay(undefined)).toBe('No study');
    expect(describeDay({ cards: 1, seconds: 0 })).toBe('1 card');
    expect(describeDay({ cards: 0, seconds: 45 })).toBe('45 sec');
    expect(describeDay({ cards: 12, seconds: 3900 })).toBe('1 h 05 min · 12 cards');
  });
});
