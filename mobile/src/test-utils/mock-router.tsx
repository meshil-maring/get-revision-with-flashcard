// A small stand-in for expo-router so screens can render in tests.
// Use with: jest.mock('expo-router', () => require('@/test-utils/mock-router').mockRouter)
import { useEffect } from 'react';

export const mockRouter = {
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: jest.fn(() => ({})),
  // The screen is always focused in tests: run the callback on open and whenever it changes.
  useFocusEffect: (callback: () => void | (() => void)) => {
    useEffect(callback, [callback]);
  },
  Stack: { Screen: () => null },
};
