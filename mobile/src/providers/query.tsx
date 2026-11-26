import { focusManager, onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { addNetworkStateListener } from 'expo-network';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { createQueryClient } from '@/services/queries';

// React Native has no window focus or online events, so tell TanStack Query about
// the app coming to the front and the network going up or down. The web already has both.
if (Platform.OS !== 'web') {
  onlineManager.setEventListener((setOnline) => {
    const subscription = addNetworkStateListener((state) => setOnline(state.isConnected !== false));
    return () => subscription.remove();
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
    return () => subscription.remove();
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
