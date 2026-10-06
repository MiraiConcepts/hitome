import { isBatteryOptimizationEnabledAsync } from 'expo-battery';
import { useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import {
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
  SettingsBlock,
  SettingsButtonRow,
  SettingsMessage,
  SettingsOutcomeLine,
  SettingsSection,
  SettingsToggle,
  SettingsValue,
  type SettingsOutcome,
} from '@/components/settings/settings-parts';
import { TIMED_PRESETS } from '@/components/calendar/alarm-field';
import { ChipRow } from '@/components/fields/chip-row';
import { FieldStack } from '@/components/fields/field-stack';
import { BellIcon, EyeIcon } from '@/components/icons';
import { ReminderPreview } from '@/components/settings/reminder-preview';
import { setDefaultAlert, useDefaultAlert } from '@/config/alert-pref';

// Android can be sent to the app's own notification settings; a browser's site
// permission is only reversible from the browser's own UI.
const CAN_OPEN_SYSTEM_SETTINGS = Platform.OS !== 'web';

// Battery optimisation is Android's; the web has no background to restrict.
const HAS_BACKGROUND_LIMIT = Platform.OS === 'android';

/** Whether the phone lets hitome run in the background (exempt from battery
 *  optimisation, which ColorOS calls "Allow background activity"); null where
 *  it cannot tell. */
async function backgroundAllowed(): Promise<boolean | null> {
  if (!HAS_BACKGROUND_LIMIT) return null;
  return !(await isBatteryOptimizationEnabledAsync());
}

const PERMISSION_OFF =
  'Notifications are off. Turn on Permission to send a test.';
const TEST_SENT =
  TEST_DELAY_SECONDS > 0
    ? `Sent. It should arrive in about ${TEST_DELAY_SECONDS} seconds. Leave the app to check it rings in the background.`
    : 'Sent. It should have appeared just now.';

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
  const defaultAlert = useDefaultAlert();
  const [snapshot, setSnapshot] = useState<PermissionSnapshot | null>(null);
  const [scheduled, setScheduled] = useState<number | null>(null);
  const [background, setBackground] = useState<boolean | null>(null);
  // The test's wait, shown on its button: one test in flight at a time, so
  // presses in the meantime are not quietly folded into the same one.
  const [cooldown, setCooldown] = useState<{
    started: number;
    ms: number;
  } | null>(null);
  const [outcome, setOutcome] = useState<SettingsOutcome>(null);
  const [busy, setBusy] = useState(false);
  // Bumped to re-read the platform, which is the only place this state lives.
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([
      permissionSnapshot(),
      listScheduledAlarmIds(),
      backgroundAllowed().catch(() => null),
    ])
      .then(([next, ids, allowed]) => {
        if (!alive) return;
        setSnapshot(next);
        setScheduled(ids.length);
        setBackground(allowed);
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

  // Turning notifications on answers the "they are off" message; showing it
  // still would contradict the toggle right above it.
  const shownOutcome =
    state === 'granted' && outcome?.kind === 'permission-off' ? null : outcome;

  /** Runs an action, then shows how it went. The previous outcome stays up
   *  until then, so the card does not shrink and grow back on every tap. */
  async function run(work: () => Promise<void>, success?: string) {
    setBusy(true);
    try {
      await work();
      if (success) setOutcome({ tone: 'note', text: success });
    } catch (err) {
      setOutcome({
        tone: 'problem',
        text: err instanceof Error ? err.message : 'That did not work',
      });
    } finally {
      setBusy(false);
      setReads((n) => n + 1);
    }
  }

  /**
   * Checks the permission at the moment of sending, not the snapshot on
   * screen: a notification scheduled without it is accepted by the platform
   * and then silently never shown, which would make "Sent" a lie.
   */
  async function sendTest() {
    const fresh = await permissionSnapshot();
    if (permissionState(fresh) !== 'granted') {
      setSnapshot(fresh);
      setOutcome({
        tone: 'problem',
        text: PERMISSION_OFF,
        kind: 'permission-off',
      });
      return;
    }
    // From the tap, not from when the send returns: started after it, the
    // button went spinner-on-amber, then emptied, a two-step flicker.
    if (TEST_DELAY_SECONDS > 0)
      setCooldown({ started: Date.now(), ms: TEST_DELAY_SECONDS * 1000 });
    await run(async () => {
      try {
        await sendTestNotification();
      } catch (err) {
        setCooldown(null);
        throw err;
      }
    }, TEST_SENT);
  }

  return (
    <SettingsSection title="Notifications" testID="settings-notifications">
      <SettingsValue
        label="Permission"
        value={
          copy && state !== 'unsupported' ? (
            <SettingsToggle
              on={state === 'granted'}
              label={copy.label}
              // Not held by `busy`: dimmed for the length of a test send,
              // the toggles flickered. Only the prompt can be shown from
              // here where there are no system settings to open (web).
              disabled={!CAN_OPEN_SYSTEM_SETTINGS && copy.action !== 'enable'}
              onPress={() =>
                run(() =>
                  // Off and never asked: the system prompt. Anything else —
                  // blocked, or on (an app cannot revoke its own permission) —
                  // is changed in the system's settings for this app; the
                  // section re-reads when the app comes back to the front.
                  copy.action === 'enable'
                    ? requestPermissionIfNeeded()
                    : Linking.openSettings()
                )
              }
              testID="settings-permission-toggle"
            />
          ) : (
            (copy?.label ?? 'Checking…')
          )
        }
        testID="settings-permission"
      />

      <SettingsValue
        label="Reminders"
        value={scheduledLabel(scheduled)}
        testID="settings-scheduled"
      />

      {HAS_BACKGROUND_LIMIT && background !== null && (
        <>
          <SettingsValue
            label="Background Activity"
            value={
              <SettingsToggle
                on={background}
                label={background ? 'Allowed' : 'Restricted'}
                // Changed only in the system's page for this app (Battery);
                // the section re-reads on the way back.
                onPress={() => run(() => Linking.openSettings())}
                testID="settings-background-toggle"
              />
            }
            testID="settings-background"
          />
          {!background && (
            <SettingsBlock>
              <SettingsMessage tone="problem">
                The phone may stop hitome in the background, and Snooze can then
                do nothing. Allow background activity under Battery.
              </SettingsMessage>
            </SettingsBlock>
          )}
        </>
      )}

      <SettingsBlock>
        <FieldStack label="Default alert for new events" icon={BellIcon}>
          <ChipRow
            options={TIMED_PRESETS}
            value={defaultAlert === null ? 'none' : String(defaultAlert)}
            onChange={(next) =>
              setDefaultAlert(next === 'none' ? null : Number(next))
            }
            singleLine
            testID="settings-default-alert"
          />
        </FieldStack>
      </SettingsBlock>

      {Platform.OS === 'web' ? (
        // The preview is an Android notification, Join and Snooze included;
        // a browser's looks like the browser's, and arrives only while the
        // page is open (alarms/scheduler.web.ts), which is worth saying.
        <SettingsBlock>
          <SettingsMessage icon={BellIcon}>
            Reminders arrive only while this page is open in a tab.
          </SettingsMessage>
        </SettingsBlock>
      ) : (
        <SettingsBlock>
          <FieldStack label="What a reminder looks like" icon={EyeIcon}>
            <ReminderPreview />
          </FieldStack>
        </SettingsBlock>
      )}

      <SettingsBlock>
        <SettingsButtonRow>
          <SettingsButton
            label="Send a test notification"
            variant="filled"
            busy={busy}
            cooldown={cooldown}
            disabled={state === 'unsupported'}
            onPress={sendTest}
            testID="settings-test-notification"
          />
        </SettingsButtonRow>

        {/* Under the button, not over it: arriving above, the line pushed
            the button down out from under the finger that had just pressed
            it. */}
        <SettingsOutcomeLine
          outcome={shownOutcome}
          testID="settings-notifications-problem"
        />
      </SettingsBlock>
    </SettingsSection>
  );
}
