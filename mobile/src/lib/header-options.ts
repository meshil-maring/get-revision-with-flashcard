import { colors } from '@/components/ui';

// Same header look for every screen: blends into the page, bold title, no shadow line.
export const headerOptions = {
  headerStyle: { backgroundColor: colors.page },
  headerShadowVisible: false,
  headerTintColor: colors.ink,
  headerTitleStyle: { fontWeight: '700' as const, fontSize: 15 },
};
