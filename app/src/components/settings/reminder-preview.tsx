import { Image, StyleSheet, View } from 'react-native';

import { SNOOZE_MINUTES } from '@/alarms/actions';
import { ThemedText } from '@/components/themed-text';
import { AccentColor, FontFamilyBold, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * What a reminder looks like when it rings, drawn in the shape of an Android
 * notification: the app line, the event's name, its time and place, and the
 * buttons. A sample, not a live notification — Send a test notification is
 * the real thing.
 */
export function ReminderPreview() {
  const theme = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: theme.backgroundElement }]}
      accessibilityLabel={`Sample reminder: Dentist, 16:30 at Clinic, with Join and Snooze ${SNOOZE_MINUTES} minutes buttons`}
      testID="settings-reminder-preview"
    >
      <View style={styles.appLine}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.appIcon}
        />
        <ThemedText themeColor="textSecondary" style={styles.small}>
          hitome · now
        </ThemedText>
      </View>
      <ThemedText style={styles.title}>Dentist</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.body}>
        16:30 · Clinic
      </ThemedText>
      <View style={styles.actions}>
        <ThemedText style={styles.action}>JOIN</ThemedText>
        <ThemedText style={styles.action}>
          SNOOZE {SNOOZE_MINUTES} MIN
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three - Spacing.one,
    gap: Spacing.one,
  },
  appLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
  },
  appIcon: {
    width: 14,
    height: 14,
  },
  small: {
    fontSize: 12,
    lineHeight: 16,
  },
  title: {
    fontFamily: FontFamilyBold,
    fontSize: 15,
    lineHeight: 20,
  },
  body: {
    fontSize: 14,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.four,
    paddingTop: Spacing.two,
  },
  action: {
    color: AccentColor,
    fontFamily: FontFamilyBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
  },
});
