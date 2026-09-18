import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { HEADER_GROUND } from '@/components/calendar/month-header';
import { FieldLabel } from '@/components/fields/field-label';
import { ChevronLeftIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
 * editor assembles by hand — 36pt controls, 4px radius, captions set back in
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

const BUTTON_HEIGHT = 36;

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

export function SettingsSection({ title, children, testID }: SectionProps) {
  return (
    <View style={styles.section} testID={testID}>
      <FieldLabel>{title}</FieldLabel>
      <ThemedView type="backgroundElement" style={styles.card}>
        {children}
      </ThemedView>
    </View>
  );
}

/** A caption/value pair — the editor's FieldRow geometry, read-only. */
export function SettingsValue({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}) {
  return (
    <View style={styles.valueRow} testID={testID}>
      <FieldLabel style={styles.valueLabel}>{label}</FieldLabel>
      <ThemedText type="small" style={styles.value}>
        {value}
      </ThemedText>
    </View>
  );
}

/** Explanatory line under a control, in the secondary shade. */
export function SettingsNote({ children }: { children: ReactNode }) {
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {children}
    </ThemedText>
  );
}

/** A failure, in the same shade and position the editor puts one. */
export function SettingsProblem({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
}) {
  return (
    <ThemedText type="small" style={styles.problem} testID={testID}>
      {children}
    </ThemedText>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** 'filled' is the section's primary action; 'danger' is destructive. */
  variant?: 'text' | 'filled' | 'danger';
  testID?: string;
};

export function SettingsButton({
  label,
  onPress,
  disabled = false,
  variant = 'text',
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const filled = variant === 'filled';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
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
      <ThemedText
        type="smallBold"
        style={
          filled
            ? styles.filledLabel
            : variant === 'danger'
              ? styles.dangerLabel
              : styles.textLabel
        }
      >
        {label}
      </ThemedText>
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
  section: {
    gap: Spacing.one + Spacing.half,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.one,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  valueLabel: {
    // Wider than the editor's 52pt column: these captions are words, not
    // abbreviations ("Permission", "Scheduled").
    width: 92,
    // Centred on the value's own line box.
    paddingTop: 2,
  },
  value: {
    flex: 1,
  },
  problem: {
    color: DangerColor,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.one + Spacing.half,
  },
  textButton: {
    minHeight: BUTTON_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.one,
  },
  filledButton: {
    minHeight: BUTTON_HEIGHT,
    justifyContent: 'center',
    backgroundColor: AccentColor,
    borderRadius: Spacing.one,
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
});
