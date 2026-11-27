import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Uniwind } from 'uniwind';

import { getThemePreference, setThemePreference, type ThemePreference } from '@/data/settings';

type ThemeContextValue = {
  /** What the user picked in Settings → Appearance. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Applies the saved Appearance setting (light, dark, or the phone's) to the whole app.
 * The colours themselves come from src/global.css and components/ui/theme.ts.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [preference, setState] = useState<ThemePreference>('system');

  useEffect(() => {
    let cancelled = false;
    getThemePreference(db)
      .then((saved) => {
        if (cancelled) return;
        setState(saved);
        Uniwind.setTheme(saved);
      })
      .catch(() => {}); // keep following the phone if settings can't be read
    return () => {
      cancelled = true;
    };
  }, [db]);

  const setPreference = useCallback(
    async (next: ThemePreference) => {
      setState(next);
      Uniwind.setTheme(next);
      await setThemePreference(db, next);
    },
    [db],
  );

  return <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useThemePreference(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useThemePreference must be used inside ThemeProvider');
  return value;
}
