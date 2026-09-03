import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { CalEvent } from '@/caldav/types';
import { ThemedText } from '@/components/themed-text';
import { AccentColor, Spacing } from '@/constants/theme';
import type { BannerPlacement } from '@/utils/calendar-grid';
import { readableTextColor } from '@/utils/color';

/**
 * An event carries the same two gestures as the day cell beneath it, so
 * nothing the cell offers is lost by covering a strip of it: tap opens (the
 * event, or the day's list when the cell overflows), hold creates on the day
 * under the finger. The week row decides all of that — it knows the column and
 * the overflow count — so the handlers here are opaque pass-throughs, and the
 * press-in/out pair only exists to drive the cell's ink.
 */
type PressProps = {
  onPress: (e: GestureResponderEvent) => void;
  onLongPress: (e: GestureResponderEvent) => void;
  onPressIn: (e: GestureResponderEvent) => void;
  onPressOut: () => void;
  /** Hold duration, passed down so the ink fill and the gesture stay timed
   *  to each other — see LONG_PRESS_MS in week-row. */
  delayLongPress: number;
  /** Beat a touch must stay put before it counts as a press, so a scroll that
   *  starts on an event does not light it — see PRESS_DELAY_MS in week-row. */
  unstable_pressDelay: number;
};

type ChipProps = PressProps & {
  event: CalEvent;
  /** Show the start time — only when cells are wide enough to afford it. */
  /** Title lines the layout granted this chip; >1 renders the stacked form. */
  titleLines: number;
  /** Absolute slot position, supplied by the week row. */
  style?: StyleProp<ViewStyle>;
};

/**
 * A single-day timed event inside a day cell: accent bar + content. With the
 * time shown it always stacks — time on its own line, title under it wrapping
 * to the granted lines. Without a time it's the title alone, wrapping only
 * when granted extra lines.
 */
export function EventChip({ event, titleLines, style, ...press }: ChipProps) {
  return (
    <Pressable
      {...press}
      style={[styles.chip, style]}
      testID={`chip-${event.id}`}
    >
      {/* Accent bar tinted by the source calendar (falls back to the theme accent). */}
      <View
        style={[
          styles.chipBar,
          { backgroundColor: event.color ?? AccentColor },
        ]}
      />
      {titleLines > 1 ? (
        <View style={styles.chipStack}>
          <ThemedText
            type="small"
            numberOfLines={titleLines}
            textBreakStrategy="simple"
            style={styles.chipTitleWrapped}
          >
            {event.summary || '(untitled)'}
          </ThemedText>
        </View>
      ) : (
        <ThemedText
          type="small"
          numberOfLines={1}
          textBreakStrategy="simple"
          style={styles.chipTitle}
        >
          {event.summary || '(untitled)'}
        </ThemedText>
      )}
    </Pressable>
  );
}

type BannerProps = PressProps & {
  placement: BannerPlacement<CalEvent>;
  /** Title lines the layout granted this banner (>1 when it wraps). */
  titleLines: number;
  /** Absolute slot position + horizontal extent, supplied by the week row. */
  style?: StyleProp<ViewStyle>;
};

/**
 * An all-day/multi-day event drawn as one filled bar across its covered day
 * cells — flush left, inset a hairline on the right so the end cell's border
 * stays visible. Past a week edge the event continues over, it bleeds to the
 * pane edge instead.
 */
export function EventBanner({
  placement,
  titleLines,
  style,
  ...press
}: BannerProps) {
  const { event, continuesRight } = placement;
  // Fill by source calendar; title contrasts against whatever that fill is.
  const fill = event.color ?? AccentColor;
  return (
    <Pressable
      {...press}
      style={[
        styles.banner,
        { backgroundColor: fill },
        continuesRight && styles.bannerContinuesRight,
        style,
      ]}
    >
      <ThemedText
        type="small"
        numberOfLines={titleLines}
        textBreakStrategy="simple"
        style={[styles.bannerTitle, { color: readableTextColor(fill) }]}
      >
        {event.summary || '(untitled)'}
      </ThemedText>
    </Pressable>
  );
}

/** Every event's text — chip title, wrapped title, start time, banner title.
 *  week-row's width estimate is derived from this, so the two move together. */
export const EVENT_FONT_SIZE = 11;
const EVENT_LINE_HEIGHT = 14;
/**
 * Optical centring, not layout. Satoshi's ascent (1.026em) leaves far more
 * room above the caps than its descent (0.224em) leaves below the baseline, so
 * ink centred in its line box reads as sitting low — beside a strip's hard
 * horizontal edges, unmistakably so. Half the difference, shifted down for the
 * bar (which moves) and up for the banner's text (which is what moves there).
 * The widget's marker glyphs carry the same correction for the same reason.
 */
const EVENT_INK_NUDGE = 0.5;

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    // The bar is not flush with the cell edge: it stands off it by 4, so a
    // column of chips reads as a column rather than as a second grid rule.
    paddingLeft: 4,
    paddingRight: 3,
  },
  chipBar: {
    width: 3,
    alignSelf: 'stretch',
    // Fills the chip's slot exactly, which already stands a dp proud of the
    // title at each end (see SLOT_HEIGHT in week-row) — so a timed event's
    // marker is the same height as an all-day banner beside it. The margins
    // cancel: they move the bar's centre without changing its height.
    marginTop: EVENT_INK_NUDGE,
    marginBottom: -EVENT_INK_NUDGE,
  },
  chipStack: {
    flex: 1,
  },
  // One size and line box for every kind of event text, so a timed chip, a
  // wrapped chip and an all-day banner all sit on the same baseline.
  chipTitle: {
    flex: 1,
    fontSize: EVENT_FONT_SIZE,
    lineHeight: EVENT_LINE_HEIGHT,
  },
  chipTitleWrapped: {
    fontSize: EVENT_FONT_SIZE,
    lineHeight: EVENT_LINE_HEIGHT,
  },
  banner: {
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
    // The optical nudge, mirrored: a banner centres its title, so shrinking
    // the box from the bottom is what lifts the ink.
    paddingBottom: EVENT_INK_NUDGE * 2,
    marginRight: StyleSheet.hairlineWidth,
  },
  bannerContinuesRight: {
    marginRight: 0,
  },
  bannerTitle: {
    fontSize: EVENT_FONT_SIZE,
    lineHeight: EVENT_LINE_HEIGHT,
  },
});
