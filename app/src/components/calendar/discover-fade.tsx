import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { RULE_WIDTH } from '@/components/calendar/grid-scale';
import { AccentColor } from '@/constants/theme';

/**
 * Discover mode's change of colour, in one place: the header bar, the
 * weekday row under it and today's cell all fade by it, in step.
 */

/** How long the bar takes to fade into discover mode's colours and back. */
export const DISCOVER_FADE_MS = 260;

/**
 * Discover mode's colours, faded in: `ground` for an orange layer laid under
 * a bar's content (its opacity runs 0 to 1), and `inkOn` for the bar's ink,
 * which turns black halfway, once the ground is orange enough to carry it.
 * The month header and the weekday row under it each use one, in step.
 */
export function useDiscoverFade(open: boolean) {
  const fade = useSharedValue(open ? 1 : 0);
  const [inkOn, setInkOn] = useState(open);
  useEffect(() => {
    fade.value = withTiming(open ? 1 : 0, {
      duration: DISCOVER_FADE_MS,
      easing: Easing.inOut(Easing.quad),
    });
    const ink = setTimeout(() => setInkOn(open), DISCOVER_FADE_MS / 2);
    return () => clearTimeout(ink);
  }, [open, fade]);
  const ground = useAnimatedStyle(() => ({ opacity: fade.value }));
  return { ground, inkOn };
}

/** The orange layer `useDiscoverFade` fades, under a bar's content. */
export function DiscoverGround({
  style,
  seam = false,
}: {
  style: ReturnType<typeof useDiscoverFade>['ground'];
  /** A strip a rule thick just below the bar instead, over the rule that
   *  sits there. */
  seam?: boolean;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        seam ? styles.discoverSeam : StyleSheet.absoluteFill,
        styles.discoverGround,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  discoverGround: {
    backgroundColor: AccentColor,
  },
  discoverSeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -RULE_WIDTH,
    height: RULE_WIDTH,
  },
});
