import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BlurBackdrop } from '@/components/blur-backdrop';
import { Overlay } from '@/components/calendar/day-popover';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import {
  CardFrame,
  SettingsButton,
  SettingsButtonRow,
} from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { BACKDROP_BLUR } from '@/constants/backdrop';
import {
  AccentColor,
  FontFamilyBold,
  OnAccentColor,
  Spacing,
} from '@/constants/theme';
import { useIsWide } from '@/hooks/use-is-wide';
import { useTheme } from '@/hooks/use-theme';
import { FIRST_YEAR, LAST_YEAR, type MonthAnchor } from '@/utils/calendar-grid';

type Props = {
  /** The month the grid shows: the picker opens on its year, marked filled. */
  shown: MonthAnchor;
  /** Today's month, marked with an outline in whichever year it falls. */
  today: MonthAnchor;
  onPick: (month: MonthAnchor) => void;
  onToday: () => void;
  onClose: () => void;
};

/** A month cell and the year arrows: thumb-sized targets. */
const CELL_HEIGHT = 48;
const ARROW_SIZE = 48;
const COLUMNS = 4;

/** A month's name in the phone's language: short ("Jan", "Sept") as the
 *  header writes it, or long for a screen reader. */
const monthName = (month0: number, style: 'short' | 'long') =>
  new Date(2000, month0, 1).toLocaleDateString(undefined, { month: style });

/**
 * The month picker, opened by holding the month name: a year with arrows
 * either side and its twelve months, and Today. A far month is otherwise a
 * long swipe away. A card at the bottom of a phone, in thumb reach; centred
 * on a wide screen, as the day list is.
 */
export function MonthPicker({ shown, today, onPick, onToday, onClose }: Props) {
  const theme = useTheme();
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  const [year, setYear] = useState(shown.year);

  const rows: number[][] = [];
  for (let m = 0; m < 12; m += COLUMNS)
    rows.push(Array.from({ length: COLUMNS }, (_, i) => m + i));

  return (
    <Overlay label={`Months of ${year}`} onClose={onClose}>
      <View
        style={[
          styles.backdrop,
          wide
            ? styles.backdropWide
            : { paddingBottom: Spacing.three + insets.bottom },
          BACKDROP_BLUR,
        ]}
      >
        <BlurBackdrop />
        {/* A layer behind the card, not around it, as in the day list. */}
        {Platform.OS === 'web' ? (
          <View
            style={[StyleSheet.absoluteFill, styles.dismiss]}
            {...({ onClick: onClose } as object)}
          />
        ) : (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            focusable={false}
            accessibilityLabel="Close"
          />
        )}
        <CardFrame
          style={[styles.card, { backgroundColor: theme.background }]}
          testID="month-picker"
        >
          <View style={styles.yearRow}>
            <YearArrow
              direction={-1}
              disabled={year <= FIRST_YEAR}
              onPress={() => setYear((y) => Math.max(FIRST_YEAR, y - 1))}
            />
            <ThemedText
              accessibilityRole="header"
              aria-level={2}
              style={styles.year}
              testID="month-picker-year"
            >
              {year}
            </ThemedText>
            <YearArrow
              direction={1}
              disabled={year >= LAST_YEAR}
              onPress={() => setYear((y) => Math.min(LAST_YEAR, y + 1))}
            />
          </View>
          <View style={styles.months}>
            {rows.map((row) => (
              <View key={row[0]} style={styles.monthRow}>
                {row.map((month0) => {
                  const selected =
                    year === shown.year && month0 === shown.month0;
                  const current =
                    year === today.year && month0 === today.month0;
                  return (
                    <Pressable
                      key={month0}
                      onPress={() => onPick({ year, month0 })}
                      accessibilityRole="button"
                      accessibilityLabel={`${monthName(month0, 'long')} ${year}`}
                      accessibilityState={{ selected }}
                      testID={`month-picker-${month0}`}
                      style={({
                        pressed,
                        hovered,
                      }: {
                        pressed: boolean;
                        hovered?: boolean;
                      }) => [
                        styles.month,
                        { borderColor: theme.rule },
                        (pressed || hovered) && {
                          backgroundColor: theme.backgroundSelected,
                        },
                        current && styles.monthToday,
                        selected && styles.monthShown,
                      ]}
                    >
                      <ThemedText
                        type={selected || current ? 'smallBold' : 'small'}
                        style={
                          selected
                            ? styles.monthShownText
                            : current && styles.monthTodayText
                        }
                      >
                        {monthName(month0, 'short')}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          <SettingsButtonRow>
            <SettingsButton
              label="Today"
              onPress={onToday}
              testID="month-picker-today"
            />
          </SettingsButtonRow>
        </CardFrame>
      </View>
    </Overlay>
  );
}

function YearArrow({
  direction,
  disabled,
  onPress,
}: {
  direction: -1 | 1;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const Icon = direction < 0 ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={direction < 0 ? 'Previous year' : 'Next year'}
      accessibilityState={{ disabled }}
      testID={direction < 0 ? 'month-picker-prev' : 'month-picker-next'}
      style={({
        pressed,
        hovered,
      }: {
        pressed: boolean;
        hovered?: boolean;
      }) => [
        styles.arrow,
        (pressed || hovered) &&
          !disabled && { backgroundColor: theme.backgroundSelected },
      ]}
    >
      <Icon size={24} color={disabled ? theme.rule : AccentColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: Spacing.three,
  },
  backdropWide: {
    justifyContent: 'center',
  },
  // The Pressable this stands in for on the web showed the hand; so does this.
  dismiss: {
    cursor: 'pointer',
  },
  // The day list's outside shadow, for the same reason.
  card: {
    width: '100%',
    maxWidth: 400,
    boxShadow: '4px 4px 0px rgba(0, 0, 0, 0.75)',
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
  },
  year: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FontFamilyBold,
    fontSize: 22,
    lineHeight: 30,
  },
  arrow: {
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  months: {
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  monthRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  month: {
    flex: 1,
    height: CELL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  monthToday: {
    borderColor: AccentColor,
  },
  monthTodayText: {
    color: AccentColor,
  },
  monthShown: {
    backgroundColor: AccentColor,
    borderColor: AccentColor,
  },
  monthShownText: {
    color: OnAccentColor,
  },
});
