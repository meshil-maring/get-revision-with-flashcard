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
