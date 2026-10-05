import '@/polyfills';

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BootScreen } from '@/components/boot-screen';
import { onCalendarReady } from '@/components/calendar/calendar-ready';
import { SetupScreen } from '@/components/settings/setup-screen';
import { ensureDefaultAlert } from '@/config/alert-pref';
import { ensureSource, useSourceStatus } from '@/config/source';
import { useAlarmReconcile } from '@/hooks/use-alarm-reconcile';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DeepLinkProvider } from '@/hooks/use-deep-link';
import { useDeepLinkSource } from '@/hooks/use-deep-link-source';
import { useHydrated } from '@/hooks/use-hydrated';
import { useSilentReload } from '@/hooks/use-silent-reload';
import { refreshAgendaWidget } from '@/widget/app-refresh';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // Web loads Satoshi at runtime (@font-face injection); native embeds
  // it via the expo-font config plugin (and the widget reads assets/fonts).
  const [fontsLoaded, fontError] = useFonts({
    Satoshi: require('../../assets/fonts/Satoshi.otf'),
    Satoshi_bold: require('../../assets/fonts/Satoshi_bold.otf'),
  });
  const hydrated = useHydrated();
  // The CalDAV connection is read from storage now rather than baked into the
  // bundle, so it is a fourth thing the shell has to wait for. 'loading' is a
  // real state: concluding "not configured" from a null that has not been read
  // yet would flash the setup screen at someone who is already set up.
  const davStatus = useSourceStatus();
  useEffect(() => {
    ensureSource();
    // Read before any editor opens: a new event starts with this alert.
    ensureDefaultAlert();
  }, []);
  const { link, ready: linkReady } = useDeepLinkSource();
  // Whether the setup screen is up — still true for a moment after Allow,
  // while it fades over the calendar drawing beneath it.
  const [setupShown, setSetupShown] = useState(false);
  if (davStatus === 'unconfigured' && !setupShown) setSetupShown(true);
  const hideSetup = useCallback(() => setSetupShown(false), []);
  useSilentReload();
  useAlarmReconcile();
  useEffect(() => {
    // DEFERRED on purpose — do not fire this during boot. The widget render
    // allocates large transient bitmaps (full widget + every row, ×2 for
    // light/dark); overlapped with app-startup allocations it blew the 256 MB
    // heap cap and OOM-crashed the app right after launch (observed on
    // OnePlus/560dpi, v0.2.2; full story in
    // .claude/plans/android-agenda-widget-plan.md §Field debugging).
    const timer = setTimeout(refreshAgendaWidget, 5000);
    return () => clearTimeout(timer);
  }, []);
  // Hold a full-page spinner until the shell can render truthfully: hydration
  // (window width is unreadable before it, and the event editor picks its
  // bottom-sheet vs centered-dialog form from that width) and fonts (no
  // Satoshi swap mid-boot). fontError falls through so a failed font load
  // degrades to fallback fonts instead of a stuck spinner.
  // linkReady joins the gate because the screen seeds state from the link: a
  // render before it lands opens the wrong event, not merely the wrong frame.
  const ready =
    hydrated &&
    linkReady &&
    (fontsLoaded || !!fontError) &&
    davStatus !== 'loading';
  return (
    // Required by react-native-gesture-handler (canvas pan/pinch) on every
    // platform, web included — gestures aren't recognized outside this view.
    <GestureHandlerRootView style={styles.root}>
      {/* The page title (web): the router's head manager writes its own
          <title> ahead of +html's, so it is set through it. */}
      <Head>
        <title>hitome</title>
      </Head>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {/* Bottom sheets (event editor on narrow layouts) portal here, above
            the router content. */}
        <BottomSheetModalProvider>
          {ready ? (
            <DeepLinkProvider value={link}>
              {/* Nothing in this app works without a server, so setup is a gate
                  rather than a route — a deep link into the calendar has
                  nothing to show either. */}
              {/* After Allow the calendar mounts underneath, and the setup
                  screen stays on top until the grid has drawn, then fades
                  (SetupOverlay) — one dissolve, not a cut to a header over
                  an empty grid. */}
              {davStatus !== 'unconfigured' && (
                /* A stack, not a Slot: settings is a pushed screen, so
                   Android's back press and the browser's back button both pop
                   it for free. No headers: every screen draws its own bar (the
                   month view's is part of the calendar's chrome, not navigation
                   furniture). */
                <Stack screenOptions={{ headerShown: false }} />
              )}
              {setupShown && (
                <SetupOverlay
                  leaving={davStatus !== 'unconfigured'}
                  onGone={hideSetup}
                />
              )}
            </DeepLinkProvider>
          ) : (
            <BootScreen />
          )}
        </BottomSheetModalProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const SETUP_FADE_MS = 250;
/** Fade anyway if the grid never says it is ready. */
const SETUP_HOLD_MAX_MS = 1500;

/**
 * The setup screen as a layer over everything. While `leaving`, it waits
 * for the calendar beneath to be drawn (or SETUP_HOLD_MAX_MS), fades out,
 * then reports gone.
 */
function SetupOverlay({
  leaving,
  onGone,
}: {
  leaving: boolean;
  onGone: () => void;
}) {
  const opacity = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  useEffect(() => {
    if (!leaving) {
      opacity.set(1);
      return;
    }
    let started = false;
    const fade = () => {
      if (started) return;
      started = true;
      opacity.set(
        withTiming(0, { duration: SETUP_FADE_MS }, (done) => {
          if (done) runOnJS(onGone)();
        })
      );
    };
    const off = onCalendarReady(fade);
    const timer = setTimeout(fade, SETUP_HOLD_MAX_MS);
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [leaving, opacity, onGone]);
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents={leaving ? 'none' : 'auto'}
    >
      <SetupScreen />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
