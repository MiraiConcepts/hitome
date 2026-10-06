import { StyleSheet } from 'react-native';

import { Spinner } from '@/components/spinner';
import { ThemedView } from '@/components/themed-view';
import { AccentColor } from '@/constants/theme';

/** The dashed circle's size when it stands alone on a screen (here, and
 *  over a slow-to-settle month grid). */
export const LARGE_SPINNER = 32;

/** Full-screen busy mark while the app shell boots (hydration, fonts, and on
 *  the web the login check): the app's dashed circle, as in a working button,
 *  rather than the platform's stock spinner. */
export function BootScreen() {
  return (
    <ThemedView style={styles.root}>
      <Spinner color={AccentColor} size={LARGE_SPINNER} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
