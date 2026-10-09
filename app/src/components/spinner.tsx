import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { CircleDashedIcon } from '@/components/icons';

/** One revolution. Slow on purpose: this only says "working". */
const SPIN_MS = 2000;

/**
 * The app's busy indicator inside a control: Tabler's dashed circle, turning
 * for as long as it is mounted. Not the refresh arrow — that one means "fetch
 * again". Loading a screen's content uses LoadingBar instead.
 */
export function Spinner({
  color,
  size = 18,
}: {
  color: string;
  size?: number;
}) {
  const angle = useSharedValue(0);
  useEffect(() => {
    angle.value = withRepeat(
      withTiming(360, { duration: SPIN_MS, easing: Easing.linear }),
      -1
    );
  }, [angle]);
  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${angle.value}deg` }],
  }));
  return (
    <Animated.View style={spin}>
      <CircleDashedIcon size={size} color={color} />
    </Animated.View>
  );
}
