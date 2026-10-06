import { Image, ScrollView, StyleSheet, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { AppName } from '@/components/settings/app-name';
import { LoginFields, useLoginForm } from '@/components/settings/login-form';
import { SettingsButton } from '@/components/settings/settings-parts';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useIsWide } from '@/hooks/use-is-wide';

const ICON_SIZE = 72;

/**
 * The web's login. Nothing here works without one, so this is a gate rather
 * than a prompt over an empty grid: the app's icon and name, username and
 * password straight on the ground, and Log in. The calendar's address is not
 * asked: whoever runs this copy of hitome set it (CALDAV_URL). Android's twin
 * is setup-screen.android.tsx.
 *
 * Nothing moves: no card arriving, no header collapsing while typing.
 */
export function SetupScreen() {
  const insets = useSafeAreaInsets();
  const form = useLoginForm();
  const isWide = useIsWide();
  const button = (
    <SettingsButton
      label="Log in"
      variant="filled"
      busy={form.busy}
      onPress={form.submit}
      testID="login-submit"
    />
  );
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          testID="login-screen"
        >
          <View style={styles.brand}>
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.icon}
              accessibilityIgnoresInvertColors
            />
            <AppName />
          </View>
          <LoginFields form={form} />
          {/* A desktop window is tall and wide: the button belongs under the
              fields, not in the far corner of the screen. */}
          {isWide && <View style={styles.actions}>{button}</View>}
        </ScrollView>
        {!isWide && (
          <View
            style={[
              styles.actions,
              styles.footer,
              { paddingBottom: insets.bottom + Spacing.three },
            ]}
          >
            {button}
          </View>
        )}
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
    // Centred on a wide window: this is a form, not the full-bleed grid.
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  brand: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  footer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
});
