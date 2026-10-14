import type { ComponentType } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  EyeIcon,
  EyeOffIcon,
  TelescopeIcon,
  type IconProps,
} from '@/components/icons';
import type { CalendarRole } from '@/config/calendar-visibility';
import { AccentColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mixHex } from '@/utils/color';

/** The three roles, in order, with their icon, their name in Settings'
 *  legend, and what a screen reader says after the calendar's name
 *  ("Birthdays on the calendar"). One list, so the legend and the switch
 *  cannot drift apart. */
export const CALENDAR_ROLES: readonly {
  role: CalendarRole;
  Icon: ComponentType<IconProps>;
  name: string;
  label: string;
}[] = [
  { role: 'shown', Icon: EyeIcon, name: 'Shown', label: 'on the calendar' },
  {
    role: 'tray',
    Icon: TelescopeIcon,
    name: 'Discover',
    label: 'in discover mode',
  },
  { role: 'hidden', Icon: EyeOffIcon, name: 'Hidden', label: 'hidden' },
];

/**
 * Where a calendar's events appear, as three square segments in a dark tray:
 * on the calendar (eye), in discover mode (telescope), hidden (eye off). The
 * chosen one is lifted a step and outlined in the accent, its icon in the
 * accent too; the others stay quiet.
 */
export function CalendarRoleSwitch({
  name,
  role,
  onChange,
  testID,
}: {
  /** The calendar's name, for screen readers. */
  name: string;
  role: CalendarRole;
  onChange: (role: CalendarRole) => void;
  testID?: string;
}) {
  const theme = useTheme();
  // A step off the card: the tray the three sit in.
  const tray = mixHex(theme.background, theme.text, 0.04);
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={`Where ${name} shows`}
      style={styles.group}
      testID={testID}
    >
      {CALENDAR_ROLES.map(({ role: option, Icon, label }) => {
        const on = option === role;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="radio"
            aria-checked={on}
            accessibilityLabel={`${name} ${label}`}
            style={({ pressed }) => [
              styles.segment,
              { backgroundColor: tray },
              on && [
                styles.chosen,
                { backgroundColor: theme.backgroundSelected },
              ],
              pressed && !on && { backgroundColor: theme.backgroundSelected },
            ]}
            testID={testID && `${testID}-${option}`}
          >
            <Icon
              size={ICON_SIZE}
              color={on ? AccentColor : theme.placeholder}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const ICON_SIZE = 18;

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
  },
  chosen: {
    borderWidth: 1,
    borderColor: AccentColor,
  },
  segment: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
