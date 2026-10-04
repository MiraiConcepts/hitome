import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';

import { HEADER_TITLE_TYPE } from '@/components/calendar/month-header';
import { ThemedText } from '@/components/themed-text';
import { AccentColor, FontFamilyBold, Spacing } from '@/constants/theme';

/**
 * "hitome" with the build's version set small on its baseline, as a
 * subscript. Centred under the icon, a transparent copy of the version leads
 * the row so the name itself stays dead centre; as a header it is dropped.
 */
export function AppName({ centred }: { centred: boolean }) {
  const version = `v${Constants.expoConfig?.version ?? '?'}${__DEV__ ? ' dev' : ''}`;
  return (
    <View style={styles.nameRow}>
      {centred && (
        <ThemedText
          style={[styles.version, styles.hidden]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {version}
        </ThemedText>
      )}
      <ThemedText style={styles.title}>hitome</ThemedText>
      <ThemedText
        themeColor="textSecondary"
        style={styles.version}
        testID="setup-version"
      >
        {version}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  title: {
    fontFamily: FontFamilyBold,
    color: AccentColor,
    // Set exactly as the month title is once you are through.
    ...HEADER_TITLE_TYPE,
  },
  version: {
    fontSize: 11,
    lineHeight: 14,
  },
  hidden: {
    opacity: 0,
  },
});
