import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { StyleSheet, View } from 'react-native';

import type { CalEvent } from '@/caldav/types';
import {
  EVENT_FONT_SIZE,
  EVENT_LINE_HEIGHT,
} from '@/components/calendar/event-chip';
import { ChipRow } from '@/components/fields/chip-row';
import { RepeatIcon } from '@/components/icons';
import {
  SettingsButton,
  SettingsMessage,
} from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import type { EditScope } from '@/data/events';
import { AccentColor, FontFamilyMedium, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { calendarTint } from '@/utils/calendar-tint';
import { readableTextColor } from '@/utils/color';
import { formatTime } from '@/utils/date';

/**
 * Dragging an event to another day on the web month grid (chosen
 * 2026-11-06, "lift and outline"): past a few pixels of movement the event
 * lifts, a faded copy staying on its own day while another follows the
 * mouse, and the day under the mouse is framed in amber. Letting go there
 * moves it, keeping its time of day and its length; letting go on its own
 * day, off the grid, or after Escape does nothing. A repeating one asks
 * which of its dates first, in a small card where it was dropped.
 *
 * Mouse and pen only. A finger on the web scrolls the grid, and a phone's
 * taps and holds (Settings › Gestures) are left exactly as they were.
 */

/** Movement before a press becomes a drag: a click that wobbles a pixel or
 *  two still opens the event. */
const DRAG_THRESHOLD_PX = 4;

/** The event being dragged, where from, and the day under the mouse. */
export type DragState = {
  event: CalEvent;
  fromDay: string;
  over: { week: string; day: string } | null;
} | null;

/** What a strip hands over as a press starts on it. */
export type DragStart = (
  /** The strip's pointerdown (react-native-web hands over the DOM's). */
  e: { nativeEvent: unknown; currentTarget: unknown },
  event: CalEvent,
  fromDay: string,
  kind: 'chip' | 'banner'
) => void;

/** Set from the moment a drag ends until the click that follows it has been
 *  swallowed: a hold that armed before the mouse moved creates nothing on
 *  release (see week-row's holdOn). */
let ending = false;
export function dragJustEnded(): boolean {
  return ending;
}

/** The floating copy: where the mouse is, and how the strip was held. */
type Lift = {
  event: CalEvent;
  kind: 'chip' | 'banner';
  /** Mouse position, in the page. */
  x: number;
  y: number;
  /** Where in the strip it was taken hold of, and the strip's size. */
  grabX: number;
  grabY: number;
  width: number;
  height: number;
};

function liftStore() {
  let current: Lift | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next: Lift | null) {
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

type Options = {
  /** Off: no strip can be taken hold of (native, or no handler). */
  enabled: boolean;
  /** Which events may move: not a discover calendar's, not a read-only
   *  calendar's. */
  canDrag: (event: CalEvent) => boolean;
  /** The day under a point in the page, or null off the grid. */
  locate: (x: number, y: number) => { week: string; day: string } | null;
  /** Let go on another day. The drag's marks stay until this settles, so
   *  the event does not jump back while it is being saved. */
  onDrop: (
    event: CalEvent,
    fromDay: string,
    toDay: string,
    at: { x: number; y: number }
  ) => Promise<void>;
};

export function useEventDrag({ enabled, canDrag, locate, onDrop }: Options) {
  const [state, setState] = useState<DragState>(null);
  const [lift] = useState(liftStore);
  const latest = useRef({ canDrag, locate, onDrop });
  useEffect(() => {
    latest.current = { canDrag, locate, onDrop };
  });
  /** Takes down the listeners of a drag still under way. */
  const teardown = useRef<(() => void) | null>(null);
  useEffect(() => () => teardown.current?.(), []);

  const begin = useCallback<DragStart>(
    ({ nativeEvent, currentTarget }, event, fromDay, kind) => {
      const e = nativeEvent as PointerEvent;
      if (!enabled || e.button !== 0 || e.pointerType === 'touch') return;
      if (!latest.current.canDrag(event)) return;
      const node = currentTarget as HTMLElement | null;
      if (!node || typeof node.getBoundingClientRect !== 'function') return;
      teardown.current?.();
      const box = node.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      let started = false;
      let cancelled = false;
      let over: { week: string; day: string } | null = null;
      const body = document.body.style;
      const before = { userSelect: body.userSelect, cursor: body.cursor };

      const clearLook = () => {
        body.userSelect = before.userSelect;
        body.cursor = before.cursor;
        lift.set(null);
      };
      const stop = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey, true);
        teardown.current = null;
      };

      function onMove(m: PointerEvent) {
        if (cancelled) return;
        if (!started) {
          if (
            Math.hypot(m.clientX - startX, m.clientY - startY) <
            DRAG_THRESHOLD_PX
          )
            return;
          started = true;
          // Ends the strip's own press (react-native-web reads a dragstart as
          // the mouse gesture called off): no hold fires, its ink clears.
          node!.dispatchEvent(new Event('dragstart', { bubbles: true }));
          window.getSelection()?.removeAllRanges();
          body.userSelect = 'none';
          body.cursor = 'grabbing';
        }
        lift.set({
          event,
          kind,
          x: m.clientX,
          y: m.clientY,
          grabX: startX - box.left,
          grabY: startY - box.top,
          width: box.width,
          height: box.height,
        });
        const next = latest.current.locate(m.clientX, m.clientY);
        if (next?.day !== over?.day) {
          over = next;
          setState({ event, fromDay, over });
        }
      }

      function onUp(u: PointerEvent) {
        stop();
        if (!started) return;
        // The click this release makes would open the event (or the day):
        // a drag is not a tap. Swallowed once, then the latch lifts.
        ending = true;
        const swallow = (c: Event) => {
          c.stopPropagation();
          c.preventDefault();
        };
        window.addEventListener('click', swallow, true);
        setTimeout(() => {
          ending = false;
          window.removeEventListener('click', swallow, true);
        }, 0);
        clearLook();
        const target = cancelled
          ? null
          : latest.current.locate(u.clientX, u.clientY);
        if (!target || target.day === fromDay) {
          setState(null);
          return;
        }
        setState({ event, fromDay, over: target });
        latest.current
          .onDrop(event, fromDay, target.day, { x: u.clientX, y: u.clientY })
          .catch(() => {})
          .finally(() => setState(null));
      }

      function onCancel() {
        stop();
        clearLook();
        setState(null);
      }

      /** Escape calls the drag off; the release that follows still counts
       *  as the drag's, so it opens nothing. */
      function onKey(k: KeyboardEvent) {
        if (k.key !== 'Escape' || !started || cancelled) return;
        k.preventDefault();
        k.stopPropagation();
        cancelled = true;
        clearLook();
        setState(null);
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey, true);
      teardown.current = () => {
        stop();
        clearLook();
      };
    },
    [enabled, lift]
  );

  return { state, begin, lift };
}

/** A border round the copy, the target day's amber. */
const COPY_BORDER = 1;

/**
 * The copy that follows the mouse: the strip as it was taken hold of, the
 * same size, framed in amber. Positioned in the page's coordinates less
 * the pane's (`origin`), and never in the way of the hit test.
 */
export function DragCopy({
  lift,
  origin,
}: {
  lift: ReturnType<typeof useEventDrag>['lift'];
  origin: () => { left: number; top: number };
}) {
  const current = useSyncExternalStore(lift.subscribe, lift.get, lift.get);
  const theme = useTheme();
  if (!current) return null;
  const { left, top } = origin();
  const tint = calendarTint(current.event.color);
  const banner = current.kind === 'banner';
  return (
    <View
      pointerEvents="none"
      testID="drag-copy"
      style={[
        styles.copy,
        {
          left: current.x - left - current.grabX,
          top: current.y - top - current.grabY,
          width: current.width,
          height: current.height,
          backgroundColor: banner ? tint : theme.background,
        },
      ]}
    >
      {!banner && <View style={[styles.copyBar, { backgroundColor: tint }]} />}
      <ThemedText
        type="small"
        numberOfLines={1}
        style={[styles.copyTitle, banner && { color: readableTextColor(tint) }]}
      >
        {banner
          ? current.event.summary || '(untitled)'
          : `${formatTime(current.event.start)} ${current.event.summary || '(untitled)'}`}
      </ThemedText>
    </View>
  );
}

/** The card's width, and how far it is held from the pane's edges. */
const ASK_WIDTH = 300;
const ASK_MARGIN = Spacing.two;

const SCOPE_OPTIONS = [
  { value: 'this', label: 'This event' },
  { value: 'following', label: 'This and following' },
  { value: 'all', label: 'All events' },
] as const;

/**
 * "Which dates?" for a repeating event dropped on another day: the editor's
 * own question and answers, in a square card where it was let go (held
 * inside the pane). Cancel or Escape leaves it where it was.
 */
export function MoveScopeAsk({
  at,
  pane,
  scopes,
  onChoose,
  onCancel,
}: {
  /** Where it was dropped, in the pane's coordinates. */
  at: { x: number; y: number };
  pane: { width: number; height: number };
  /** The answers on offer, narrowest first. */
  scopes: readonly EditScope[];
  onChoose: (scope: EditScope) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  // The narrowest reach on offer, as the editor's question starts on.
  const [scope, setScope] = useState<EditScope>(scopes[0] ?? 'this');
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const onKey = (k: KeyboardEvent) => {
      if (k.key !== 'Escape') return;
      k.preventDefault();
      k.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);
  const width = Math.min(ASK_WIDTH, pane.width - ASK_MARGIN * 2);
  const left = Math.max(
    ASK_MARGIN,
    Math.min(at.x - width / 2, pane.width - width - ASK_MARGIN)
  );
  // Under the drop point, or above it where there is no room below.
  const below = at.y + ASK_MARGIN;
  const top =
    below + height + ASK_MARGIN <= pane.height
      ? below
      : Math.max(ASK_MARGIN, at.y - height - ASK_MARGIN);
  return (
    <View
      testID="move-scope"
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      style={[
        styles.ask,
        {
          left,
          top,
          width,
          backgroundColor: theme.backgroundElement,
          borderColor: theme.rule,
          opacity: height > 0 ? 1 : 0,
        },
      ]}
    >
      <SettingsMessage icon={RepeatIcon}>
        This is a repeating event. Move:
      </SettingsMessage>
      <ChipRow
        options={SCOPE_OPTIONS.filter((o) => scopes.includes(o.value)).map(
          (o) => ({ ...o, color: AccentColor, noMark: true })
        )}
        value={scope}
        onChange={setScope}
        testID="move-scope-choice"
      />
      <View style={styles.askActions}>
        <SettingsButton
          label="Cancel"
          onPress={onCancel}
          testID="move-scope-cancel"
        />
        <SettingsButton
          label="Move"
          variant="filled"
          onPress={() => onChoose(scope)}
          testID="move-scope-confirm"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  copy: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingLeft: 4,
    paddingRight: 3,
    borderWidth: COPY_BORDER,
    borderColor: AccentColor,
    zIndex: 10,
  },
  copyBar: {
    width: 3,
    alignSelf: 'stretch',
  },
  copyTitle: {
    flex: 1,
    fontSize: EVENT_FONT_SIZE,
    lineHeight: EVENT_LINE_HEIGHT,
    fontFamily: FontFamilyMedium,
  },
  ask: {
    position: 'absolute',
    padding: Spacing.three,
    gap: Spacing.two,
    borderWidth: 1,
    zIndex: 11,
  },
  askActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.one + Spacing.half,
  },
});
