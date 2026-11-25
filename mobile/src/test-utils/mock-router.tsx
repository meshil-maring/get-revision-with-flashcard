// A small stand-in for expo-router so screens can render in tests.
// Use with: jest.mock('expo-router', () => require('@/test-utils/mock-router').mockRouter)
import { useEffect } from 'react';

export const mockRouter = {
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  // Run the focus callback once, like a screen opening.
  useFocusEffect: (callback: () => void) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(callback, []);
  },
  Stack: { Screen: () => null },
};
