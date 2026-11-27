// expo-crypto needs the native app; in tests use Node's built-in UUID generator.
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual<typeof import('node:crypto')>('node:crypto').randomUUID(),
}));

// Native media modules: tests don't play, record or pick real files.
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0, didJustFinish: false }),
  useAudioRecorder: () => ({ prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn(), uri: null }),
  useAudioRecorderState: () => ({ isRecording: false, durationMillis: 0 }),
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setAudioModeAsync: jest.fn(),
  RecordingPresets: { HIGH_QUALITY: {} },
}));
jest.mock('expo-image', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Image: View };
});
jest.mock('expo-file-system', () => ({ File: jest.fn(), Directory: jest.fn(), Paths: {} }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-network', () => ({ addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })) }));

// Animations (flip cards, the image viewer's zoom): Reanimated's own mock needs its native
// runtime, so stand-ins for the few parts the app uses; values change at once, no animation.
jest.mock('react-native-reanimated', () => {
  const { View, Text, ScrollView } = jest.requireActual<typeof import('react-native')>('react-native');
  const now = <T,>(value: T) => value;
  return {
    __esModule: true,
    default: { View, Text, ScrollView, createAnimatedComponent: now },
    useSharedValue: <T,>(value: T) => {
      const shared = { value, get: () => shared.value, set: (next: T) => void (shared.value = next) };
      return shared;
    },
    useAnimatedStyle: (style: () => object) => style(),
    withTiming: now,
    withSpring: now,
    Easing: { out: now, in: now, inOut: now, ease: 0, linear: 0, cubic: 0 },
  };
});

// Gestures (the image viewer's pinch, pan and double-tap): can't be performed in tests, so the
// detectors just show their children and the gestures do nothing. The buttons still work.
jest.mock('react-native-gesture-handler', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const gesture = () => ({});
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    usePinchGesture: gesture,
    usePanGesture: gesture,
    useTapGesture: gesture,
    useSimultaneousGestures: gesture,
  };
});
