import { useState } from 'react';
import { Linking } from 'react-native';

import {
  SettingsBlock,
  SettingsButton,
  SettingsButtonRow,
  SettingsSection,
} from '@/components/settings/settings-parts';
import { cancelAllReminders } from '@/alarms/scheduler';
import { Brand } from '@/components/brand';
import { ThemedText } from '@/components/themed-text';
import { recheckSource } from '@/config/source.android';
import { setStoreDisconnected } from '@/config/store-connection';
import { DAVX5_DOWNLOAD, openDavx5, requestSync } from '@/store/events';
import { clearSnapshots } from '@/utils/snapshot-cache';
import { refreshAgendaWidget } from '@/widget/app-refresh';

/**
 * Stop using the phone's calendars: nothing is read, the reminders hitome
 * set are cancelled, its cached copy goes and the widget asks to connect
 * again. Android keeps the permission itself (an app cannot revoke it while
 * running); the first-run screen's Allow connects again.
 */
async function disconnect(): Promise<void> {
  setStoreDisconnected(true);
  await cancelAllReminders().catch(() => {});
  await clearSnapshots().catch(() => {});
  refreshAgendaWidget();
  await recheckSource();
}

/**
 * Where the calendar comes from, on Android: the phone's own calendars, which
 * DAVx⁵ (or Google, or another account) keeps in step with the server. hitome
 * holds no login here, so there is nothing to edit — only the sync app to
 * open, and a nudge to sync now.
 */
export function ConnectionSection() {
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  return (
    <SettingsSection title="Sync" testID="settings-connection">
      <SettingsBlock>
        <ThemedText type="small" themeColor="textSecondary">
          <Brand /> uses the calendars synced to this phone. DAVx⁵ keeps them in
          step with your server. Changes made offline go up when you’re back
          online.
        </ThemedText>
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
      <SettingsBlock>
        <SettingsButtonRow>
          <SettingsButton
            label="Disconnect"
            variant="danger"
            busy={disconnecting}
            onPress={async () => {
              setDisconnecting(true);
              try {
                await disconnect();
              } finally {
                setDisconnecting(false);
              }
            }}
            testID="settings-disconnect"
          />
        </SettingsButtonRow>
      </SettingsBlock>
    </SettingsSection>
  );
}
