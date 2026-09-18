import {
  SettingsNote,
  SettingsSection,
  SettingsValue,
} from '@/components/settings/settings-parts';
import { ServerForm } from '@/components/settings/server-form';
import { useDavConfig } from '@/config/dav-store';
import { CONFIGURABLE } from '@/config/dav-storage';

/**
 * Where the calendar comes from. Editable where a server address is something
 * a person supplies (Android); read-only on web, which derives its endpoint
 * from the page it was loaded from and rides the credentials its reverse proxy
 * injects — so there is nothing to type, and nothing that could be typed that a
 * browser would not refuse to send cross-origin anyway.
 */
export function ConnectionSection() {
  const config = useDavConfig();

  if (!CONFIGURABLE) {
    return (
      <SettingsSection title="Server" testID="settings-connection">
        <SettingsValue
          label="Address"
          value={config?.url ?? 'Not configured'}
          testID="settings-server-url"
        />
        <SettingsValue label="Login" value="Supplied by the server" />
        <SettingsNote>
          The web app talks to /dav/ on its own address, and the reverse proxy
          in front of it supplies the credentials — so no password is ever kept
          in this browser.
        </SettingsNote>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="Server" testID="settings-connection">
      <ServerForm allowDisconnect saveLabel="Save" />
    </SettingsSection>
  );
}
