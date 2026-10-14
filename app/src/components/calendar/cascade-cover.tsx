import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/** One tile per day of a six-week month. */
const COLS = 7;
const ROWS = 6;
/** How far behind its neighbour each tile clears, and how long it takes. */
const STAGGER_MS = 18;
const FADE_MS = 200;
const LAST_DELAY_MS = (COLS - 1 + ROWS - 1) * STAGGER_MS;
/** When the last tile has cleared (two frames' grace included). */
export const CASCADE_DONE_MS = LAST_DELAY_MS + FADE_MS + 40;

/**
 * Discover mode's change of calendar. The screen changes the grid in the
 * same frame as the tap, under this sheet of tiles in the grid's own ground;
 * the tiles then clear one by one, from the top right (the telescope button's
 * corner) to the bottom left, so the other side shows through day by day.
 *
 * Only opacity moves, the cheapest thing to animate: turning slices of a
 * picture of the grid in 3D stuttered on a phone, and the picture was either
 * blurry or slow to take.
 *
 * Mounted for one run (keyed by the screen), and only while it runs. With
 * reduced motion it draws nothing.
 */
export function CascadeCover({
  width,
  height,
  color,
}: {
  width: number;
  height: number;
  /** The grid's ground. */
  color: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  const tileW = width / COLS;
  const tileH = height / ROWS;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: ROWS * COLS }, (_, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        return (
          <Tile
            key={i}
            delay={(COLS - 1 - col + row) * STAGGER_MS}
            color={color}
            box={{
              left: col * tileW,
              top: row * tileH,
              // A pixel over, so no hairline of the grid shows between tiles.
              width: Math.ceil(tileW) + 1,
              height: Math.ceil(tileH) + 1,
            }}
          />
        );
      })}
    </View>
  );
}

function Tile({
  delay,
  color,
  box,
}: {
  delay: number;
  color: string;
  box: { left: number; top: number; width: number; height: number };
}) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    // Two frames' grace: the grid underneath has just changed, and that
    // redraw is the heaviest frame of the run; clearing starts after it.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        opacity.value = withDelay(
          delay,
          withTiming(0, { duration: FADE_MS, easing: Easing.out(Easing.quad) })
        );
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [opacity, delay]);
  const fading = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[styles.tile, box, { backgroundColor: color }, fading]}
    />
  );
}

const styles = StyleSheet.create({
  tile: {
    position: 'absolute',
  },
});
