import type { Colors } from '@/components/ui';

// Same header look for every screen: blends into the page, bold title, no shadow line.
export function headerOptions(colors: Colors) {
  return {
    headerStyle: { backgroundColor: colors.page },
    headerShadowVisible: false,
    headerTintColor: colors.ink,
    headerTitleStyle: { fontWeight: '700' as const, fontSize: 15 },
  };
}
