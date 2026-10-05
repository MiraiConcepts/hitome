import { useState } from 'react';
import { StyleSheet, View, type TextInputProps } from 'react-native';

import { probeConnection } from '@/caldav/client';
import { FieldStack } from '@/components/fields/field-stack';
import { TextField } from '@/components/fields/text-field';
import { LockIcon, ServerIcon, UserIcon } from '@/components/icons';
import {
  SettingsOutcomeLine,
  type SettingsOutcome,
} from '@/components/settings/settings-parts';
import {
  classifyConnectError,
  connectFailureMessage,
  normalizeDavUrl,
} from '@/config/dav-config';
import {
  getLastDavConfig,
  saveDavConfig,
  useDavConfig,
} from '@/config/dav-store';
import { Spacing } from '@/constants/theme';

/**
 * State and actions for the CalDAV connection form on the web's first-run
 * setup screen (Android has no login form since v0.5: it uses the phone's
 * calendars). Split into this hook and the fields (ConnectionFields), with
 * the screen's own Connect button.
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
}: {
  form: ServerFormState;
  onFieldFocus?: () => void;
  onFieldBlur?: () => void;
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
    </View>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: Spacing.three - Spacing.one,
  },
});
