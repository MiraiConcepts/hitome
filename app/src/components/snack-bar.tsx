import { type ComponentType } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { TrashIcon, type IconProps } from '@/components/icons';
import { Card, DashedLine } from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { Motion } from '@/constants/motion';
import { AccentColor, Colors, DangerColor, Spacing } from '@/constants/theme';

/** How long a message with Undo stays: long enough that Undo is still there
 *  once the grid has visibly changed and the mistake sinks in. */
export const SNACK_MS = 8_000;

/** How long a message with nothing to do about it stays ("Event copied"):
 *  read and gone. */
export const SNACK_PLAIN_MS = 4_000;

/** How long a message stays, by whether it carries an action. */
export const snackMs = (hasAction: boolean) =>
  hasAction ? SNACK_MS : SNACK_PLAIN_MS;

/** The toast's fade in and out: long enough to read as easing, short
 *  enough that a tap on Undo never waits on it. */
const SNACK_FADE_MS = Motion.normal;

/** The toast's ground, in both schemes: a step lighter than the dark
 *  screen, so it stands off the grid it floats over (it was the screen's
 *  own dark, and hard to tell apart from it). */
const SNACK_GROUND = Colors.dark.backgroundSelected;

/**
 * The toast: a plain bar with the settings card's dotted top, what happened
 * (a glyph, then a sentence), and when there is something to do about it, a
 * ruled cell for that beside it: an icon when the action has one (Undo),
 * else its word.
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
  /** `icon` stands in for the word, which a screen reader still hears. */
  action?: {
    label: string;
    onPress: () => void;
    icon?: ComponentType<IconProps>;
  };
  /** A problem that stops the calendar (the connection banner): read out at
   *  once, over whatever a screen reader was saying. */
  urgent?: boolean;
  testID?: string;
}) {
  const ActionIcon = action?.icon;
  return (
    <Animated.View
      entering={FadeIn.duration(SNACK_FADE_MS)}
      exiting={FadeOut.duration(SNACK_FADE_MS)}
      style={styles.snack}
      // Read out as it appears, Undo included: a screen reader user would
      // otherwise never learn the toast, or its seconds, were there.
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
      testID={testID}
    >
      <View style={styles.snackCard}>
        <View style={styles.snackTop} pointerEvents="none">
          <DashedLine weight={Card.dotted} dash={Card.dot} strong />
        </View>
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
                accessibilityLabel={action.label}
                style={[
                  styles.snackAction,
                  ActionIcon && styles.snackIconAction,
                ]}
                onPress={action.onPress}
              >
                {ActionIcon ? (
                  <ActionIcon size={22} color={AccentColor} />
                ) : (
                  <ThemedText type="smallBold" style={styles.snackActionText}>
                    {action.label}
                  </ThemedText>
                )}
              </Pressable>
            </>
          )}
        </View>
      </View>
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
  // No shadow: it floats over the grid, and its lighter ground is edge
  // enough.
  snackCard: {
    position: 'relative',
    paddingTop: Card.dotted,
    backgroundColor: SNACK_GROUND,
  },
  snackTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
  // A thumb-sized cell for the icon alone.
  snackIconAction: {
    minWidth: 48,
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  snackActionText: {
    color: AccentColor,
  },
});
