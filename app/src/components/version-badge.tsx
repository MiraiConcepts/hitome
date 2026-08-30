import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';

/**
 * Build identifier pinned to the bottom-right of every screen (web + native).
 * `dev` marks debug builds so a phone with both variants installed is
 * unambiguous about which one is on screen. Safe-area insets keep it clear of
 * nav bars and rounded display corners. Drawn at full strength in the theme's
 * primary text color — white on the dark scheme, black on the light one —
 * rather than dimmed, so the build is readable at a glance.
 */
export function VersionBadge() {
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? '?';
  return (
    <View
      style={[
        styles.wrapper,
        { bottom: insets.bottom + 2, right: insets.right + 6 },
      ]}
      pointerEvents="none"
    >
      <ThemedText style={styles.label}>
        v{version}
        {__DEV__ ? ' dev' : ''}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
  },
});
