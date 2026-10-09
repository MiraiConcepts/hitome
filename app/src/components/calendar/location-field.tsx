import { useState, type ComponentType } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { TextField } from '@/components/fields/text-field';
import { CardFrame, DashedLine } from '@/components/settings/settings-parts';
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
        // The caption above names the group; the input needs its own name,
        // or a screen reader hears only the placeholder.
        accessibilityLabel="Location"
        placeholder="Add a place"
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        testID={testID}
      />
      {suggestions.length > 0 && (
        <CardFrame
          style={{ backgroundColor: theme.background }}
          testID={testID ? `${testID}-suggestions` : undefined}
        >
          {suggestions.map((label, index) => (
            <View key={label}>
              {index > 0 && <DashedLine />}
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.item,
                  pressed && { backgroundColor: theme.backgroundSelected },
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
            </View>
          ))}
          <DashedLine />
          <ThemedText
            type="code"
            themeColor="textSecondary"
            style={styles.credit}
          >
            Search by Photon · data © OpenStreetMap contributors
          </ThemedText>
        </CardFrame>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: Spacing.two,
  },
  item: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  credit: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
