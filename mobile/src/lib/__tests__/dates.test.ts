import { addDays, currentStreak, dayKey, fromDayKey, longestStreak } from '@/lib/dates';

const today = new Date(2026, 10, 25, 15, 30); // 25 Nov 2026, 3:30pm local

function days(...offsets: number[]) {
  return new Set(offsets.map((n) => dayKey(addDays(today, n))));
}

describe('dayKey', () => {
  it('uses the local date with zero padding', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dayKey(fromDayKey('2026-03-09'))).toBe('2026-03-09');
  });

  it('adds days across month and year ends', () => {
    expect(dayKey(addDays(new Date(2026, 11, 31), 1))).toBe('2027-01-01');
    expect(dayKey(addDays(new Date(2026, 2, 1), -1))).toBe('2026-02-28');
  });
});

describe('currentStreak', () => {
  it('counts days in a row up to today', () => {
    expect(currentStreak(days(0, -1, -2), today)).toBe(3);
  });

  it('keeps yesterday’s streak alive until today is over', () => {
    expect(currentStreak(days(-1, -2), today)).toBe(2);
  });

  it('is broken by a missed day', () => {
    expect(currentStreak(days(0, -2, -3), today)).toBe(1);
    expect(currentStreak(days(-2, -3), today)).toBe(0);
  });

  it('is 0 with no study', () => {
    expect(currentStreak(new Set(), today)).toBe(0);
  });
});

describe('longestStreak', () => {
  it('finds the longest run of days', () => {
    expect(longestStreak(days(0, -1, -5, -6, -7, -8, -20))).toBe(4);
  });

  it('counts runs across a month end', () => {
    expect(longestStreak(new Set(['2026-01-30', '2026-01-31', '2026-02-01']))).toBe(3);
  });

  it('is 0 with no study', () => {
    expect(longestStreak(new Set())).toBe(0);
  });
});
