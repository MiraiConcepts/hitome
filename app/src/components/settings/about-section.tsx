import Constants from 'expo-constants';
import type { ComponentType } from 'react';
import { Linking, Platform, Pressable, StyleSheet } from 'react-native';

import {
  BugIcon,
  FileTextIcon,
  GithubIcon,
  type IconProps,
} from '@/components/icons';
import {
  SettingsBlock,
  SettingsSection,
  SettingsValue,
} from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { AccentColor, Spacing } from '@/constants/theme';

const REPO = 'https://github.com/MiraiConcepts/hitome';

/** Where the About card's links go. */
const LINKS: { label: string; url: string; icon: ComponentType<IconProps> }[] =
  [
    { label: 'Source code', url: REPO, icon: GithubIcon },
    {
      label: 'MIT licence',
      url: `${REPO}/blob/main/LICENSE`,
      icon: FileTextIcon,
    },
    { label: 'Report a problem', url: `${REPO}/issues/new`, icon: BugIcon },
  ];

const PLATFORM_NAMES: Partial<Record<typeof Platform.OS, string>> = {
  android: 'Android',
  web: 'Web',
};

/**
 * What build this is, in two lines. Version folds in the Android versionCode
 * (what Obtainium and Android compare to call an APK newer) and which copy of
 * the app this is, e.g. '0.3.2 (5) · Android'. Channel says whether it is the
 * debug variant that coexists with the release app — the one thing worth
 * checking at a glance with both installed.
 */
export function AboutSection() {
  const version = Constants.expoConfig?.version ?? '?';
  // versionCode only means something to an Android install.
  const versionCode =
    Platform.OS === 'android'
      ? Constants.expoConfig?.android?.versionCode
      : undefined;
  const platform = PLATFORM_NAMES[Platform.OS] ?? Platform.OS;
  return (
    <SettingsSection title="About" testID="settings-about">
      <SettingsValue
        label="Version"
        value={`${version}${versionCode !== undefined ? ` (${versionCode})` : ''} · ${platform}`}
        testID="settings-version"
      />
      <SettingsValue
        label="Channel"
        value={__DEV__ ? 'Development' : 'Release'}
        testID="settings-channel"
      />
      <SettingsBlock>
        {LINKS.map(({ label, url, icon: Icon }) => (
          <Pressable
            key={url}
            // Rejects when no app takes the link; the tap then does nothing.
            onPress={() => Linking.openURL(url).catch(() => {})}
            accessibilityRole="link"
            hitSlop={6}
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
            testID={`settings-link-${label}`}
          >
            <Icon size={16} color={AccentColor} />
            <ThemedText type="small" style={styles.linkLabel}>
              {label}
            </ThemedText>
          </Pressable>
        ))}
      </SettingsBlock>
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  linkLabel: {
    color: AccentColor,
  },
  pressed: {
    opacity: 0.6,
  },
});
