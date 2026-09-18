import Constants from 'expo-constants';
import { Platform } from 'react-native';

import {
  SettingsNote,
  SettingsSection,
  SettingsValue,
} from '@/components/settings/settings-parts';

/**
 * What build this is. The same version the floating badge shows, with the
 * pieces the badge has no room for — versionCode matters when telling two
 * Obtainium installs apart, and `dev` marks the debug variant that coexists
 * with the release app.
 */
export function AboutSection() {
  const version = Constants.expoConfig?.version ?? '?';
  const versionCode = Constants.expoConfig?.android?.versionCode;
  return (
    <SettingsSection title="About" testID="settings-about">
      <SettingsValue
        label="Version"
        value={`${version}${__DEV__ ? ' dev' : ''}`}
        testID="settings-version"
      />
      {versionCode !== undefined && (
        <SettingsValue label="Build" value={String(versionCode)} />
      )}
      <SettingsValue label="Platform" value={Platform.OS} />
      <SettingsNote>
        Web and Android are released from the same tag, so these versions always
        match.
      </SettingsNote>
    </SettingsSection>
  );
}
