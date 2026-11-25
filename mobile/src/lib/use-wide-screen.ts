import { useWindowDimensions } from 'react-native';

// Tablets and desktop browsers: the sidebar stays open instead of sliding in.
export const WIDE_SCREEN_MIN_WIDTH = 768;

export function useWideScreen() {
  return useWindowDimensions().width >= WIDE_SCREEN_MIN_WIDTH;
}
