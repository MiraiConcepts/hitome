import { useWindowDimensions } from 'react-native';

import { WideLayoutMinWidth } from '@/constants/theme';
import { useHydrated } from '@/hooks/use-hydrated';

/**
 * Whether the window is wide enough for the side-by-side layout. Reports
 * narrow until hydration so the client's first render matches the static
 * HTML.
 */
export function useIsWide() {
  const hasHydrated = useHydrated();
  const { width } = useWindowDimensions();

  return hasHydrated && width >= WideLayoutMinWidth;
}
