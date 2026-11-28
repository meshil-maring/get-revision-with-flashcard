// Pomodoro timer: focus for a while, take a short break, and a long break after every few
// focus rounds. Pure functions here; the running timer is providers/pomodoro.tsx.

export type PomodoroPhase = 'focus' | 'short' | 'long';

export type PomodoroPreset = {
  id: string;
  title: string;
  /** Minutes for focus, a short break and a long break. */
  focus: number;
  short: number;
  long: number;
  /** Focus rounds before a long break. */
  rounds: number;
};

export const POMODORO_PRESETS: PomodoroPreset[] = [
  { id: 'classic', title: '25 / 5', focus: 25, short: 5, long: 15, rounds: 4 },
  { id: 'long', title: '50 / 10', focus: 50, short: 10, long: 20, rounds: 3 },
  { id: 'short', title: '15 / 3', focus: 15, short: 3, long: 10, rounds: 4 },
];

export const PHASE_LABELS: Record<PomodoroPhase, string> = {
  focus: 'Focus',
  short: 'Short break',
  long: 'Long break',
};

export function findPreset(id: string): PomodoroPreset | undefined {
  return POMODORO_PRESETS.find((p) => p.id === id);
}

export function phaseMs(preset: PomodoroPreset, phase: PomodoroPhase): number {
  return preset[phase] * 60_000;
}

/**
 * What comes after a phase. `done` is how many focus rounds were finished before this one ends;
 * returns the next phase and the new count.
 */
export function nextPhase(
  preset: PomodoroPreset,
  phase: PomodoroPhase,
  done: number,
): { phase: PomodoroPhase; done: number } {
  if (phase !== 'focus') return { phase: 'focus', done };
  const finished = done + 1;
  return { phase: finished % preset.rounds === 0 ? 'long' : 'short', done: finished };
}

export type PomodoroRun = { phase: PomodoroPhase; done: number; endsAt: number };

/**
 * Moves a running timer on past every phase that ended by `now` (e.g. while the app was in the
 * background), each phase starting when the one before it ended. `changed` = at least one ended.
 */
export function catchUp(preset: PomodoroPreset, run: PomodoroRun, now: number): PomodoroRun & { changed: boolean } {
  let { phase, done, endsAt } = run;
  let changed = false;
  // Bounded, so a clock jump can't loop for ever.
  for (let i = 0; i < 1000 && endsAt <= now; i++) {
    ({ phase, done } = nextPhase(preset, phase, done));
    endsAt += phaseMs(preset, phase);
    changed = true;
  }
  return { phase, done, endsAt, changed };
}

/** 1500000 → "25:00"; rounds up, so the last second shows 0:01 not 0:00. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// --- Custom lengths ----------------------------------------------------------

export const CUSTOM_PRESET_ID = 'custom';

export type PomodoroLengths = Pick<PomodoroPreset, 'focus' | 'short' | 'long' | 'rounds'>;
export type LengthKey = keyof PomodoroLengths;

/** Limits and step for each custom setting (minutes, or a count for rounds). */
export const CUSTOM_LIMITS: Record<LengthKey, { min: number; max: number; step: number }> = {
  focus: { min: 5, max: 120, step: 5 },
  short: { min: 1, max: 30, step: 1 },
  long: { min: 5, max: 60, step: 5 },
  rounds: { min: 1, max: 8, step: 1 },
};

/** Custom starts from the classic lengths. */
export const DEFAULT_CUSTOM: PomodoroLengths = { focus: 30, short: 5, long: 15, rounds: 4 };

export function clampLength(key: LengthKey, value: number): number {
  const { min, max } = CUSTOM_LIMITS[key];
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function customPreset(lengths: PomodoroLengths): PomodoroPreset {
  return { id: CUSTOM_PRESET_ID, title: 'Custom', ...lengths };
}

export type PomodoroPrefs = { presetId: string; custom: PomodoroLengths };

export function parsePomodoroPrefs(raw: string | null): PomodoroPrefs {
  const fallback = { presetId: POMODORO_PRESETS[0].id, custom: DEFAULT_CUSTOM };
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as { presetId?: unknown; custom?: Record<string, unknown> };
    const custom = { ...DEFAULT_CUSTOM };
    for (const key of Object.keys(CUSTOM_LIMITS) as LengthKey[]) {
      const n = value.custom?.[key];
      if (typeof n === 'number' && Number.isFinite(n)) custom[key] = clampLength(key, n);
    }
    const known = typeof value.presetId === 'string' && (value.presetId === CUSTOM_PRESET_ID || findPreset(value.presetId));
    return { presetId: known ? (value.presetId as string) : fallback.presetId, custom };
  } catch {
    return fallback;
  }
}
