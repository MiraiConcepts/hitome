import { useState } from 'react';
import { Pressable, StyleSheet, View, type TextInputProps } from 'react-native';

import { cancelAllReminders } from '@/alarms/scheduler';
import { probeConnection } from '@/caldav/client';
import { FieldStack } from '@/components/fields/field-stack';
import { TextField } from '@/components/fields/text-field';
import {
  HelpCircleIcon,
  LockIcon,
  LogoutIcon,
  ServerIcon,
  UserIcon,
} from '@/components/icons';
import {
  SettingsButton,
  SettingsBlock,
  SettingsButtonRow,
  SettingsMessage,
  SettingsOutcomeLine,
  type SettingsOutcome,
} from '@/components/settings/settings-parts';
import {
  classifyConnectError,
  connectFailureMessage,
  normalizeDavUrl,
} from '@/config/dav-config';
import {
  clearDavConfig,
  eraseDavConfig,
  getLastDavConfig,
  saveDavConfig,
  useDavConfig,
} from '@/config/dav-store';
import { Spacing } from '@/constants/theme';
import { refreshAgendaWidget } from '@/widget/app-refresh';

/**
 * State and actions for the CalDAV connection form, shared by the first-run
 * setup screen and the Server section of settings. The two lay the same
 * fields out differently — setup pins its Connect button to the corner of the
 * screen, settings keeps Save and Disconnect under the fields — so the form is
 * split into this hook, the fields (ConnectionFields), and each screen's own
 * buttons.
 *
 * Save connects before it stores: discovery has to complete, the login has to
 * be accepted, and the account has to actually have a calendar. A configuration
 * that has never been tried is worth very little — the failure modes here
 * (wrong address, wrong password, off the network, no calendars) are all
 * indistinguishable from "the calendar is empty" once you are past this screen.
 *
 * The login is optional on purpose. Pointing this at a reverse proxy that
 * injects Authorization — the deployment docs/Deploy.md describes — means the
 * client should send nothing at all, and the connection check is what confirms
 * it either way.
 */
export function useServerForm(onSaved?: () => void) {
  const config = useDavConfig();
  // The live connection, or else the one last disconnected on this device.
  // Starts empty on a fresh install: nothing about any particular server ships
  // in a build, not even as a suggestion.
  const [seed] = useState(() => config ?? getLastDavConfig());
  const [url, setUrl] = useState(seed?.url ?? '');
  const [username, setUsername] = useState(seed?.username ?? '');
  const [password, setPassword] = useState(seed?.password ?? '');
  const [outcome, setOutcome] = useState<SettingsOutcome>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const normalized = normalizeDavUrl(url);
    if (!normalized) {
      setOutcome({
        tone: 'problem',
        text: connectFailureMessage('bad-url', ''),
      });
      return;
    }
    const candidate = {
      url: normalized,
      username: username.trim(),
      password,
    };
    // The last outcome stays up while this one is checked; the button's
    // spinner says it is working.
    setBusy(true);
    try {
      await probeConnection(candidate);
      await saveDavConfig(candidate);
      // Show the normalized form — the trailing slash and scheme it gained are
      // what will actually be used.
      setUrl(candidate.url);
      setOutcome({ tone: 'success', text: 'Connected' });
      onSaved?.();
    } catch (err) {
      setOutcome({
        tone: 'problem',
        text: connectFailureMessage(
          classifyConnectError(err, { hadLogin: Boolean(candidate.username) }),
          err instanceof Error ? err.message : String(err)
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  /** What both ways out share: nothing from this account should ring or
   *  sit on the home screen afterwards. */
  async function leaveAccount() {
    await cancelAllReminders().catch(() => {});
    refreshAgendaWidget();
  }

  async function disconnect() {
    setBusy(true);
    try {
      // The fields keep their values: the store remembers this connection to
      // prefill the setup screen, which replaces this one once it is cleared.
      await clearDavConfig();
      await leaveAccount();
    } finally {
      setBusy(false);
    }
  }

  /** Disconnect and forget: no remembered login, nothing cached. */
  async function signOutAndErase() {
    setBusy(true);
    try {
      await eraseDavConfig();
      await leaveAccount();
    } finally {
      setBusy(false);
    }
  }

  return {
    config,
    url,
    setUrl,
    username,
    setUsername,
    password,
    setPassword,
    outcome,
    busy,
    save,
    disconnect,
    signOutAndErase,
  };
}

export type ServerFormState = ReturnType<typeof useServerForm>;

/**
 * Server URL, username and password — captions above the fields, each with
 * its glyph — and the outcome of the last attempt beneath them. No buttons and
 * no surface of its own: the screen around it decides both. Focus and blur
 * are passed out so a screen can react to typing starting and stopping.
 */
export function ConnectionFields({
  form,
  onFieldFocus,
  onFieldBlur,
  help = false,
}: {
  form: ServerFormState;
  onFieldFocus?: () => void;
  onFieldBlur?: () => void;
  /** Offer the "what do I enter" help (first run, where it is needed). */
  help?: boolean;
}) {
  // What every one of the three inputs shares.
  const common: TextInputProps = {
    autoCapitalize: 'none',
    autoCorrect: false,
    editable: !form.busy,
    onFocus: onFieldFocus,
    onBlur: onFieldBlur,
  };
  return (
    <View style={styles.fields}>
      <FieldStack label="Server URL" icon={ServerIcon}>
        <TextField
          {...common}
          value={form.url}
          onChangeText={form.setUrl}
          placeholder="https://your-server/dav/"
          keyboardType="url"
          inputMode="url"
          testID="settings-url"
        />
      </FieldStack>
      <FieldStack label="Username" icon={UserIcon}>
        <TextField
          {...common}
          value={form.username}
          onChangeText={form.setUsername}
          placeholder="Optional"
          testID="settings-username"
        />
      </FieldStack>
      <FieldStack label="Password" icon={LockIcon}>
        <TextField
          {...common}
          value={form.password}
          onChangeText={form.setPassword}
          placeholder="Optional"
          secureTextEntry
          testID="settings-password"
        />
      </FieldStack>

      <SettingsOutcomeLine outcome={form.outcome} testID="settings-problem" />
      {help && <ConnectionHelp />}
    </View>
  );
}

/**
 * Folded until asked for: one quiet line, which opens to what the fields want
 * — the server's CalDAV address with examples, and what the login is. Kept
 * short on purpose; the error messages carry the rest.
 */
function ConnectionHelp() {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.help}>
      <Pressable
        onPress={() => setOpen(!open)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        testID="setup-help"
      >
        <SettingsMessage icon={HelpCircleIcon}>
          What do I enter here?
        </SettingsMessage>
      </Pressable>
      {open && (
        <>
          <SettingsMessage>
            Your calendar server’s CalDAV address. For Radicale it is usually
            https://your-server:5232/, for Nextcloud
            https://your-server/remote.php/dav/.
          </SettingsMessage>
          <SettingsMessage>
            Username and password are the ones that server knows you by. Leave
            them empty if a proxy in front of it signs you in. Accounts that
            need Google or Microsoft sign-in can’t connect.
          </SettingsMessage>
        </>
      )}
    </View>
  );
}

/** The settings arrangement, as two card rows: the fields with Disconnect
 *  and Save under them (Save last, at the right), then the erase row. */
export function ServerForm() {
  const form = useServerForm();
  return (
    <>
      <SettingsBlock>
        <ConnectionFields form={form} />
        <SettingsButtonRow>
          {form.config && (
            <SettingsButton
              label="Disconnect"
              variant="danger"
              disabled={form.busy}
              onPress={form.disconnect}
              testID="settings-disconnect"
            />
          )}
          <SettingsButton
            label="Save"
            variant="filled"
            busy={form.busy}
            onPress={form.save}
            testID="settings-save"
          />
        </SettingsButtonRow>
      </SettingsBlock>
      {form.config && <EraseRow form={form} />}
    </>
  );
}

/** The way out that keeps nothing — its own row, away from Save. */
function EraseRow({ form }: { form: ServerFormState }) {
  return (
    <SettingsBlock>
      <SettingsMessage icon={LogoutIcon}>
        Disconnect remembers your login for next time. Sign out and erase
        removes it and everything hitome keeps on this phone.
      </SettingsMessage>
      <SettingsButtonRow>
        <SettingsButton
          label="Sign out and erase"
          variant="danger"
          disabled={form.busy}
          onPress={form.signOutAndErase}
          testID="settings-erase"
        />
      </SettingsButtonRow>
    </SettingsBlock>
  );
}

const styles = StyleSheet.create({
  help: {
    gap: Spacing.two,
  },
  fields: {
    gap: Spacing.three - Spacing.one,
  },
});
