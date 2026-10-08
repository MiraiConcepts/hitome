import { useCallback, useSyncExternalStore } from 'react';
import {
  Platform,
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
import { scaled } from '@/components/calendar/grid-scale';

/**
 * An event carries the same two gestures as the day cell beneath it, so
 * nothing the cell offers is lost by covering a strip of it: tap opens (the
 * event, or the day's list when the cell overflows), hold creates on the day
 * under the finger. The week row decides all of that — it knows the column and
 * the overflow count — so the handlers here are opaque pass-throughs. A press
 * lights the event itself (what a tap opens); the press-in/out pair drives the
 * cell's ink, which the row starts only once the press is turning into a hold
 * (what creates on that day).
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
  const title = event.summary || '(untitled)';
  const dimmed = hoveredOccurrence.useDimmed(event.id);
  return (
    <Pressable
      {...press}
      onHoverIn={() => hoveredOccurrence.set(event.id)}
      onHoverOut={() => {
        if (hoveredOccurrence.get() === event.id) hoveredOccurrence.set(null);
      }}
      accessibilityRole="button"
      accessibilityLabel={event.summary}
      style={({ pressed }: { pressed: boolean }) => [
        styles.chip,
        style,
        FOCUS_MOTION,
        dimmed && styles.unfocused,
        pressed && styles.chipPressed,
      ]}
      testID={`chip-${event.id}`}
    >
      {/* Accent bar tinted by the source calendar (falls back to the
          theme accent). */}
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
            {title}
          </ThemedText>
        </View>
      ) : (
        <ThemedText
          type="small"
          numberOfLines={1}
          textBreakStrategy="simple"
          style={styles.chipTitle}
        >
          {title}
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
/**
 * The occurrence under the finger, shared by every strip of it. A banner that
 * crosses a week edge is drawn once per week row, and each strip is its own
 * Pressable, so a pressed state kept per strip lit only the week touched — the
 * rest of the event stayed dark. Keyed by occurrence id, so another
 * occurrence of the same series beside it does not light up too; a selector
 * per strip means a press re-renders only that event's strips, not the grid.
 */
function sharedOccurrence() {
  let current: string | null = null;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return {
    get: () => current,
    set(id: string | null) {
      if (current === id) return;
      current = id;
      for (const listener of listeners) listener();
    },
    /** Whether this occurrence is the one; re-renders only its strips. */
    useIs(id: string): boolean {
      const get = useCallback(() => current === id, [id]);
      return useSyncExternalStore(subscribe, get, get);
    },
    /** Whether another occurrence is the one (and this one is not). */
    useDimmed(id: string): boolean {
      const get = useCallback(() => current !== null && current !== id, [id]);
      return useSyncExternalStore(subscribe, get, get);
    },
  };
}

const pressedOccurrence = sharedOccurrence();
/** The occurrence under the mouse (web), shared the same way. Hovering an
 *  event brings it into focus: every other event dims, and every strip of a
 *  multi-day one stays lit, in every week it crosses. */
const hoveredOccurrence = sharedOccurrence();

export function EventBanner({
  placement,
  titleLines,
  style,
  ...press
}: BannerProps) {
  const { event, continuesRight } = placement;
  // Fill by source calendar; title contrasts against whatever that fill is.
  const fill = event.color ?? AccentColor;
  const pressed = pressedOccurrence.useIs(event.id);
  const dimmed = hoveredOccurrence.useDimmed(event.id);
  const { onPressIn, onPressOut } = press;
  return (
    <Pressable
      {...press}
      onPressIn={(e) => {
        pressedOccurrence.set(event.id);
        onPressIn(e);
      }}
      onPressOut={() => {
        if (pressedOccurrence.get() === event.id) pressedOccurrence.set(null);
        onPressOut();
      }}
      onHoverIn={() => hoveredOccurrence.set(event.id)}
      onHoverOut={() => {
        if (hoveredOccurrence.get() === event.id) hoveredOccurrence.set(null);
      }}
      accessibilityRole="button"
      accessibilityLabel={event.summary}
      style={[
        styles.banner,
        { backgroundColor: fill },
        continuesRight && styles.bannerContinuesRight,
        style,
        FOCUS_MOTION,
        dimmed && styles.unfocused,
        pressed && styles.pressed,
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
export const EVENT_FONT_SIZE = scaled(11);
export const EVENT_LINE_HEIGHT = scaled(14);
/**
 * Optical centring, not layout. Satoshi's ascent (1.026em) leaves far more
 * room above the caps than its descent (0.224em) leaves below the baseline, so
 * ink centred in its line box reads as sitting low — beside a strip's hard
 * horizontal edges, unmistakably so. Half the difference, shifted down for the
 * bar (which moves) and up for the banner's text (which is what moves there).
 * The widget's marker glyphs carry the same correction for the same reason.
 */
const EVENT_INK_NUDGE = 0.5;

/** A chip's geometry: the bar stands off the cell's left edge by PAD_LEFT,
 *  is BAR wide and GAP from the title, which stops PAD_RIGHT short of the
 *  cell's right. */
const CHIP_PAD_LEFT = 4;
const CHIP_PAD_RIGHT = 3;
const CHIP_BAR = 3;
const CHIP_GAP = 3;

/** The other events' strength while one is hovered (web only: nothing
 *  hovers on a phone), and how fast they dim and return. */
const UNFOCUSED = 0.4;
const FOCUS_MOTION =
  Platform.OS === 'web'
    ? ({
        transitionProperty: 'opacity',
        transitionDuration: '120ms',
        transitionTimingFunction: 'ease-out',
      } as object)
    : null;

const styles = StyleSheet.create({
  // A press on a timed event: a lighter dim than a banner's, as before.
  chipPressed: {
    opacity: 0.8,
  },
  // Every event but the hovered one, while one is.
  unfocused: {
    opacity: UNFOCUSED,
  },
  // A banner's fill is the event's whole face, so a press dims it further
  // than a hover: it has to read under a thumb.
  pressed: {
    opacity: 0.6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: CHIP_GAP,
    // The bar is not flush with the cell edge: it stands off it by 4, so a
    // column of chips reads as a column rather than as a second grid rule.
    paddingLeft: CHIP_PAD_LEFT,
    paddingRight: CHIP_PAD_RIGHT,
  },
  chipBar: {
    width: CHIP_BAR,
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
