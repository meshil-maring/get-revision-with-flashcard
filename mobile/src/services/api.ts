import { Platform } from 'react-native';

/**
 * The NoteMe server (backend/). Set EXPO_PUBLIC_API_URL in mobile/.env.
 * Defaults: the Android emulator reaches the computer at 10.0.2.2; web and iOS use localhost.
 * A real phone needs the computer's LAN address, e.g. http://192.168.1.5:4000.
 */
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000')
).replace(/\/$/, '');
