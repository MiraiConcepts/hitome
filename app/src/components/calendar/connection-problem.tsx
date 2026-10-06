import { Image, ScrollView, StyleSheet, View } from 'react-native';

import { AppName } from '@/components/settings/app-name';
import {
  SettingsBlock,
  SettingsButton,
  SettingsSection,
} from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { ConnectionProblem as Problem } from '@/config/dav-config';
import { Spacing } from '@/constants/theme';

type Props = {
  problem: Problem;
  /** A retry is in flight. */
  busy: boolean;
  onRetry: () => void;
};

/**
 * The web's answer to a calendar it has never managed to load: a whole
 * screen, cut from the Android setup screen (icon and name, one card that
 * says what is wrong, the action bottom-right), rather than an error line
 * over an empty grid that looks like a quiet month. Once anything has loaded
 * the banner takes over, since the grid then has something true to show.
 */
export function ConnectionProblem({ problem, busy, onRetry }: Props) {
  return (
    <ThemedView style={styles.fill} testID="connection-problem">
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.brand}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.icon}
            accessibilityIgnoresInvertColors
          />
          <AppName />
        </View>
        <SettingsSection title={problem.title}>
          <SettingsBlock>
            <ThemedText type="small" themeColor="textSecondary">
              {problem.body}
            </ThemedText>
          </SettingsBlock>
        </SettingsSection>
        <View style={styles.actions}>
          <SettingsButton
            label="Try again"
            variant="filled"
            busy={busy}
            onPress={onRetry}
            testID="connection-retry"
          />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  // The setup screen's column: a form-width card, centred on a wide window.
  body: {
    padding: Spacing.three,
    paddingTop: Spacing.six + Spacing.five,
    gap: Spacing.five,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  brand: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  icon: {
    width: 72,
    height: 72,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
