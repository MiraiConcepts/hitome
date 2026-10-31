import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { UndoIcon } from '@/components/icons';
import { SNACK_SPOT, SnackBar, snackMs } from '@/components/snack-bar';
import { AboutSection } from '@/components/settings/about-section';
import { CalendarsSection } from '@/components/settings/calendars-section';
import { ConnectionSection } from '@/components/settings/connection-section';
import { GesturesSection } from '@/components/settings/gestures-section';
import { NotificationsSection } from '@/components/settings/notifications-section';
import { SettingsHeader } from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MESSAGE_SAMPLES } from '@/constants/messages';
import {
  AccentColor,
  FontFamilyBold,
  OnAccentColor,
  Spacing,
} from '@/constants/theme';
import { useEscapeKey } from '@/hooks/use-escape-key';
import { useTheme } from '@/hooks/use-theme';

type SectionKey =
  | 'account'
  | 'calendars'
  | 'notifications'
  | 'gestures'
  | 'about';

/**
 * The app's second screen. Sections scroll under a header bar cut from the
 * month view's — same black ground, same accent ink — so pushing it does not
 * feel like leaving the app.
 */
export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  // A wide window gets a side menu and one section at a time, so nothing has
  // to scroll out of sight; a phone keeps the column.
  const sideMenu = useWindowDimensions().width >= SIDE_MENU_MIN_WIDTH;
  const [section, setSection] = useState<SectionKey>('account');
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
    const timer = setTimeout(
      () => setSample(null),
      snackMs(Boolean(MESSAGE_SAMPLES[sample.index].undo))
    );
    return () => clearTimeout(timer);
  }, [sample]);
  const notifications = (
    <NotificationsSection onTestMessage={showTestMessage} />
  );
  const shown = sample ? MESSAGE_SAMPLES[sample.index] : null;
  const sections: { key: SectionKey; label: string; body: ReactNode }[] = [
    {
      key: 'account',
      // The connection card's own title: an account on the web, the sync
      // app on a phone.
      label: Platform.OS === 'web' ? 'Account' : 'Sync',
      body: <ConnectionSection />,
    },
    { key: 'calendars', label: 'Calendars', body: <CalendarsSection /> },
    { key: 'notifications', label: 'Notifications', body: notifications },
    { key: 'gestures', label: 'Gestures', body: <GesturesSection /> },
    { key: 'about', label: 'About', body: <AboutSection /> },
  ];
  return (
    <ThemedView style={styles.container}>
      {/* Top and sides only, as in the month view; the scroll view applies the
          bottom inset to its content so the list can run under the gesture
          bar while its last row stays reachable. */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <SettingsHeader title="Settings" onBack={goBack} />
        {sideMenu ? (
          <View style={styles.menuLayout}>
            <View style={styles.menu} role="tablist" testID="settings-menu">
              {sections.map(({ key, label }) => {
                const selected = key === section;
                return (
                  <Pressable
                    key={key}
                    role="tab"
                    aria-selected={selected}
                    onPress={() => setSection(key)}
                    testID={`settings-menu-${key}`}
                    style={({
                      pressed,
                      hovered,
                    }: {
                      pressed: boolean;
                      hovered?: boolean;
                    }) => [
                      styles.menuItem,
                      (pressed || hovered) &&
                        !selected && {
                          backgroundColor: theme.backgroundSelected,
                        },
                      selected && styles.menuItemSelected,
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.menuLabel,
                        selected && styles.menuLabelSelected,
                      ]}
                    >
                      {label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <ScrollView
              style={styles.panelScroll}
              contentContainerStyle={[
                styles.panel,
                { paddingBottom: insets.bottom + Spacing.five },
              ]}
              testID="settings-screen"
            >
              <View role="tabpanel">
                {sections.find((s) => s.key === section)!.body}
              </View>
            </ScrollView>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.body,
              { paddingBottom: insets.bottom + Spacing.five },
            ]}
            testID="settings-screen"
          >
            {sections.map(({ key, body }) => (
              <View key={key}>{body}</View>
            ))}
          </ScrollView>
        )}
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
              shown.undo
                ? { label: 'Undo', icon: UndoIcon, onPress: () => {} }
                : undefined
            }
          />
        )}
      </View>
    </ThemedView>
  );
}

/** One column's width, as in the single-column layout. */
const COLUMN_WIDTH = 560;
/** The side menu's width. */
const MENU_WIDTH = 240;
/** The open section's width: a reading width, as the single column's. */
const PANEL_WIDTH = 640;
/** Menu, the open section, and the padding around them. */
const SIDE_MENU_MIN_WIDTH = MENU_WIDTH + PANEL_WIDTH + Spacing.four * 3;

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
  menuLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  menu: {
    width: MENU_WIDTH,
    paddingVertical: Spacing.four,
    paddingLeft: Spacing.four,
    gap: Spacing.one,
  },
  menuItem: {
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  menuItemSelected: {
    backgroundColor: AccentColor,
  },
  menuLabel: {
    fontFamily: FontFamilyBold,
    fontSize: 16,
    lineHeight: 22,
  },
  menuLabelSelected: {
    color: OnAccentColor,
  },
  panelScroll: {
    flex: 1,
  },
  panel: {
    padding: Spacing.four,
    // The section at a reading width, not stretched across a wide window.
    maxWidth: PANEL_WIDTH + Spacing.four * 2,
  },
});
