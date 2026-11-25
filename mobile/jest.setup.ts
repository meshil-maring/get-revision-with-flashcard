// expo-crypto needs the native app; in tests use Node's built-in UUID generator.
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual<typeof import('node:crypto')>('node:crypto').randomUUID(),
}));
