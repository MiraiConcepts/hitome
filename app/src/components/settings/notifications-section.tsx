import { useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import {
  CHANNEL_ID,
  listScheduledAlarmIds,
  permissionSnapshot,
  requestPermissionIfNeeded,
  sendTestNotification,
  TEST_DELAY_SECONDS,
} from '@/alarms/scheduler';
import {
  permissionState,
  scheduledLabel,
  statusCopy,
  type PermissionSnapshot,
} from '@/alarms/status';
import {
  SettingsButton,
  SettingsButtonRow,
  SettingsNote,
  SettingsProblem,
  SettingsSection,
  SettingsValue,
} from '@/components/settings/settings-parts';

// Android can be sent to the app's own notification settings; a browser's site
// permission is only reversible from the browser's own UI.
const CAN_OPEN_SYSTEM_SETTINGS = Platform.OS !== 'web';

/**
 * Reminder plumbing, made visible. Everything under here already existed —
 * VALARM reminders, per-occurrence exact alarms, reconcile on foreground — with
 * no way to confirm any of it from the app: permission was only ever requested
 * as a side effect of setting a first alarm in the event editor, and nothing
 * reported state at rest. So this section reads the state, offers the one
 * action that state allows, and fires a real notification through the real
 * channel so a working setup is provable rather than assumed.
 */
export function NotificationsSection() {
  const [snapshot, setSnapshot] = useState<PermissionSnapshot | null>(null);
  const [scheduled, setScheduled] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped to re-read the platform, which is the only place this state lives.
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([permissionSnapshot(), listScheduledAlarmIds()])
      .then(([next, ids]) => {
        if (!alive) return;
        setSnapshot(next);
        setScheduled(ids.length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [reads]);

  useEffect(() => {
    // Returning from the system's notification settings is the whole reason
    // this re-reads on foreground — the permission may have changed out there.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setReads((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  const state = snapshot ? permissionState(snapshot) : null;
  const copy = state
    ? statusCopy(state, { canOpenSystemSettings: CAN_OPEN_SYSTEM_SETTINGS })
    : null;

  async function run(work: () => Promise<void>, after?: string) {
    setBusy(true);
    setProblem(null);
    setNote(null);
    try {
      await work();
      if (after) setNote(after);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That did not work');
    } finally {
      setBusy(false);
      setReads((n) => n + 1);
    }
  }

  return (
    <SettingsSection title="Notifications" testID="settings-notifications">
      <SettingsValue
        label="Permission"
        value={copy?.label ?? 'Checking…'}
        testID="settings-permission"
      />
      {copy && <SettingsNote>{copy.detail}</SettingsNote>}

      <SettingsValue
        label="Scheduled"
        value={scheduledLabel(scheduled)}
        testID="settings-scheduled"
      />
      <SettingsNote>
        Channel {CHANNEL_ID} · {Platform.OS}
      </SettingsNote>

      {problem && (
        <SettingsProblem testID="settings-notifications-problem">
          {problem}
        </SettingsProblem>
      )}
      {note && <SettingsNote>{note}</SettingsNote>}

      <SettingsButtonRow>
        {copy?.action === 'enable' && (
          <SettingsButton
            label="Enable notifications"
            variant="filled"
            disabled={busy}
            onPress={() => run(() => requestPermissionIfNeeded())}
            testID="settings-enable-notifications"
          />
        )}
        {copy?.action === 'open-system-settings' && (
          <SettingsButton
            label="Open system settings"
            variant="filled"
            disabled={busy}
            onPress={() => run(() => Linking.openSettings())}
            testID="settings-open-system-settings"
          />
        )}
        <SettingsButton
          label="Send a test notification"
          disabled={busy || state === 'unsupported' || state === 'blocked'}
          onPress={() =>
            run(
              sendTestNotification,
              TEST_DELAY_SECONDS > 0
                ? `Sent — it should arrive in about ${TEST_DELAY_SECONDS} seconds. Leave the app to check it rings in the background.`
                : 'Sent — it should have appeared just now.'
            )
          }
          testID="settings-test-notification"
        />
      </SettingsButtonRow>
    </SettingsSection>
  );
}
