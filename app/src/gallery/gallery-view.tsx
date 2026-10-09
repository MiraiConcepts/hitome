// THROWAWAY gallery (see app/src/gallery/REVERT.md). The long page of
// specimens, one section per group.
import { useEffect } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';

import { OverlayHost } from './overlays';
import { Section, ToastHost } from './parts';
import { CalendarSection } from './sections/calendar';
import { ControlsSection } from './sections/controls';
import { FieldsSection } from './sections/fields';
import { Foundations } from './sections/foundations';
import { IconsSection, PrimitivesSection } from './sections/icons-primitives';
import { OverlaysSection } from './sections/overlays';
import { SettingsPartsSection } from './sections/settings';
import { ToastsSection, WidgetSection } from './sections/toasts';

/** The sections, in page order, for the shell's index. */
export const SECTIONS = [
  ['foundations', 'Foundations'],
  ['icons', 'Icons'],
  ['primitives', 'Primitives'],
  ['controls', 'Buttons'],
  ['settings', 'Settings'],
  ['fields', 'Fields'],
  ['calendar', 'Calendar'],
  ['overlays', 'Dialogs'],
  ['toasts', 'Toasts'],
  ['widget', 'Widget'],
  ['notes', 'Notes'],
] as const;

/** Web: jump to the section the URL's #hash names, now and on change. */
function useHashScroll() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const jump = () => {
      const id = window.location.hash.slice(1);
      if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
    };
    // After the first layout: the sections are not in the page before it.
    const timer = setTimeout(jump, 300);
    window.addEventListener('hashchange', jump);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('hashchange', jump);
    };
  }, []);
}

function NotesSection() {
  return (
    <Section id="notes" title="Notes">
      <ThemedText style={styles.noteHead}>States I could not force</ThemedText>
      {[
        'Hover (web): event strips dimming the others, the grid crosshair (GridSpotlight), SettingsValue rows and the day list bin lighting up. Live on this page with a mouse.',
        'Pressed: buttons (0.85 opacity filled, raised ground for the rest), chips, banners washing out, the grid hold ink spreading from the finger. Live on this page.',
        'Keyboard focus: the 2 px accent outline (global.css) on buttons, links, switches and radios; text fields turn their border accent while focused. Press Tab, or click into a field.',
        'The month label sliding between months in MonthHeader, and the grid snapping by month: scroll the sample month.',
        'Native pickers (the Android Compose date and time dialogs, the browser date and time popups) are the platform’s own.',
        'The editor sheet’s keyboard handling (the footer riding above the keyboard) needs a phone.',
        'The day pulse after a widget tap (WeekRow pulse) and the cover spinner over a slow grid are timing states of the month screen.',
      ].map((line) => (
        <ThemedText key={line} style={styles.noteLine}>
          · {line}
        </ThemedText>
      ))}
      <ThemedText style={styles.noteHead}>Shown other than live</ThemedText>
      {[
        'Event editor: the real form and parts, in a copy of its two shells, on a sample controller (the real controller reads the calendar list and writes to the server).',
        'Calendars (Settings): assembled from its parts with sample calendars (the real one reads the server).',
        'Location suggestions: drawn from the same parts with made-up places (the real list is a Photon search).',
        'Weekday row: copied from month-screen.tsx, where it is inline JSX.',
        'Account, Notifications and the login screen: the real components, live but view only, since their controls would sign out or change your settings.',
        'MonthScreen and SettingsScreen as whole screens are not mounted: they fetch the real calendar. Their parts are all above.',
        'Android widget: on the web, a description (see Widget).',
      ].map((line) => (
        <ThemedText key={line} style={styles.noteLine}>
          · {line}
        </ThemedText>
      ))}
    </Section>
  );
}

/** Scrolls this page to a section (web: by its anchor). */
function jumpTo(id: string) {
  if (Platform.OS !== 'web') return;
  window.history.replaceState(null, '', `#${id}`);
  document.getElementById(id)?.scrollIntoView({ block: 'start' });
}

export function GalleryView({ index = true }: { index?: boolean }) {
  const insets = useSafeAreaInsets();
  useHashScroll();
  return (
    <ThemedView style={styles.fill}>
      <ToastHost>
        <OverlayHost>
          <ScrollView
            style={styles.fill}
            contentContainerStyle={[
              styles.body,
              { paddingTop: insets.top + Spacing.three },
            ]}
          >
            <View style={styles.intro}>
              <ThemedText style={styles.title}>hitome components</ThemedText>
              <ThemedText style={styles.subtitle}>
                Every piece of the UI on sample data (made up, nothing fetched
                or written). Throwaway: app/src/gallery/REVERT.md.
              </ThemedText>
              {index && Platform.OS === 'web' && (
                <View style={styles.index}>
                  {SECTIONS.map(([id, label]) => (
                    <Pressable
                      key={id}
                      accessibilityRole="link"
                      onPress={() => jumpTo(id)}
                    >
                      <ThemedText style={styles.link}>{label}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            <Foundations />
            <IconsSection />
            <PrimitivesSection />
            <ControlsSection />
            <SettingsPartsSection />
            <FieldsSection />
            <CalendarSection />
            <OverlaysSection />
            <ToastsSection />
            <WidgetSection />
            <NotesSection />
          </ScrollView>
        </OverlayHost>
      </ToastHost>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    // The page itself is black; the specimens keep the app's own grounds.
    backgroundColor: '#000000',
  },
  body: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.six * 2,
    gap: Spacing.three,
  },
  intro: {
    gap: Spacing.one,
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: 700,
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#8A8F98',
  },
  index: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.three,
    rowGap: Spacing.one,
    paddingTop: Spacing.one,
  },
  link: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.dark.link,
  },
  noteHead: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 700,
    color: Colors.dark.text,
  },
  noteLine: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.dark.textSecondary,
  },
});
