import { useState } from 'react';

import { probeConnection } from '@/caldav/client';
import { FieldRow } from '@/components/fields/field-row';
import { TextField } from '@/components/fields/text-field';
import {
  SettingsButton,
  SettingsButtonRow,
  SettingsNote,
  SettingsProblem,
} from '@/components/settings/settings-parts';
import {
  classifyConnectError,
  connectFailureMessage,
  normalizeDavUrl,
} from '@/config/dav-config';
import {
  clearDavConfig,
  saveDavConfig,
  useDavConfig,
} from '@/config/dav-store';

type Props = {
  /** Called after a successful save — the setup screen uses it to get out of
   *  the way; settings uses it to say so. */
  onSaved?: () => void;
  /** Offered in settings, not during first-run setup (nothing to disconnect). */
  allowDisconnect?: boolean;
  saveLabel?: string;
};

/**
 * Address + login for a CalDAV server, shared by the first-run setup screen and
 * the Server section of settings.
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
export function ServerForm({
  onSaved,
  allowDisconnect = false,
  saveLabel = 'Connect',
}: Props) {
  const config = useDavConfig();
  const [url, setUrl] = useState(
    // A build-time URL is a convenience for the dev loop, never a configuration:
    // it prefills the field and nothing more.
    config?.url ?? process.env.EXPO_PUBLIC_DAV_URL ?? ''
  );
  const [username, setUsername] = useState(config?.username ?? '');
  const [password, setPassword] = useState(config?.password ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const normalized = normalizeDavUrl(url);
    if (!normalized) {
      setProblem('That does not look like a server address.');
      return;
    }
    const candidate = {
      url: normalized,
      username: username.trim(),
      password,
    };
    setBusy(true);
    setProblem(null);
    setNote(null);
    try {
      const calendars = await probeConnection(candidate);
      await saveDavConfig(candidate);
      // Show the normalized form — the trailing slash and scheme it gained are
      // what will actually be used.
      setUrl(candidate.url);
      setNote(
        `Connected — ${calendars.length} calendar${calendars.length === 1 ? '' : 's'} found.`
      );
      onSaved?.();
    } catch (err) {
      setProblem(
        connectFailureMessage(
          classifyConnectError(err),
          err instanceof Error ? err.message : 'Could not connect'
        )
      );
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setProblem(null);
    setNote(null);
    try {
      await clearDavConfig();
      setUrl('');
      setUsername('');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <FieldRow label="Server">
        <TextField
          value={url}
          onChangeText={setUrl}
          placeholder="https://your-server/dav/"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          inputMode="url"
          editable={!busy}
          testID="settings-url"
        />
      </FieldRow>
      <FieldRow label="User">
        <TextField
          value={username}
          onChangeText={setUsername}
          placeholder="Optional"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          testID="settings-username"
        />
      </FieldRow>
      <FieldRow label="Password">
        <TextField
          value={password}
          onChangeText={setPassword}
          placeholder="Optional"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          editable={!busy}
          testID="settings-password"
        />
      </FieldRow>
      <SettingsNote>
        Your Radicale login. Leave both blank if a proxy in front of the server
        already supplies it.
      </SettingsNote>

      {problem && (
        <SettingsProblem testID="settings-problem">{problem}</SettingsProblem>
      )}
      {note && <SettingsNote>{note}</SettingsNote>}

      <SettingsButtonRow>
        <SettingsButton
          label={busy ? 'Connecting…' : saveLabel}
          variant="filled"
          disabled={busy}
          onPress={save}
          testID="settings-save"
        />
        {allowDisconnect && config && (
          <SettingsButton
            label="Disconnect"
            variant="danger"
            disabled={busy}
            onPress={disconnect}
            testID="settings-disconnect"
          />
        )}
      </SettingsButtonRow>
    </>
  );
}
