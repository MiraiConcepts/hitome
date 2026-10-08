import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { FieldStack } from '@/components/fields/field-stack';
import { TextField } from '@/components/fields/text-field';
import { LockIcon, UserIcon } from '@/components/icons';
import {
  SettingsMessage,
  SettingsOutcomeLine,
  type SettingsOutcome,
} from '@/components/settings/settings-parts';
import { logIn, loginFailureMessage, useSession } from '@/config/session';
import { Spacing } from '@/constants/theme';

/**
 * State and action for the web's login screen. The username and password go
 * to hitome's own server (app/server), which checks them with the calendar
 * server and keeps them there; the browser is handed a cookie it cannot read.
 * The calendar's address is not asked for: whoever runs this copy set it.
 */
export function useLoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [outcome, setOutcome] = useState<SettingsOutcome>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await logIn(username.trim(), password);
      const message = loginFailureMessage(result);
      // On success the screen fades out over the calendar; nothing to say.
      setOutcome(message ? { tone: 'problem', text: message } : null);
      if (!result.ok) setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return {
    username,
    setUsername,
    password,
    setPassword,
    outcome,
    busy,
    submit,
  };
}

export type LoginFormState = ReturnType<typeof useLoginForm>;

/**
 * Username and password, captions above with their glyphs, and under them
 * why the screen is up (when it was not the person's choice) or how the last
 * try went. No buttons and no surface of its own: the screen decides both.
 * No placeholder hints: the captions already say what goes where.
 */
export function LoginFields({ form }: { form: LoginFormState }) {
  const { notice } = useSession();
  const passwordRef = useRef<TextInput>(null);
  const common: TextInputProps = {
    autoCapitalize: 'none',
    autoCorrect: false,
    editable: !form.busy,
  };
  return (
    <View style={styles.fields}>
      <FieldStack label="Username" icon={UserIcon}>
        <TextField
          {...common}
          value={form.username}
          onChangeText={form.setUsername}
          autoComplete="username"
          accessibilityLabel="Username"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
          testID="login-username"
        />
      </FieldStack>
      <FieldStack label="Password" icon={LockIcon}>
        <TextField
          {...common}
          ref={passwordRef}
          value={form.password}
          onChangeText={form.setPassword}
          secureTextEntry
          autoComplete="current-password"
          accessibilityLabel="Password"
          returnKeyType="go"
          onSubmitEditing={form.submit}
          testID="login-password"
        />
      </FieldStack>
      {/* Under the fields, where a wrong password is reported too: why the
          screen is up when it was not the person's choice, until they try. */}
      {notice && !form.outcome && (
        <SettingsMessage tone="problem" testID="login-notice">
          {notice}
        </SettingsMessage>
      )}
      <SettingsOutcomeLine outcome={form.outcome} testID="login-problem" />
    </View>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: Spacing.three - Spacing.one,
  },
});
