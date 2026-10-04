import Constants from 'expo-constants';
import { Platform } from 'react-native';

import {
  SettingsSection,
  SettingsValue,
} from '@/components/settings/settings-parts';

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
    </SettingsSection>
  );
}
