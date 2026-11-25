import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/** "4:05", or "1:02:09" after an hour. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = String(s % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** A total like "45 sec", "12 min" or "1 h 05 min", for study time so far. */
export function formatStudyTotal(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} sec`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/**
 * Counts how long you have been studying, in seconds. It only counts while `running`
 * is true and the app is open, so leaving the app or reaching the summary pauses it.
 */
export function useStudyTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  const savedMs = useRef(0); // time counted before the current stretch
  const startedAt = useRef<number | null>(null); // start of the current stretch
  const [active, setActive] = useState(AppState.currentState !== 'background');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => sub.remove();
  }, []);

  const counting = running && active;

  useEffect(() => {
    if (!counting) return;
    startedAt.current = Date.now();
    const tick = () => setSeconds(Math.floor((savedMs.current + Date.now() - startedAt.current!) / 1000));
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      savedMs.current += Date.now() - startedAt.current!;
      startedAt.current = null;
      setSeconds(Math.floor(savedMs.current / 1000));
    };
  }, [counting]);

  /** Start again from 0:00, e.g. for a new round. */
  const reset = useCallback(() => {
    savedMs.current = 0;
    if (startedAt.current !== null) startedAt.current = Date.now();
    setSeconds(0);
  }, []);

  return { seconds, reset };
}
