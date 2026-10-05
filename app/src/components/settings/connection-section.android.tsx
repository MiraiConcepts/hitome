import { useState } from 'react';
import { Linking } from 'react-native';

import {
  SettingsBlock,
  SettingsButton,
  SettingsButtonRow,
  SettingsMessage,
  SettingsSection,
} from '@/components/settings/settings-parts';
import { DAVX5_DOWNLOAD, openDavx5, requestSync } from '@/store/events';

/**
 * Where the calendar comes from, on Android: the phone's own calendars, which
 * DAVx⁵ (or Google, or another account) keeps in step with the server. hitome
 * holds no login here, so there is nothing to edit — only the sync app to
 * open, and a nudge to sync now.
 */
export function ConnectionSection() {
  const [syncing, setSyncing] = useState(false);
  return (
    <SettingsSection title="Sync" testID="settings-connection">
      <SettingsBlock>
        <SettingsMessage>
          hitome uses the calendars synced to this phone. DAVx⁵ keeps them in
          step with your server. Changes made offline go up when you’re back
          online.
        </SettingsMessage>
        <SettingsButtonRow>
          <SettingsButton
            label="Sync now"
            busy={syncing}
            onPress={async () => {
              setSyncing(true);
              try {
                await requestSync();
              } finally {
                setSyncing(false);
              }
            }}
            testID="settings-sync-now"
          />
          <SettingsButton
            label="Open DAVx⁵"
            variant="filled"
            onPress={async () => {
              if (!(await openDavx5())) Linking.openURL(DAVX5_DOWNLOAD);
            }}
            testID="settings-open-davx5"
          />
        </SettingsButtonRow>
      </SettingsBlock>
    </SettingsSection>
  );
}
