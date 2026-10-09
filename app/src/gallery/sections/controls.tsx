// THROWAWAY gallery (see app/src/gallery/REVERT.md). Buttons, chips,
// toggles and the header bars' icon buttons.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChipRow } from '@/components/fields/chip-row';
import {
  AddIcon,
  ChevronLeftIcon,
  RefreshIcon,
  SettingsIcon,
} from '@/components/icons';
import {
  SettingsButton,
  SettingsButtonRow,
  SettingsHeader,
  SettingsToggle,
} from '@/components/settings/settings-parts';
import { AccentColor, Spacing } from '@/constants/theme';

import { Row, Section, Specimen, Tag } from '../parts';
import { SAMPLE_CALENDARS } from '../sample-data';

const noop = () => {};

function Toggle({ start, label }: { start: boolean; label: string }) {
  const [on, setOn] = useState(start);
  return (
    <SettingsToggle
      on={on}
      label={on ? label : 'Off'}
      name={label}
      onPress={() => setOn((v) => !v)}
    />
  );
}

export function ControlsSection() {
  const [repeat, setRepeat] = useState<string>('weekly');
  const [cal, setCal] = useState(SAMPLE_CALENDARS[1].url);
  const [scope, setScope] = useState('this');
  const [cooldown, setCooldown] = useState<{
    started: number;
    ms: number;
  } | null>(null);
  return (
    <Section
      id="controls"
      title="Buttons, chips and toggles"
      intro="Everything here is live: press to see the pressed look (the hover and keyboard-focus looks need a mouse or Tab)."
    >
      <Specimen
        name="SettingsButton"
        file="components/settings/settings-parts.tsx"
        shows="variant text (outlined, default), filled, danger, filledDanger; disabled; busy; cooldown; long label"
      >
        <Row gap={Spacing.two}>
          <View style={styles.cell}>
            <Tag>text</Tag>
            <SettingsButton label="Cancel" onPress={noop} />
          </View>
          <View style={styles.cell}>
            <Tag>filled</Tag>
            <SettingsButton label="Save" variant="filled" onPress={noop} />
          </View>
          <View style={styles.cell}>
            <Tag>danger</Tag>
            <SettingsButton label="Delete" variant="danger" onPress={noop} />
          </View>
          <View style={styles.cell}>
            <Tag>filledDanger</Tag>
            <SettingsButton
              label="Delete"
              variant="filledDanger"
              onPress={noop}
            />
          </View>
        </Row>
        <Row gap={Spacing.two}>
          <View style={styles.cell}>
            <Tag>text disabled</Tag>
            <SettingsButton
              label="Log out everywhere"
              disabled
              onPress={noop}
            />
          </View>
          <View style={styles.cell}>
            <Tag>filled disabled</Tag>
            <SettingsButton
              label="Send a test notification"
              variant="filled"
              disabled
              onPress={noop}
            />
          </View>
          <View style={styles.cell}>
            <Tag>danger disabled</Tag>
            <SettingsButton
              label="Delete"
              variant="danger"
              disabled
              onPress={noop}
            />
          </View>
        </Row>
        <Row gap={Spacing.two}>
          <View style={styles.cell}>
            <Tag>filled busy</Tag>
            <SettingsButton
              label="Log in"
              variant="filled"
              busy
              onPress={noop}
            />
          </View>
          <View style={styles.cell}>
            <Tag>text busy</Tag>
            <SettingsButton label="Sync now" busy onPress={noop} />
          </View>
          <View style={styles.cell}>
            <Tag>cooldown (press it: 5 s refill)</Tag>
            <SettingsButton
              label="Send a test notification"
              variant="filled"
              cooldown={cooldown}
              onPress={() => setCooldown({ started: Date.now(), ms: 5000 })}
            />
          </View>
        </Row>
        <View style={styles.cell}>
          <Tag>long label, in a narrow box</Tag>
          <View style={styles.narrow}>
            <SettingsButton
              label="Open the calendar sync app and sync every account now"
              variant="filled"
              onPress={noop}
            />
          </View>
        </View>
        <View style={styles.cell}>
          <Tag>SettingsButtonRow (right-aligned, wraps)</Tag>
          <SettingsButtonRow>
            <SettingsButton label="Log out everywhere" onPress={noop} />
            <SettingsButton label="Log out" variant="filled" onPress={noop} />
          </SettingsButtonRow>
        </View>
      </Specimen>

      <Specimen
        name="ChipRow"
        file="components/fields/chip-row.tsx"
        shows="accent chips; calendar-coloured with marks; noMark colour (scope question); singleLine strip (native scrolls sideways, web wraps)"
      >
        <Tag>accent, wrapping</Tag>
        <ChipRow
          options={[
            { value: 'none', label: 'None' },
            { value: 'daily', label: 'Daily' },
            { value: 'weekdays', label: 'Weekdays' },
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: 'Yearly' },
          ]}
          value={repeat}
          onChange={setRepeat}
        />
        <Tag>singleLine</Tag>
        <ChipRow
          singleLine
          options={[
            { value: 'none', label: 'None' },
            { value: 'daily', label: 'Daily' },
            { value: 'weekdays', label: 'Weekdays' },
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: 'Yearly' },
          ]}
          value={repeat}
          onChange={setRepeat}
        />
        <Tag>calendar colours, with CalendarMark</Tag>
        <ChipRow
          options={SAMPLE_CALENDARS.map((c) => ({
            value: c.url,
            label: c.name,
            color: c.color ?? AccentColor,
            icon: c.icon,
          }))}
          value={cal}
          onChange={setCal}
        />
        <Tag>own colour, noMark (the delete scope question)</Tag>
        <ChipRow
          options={[
            { value: 'this', label: 'This event' },
            { value: 'following', label: 'This and following' },
            { value: 'all', label: 'All events' },
          ].map((o) => ({ ...o, color: '#FF505F', noMark: true }))}
          value={scope}
          onChange={setScope}
        />
      </Specimen>

      <Row>
        <Specimen
          name="SettingsToggle"
          file="components/settings/settings-parts.tsx"
          shows="on, off, disabled on, disabled off"
        >
          <Toggle start label="Allowed" />
          <Toggle start={false} label="Allowed" />
          <SettingsToggle on label="Allowed" disabled onPress={noop} />
          <SettingsToggle on={false} label="Blocked" disabled onPress={noop} />
          <Toggle start label="All-day" />
        </Specimen>
        <Specimen
          name="Header icon buttons"
          file="calendar/month-header.tsx, settings-parts.tsx SettingsHeader"
          shows="24 px accent glyphs, 6 px padding, on the header ground"
        >
          <View style={styles.headerIcons}>
            {[ChevronLeftIcon, AddIcon, RefreshIcon, SettingsIcon].map(
              (Icon, i) => (
                <Pressable
                  key={i}
                  onPress={noop}
                  hitSlop={8}
                  style={styles.iconButton}
                  accessibilityRole="button"
                >
                  <Icon size={24} color={AccentColor} />
                </Pressable>
              )
            )}
          </View>
        </Specimen>
      </Row>

      <Specimen
        name="SettingsHeader"
        file="components/settings/settings-parts.tsx"
        shows="The Settings screen's bar: back arrow and DayHeading-size title"
        bare
      >
        <SettingsHeader title="Settings" onBack={noop} />
      </Specimen>
    </Section>
  );
}

const styles = StyleSheet.create({
  cell: {
    gap: Spacing.one,
  },
  narrow: {
    width: 200,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#000000',
    padding: Spacing.two,
    alignSelf: 'flex-start',
  },
  iconButton: {
    padding: 6,
  },
});
