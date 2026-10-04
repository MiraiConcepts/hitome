import { useEffect, type ComponentType, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
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
    <View style={styles.card} testID={testID}>
      <View style={styles.cardTopEdge} pointerEvents="none">
        <DashedLine weight={Card.dotted} dash={Card.dot} strong />
      </View>
      <View style={styles.cardAccentBar} pointerEvents="none" />
      <ThemedText style={styles.cardTitle}>{title}</ThemedText>
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
function DashedLine({
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
}: {
  label: string;
  /** Text, or a control (SettingsToggle) in place of it. */
  value: ReactNode;
  testID?: string;
}) {
  return (
    <View testID={testID}>
      <DashedLine />
      <View style={styles.valueRow}>
        <View style={styles.valueLabelCell}>
          <ThemedText type="small" themeColor="textSecondary">
            {label}
          </ThemedText>
        </View>
        <DashedLine vertical />
        <View style={styles.valueCell}>
          {typeof value === 'string' ? (
            <ThemedText type="small">{value}</ThemedText>
          ) : (
            value
          )}
        </View>
      </View>
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
  onPress,
  disabled = false,
  testID,
}: {
  on: boolean;
  /** The state in words, e.g. 'Allowed' / 'Off'. */
  label: string;
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
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={label}
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
          accessibilityState={{ selected }}
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
const Message = { size: 12, lineHeight: 16, icon: 12 } as const;

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
  /** 'filled' is the section's primary action; 'danger' is destructive. */
  variant?: 'text' | 'filled' | 'danger';
  /** The action is running: a spinner replaces the label, the button keeps
   *  its size, and presses are ignored until it finishes. */
  busy?: boolean;
  testID?: string;
};

export function SettingsButton({
  label,
  onPress,
  disabled = false,
  variant = 'text',
  busy = false,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const filled = variant === 'filled';
  const inkStyle = filled
    ? styles.filledLabel
    : variant === 'danger'
      ? styles.dangerLabel
      : styles.textLabel;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityState={{ busy, disabled: disabled || busy }}
      hitSlop={8}
      style={({ pressed }) => [
        filled ? styles.filledButton : styles.textButton,
        pressed &&
          (filled
            ? styles.filledButtonPressed
            : { backgroundColor: theme.backgroundSelected }),
        disabled && styles.disabled,
      ]}
      testID={testID}
    >
      {/* The label stays laid out while busy, only hidden, so the button
          holds the width it had — the spinner sits over the same box. */}
      <ThemedText type="smallBold" style={[inkStyle, busy && styles.hidden]}>
        {label}
      </ThemedText>
      {busy && (
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
  valueLabelCell: {
    width: Card.labelColumn,
    paddingVertical: Card.padV,
    paddingHorizontal: Card.padH,
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
  filledButton: {
    minHeight: CONTROL_HEIGHT,
    justifyContent: 'center',
    backgroundColor: AccentColor,
    paddingHorizontal: Spacing.four - Spacing.half,
  },
  filledButtonPressed: {
    opacity: 0.85,
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
