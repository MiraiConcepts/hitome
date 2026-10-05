import { useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { AppName } from '@/components/settings/app-name';
import {
  SettingsBlock,
  SettingsButton,
  SettingsButtonRow,
  SettingsSection,
} from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  recheckSource,
  requestCalendarAccess,
  useSourceProblem,
} from '@/config/source.android';
import { Spacing } from '@/constants/theme';
import { DAVX5_DOWNLOAD, openDavx5 } from '@/store/events';

/**
 * First run on Android. hitome holds no server login here: it reads the
 * calendars already on the phone — synced by DAVx⁵, Google or another
 * account — so the gate is calendar access, then at least one calendar.
 */
export function SetupScreen() {
  const insets = useSafeAreaInsets();
  const problem = useSourceProblem();
  const [busy, setBusy] = useState(false);
  // A second refusal means Android stops asking ("don't ask again"); then
  // only the app's settings page can grant it.
  const [asked, setAsked] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const noCalendars = problem === 'no-calendars';
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.body} testID="setup-screen">
          <View style={styles.brand}>
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.icon}
              accessibilityIgnoresInvertColors
            />
            <AppName />
          </View>
          {noCalendars ? (
            <SettingsSection title="No calendars on this phone">
              <SettingsBlock>
                <ThemedText type="small" themeColor="textSecondary">
                  hitome shows the calendars your phone syncs. To add yours:
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  1. Install DAVx⁵ (free on F-Droid).{'\n'}2. Add your server
                  there: its address and your login.{'\n'}3. Come back, and
                  hitome picks the calendars up.
                </ThemedText>
              </SettingsBlock>
              <SettingsBlock>
                <ThemedText type="small" themeColor="textSecondary">
                  A Google account on this phone works too.
                </ThemedText>
              </SettingsBlock>
            </SettingsSection>
          ) : (
            <SettingsSection title="Use your phone’s calendars">
              <SettingsBlock>
                <ThemedText type="small" themeColor="textSecondary">
                  hitome shows the calendars your phone already syncs, from
                  DAVx⁵, Google or any other account.
                </ThemedText>
              </SettingsBlock>
            </SettingsSection>
          )}
        </ScrollView>
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + Spacing.three },
          ]}
        >
          {noCalendars ? (
            <SettingsButtonRow>
              <SettingsButton
                label="Check again"
                busy={busy}
                onPress={() => run(recheckSource)}
                testID="setup-check-again"
              />
              <SettingsButton
                label="Open DAVx⁵"
                variant="filled"
                onPress={async () => {
                  if (!(await openDavx5())) Linking.openURL(DAVX5_DOWNLOAD);
                }}
                testID="setup-open-davx5"
              />
            </SettingsButtonRow>
          ) : (
            <SettingsButton
              label={asked ? 'Open settings' : 'Allow calendar access'}
              variant="filled"
              busy={busy}
              onPress={() =>
                run(async () => {
                  if (asked) await Linking.openSettings();
                  else {
                    await requestCalendarAccess();
                    setAsked(true);
                  }
                })
              }
              testID="setup-allow"
            />
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  body: {
    padding: Spacing.three,
    paddingTop: Spacing.six + Spacing.five,
    gap: Spacing.five,
  },
  brand: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  icon: {
    width: 72,
    height: 72,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
});
