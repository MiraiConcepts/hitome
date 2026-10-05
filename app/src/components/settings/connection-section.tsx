import {
  SettingsSection,
  SettingsValue,
} from '@/components/settings/settings-parts';
import { useDavConfig } from '@/config/dav-store';

/**
 * Where the calendar comes from, on the web: read-only, since the endpoint
 * derives from the page it was loaded from and rides the credentials its
 * reverse proxy injects. (Android's version is connection-section.android:
 * the phone's calendars, synced by DAVx⁵.)
 */
export function ConnectionSection() {
  const config = useDavConfig();
  return (
    <SettingsSection title="Server" testID="settings-connection">
      <SettingsValue
        label="Address"
        value={config?.url ?? 'Not configured'}
        testID="settings-server-url"
      />
      <SettingsValue label="Login" value="Supplied by the server" />
    </SettingsSection>
  );
}
