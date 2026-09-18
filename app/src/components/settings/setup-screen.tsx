import { ScrollView, StyleSheet } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { ServerForm } from '@/components/settings/server-form';
import {
  SettingsNote,
  SettingsSection,
} from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccentColor, FontFamilyBold, Spacing } from '@/constants/theme';

/**
 * First run. Nothing in this app works without a calendar server, so this is a
 * gate rather than a prompt over an empty grid — the same ServerForm settings
 * uses, with the app's name above it instead of a header bar to go back to.
 * It replaces the old "this build has no CalDAV server URL, set
 * EXPO_PUBLIC_DAV_URL and rebuild" card, which was true right up until the URL
 * stopped being baked in.
 */
export function SetupScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingBottom: insets.bottom + Spacing.five },
          ]}
          testID="setup-screen"
        >
          <ThemedText style={styles.title}>hitome</ThemedText>
          <SettingsNote>
            Point this at your CalDAV server to get started. It is checked
            before anything is saved.
          </SettingsNote>
          <SettingsSection title="Server" testID="setup-server">
            <ServerForm />
          </SettingsSection>
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
    // Centred on a wide window, as the old setup card was — this is a form,
    // not the full-bleed grid.
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    // Sits the form a little above dead centre, which reads better than the
    // top of an otherwise empty screen.
    paddingTop: Spacing.six,
  },
  title: {
    fontFamily: FontFamilyBold,
    color: AccentColor,
    fontSize: 32,
    lineHeight: 42,
  },
});
