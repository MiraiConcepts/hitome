import { useState } from 'react';

import {
  SettingsBlock,
  SettingsButton,
  SettingsButtonRow,
  SettingsSection,
  SettingsValue,
} from '@/components/settings/settings-parts';
import { logOut, useSession } from '@/config/session';

/**
 * Where the calendar comes from, on the web: the server this copy of hitome
 * was set up with (read-only; it is the deployer's setting), who is logged
 * in, and the way out. Android's version is connection-section.android: the
 * phone's calendars, synced by DAVx⁵.
 */
export function ConnectionSection() {
  const { username, server } = useSession();
  const [busy, setBusy] = useState<'here' | 'everywhere' | null>(null);

  async function run(everywhere: boolean) {
    setBusy(everywhere ? 'everywhere' : 'here');
    // On success the login screen replaces everything, this included.
    try {
      await logOut(everywhere);
    } finally {
      setBusy(null);
    }
  }

  return (
    <SettingsSection title="Account" testID="settings-connection">
      <SettingsValue
        label="Logged in as"
        value={username ?? '…'}
        testID="settings-username"
      />
      <SettingsValue
        label="Calendar server"
        value={server ?? '…'}
        testID="settings-server-url"
      />
      <SettingsBlock>
        <SettingsButtonRow>
          <SettingsButton
            label="Log out everywhere"
            busy={busy === 'everywhere'}
            disabled={busy !== null}
            onPress={() => run(true)}
            testID="settings-logout-everywhere"
          />
          <SettingsButton
            label="Log out"
            variant="filled"
            busy={busy === 'here'}
            disabled={busy !== null}
            onPress={() => run(false)}
            testID="settings-logout"
          />
        </SettingsButtonRow>
      </SettingsBlock>
    </SettingsSection>
  );
}
