import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { HEADER_GROUND } from '@/components/calendar/month-header';
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronLeftIcon,
  InfoCircleIcon,
  type IconProps,
} from '@/components/icons';
import { Spinner } from '@/components/spinner';
import { ThemedText } from '@/components/themed-text';
import {
  AccentColor,
  DangerColor,
  FontFamilyBold,
  OnAccentColor,
  Spacing,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The settings screen's furniture. Deliberately the same pieces the event
 * editor assembles by hand — square corners, captions set back in
 * the secondary shade, a problem line in DangerColor — so the two screens read
 * as one app. Buttons and sections exist here rather than inline because this
 * screen has many of both; the editor has one of each.
 */

/** Matches MonthHeader's bar: accent ink on the chrome's black ground. */
const Bar = {
  paddingHorizontal: 16,
  paddingVertical: Spacing.four,
  titleSize: 28,
  titleLineRatio: 1.3,
  iconSize: 24,
  iconPadding: 6,
} as const;

/** Buttons and the connection fields share one height, so a button never
 *  reads as an afterthought beside the fields it acts on. */
export const CONTROL_HEIGHT = 44;

/**
 * The settings card, after the tables on catallenya.com/environment: an
 * accent bar down the left edge, a dotted top edge, dashed rules between rows
 * and between the label and value columns, the section's title as the first
 * row, and a hard offset shadow. Recoloured to this app — accent orange for
 * the bar and title, the theme's greys for the rules.
 */
export const Card = {
  accentBar: 3,
  dotted: 2,
  padV: 10,
  padH: 13,
  titleSize: 17,
  /** Share of the row the label column takes. */
  labelColumn: '34%',
  /** Dash and gap lengths, in px. */
  dash: 3,
  dot: 2,
} as const;

type HeaderProps = {
  title: string;
  onBack: () => void;
};

export function SettingsHeader({ title, onBack }: HeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        hitSlop={8}
        style={styles.iconButton}
        accessibilityRole="button"
        accessibilityLabel="Back"
        testID="settings-back"
      >
        <ChevronLeftIcon size={Bar.iconSize} color={AccentColor} />
      </Pressable>
      <ThemedText style={styles.title}>{title}</ThemedText>
    </View>
  );
}

type SectionProps = {
  title: string;
  children: ReactNode;
  testID?: string;
};

/**
 * A settings group as a card (see Card above). Its children are rows —
 * SettingsValue for a label/value pair, SettingsBlock for anything else —
 * and each row draws the dashed rule above itself, so the card needs no idea
 * which of its children are rendered.
 */
export function SettingsSection({ title, children, testID }: SectionProps) {
  return (
    <CardFrame testID={testID}>
      <ThemedText style={styles.cardTitle}>{title}</ThemedText>
      {children}
    </CardFrame>
  );
}

/**
 * The card's frame on its own: the accent bar down the left edge, the dotted
 * top edge and the hard offset shadow, around whatever the card holds. The
 * event editor's desktop dialog is one, with its own rules between header,
 * fields and buttons. `style` sets what the frame does not: its ground, its
 * width.
 */
export function CardFrame({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View style={[styles.card, style]} testID={testID}>
      <View style={styles.cardTopEdge} pointerEvents="none">
        <DashedLine weight={Card.dotted} dash={Card.dot} strong />
      </View>
      <View style={styles.cardAccentBar} pointerEvents="none" />
      {children}
    </View>
  );
}

/**
 * A dashed line in the card's rule colour: across (the rule above each row,
 * the dotted top edge) or down (between a row's label and value columns).
 * SVG rather than a border, because Android only dashes a border drawn on
 * all four sides.
 */
export function DashedLine({
  vertical = false,
  weight = 1,
  dash = Card.dash,
  strong = false,
}: {
  vertical?: boolean;
  weight?: number;
  dash?: number;
  strong?: boolean;
}) {
  const theme = useTheme();
  const mid = weight / 2;
  return (
    <Svg
      width={vertical ? weight : '100%'}
      height={vertical ? '100%' : weight}
      pointerEvents="none"
    >
      <Line
        x1={vertical ? mid : 0}
        y1={vertical ? 0 : mid}
        x2={vertical ? mid : '100%'}
        y2={vertical ? '100%' : mid}
        stroke={strong ? theme.ruleStrong : theme.rule}
        strokeWidth={weight}
        strokeDasharray={`${dash} ${dash}`}
      />
    </Svg>
  );
}

/** A label/value row of the card's table. */
export function SettingsValue({
  label,
  value,
  testID,
  labelWidth,
  cellPaddingY,
  valuePaddingX,
  centerValue,
  onPress,
  pressLabel,
  trailing,
}: {
  /** Text, or something of your own (the day list's mark and time). */
  label: ReactNode;
  /** Text, or a control (SettingsToggle) in place of it. */
  value: ReactNode;
  testID?: string;
  /** The label column's share of the row, where the card's own is too wide
   *  or too narrow for what it holds. */
  labelWidth?: DimensionValue;
  /** The label's and the value's vertical padding, where the card's own is
   *  not the room a row wants; both together, so their first lines align. */
  cellPaddingY?: number;
  /** The value's padding on both sides, the same either way. */
  valuePaddingX?: number;
  /** Centre the value up and down in its cell, for a row whose label is
   *  taller than the value (a title beside a two-line time). */
  centerValue?: boolean;
  /** Makes the whole row a button, lit while hovered or pressed. Its own
   *  tappable parts (a tag) are `pointerEvents: 'auto'` inside the value, and
   *  everything else passes the press through: a button never holds another
   *  button, which the web rejects as invalid HTML. */
  onPress?: () => void;
  pressLabel?: string;
  /** A third column after a rule of its own: a control for the row (the day
   *  list's delete). It stays a button of its own above the row's, so give it
   *  the whole cell to be pressed in. */
  trailing?: ReactNode;
}) {
  const theme = useTheme();
  const passThrough = onPress ? styles.passThrough : null;
  // Lit while hovered or pressed, on the value cell alone: the time column,
  // the rules and the delete beside it keep their ground.
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const lit = hovered || pressed;
  return (
    <View testID={testID}>
      <DashedLine />
      <View style={styles.valueRow}>
        <View
          style={[
            styles.valueLabelCell,
            labelWidth ? { width: labelWidth } : null,
            cellPaddingY !== undefined
              ? { paddingVertical: cellPaddingY }
              : null,
          ]}
        >
          {typeof label === 'string' ? (
            <ThemedText type="small" themeColor="textSecondary">
              {label}
            </ThemedText>
          ) : (
            label
          )}
        </View>
        {/* Out of flow: a percentage-tall SVG has no height of its own to
            give, and in a browser it would set the row's height instead of
            filling it. */}
        <View style={styles.columnRule}>
          <View style={StyleSheet.absoluteFill}>
            <DashedLine vertical />
          </View>
        </View>
        <View
          style={[
            styles.valueCell,
            cellPaddingY !== undefined
              ? { paddingVertical: cellPaddingY }
              : null,
            valuePaddingX !== undefined
              ? { paddingHorizontal: valuePaddingX }
              : null,
            centerValue ? styles.valueCentered : null,
            passThrough,
            lit && { backgroundColor: theme.backgroundSelected },
          ]}
        >
          {onPress && (
            // The row's button is this cell alone: the time beside it is not
            // a target, and neither lights nor answers a click.
            <Pressable
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={pressLabel}
              onHoverIn={() => setHovered(true)}
              onHoverOut={() => setHovered(false)}
              onPressIn={() => setPressed(true)}
              onPressOut={() => setPressed(false)}
              style={[StyleSheet.absoluteFill, styles.pressTarget]}
            />
          )}
          {typeof value === 'string' ? (
            <ThemedText type="small">{value}</ThemedText>
          ) : (
            value
          )}
        </View>
        {trailing ? (
          <>
            <View style={styles.columnRule}>
              <View style={StyleSheet.absoluteFill}>
                <DashedLine vertical />
              </View>
            </View>
            <View style={styles.trailingCell}>{trailing}</View>
          </>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Something being read, in the place its value will appear: the app's
 * dashed circle turning beside a word that says what ("Loading…",
 * "Checking…"), in the quiet secondary ink.
 */
export function SettingsBusy({
  label,
  testID,
}: {
  label: string;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.busyRow} testID={testID}>
      <Spinner color={theme.textSecondary} size={14} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

/** Toggle geometry: square, like everything else here. */
const Toggle = {
  width: 40,
  height: 22,
  knob: 14,
  inset: 3,
  slideMs: 160,
} as const;

/**
 * An on/off switch, square to match the app — a track that fills with the
 * accent when on, and a knob that slides across. Beside it, the state in
 * words, so it never has to be read from position or colour alone.
 */
export function SettingsToggle({
  on,
  label,
  name,
  onPress,
  disabled = false,
  testID,
}: {
  on: boolean;
  /** The state in words, e.g. 'Allowed' / 'Off'. */
  label: string;
  /** What the switch is, for screen readers, when the label is only its
   *  state ('Off' alone says nothing). Defaults to the label. */
  name?: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const travel = Toggle.width - Toggle.knob - Toggle.inset * 2 - 2;
  const position = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    position.value = withTiming(on ? 1 : 0, { duration: Toggle.slideMs });
  }, [on, position]);
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value * travel }],
  }));
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      // A 22pt row reached as 48pt.
      hitSlop={13}
      accessibilityRole="switch"
      // aria-* rather than accessibilityState: the same on every platform,
      // and the web's switch and radio require them.
      aria-checked={on}
      aria-disabled={disabled}
      accessibilityLabel={name ?? label}
      style={({ pressed }) => [
        styles.toggleRow,
        (pressed || disabled) && styles.togglePressed,
      ]}
      testID={testID}
    >
      <View
        style={[
          styles.toggleTrack,
          on
            ? { backgroundColor: AccentColor, borderColor: AccentColor }
            : { borderColor: theme.placeholder },
        ]}
      >
        <Animated.View
          style={[
            styles.toggleKnob,
            { backgroundColor: on ? OnAccentColor : theme.placeholder },
            knob,
          ]}
        />
      </View>
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );
}

/**
 * A full-width row of the card, for anything that is not a label/value
 * pair: a form, a line of status, a row of buttons — or, given `onPress`, a
 * choice in a list (the Calendars card), which lights up while pressed.
 */
export function SettingsBlock({
  children,
  onPress,
  selected,
  testID,
}: {
  children: ReactNode;
  onPress?: () => void;
  /** With `onPress`: the row is one of a set of radio choices. */
  selected?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View>
      <DashedLine />
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="radio"
          aria-checked={Boolean(selected)}
          style={({ pressed }) => [
            styles.block,
            pressed && { backgroundColor: theme.backgroundSelected },
          ]}
          testID={testID}
        >
          {children}
        </Pressable>
      ) : (
        <View style={styles.block} testID={testID}>
          {children}
        </View>
      )}
    </View>
  );
}

/** Message-line type: the size of the Calendars legend, which every note,
 *  confirmation and error now shares. */
const Message = {
  size: 12,
  lineHeight: 16,
  icon: 12,
  glyphNudge: 1,
} as const;

type MessageTone = 'note' | 'success' | 'problem';

/**
 * One line of status under a control — a note, a confirmation, or an error —
 * as a small glyph and a short sentence in the legend's size. The tone picks
 * the colours and the default glyph; `icon` swaps the glyph (the Calendars
 * legend repeats the tick it explains).
 */
export function SettingsMessage({
  tone = 'note',
  icon: Icon,
  children,
  testID,
}: {
  tone?: MessageTone;
  icon?: ComponentType<IconProps>;
  children: ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  const ink = tone === 'problem' ? DangerColor : theme.textSecondary;
  const glyphColor =
    tone === 'problem'
      ? DangerColor
      : tone === 'success' || Icon
        ? AccentColor
        : theme.textSecondary;
  const Glyph =
    Icon ??
    (tone === 'problem'
      ? AlertCircleIcon
      : tone === 'success'
        ? CheckIcon
        : InfoCircleIcon);
  return (
    <View style={styles.message} testID={testID}>
      <View style={styles.messageGlyph}>
        <Glyph size={Message.icon} color={glyphColor} />
      </View>
      <ThemedText style={[styles.messageText, { color: ink }]}>
        {children}
      </ThemedText>
    </View>
  );
}

/**
 * What the last action came to — shown as one message line, and replaced only
 * when the next action finishes. Clearing it when an action starts would make
 * the card shrink and grow back on every tap that ends the same way.
 */
export type SettingsOutcome = {
  tone: MessageTone;
  text: string;
  /** Names an outcome a screen may want to withdraw when its cause goes
   *  away (notifications' 'permission-off'). */
  kind?: string;
} | null;

export function SettingsOutcomeLine({
  outcome,
  testID,
}: {
  outcome: SettingsOutcome;
  testID?: string;
}) {
  if (!outcome) return null;
  return (
    <SettingsMessage tone={outcome.tone} testID={testID}>
      {outcome.text}
    </SettingsMessage>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** 'filled' is the section's primary action; 'danger' is destructive, and
   *  'filledDanger' is a destructive one that is the primary action. */
  variant?: 'text' | 'filled' | 'danger' | 'filledDanger';
  /** The action is running: a spinner replaces the label, the button keeps
   *  its size, and presses are ignored until it finishes. */
  busy?: boolean;
  /** A wait after the action (a filled button only): the button empties and
   *  refills left to right over `ms`, ignoring presses until it is full.
   *  Restarted by a new `started`. */
  cooldown?: { started: number; ms: number } | null;
  testID?: string;
};

export function SettingsButton({
  label,
  onPress,
  disabled = false,
  variant = 'text',
  busy = false,
  cooldown = null,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const filled = variant === 'filled' || variant === 'filledDanger';
  const fill = useSharedValue(1);
  const started = cooldown?.started;
  const ms = cooldown?.ms ?? 0;
  // Cooling until the cooldown that started last has run out.
  const [finished, setFinished] = useState<number | undefined>(undefined);
  const cooling = started !== undefined && ms > 0 && finished !== started;
  useEffect(() => {
    if (started === undefined || ms <= 0) return;
    fill.value = 0;
    // Linear, so how full the bar is honestly says how long is left.
    fill.value = withTiming(1, { duration: ms, easing: Easing.linear });
    const timer = setTimeout(() => setFinished(started), ms);
    return () => clearTimeout(timer);
  }, [started, ms, fill]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%`,
  }));
  const inkStyle = filled
    ? styles.filledLabel
    : variant === 'danger'
      ? styles.dangerLabel
      : styles.textLabel;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy || cooling}
      // Named as a button for screen readers, and on the web for the
      // keyboard: without it the label was announced as plain text.
      accessibilityRole="button"
      aria-busy={busy}
      aria-disabled={disabled || busy || cooling}
      hitSlop={8}
      style={({ pressed }) => [
        filled ? styles.filledButton : styles.textButton,
        variant === 'filledDanger' && styles.filledDangerButton,
        variant === 'text' && styles.outlinedButton,
        filled && cooling && styles.filledButtonCooling,
        pressed &&
          (filled
            ? styles.filledButtonPressed
            : { backgroundColor: theme.backgroundSelected }),
        disabled && styles.disabled,
      ]}
      testID={testID}
    >
      {filled && cooling && (
        <Animated.View
          pointerEvents="none"
          style={[styles.cooldownFill, fillStyle]}
        />
      )}
      {/* The label stays laid out while busy or cooling, only hidden, so
          the button holds the width it had — the spinner sits over the same
          box, and through a cooldown turns over the climbing fill. */}
      <ThemedText
        type="smallBold"
        style={[inkStyle, (busy || cooling) && styles.hidden]}
      >
        {label}
      </ThemedText>
      {(busy || cooling) && (
        <View style={styles.spinnerSlot} pointerEvents="none">
          <Spinner color={inkStyle.color} />
        </View>
      )}
    </Pressable>
  );
}

/** Buttons sitting side by side at the foot of a section. */
export function SettingsButtonRow({ children }: { children: ReactNode }) {
  return <View style={styles.buttonRow}>{children}</View>;
}

const styles = StyleSheet.create({
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Bar.paddingHorizontal,
    paddingVertical: Bar.paddingVertical,
    backgroundColor: HEADER_GROUND,
  },
  title: {
    fontFamily: FontFamilyBold,
    color: AccentColor,
    // Derived from the size, as in MonthHeader, so raising one cannot clip the
    // other.
    fontSize: Bar.titleSize,
    lineHeight: Math.round(Bar.titleSize * Bar.titleLineRatio),
  },
  iconButton: {
    padding: Bar.iconPadding,
    // Pulls the glyph back level with the title's own left edge.
    marginLeft: -Bar.iconPadding,
  },
  card: {
    position: 'relative',
    // Room for the accent bar, so nothing inside runs under it.
    paddingLeft: Card.accentBar,
    paddingTop: Card.dotted,
    // The hard offset shadow of the original, darkened to read on this
    // app's dark ground.
    boxShadow: '2px 2px 0px rgba(0, 0, 0, 0.55)',
  },
  cardTopEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  cardAccentBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: Card.accentBar,
    backgroundColor: AccentColor,
  },
  cardTitle: {
    fontFamily: FontFamilyBold,
    color: AccentColor,
    fontSize: Card.titleSize,
    lineHeight: Math.round(Card.titleSize * 1.3),
    paddingVertical: Card.padV,
    paddingHorizontal: Card.padH,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  togglePressed: {
    opacity: 0.6,
  },
  toggleTrack: {
    width: Toggle.width,
    height: Toggle.height,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: Toggle.inset,
  },
  toggleKnob: {
    width: Toggle.knob,
    height: Toggle.knob,
  },
  // Enough room between a message and the action under it that the two read
  // as separate things.
  block: {
    paddingVertical: Card.padV,
    paddingHorizontal: Card.padH,
    gap: Spacing.three,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  columnRule: {
    width: 1,
  },
  // Lets a press through to the row's own button beneath.
  passThrough: {
    pointerEvents: 'none',
  },
  // The button sits in a cell that passes presses through, so it takes its
  // own.
  pressTarget: {
    pointerEvents: 'auto',
  },
  valueLabelCell: {
    width: Card.labelColumn,
    paddingVertical: Card.padV,
    paddingHorizontal: Card.padH,
  },
  valueCentered: {
    justifyContent: 'center',
  },
  trailingCell: {
    width: 48,
    alignItems: 'stretch',
  },
  valueCell: {
    flex: 1,
    paddingVertical: Card.padV,
    paddingHorizontal: Card.padH,
  },
  message: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.one + Spacing.half,
  },
  // Centres the glyph on the first line, so a message that wraps keeps its
  // icon beside the opening words.
  messageGlyph: {
    height: Message.lineHeight,
    justifyContent: 'center',
    // Optical, not layout: Satoshi's lowercase sits about 1.6px below the
    // line's centre (its ascent leaves far more room above the letters than
    // its descent below), so a glyph centred on the line read as riding high
    // beside a sentence. Same correction as the event chips' ink nudge.
    marginTop: Message.glyphNudge,
  },
  messageText: {
    flexShrink: 1,
    fontSize: Message.size,
    lineHeight: Message.lineHeight,
  },
  // Right-aligned, as on the setup screen: the primary action sits last, at
  // the far right, where the thumb ends up.
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: Spacing.one + Spacing.half,
  },
  textButton: {
    minHeight: CONTROL_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  // The secondary action: drawn as a square amber outline, so it reads as a
  // button beside the filled one rather than as a link. Same padding as the
  // filled button, so a pair of them lines up.
  outlinedButton: {
    borderWidth: 1,
    borderColor: AccentColor,
    paddingHorizontal: Spacing.four - Spacing.half - 1,
  },
  filledButton: {
    minHeight: CONTROL_HEIGHT,
    justifyContent: 'center',
    backgroundColor: AccentColor,
    paddingHorizontal: Spacing.four - Spacing.half,
  },
  filledDangerButton: {
    backgroundColor: DangerColor,
  },
  filledButtonPressed: {
    opacity: 0.85,
  },
  // Emptied to a faint accent the fill climbs back over; the black label
  // reads on both.
  filledButtonCooling: {
    backgroundColor: 'rgba(255, 189, 79, 0.35)',
  },
  cooldownFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: AccentColor,
  },
  filledLabel: {
    color: OnAccentColor,
    fontFamily: FontFamilyBold,
  },
  textLabel: {
    color: AccentColor,
  },
  dangerLabel: {
    color: DangerColor,
  },
  disabled: {
    opacity: 0.5,
  },
  hidden: {
    opacity: 0,
  },
  spinnerSlot: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
