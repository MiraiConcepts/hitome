import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useDiscoverFade } from '@/components/calendar/discover-fade';
import { AccentColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mixHex } from '@/utils/color';

/** Today's colour on the grid. */
export const TODAY_COLOR = '#0060E0';
/** How far today's fill leans from its colour toward the ground: enough
 *  colour to find the day at once, little enough that its events, drawn
 *  over it, read as any other day's. */
const FILL_TO_GROUND = 0.72;

/**
 * Today's mark: its whole cell filled with a deep wash of blue, fading to
 * orange for discover mode (whose events are often blue) in step with the
 * header (useDiscoverFade). Tried before: an outline, a bar across the top
 * (read as part of the grid's lines), a filled square behind the date (too
 * heavy) and a sun at the end of the date's line (too easy to miss). Placed
 * by the week row, behind the cell, as a neighbouring month's shading is.
 */
export function TodayMark({
  discover,
  style,
}: {
  discover: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const ground = useTheme().background;
  const { ground: orangeFade } = useDiscoverFade(discover);
  return (
    <View
      pointerEvents="none"
      style={[
        style,
        { backgroundColor: mixHex(TODAY_COLOR, ground, FILL_TO_GROUND) },
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: mixHex(AccentColor, ground, FILL_TO_GROUND) },
          orangeFade,
        ]}
      />
    </View>
  );
}
