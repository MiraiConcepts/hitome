import { router } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
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
  // Two columns once both fit at the single column's width: where things
  // come from on the left, how they reach you on the right.
  const twoColumns = useWindowDimensions().width >= TWO_COLUMN_MIN_WIDTH;
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
            twoColumns && styles.bodyWide,
            { paddingBottom: insets.bottom + Spacing.five },
          ]}
          testID="settings-screen"
        >
          {twoColumns ? (
            <>
              <View style={styles.column}>
                <ConnectionSection />
                <CalendarsSection />
              </View>
              <View style={styles.column}>
                <NotificationsSection />
                <AboutSection />
              </View>
            </>
          ) : (
            <>
              <ConnectionSection />
              <CalendarsSection />
              <NotificationsSection />
              <AboutSection />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** One column's width, as in the single-column layout. */
const COLUMN_WIDTH = 560;
/** Two columns, the gap between them, and the side padding. */
const TWO_COLUMN_MIN_WIDTH =
  COLUMN_WIDTH * 2 + Spacing.four + Spacing.three * 2;

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
    maxWidth: COLUMN_WIDTH,
    alignSelf: 'center',
  },
  bodyWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    maxWidth: TWO_COLUMN_MIN_WIDTH,
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.four,
  },
});
