// THROWAWAY gallery (see app/src/gallery/REVERT.md). The editor's form
// fields, one by one, each live on local sample state.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AlarmField, type AlarmState } from '@/components/calendar/alarm-field';
import { CalendarField } from '@/components/calendar/calendar-field';
import { LocationField } from '@/components/calendar/location-field';
import {
  RecurrenceField,
  type RecurrenceState,
} from '@/components/calendar/recurrence-field';
import { DateField } from '@/components/fields/date-field';
import { FieldLabel } from '@/components/fields/field-label';
import { FieldStack } from '@/components/fields/field-stack';
import { TextField } from '@/components/fields/text-field';
import { TimeField } from '@/components/fields/time-field';
import {
  CalendarIcon,
  MapPinIcon,
  PencilIcon,
  UserIcon,
} from '@/components/icons';
import {
  CardFrame,
  DashedLine,
  SettingsMessage,
} from '@/components/settings/settings-parts';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';

import { Note, Row, Section, Specimen, Tag } from '../parts';
import { DAY, SAMPLE, SAMPLE_CALENDARS, TODAY } from '../sample-data';

function Text({
  start,
  placeholder,
  multiline,
  big,
}: {
  start: string;
  placeholder: string;
  multiline?: boolean;
  big?: boolean;
}) {
  const [value, setValue] = useState(start);
  return (
    <TextField
      value={value}
      onChangeText={setValue}
      placeholder={placeholder}
      multiline={multiline}
      style={[multiline && styles.notes, big && styles.title]}
    />
  );
}

function Recurrence({ start }: { start: RecurrenceState }) {
  const [value, setValue] = useState(start);
  return <RecurrenceField value={value} onChange={setValue} startDay={TODAY} />;
}

function Alarm({
  start,
  allDay = false,
  hint,
}: {
  start: AlarmState;
  allDay?: boolean;
  hint?: string;
}) {
  const [value, setValue] = useState(start);
  return (
    <AlarmField value={value} onChange={setValue} allDay={allDay} hint={hint} />
  );
}

/** The location field's suggestion list, as it appears under the field. The
 *  real list comes from Photon (a network search), so it is drawn here from
 *  the same parts with made-up places. */
function SampleSuggestions() {
  const [value, setValue] = useState('Tiong Ba');
  const places = [
    'Tiong Bahru Market, 30 Seng Poh Road, Singapore',
    'Tiong Bahru Plaza, 302 Tiong Bahru Road, Singapore',
    'Tiong Bahru Bakery, 56 Eng Hoon Street, Singapore',
  ];
  return (
    <View style={styles.column}>
      <TextField
        value={value}
        onChangeText={setValue}
        placeholder="Add a place"
      />
      <CardFrame style={{ backgroundColor: Colors.dark.background }}>
        {places.map((label, index) => (
          <View key={label}>
            {index > 0 && <DashedLine />}
            <Pressable
              onPressIn={() => setValue(label)}
              style={({ pressed }) => [
                styles.suggestion,
                pressed && { backgroundColor: Colors.dark.backgroundSelected },
              ]}
            >
              <ThemedText type="small" numberOfLines={2}>
                {label}
              </ThemedText>
            </Pressable>
          </View>
        ))}
        <DashedLine />
        <ThemedText
          type="code"
          themeColor="textSecondary"
          style={styles.credit}
        >
          Search by Photon · data © OpenStreetMap contributors
        </ThemedText>
      </CardFrame>
    </View>
  );
}

export function FieldsSection() {
  const [day, setDay] = useState(TODAY);
  const [time, setTime] = useState('09:30');
  const [cal, setCal] = useState(SAMPLE_CALENDARS[1].url);
  const [place, setPlace] = useState('');
  return (
    <Section
      id="fields"
      title="Form fields"
      intro="The editor's fields (components/fields, calendar/*-field.tsx), each live on sample state. The focused look (accent border) shows when you click into a text field."
    >
      <Row>
        <Specimen
          name="TextField (title)"
          file="components/fields/text-field.tsx"
          shows="empty with placeholder; filled; long; 17 px title size"
          style={styles.wide}
        >
          <Text start="" placeholder="Add a title" big />
          <Text start="Dentist" placeholder="Add a title" big />
          <Text
            start="Quarterly planning review with the whole product and design team (bring laptops)"
            placeholder="Add a title"
            big
          />
        </Specimen>
        <Specimen
          name="TextField (notes, multiline)"
          file="components/fields/text-field.tsx"
          shows="empty and filled, minHeight 88"
          style={styles.wide}
        >
          <Text start="" placeholder="Add notes" multiline />
          <Text
            start={SAMPLE.planning.description ?? ''}
            placeholder="Add notes"
            multiline
          />
        </Specimen>
      </Row>

      <Row>
        <Specimen
          name="DateField"
          file="components/fields/date-field(.web).tsx"
          shows="Web: a native date input; Android: a chip opening the Compose dialog"
          style={styles.wide}
        >
          <DateField value={day} onChange={setDay} label="Start date" />
        </Specimen>
        <Specimen
          name="TimeField"
          file="components/fields/time-field(.web).tsx"
          shows="Web: a native time input; Android: a chip opening the Compose dialog"
          style={styles.wide}
        >
          <TimeField value={time} onChange={setTime} label="Start time" />
        </Specimen>
      </Row>

      <Row>
        <Specimen
          name="FieldLabel"
          file="components/fields/field-label.tsx"
          shows="The caption type (12 px bold, secondary)"
        >
          <FieldLabel>Starts</FieldLabel>
        </Specimen>
        <Specimen
          name="FieldStack"
          file="components/fields/field-stack.tsx"
          shows="Caption with icon above the field (accent), and without an icon"
          style={styles.wide}
        >
          <FieldStack label="Username" icon={UserIcon}>
            <Text start="ada" placeholder="" />
          </FieldStack>
          <FieldStack label="No icon">
            <Text start="" placeholder="Something" />
          </FieldStack>
        </Specimen>
      </Row>

      <Specimen
        name="CalendarField"
        file="components/calendar/calendar-field.tsx"
        shows="Create-only picker, each chip in its calendar's colour (mounted only with more than one calendar)"
      >
        <FieldStack label="Calendar" icon={CalendarIcon}>
          <CalendarField
            calendars={SAMPLE_CALENDARS}
            value={cal}
            onChange={setCal}
          />
        </FieldStack>
        <SettingsMessage>
          Moves every occurrence of this repeating event.
        </SettingsMessage>
        <Note>
          The line above shows under it when a repeating event is moved to
          another calendar.
        </Note>
      </Specimen>

      <Specimen
        name="RecurrenceField"
        file="components/calendar/recurrence-field.tsx"
        shows="none; weekly forever; monthly until a day; daily after 5 times; custom rule (read-only note)"
      >
        <Tag>none</Tag>
        <Recurrence start={{ kind: 'none' }} />
        <Tag>weekly, forever</Tag>
        <Recurrence
          start={{ kind: 'preset', preset: 'weekly', end: { type: 'forever' } }}
        />
        <Tag>monthly, until</Tag>
        <Recurrence
          start={{
            kind: 'preset',
            preset: 'monthly',
            end: { type: 'until', day: DAY(90) },
          }}
        />
        <Tag>daily, after 5 times</Tag>
        <Recurrence
          start={{
            kind: 'preset',
            preset: 'daily',
            end: { type: 'count', n: 5 },
          }}
        />
        <Tag>custom</Tag>
        <Recurrence start={{ kind: 'custom' }} />
      </Specimen>

      <Specimen
        name="AlarmField"
        file="components/calendar/alarm-field.tsx"
        shows="timed presets (10m set); all-day presets; a foreign offset not in the presets (45m); notifications-off hint; foreign alarm (read-only note)"
      >
        <Tag>timed, 10m</Tag>
        <Alarm start={{ kind: 'set', offsetMinutes: 10 }} />
        <Tag>all-day, morning of</Tag>
        <Alarm start={{ kind: 'set', offsetMinutes: -540 }} allDay />
        <Tag>offset from another app (45m)</Tag>
        <Alarm start={{ kind: 'set', offsetMinutes: 45 }} />
        <Tag>with the notifications-off hint</Tag>
        <Alarm
          start={{ kind: 'set', offsetMinutes: 5 }}
          hint="Notifications are off, so reminders won't ring on this device."
        />
        <Tag>foreign</Tag>
        <Alarm start={{ kind: 'foreign' }} />
      </Specimen>

      <Row>
        <Specimen
          name="LocationField"
          file="components/calendar/location-field.tsx"
          shows="The real field (typing here would search Photon after 250 ms; it is empty so nothing is sent until you type)"
          style={styles.wide}
        >
          <FieldStack label="Location" icon={MapPinIcon}>
            <LocationField value={place} onChange={setPlace} />
          </FieldStack>
        </Specimen>
        <Specimen
          name="LocationField suggestions (sample)"
          file="components/calendar/location-field.tsx"
          shows="The suggestion list drawn from the same parts with made-up places (the real list is a network search)"
          style={styles.wide}
        >
          <FieldStack label="Location" icon={MapPinIcon}>
            <SampleSuggestions />
          </FieldStack>
        </Specimen>
      </Row>

      <Specimen
        name="Validation messages"
        file="calendar/event-editor-form.tsx FieldProblem"
        shows="SettingsMessage tone problem, under the field it is about"
      >
        <FieldStack label="Title" icon={PencilIcon}>
          <Text start="" placeholder="Add a title" big />
          <SettingsMessage tone="problem">Add a title</SettingsMessage>
        </FieldStack>
        <SettingsMessage tone="problem">
          End must be after the start
        </SettingsMessage>
        <SettingsMessage tone="problem">
          Repeat end is before the start
        </SettingsMessage>
        <SettingsMessage tone="problem">
          Repeat count must be at least 1
        </SettingsMessage>
      </Specimen>
    </Section>
  );
}

const styles = StyleSheet.create({
  wide: {
    width: 360,
  },
  notes: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  title: {
    fontSize: 17,
  },
  column: {
    gap: Spacing.two,
  },
  suggestion: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  credit: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
