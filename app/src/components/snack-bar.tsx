import { type ComponentType } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { TrashIcon, type IconProps } from '@/components/icons';
import { CardFrame, DashedLine } from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { AccentColor, Colors, DangerColor, Spacing } from '@/constants/theme';

/** How long a message stays: long enough that Undo is still there once the
 *  grid has visibly changed and the mistake sinks in. */
export const SNACK_MS = 8_000;

/** The toast's fade in and out: long enough to read as easing, short
 *  enough that a tap on Undo never waits on it. */
const SNACK_FADE_MS = 150;

/**
 * The toast, as the settings card: the accent edge and dotted top, what
 * happened (a glyph, then a sentence), and when there is something to do
 * about it, a ruled cell for that beside it.
 */
export function SnackBar({
  icon: Icon,
  message,
  action,
  urgent = false,
  testID,
}: {
  icon: ComponentType<IconProps>;
  message: string;
  action?: { label: string; onPress: () => void };
  /** A problem that stops the calendar (the connection banner): read out at
   *  once, over whatever a screen reader was saying. */
  urgent?: boolean;
  testID?: string;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(SNACK_FADE_MS)}
      exiting={FadeOut.duration(SNACK_FADE_MS)}
      style={styles.snack}
      // Read out as it appears, Undo included: a screen reader user would
      // otherwise never learn the toast, or its eight seconds, were there.
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
      testID={testID}
    >
      <CardFrame style={styles.snackCard}>
        <View style={styles.snackRow}>
          <View style={styles.snackBody}>
            <View style={styles.snackIcon}>
              <Icon
                size={18}
                color={Icon === TrashIcon ? DangerColor : AccentColor}
              />
            </View>
            <ThemedText type="small" style={styles.snackText} numberOfLines={2}>
              {message}
            </ThemedText>
          </View>
          {action && (
            <>
              <View style={styles.snackRule}>
                <View style={StyleSheet.absoluteFill}>
                  <DashedLine vertical />
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                style={styles.snackAction}
                onPress={action.onPress}
              >
                <ThemedText type="smallBold" style={styles.snackActionText}>
                  {action.label}
                </ThemedText>
              </Pressable>
            </>
          )}
        </View>
      </CardFrame>
    </Animated.View>
  );
}

/** Where a screen puts its bar: across the bottom, the bar at the right
 *  (add the bottom inset). */
export const SNACK_SPOT = StyleSheet.create({
  spot: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Bottom right, clear of the thumb's reach for the grid's middle.
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
    pointerEvents: 'box-none',
  },
}).spot;

const styles = StyleSheet.create({
  // Never wider than the screen: sized to its text, a long message ran off
  // both edges of a phone (480 is wider than one).
  snack: {
    maxWidth: 480,
    width: '100%',
    alignItems: 'flex-end',
  },
  // The card's own ground in both schemes: the toast keeps the dark palette.
  // No shadow: the card frame's own is switched off (it floats over the grid,
  // which is edge enough).
  snackCard: {
    backgroundColor: Colors.dark.background,
    boxShadow: '0px 0px 0px rgba(0, 0, 0, 0)',
  },
  snackRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  snackBody: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three - Spacing.one,
    paddingHorizontal: Spacing.three - Spacing.one,
  },
  // Its own size, whatever the message: a long one wraps beside it and must
  // not squeeze the glyph.
  snackIcon: {
    width: 18,
    height: 18,
    flexShrink: 0,
  },
  snackText: {
    color: Colors.dark.text,
    flexShrink: 1,
  },
  snackRule: {
    width: 1,
  },
  snackAction: {
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  snackActionText: {
    color: AccentColor,
  },
});
