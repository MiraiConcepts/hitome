import { StyleSheet } from 'react-native';

import { HEADER_TITLE_TYPE } from '@/components/calendar/month-header';
import { ThemedText } from '@/components/themed-text';
import { AccentColor, FontFamilyBold } from '@/constants/theme';

/**
 * "hitome", set as the month title is once you are through. The version
 * lives in Settings → About; the connect screen shows the name alone.
 */
export function AppName() {
  return <ThemedText style={styles.title}>hitome</ThemedText>;
}

const styles = StyleSheet.create({
  title: {
    fontFamily: FontFamilyBold,
    color: AccentColor,
    ...HEADER_TITLE_TYPE,
  },
});
