import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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

import { SNACK_MS, SNACK_SPOT, SnackBar } from '@/components/snack-bar';
import { AboutSection } from '@/components/settings/about-section';
import { CalendarsSection } from '@/components/settings/calendars-section';
import { ConnectionSection } from '@/components/settings/connection-section';
import { NotificationsSection } from '@/components/settings/notifications-section';
import { SettingsHeader } from '@/components/settings/settings-parts';
import { ThemedView } from '@/components/themed-view';
import { MESSAGE_SAMPLES } from '@/constants/messages';
import { Spacing } from '@/constants/theme';
import { useEscapeKey } from '@/hooks/use-escape-key';

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
  // A pushed screen pops; a cold landing on /settings (a shared web URL) has
  // nothing to pop to, so it goes home instead of dead-ending. Escape does the
  // same as the back arrow.
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace('/');
  useEscapeKey(goBack);
  // "Show a test message": each press shows the next of the app's messages
  // (constants/messages) in the month screen's bar, so the set can be read
  // through. Gone after a while, as the month screen's.
  const [sample, setSample] = useState<{ index: number; key: number } | null>(
    null
  );
  const showTestMessage = () =>
    setSample((prev) => ({
      index: prev ? (prev.index + 1) % MESSAGE_SAMPLES.length : 0,
      key: Date.now(),
    }));
  useEffect(() => {
    if (!sample) return;
    const timer = setTimeout(() => setSample(null), SNACK_MS);
    return () => clearTimeout(timer);
  }, [sample]);
  const notifications = (
    <NotificationsSection onTestMessage={showTestMessage} />
  );
  const shown = sample ? MESSAGE_SAMPLES[sample.index] : null;
  return (
    <ThemedView style={styles.container}>
      {/* Top and sides only, as in the month view; the scroll view applies the
          bottom inset to its content so the list can run under the gesture
          bar while its last row stays reachable. */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <SettingsHeader title="Settings" onBack={goBack} />
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
                {notifications}
                <AboutSection />
              </View>
            </>
          ) : (
            <>
              <ConnectionSection />
              <CalendarsSection />
              {notifications}
              <AboutSection />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
      <View
        pointerEvents="box-none"
        style={[SNACK_SPOT, { bottom: insets.bottom + Spacing.three }]}
      >
        {shown && (
          <SnackBar
            key={sample!.key}
            icon={shown.icon}
            message={`${shown.message}  (${sample!.index + 1} of ${MESSAGE_SAMPLES.length})`}
            action={
              shown.undo ? { label: 'Undo', onPress: () => {} } : undefined
            }
          />
        )}
      </View>
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
  // As the month screen's: bottom right, clear of the content's reach.
  column: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.four,
  },
});
