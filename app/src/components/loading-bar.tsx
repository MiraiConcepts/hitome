import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AccentColor } from '@/constants/theme';

/** One sweep of the segment across the bar. */
const SWEEP_MS = 1100;
/** Fade in and out, so a fetch that lands quickly does not flash. */
const FADE_MS = 160;
/** The moving segment, as a share of the bar's width. */
const SEGMENT = 0.35;
const LOADING_BAR_HEIGHT = 3;

/**
 * An indeterminate progress bar: an accent segment sweeping left to right
 * along the top edge of whatever it is placed in. The app's indicator for
 * loading a screen's content — a button's own action shows a spinner inside
 * the button instead (SettingsButton's `busy`).
 *
 * Absolutely positioned and pointer-transparent, so showing and hiding it
 * never moves anything.
 */
export function LoadingBar({ visible }: { visible: boolean }) {
  const [width, setWidth] = useState(0);
  const sweep = useSharedValue(0);
  const opacity = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: FADE_MS });
    if (visible) {
      sweep.value = 0;
      sweep.value = withRepeat(
        withTiming(1, {
          duration: SWEEP_MS,
          easing: Easing.inOut(Easing.quad),
        }),
        -1
      );
    } else {
      // Let the fade finish before the segment stops, so it never freezes
      // mid-bar while still visible.
      const stop = setTimeout(() => cancelAnimation(sweep), FADE_MS);
      return () => clearTimeout(stop);
    }
  }, [visible, sweep, opacity]);

  const bar = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const segment = useAnimatedStyle(() => ({
    // From fully off the left edge to fully off the right one.
    transform: [
      {
        translateX: -width * SEGMENT + sweep.value * width * (1 + SEGMENT),
      },
    ],
  }));

  return (
    <Animated.View
      style={[styles.bar, bar]}
      pointerEvents="none"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading the calendar"
      accessibilityState={{ busy: visible }}
      accessibilityElementsHidden={!visible}
    >
      <View style={styles.clip}>
        <Animated.View
          style={[styles.segment, { width: width * SEGMENT }, segment]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: LOADING_BAR_HEIGHT,
  },
  clip: {
    flex: 1,
    overflow: 'hidden',
  },
  segment: {
    height: LOADING_BAR_HEIGHT,
    backgroundColor: AccentColor,
  },
});
