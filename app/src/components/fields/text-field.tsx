import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentType,
  type Ref,
} from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  type TextInputProps,
} from 'react-native';

import { AccentColor, FontFamilyMedium } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { FieldChrome } from './field-chrome';

type Props = TextInputProps & {
  ref?: Ref<TextInput>;
  /** Sheet shell passes BottomSheetTextInput for keyboard-aware inputs. */
  TextInputComponent?: ComponentType<TextInputProps & { ref?: Ref<TextInput> }>;
};

/**
 * On a phone the field keeps its own text: a controlled input (`value` set on
 * every keystroke) has the app send the whole text back to the native field
 * after each letter, and when the app is busy for a moment one of those
 * arrives after the next letter was typed and overwrites it. Typing "eda"
 * came out "ade", or a letter went missing and another doubled. The browser
 * keeps the order itself, so the web stays controlled.
 */
const KEEPS_OWN_TEXT = Platform.OS !== 'web';

/**
 * The editor's text input: FieldChrome geometry, outlined in the raised
 * surface color, the placeholder shade for hints, and an accent
 * outline while focused so the field being typed into is unmistakable with
 * the keyboard up. The border exists at rest, so focus never moves layout.
 *
 * Use it like a controlled input: `value` and `onChangeText`. On a phone the
 * value only reaches the field when it differs from what the field last
 * reported (a picked suggestion, a count put back in range).
 */
export function TextField({
  TextInputComponent = TextInput,
  style,
  onFocus,
  onBlur,
  ref,
  value,
  onChangeText,
  ...rest
}: Props) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  useImperativeHandle(ref, () => input.current as TextInput);

  // What the field holds as far as the app knows: the text it last reported,
  // or the value last pushed into it.
  const shown = useRef(value);
  useEffect(() => {
    if (!KEEPS_OWN_TEXT || value === undefined || value === shown.current)
      return;
    shown.current = value;
    input.current?.setNativeProps({ text: value });
  }, [value]);

  return (
    <TextInputComponent
      placeholderTextColor={theme.placeholder}
      cursorColor={AccentColor}
      selectionColor={AccentColor}
      {...rest}
      ref={input}
      {...(KEEPS_OWN_TEXT ? { defaultValue: value } : { value })}
      onChangeText={(text) => {
        shown.current = text;
        onChangeText?.(text);
      }}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.input,
        {
          color: theme.text,
          borderColor: focused ? AccentColor : theme.backgroundSelected,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    ...FieldChrome,
    fontFamily: FontFamilyMedium,
    backgroundColor: 'transparent',
    // The browser's own focus ring would double the accent border.
    outlineWidth: 0,
  },
});
