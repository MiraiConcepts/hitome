import '@/polyfills';

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BootScreen } from '@/components/boot-screen';
import { VersionBadge } from '@/components/version-badge';
import { useAlarmReconcile } from '@/hooks/use-alarm-reconcile';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
  const ready = hydrated && (fontsLoaded || !!fontError);
  return (
    // Required by react-native-gesture-handler (canvas pan/pinch) on every
    // platform, web included — gestures aren't recognized outside this view.
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {/* Bottom sheets (event editor on narrow layouts) portal here, above
            the router content. */}
        <BottomSheetModalProvider>
          {ready ? (
            <>
              <Slot />
              <VersionBadge />
            </>
          ) : (
            <BootScreen />
          )}
        </BottomSheetModalProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
