import { useState, type ComponentType } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { TextField } from '@/components/fields/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocationSearch } from '@/hooks/use-location-search';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  value: string;
  onChange: (next: string) => void;
  TextInputComponent?: ComponentType<TextInputProps>;
  onFocus?: () => void;
  testID?: string;
};

/**
 * Location input with Photon search-as-you-type. Suggestions render inline
 * under the field (works in both shells); picking one fills the text. When
 * Photon is unreachable this is exactly a plain text field.
 */
export function LocationField({
  value,
  onChange,
  TextInputComponent = TextInput,
  onFocus,
  testID,
}: Props) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  // The prefilled value counts as picked — no queries until the user types.
  const [picked, setPicked] = useState<string | null>(value || null);
  const suggestions = useLocationSearch(value, focused && value !== picked);

  return (
    <View style={styles.column}>
      <TextField
        TextInputComponent={TextInputComponent}
        value={value}
        onChangeText={(next) => {
          setPicked(null);
          onChange(next);
        }}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => setFocused(false)}
        placeholder="Location"
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        testID={testID}
      />
      {suggestions.length > 0 && (
        <View
          style={styles.list}
          testID={testID ? `${testID}-suggestions` : undefined}
        >
          {suggestions.map((label) => (
            <Pressable
              key={label}
              style={({ pressed }) => [
                styles.item,
                {
                  backgroundColor: pressed
                    ? theme.backgroundSelected
                    : theme.backgroundElement,
                },
              ]}
              // onPressIn beats the input's blur — a tap can't lose the race
              // against the suggestion list unmounting.
              onPressIn={() => {
                setPicked(label);
                onChange(label);
              }}
            >
              <ThemedText type="small" numberOfLines={2}>
                {label}
              </ThemedText>
            </Pressable>
          ))}
          <ThemedText type="code" themeColor="textSecondary">
            Search by Photon · data © OpenStreetMap contributors
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.one,
  },
  item: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.one,
  },
});
