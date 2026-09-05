import { useState, type ComponentType, type Ref } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { AccentColor, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { FieldChrome } from './field-chrome';

type Props = TextInputProps & {
  ref?: Ref<TextInput>;
  /** Sheet shell passes BottomSheetTextInput for keyboard-aware inputs. */
  TextInputComponent?: ComponentType<TextInputProps & { ref?: Ref<TextInput> }>;
};

/**
 * The editor's text input: FieldChrome geometry, outlined in the raised
 * surface color, the secondary shade for placeholders, and an accent
 * outline while focused so the field being typed into is unmistakable with
 * the keyboard up. The border exists at rest, so focus never moves layout.
 */
export function TextField({
  TextInputComponent = TextInput,
  style,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <TextInputComponent
      placeholderTextColor={theme.textSecondary}
      cursorColor={AccentColor}
      selectionColor={AccentColor}
      {...rest}
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
    fontFamily: Fonts.sans,
    backgroundColor: 'transparent',
    // The browser's own focus ring would double the accent border.
    outlineWidth: 0,
  },
});
