import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Vibration } from 'react-native';

import { getSetting, setSetting, SETTINGS } from '@/data/settings';
import {
  catchUp,
  clampLength,
  CUSTOM_PRESET_ID,
  customPreset,
  DEFAULT_CUSTOM,
  findPreset,
  nextPhase,
  parsePomodoroPrefs,
  phaseMs,
  POMODORO_PRESETS,
  type LengthKey,
  type PomodoroLengths,
  type PomodoroPhase,
  type PomodoroPreset,
} from '@/lib/pomodoro';

type Status = 'idle' | 'running' | 'paused';

type PomodoroState = {
  preset: PomodoroPreset;
  status: Status;
  phase: PomodoroPhase;
  /** Focus rounds finished since the timer was started. */
  done: number;
  /** Time left in this phase, in ms. */
  left: number;
  /** Start from idle, or carry on after a pause. */
  start: () => void;
  pause: () => void;
  /** Back to the start of a focus round, stopped. */
  reset: () => void;
  /** End this phase now and start the next. */
  skip: () => void;
  /** Pick other lengths (a preset's id, or 'custom'); stops and resets the timer. */
  setPreset: (id: string) => void;
  /** Your own lengths, used when 'custom' is picked. */
  custom: PomodoroLengths;
  /** Change one of your own lengths; stops and resets the timer. */
  setCustom: (key: LengthKey, value: number) => void;
};

const PomodoroContext = createContext<PomodoroState | null>(null);

/** A buzz when a phase ends, so you know to take a break or get back to it. */
function signalPhaseEnd() {
  Vibration.vibrate([0, 400, 200, 400]);
}

/**
 * The Pomodoro timer, from the study sounds sheet. One for the whole app, so it keeps counting
 * from screen to screen. It counts to a fixed end time, so time in the background still counts,
 * and on return it skips past any phases that ended meanwhile.
 */
export function PomodoroProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [presetId, setPresetId] = useState(POMODORO_PRESETS[0].id);
  const [status, setStatus] = useState<Status>('idle');
  const [phase, setPhase] = useState<PomodoroPhase>('focus');
  const [done, setDone] = useState(0);
  const [endsAt, setEndsAt] = useState(0); // while running
  const [pausedLeft, setPausedLeft] = useState(0); // while paused
  const [now, setNow] = useState(() => Date.now());
  const [custom, setCustomState] = useState<PomodoroLengths>(DEFAULT_CUSTOM);
  const preset = useMemo(
    () => (presetId === CUSTOM_PRESET_ID ? customPreset(custom) : (findPreset(presetId) ?? POMODORO_PRESETS[0])),
    [presetId, custom],
  );

  useEffect(() => {
    let cancelled = false;
    getSetting(db, SETTINGS.pomodoro)
      .then((raw) => {
        if (cancelled) return;
        const prefs = parsePomodoroPrefs(raw);
        setPresetId(prefs.presetId);
        setCustomState(prefs.custom);
      })
      .catch(() => {}); // keep the default
    return () => {
      cancelled = true;
    };
  }, [db]);

  const tick = useCallback(() => {
    const t = Date.now();
    setNow(t);
    const next = catchUp(preset, { phase, done, endsAt }, t);
    if (!next.changed) return;
    setPhase(next.phase);
    setDone(next.done);
    setEndsAt(next.endsAt);
    signalPhaseEnd();
  }, [preset, phase, done, endsAt]);

  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(tick, 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [status, tick]);

  const start = useCallback(() => {
    const t = Date.now();
    setNow(t);
    setEndsAt(t + (status === 'paused' ? pausedLeft : phaseMs(preset, phase)));
    setStatus('running');
  }, [status, pausedLeft, preset, phase]);

  const pause = useCallback(() => {
    if (status !== 'running') return;
    setPausedLeft(Math.max(0, endsAt - Date.now()));
    setStatus('paused');
  }, [status, endsAt]);

  const reset = useCallback(() => {
    setStatus('idle');
    setPhase('focus');
    setDone(0);
  }, []);

  const skip = useCallback(() => {
    const next = nextPhase(preset, phase, done);
    const t = Date.now();
    setPhase(next.phase);
    setDone(next.done);
    setNow(t);
    setEndsAt(t + phaseMs(preset, next.phase));
    setPausedLeft(phaseMs(preset, next.phase));
    if (status === 'idle') setStatus('paused'); // ready to start the next phase
  }, [preset, phase, done, status]);

  const save = useCallback(
    (next: { presetId: string; custom: PomodoroLengths }) => {
      setSetting(db, SETTINGS.pomodoro, JSON.stringify(next)).catch(() => {});
    },
    [db],
  );

  const setPreset = useCallback(
    (id: string) => {
      if (id !== CUSTOM_PRESET_ID && !findPreset(id)) return;
      setPresetId(id);
      reset();
      save({ presetId: id, custom });
    },
    [reset, save, custom],
  );

  const setCustom = useCallback(
    (key: LengthKey, value: number) => {
      const next = { ...custom, [key]: clampLength(key, value) };
      setCustomState(next);
      setPresetId(CUSTOM_PRESET_ID);
      reset();
      save({ presetId: CUSTOM_PRESET_ID, custom: next });
    },
    [custom, reset, save],
  );

  const left =
    status === 'running' ? Math.max(0, endsAt - now) : status === 'paused' ? pausedLeft : phaseMs(preset, phase);

  return (
    <PomodoroContext.Provider value={{ preset, status, phase, done, left, start, pause, reset, skip, setPreset, custom, setCustom }}>
      {children}
    </PomodoroContext.Provider>
  );
}

export function usePomodoro(): PomodoroState {
  const value = useContext(PomodoroContext);
  if (!value) throw new Error('usePomodoro must be used inside PomodoroProvider');
  return value;
}
