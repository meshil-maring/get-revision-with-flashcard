import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { ReadingSizeContext } from '@/components/ui/rich-text';
import { getReadingSize, setReadingSize, type ReadingSize } from '@/data/settings';

type ReadingSizeSetting = {
  /** What the user picked in Settings → Text size. */
  size: ReadingSize;
  setSize: (size: ReadingSize) => Promise<void>;
};

const SettingContext = createContext<ReadingSizeSetting | null>(null);

/**
 * Applies the saved text size for notes and flashcards (Settings → Text size). RichText and
 * the flashcards read it through ReadingSizeContext (components/ui/rich-text.tsx).
 */
export function ReadingSizeProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [size, setState] = useState<ReadingSize>('base');

  useEffect(() => {
    let cancelled = false;
    getReadingSize(db)
      .then((saved) => {
        if (!cancelled) setState(saved);
      })
      .catch(() => {}); // keep Medium if settings can't be read
    return () => {
      cancelled = true;
    };
  }, [db]);

  const setSize = useCallback(
    async (next: ReadingSize) => {
      setState(next);
      await setReadingSize(db, next);
    },
    [db],
  );

  return (
    <SettingContext.Provider value={{ size, setSize }}>
      <ReadingSizeContext.Provider value={size}>{children}</ReadingSizeContext.Provider>
    </SettingContext.Provider>
  );
}

export function useReadingSizeSetting(): ReadingSizeSetting {
  const value = useContext(SettingContext);
  if (!value) throw new Error('useReadingSizeSetting must be used inside ReadingSizeProvider');
  return value;
}
