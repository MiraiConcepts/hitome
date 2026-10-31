import type { ComponentType } from 'react';

import { ChipRow } from '@/components/fields/chip-row';
import { FieldStack } from '@/components/fields/field-stack';
import {
  CalendarEventIcon,
  CalendarIcon,
  CalendarPlusIcon,
  type IconProps,
} from '@/components/icons';
import {
  SettingsBlock,
  SettingsMessage,
  SettingsSection,
} from '@/components/settings/settings-parts';
import { setGesture, useGestures, type Gestures } from '@/config/gestures';

/** Each gesture as Settings asks about it, in the order a person meets them
 *  on the grid. */
const QUESTIONS: {
  [K in keyof Gestures]: {
    label: string;
    icon: ComponentType<IconProps>;
    options: { value: Gestures[K]; label: string }[];
  };
} = {
  emptyDayTap: {
    label: 'When you tap a day with nothing on',
    icon: CalendarIcon,
    options: [
      { value: 'create', label: 'Start a new event' },
      { value: 'day', label: 'Open the day' },
      { value: 'nothing', label: 'Nothing' },
    ],
  },
  eventTap: {
    label: 'When you tap an event',
    icon: CalendarEventIcon,
    options: [
      { value: 'open', label: 'Open the event' },
      { value: 'day', label: 'Open its day' },
    ],
  },
  dayHold: {
    label: 'When you hold a day',
    icon: CalendarPlusIcon,
    options: [
      { value: 'create', label: 'Start a new event' },
      { value: 'day', label: 'Open the day' },
    ],
  },
  monthTap: {
    label: 'When you tap the month',
    icon: CalendarIcon,
    options: [
      { value: 'today', label: 'Jump to today' },
      { value: 'picker', label: 'Choose a month' },
    ],
  },
};

const ORDER: (keyof Gestures)[] = [
  'emptyDayTap',
  'eventTap',
  'dayHold',
  'monthTap',
];

/** Settings › Gestures: what the month grid's taps and holds do, on this
 *  device (config/gestures.ts). */
export function GesturesSection() {
  const gestures = useGestures();
  return (
    <SettingsSection title="Gestures" testID="settings-gestures">
      {ORDER.map((key) => (
        <Question key={key} name={key} value={gestures[key]} />
      ))}
      <SettingsBlock>
        <SettingsMessage>
          Holding the month does whichever one a tap does not. Discover mode
          keeps its own: a tap opens the day, a hold opens the event&apos;s
          page.
        </SettingsMessage>
      </SettingsBlock>
    </SettingsSection>
  );
}

function Question<K extends keyof Gestures>({
  name,
  value,
}: {
  name: K;
  value: Gestures[K];
}) {
  const question = QUESTIONS[name];
  return (
    <SettingsBlock>
      <FieldStack label={question.label} icon={question.icon}>
        <ChipRow
          options={question.options}
          value={value}
          onChange={(next) => setGesture(name, next)}
          testID={`settings-gesture-${name}`}
        />
      </FieldStack>
    </SettingsBlock>
  );
}
