import { Platform } from 'react-native';

import {
  SettingsNote,
  SettingsSection,
  SettingsValue,
} from '@/components/settings/settings-parts';
import { DAV, davConfigured } from '@/config';

/**
 * The CalDAV endpoint in use, read-only for now — the URL is still baked into
 * the bundle at build time, so there is nothing here to edit yet. Reporting it
 * is worth doing regardless: "which server am I actually talking to" was
 * previously only answerable by grepping the bundle.
 */
export function ConnectionSection() {
  const injected = !DAV.user;
  return (
    <SettingsSection title="Connection" testID="settings-connection">
      <SettingsValue
        label="Server"
        value={davConfigured ? DAV.url : 'Not configured'}
        testID="settings-server-url"
      />
      <SettingsValue
        label="Login"
        value={injected ? 'Supplied by the server' : DAV.user}
        testID="settings-server-login"
      />
      <SettingsNote>
        {Platform.OS === 'web'
          ? 'The web app talks to /dav/ on its own address, and the reverse proxy in front of it supplies the credentials.'
          : 'This build carries its server URL. A future version lets you set it here.'}
      </SettingsNote>
    </SettingsSection>
  );
}
