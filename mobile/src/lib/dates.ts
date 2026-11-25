// Day-based date helpers. Days use the phone's local time zone, so a streak
// follows the student's own calendar (studying at 11pm counts for that day).

/** "2026-11-25" for the local day of `date`. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The local date for a "2026-11-25" key (at midnight). */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Same time `n` calendar days later (or earlier, if negative). Safe across daylight-saving changes. */
export function addDays(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

/**
 * Days in a row with study, counting back from today. If today has no study
 * yet, the streak still counts up to yesterday (it isn't broken until the day ends).
 */
export function currentStreak(studiedDays: ReadonlySet<string>, today: Date): number {
  let day = studiedDays.has(dayKey(today)) ? today : addDays(today, -1);
  let count = 0;
  while (studiedDays.has(dayKey(day))) {
    count += 1;
    day = addDays(day, -1);
  }
  return count;
}

/** The most days in a row ever studied. */
export function longestStreak(studiedDays: ReadonlySet<string>): number {
  const sorted = [...studiedDays].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const key of sorted) {
    run = previous !== null && dayKey(addDays(fromDayKey(previous), 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    previous = key;
  }
  return best;
}
