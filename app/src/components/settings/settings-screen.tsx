import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { AboutSection } from '@/components/settings/about-section';
import { CalendarsSection } from '@/components/settings/calendars-section';
import { ConnectionSection } from '@/components/settings/connection-section';
import { NotificationsSection } from '@/components/settings/notifications-section';
import { SettingsHeader } from '@/components/settings/settings-parts';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * The app's second screen. Sections scroll under a header bar cut from the
 * month view's — same black ground, same accent ink — so pushing it does not
 * feel like leaving the app.
 */
export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ThemedView style={styles.container}>
      {/* Top and sides only, as in the month view; the scroll view applies the
          bottom inset to its content so the list can run under the gesture
          bar while its last row stays reachable. */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <SettingsHeader
          title="Settings"
          // A pushed screen pops; a cold landing on /settings (a shared web URL)
          // has nothing to pop to, so it goes home instead of dead-ending.
          onBack={() =>
            router.canGoBack() ? router.back() : router.replace('/')
          }
        />
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingBottom: insets.bottom + Spacing.five },
          ]}
          testID="settings-screen"
        >
          <ConnectionSection />
          <CalendarsSection />
          <NotificationsSection />
          <AboutSection />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  body: {
    padding: Spacing.three,
    gap: Spacing.four,
    // Long-form content, unlike the full-bleed grid — a column that keeps
    // reading on a desktop browser rather than stretching label columns apart.
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
});
