// THROWAWAY gallery (see app/src/gallery/REVERT.md). The settings card and
// everything built from it: the Settings screen's sections, the login and
// the connection screens.
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ConnectionProblem } from '@/components/calendar/connection-problem';
import { CalendarMark } from '@/components/calendar/calendar-mark';
import { ChipRow } from '@/components/fields/chip-row';
import { FieldStack } from '@/components/fields/field-stack';
import {
  BellIcon,
  CalendarIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  GiftIcon,
} from '@/components/icons';
import { AboutSection } from '@/components/settings/about-section';
import { ConnectionSection } from '@/components/settings/connection-section';
import {
  LoginFields,
  type LoginFormState,
} from '@/components/settings/login-form';
import { NotificationsSection } from '@/components/settings/notifications-section';
import { ReminderPreview } from '@/components/settings/reminder-preview';
import {
  CardFrame,
  DashedLine,
  SettingsBlock,
  SettingsBusy,
  SettingsButton,
  SettingsButtonRow,
  SettingsMessage,
  SettingsOutcomeLine,
  SettingsSection,
  SettingsToggle,
  SettingsValue,
} from '@/components/settings/settings-parts';
import { SetupScreen } from '@/components/settings/setup-screen';
import { ThemedText } from '@/components/themed-text';
import { webConnectionProblem } from '@/config/dav-config';
import { AccentColor, Colors, Spacing } from '@/constants/theme';

import { Note, Row, Section, Specimen, Tag, ViewOnly } from '../parts';
import { SAMPLE_CALENDARS } from '../sample-data';

const noop = () => {};
const PARTS = 'components/settings/settings-parts.tsx';

/** A login form's state without the login: typing works, Log in does not. */
function useFakeLoginForm(
  start: Partial<Pick<LoginFormState, 'username' | 'outcome' | 'busy'>>
): LoginFormState {
  const [username, setUsername] = useState(start.username ?? '');
  const [password, setPassword] = useState(start.username ? 'hunter22' : '');
  return {
    username,
    setUsername,
    password,
    setPassword,
    outcome: start.outcome ?? null,
    busy: start.busy ?? false,
    submit: async () => {},
  };
}

function LoginSpecimens() {
  const empty = useFakeLoginForm({});
  const filled = useFakeLoginForm({ username: 'ada' });
  const wrong = useFakeLoginForm({
    username: 'ada',
    outcome: {
      tone: 'problem',
      text: 'The server didn’t accept that username and password.',
    },
  });
  const busy = useFakeLoginForm({ username: 'ada', busy: true });
  const forms = [
    ['empty', empty],
    ['filled', filled],
    ['wrong password', wrong],
    ['busy (fields read-only)', busy],
  ] as const;
  return (
    <Specimen
      name="LoginFields (web)"
      file="components/settings/login-form.tsx"
      shows="Sample form state (typing works, nothing is sent). The real screen adds a session notice above the problem line when it was not your choice to log out."
    >
      <Row>
        {forms.map(([label, form]) => (
          <View key={label} style={styles.formCell}>
            <Tag>{label}</Tag>
            <SettingsSection title="Log in">
              <SettingsBlock>
                <LoginFields form={form} />
              </SettingsBlock>
              <SettingsBlock>
                <SettingsButtonRow>
                  <SettingsButton
                    label="Log in"
                    variant="filled"
                    busy={form.busy}
                    onPress={noop}
                  />
                </SettingsButtonRow>
              </SettingsBlock>
            </SettingsSection>
          </View>
        ))}
      </Row>
    </Specimen>
  );
}

/**
 * The Calendars card, assembled from its real parts with sample calendars:
 * the real section lists the account's calendars (a server read) and
 * writes its choices to settings.
 */
function SampleCalendarsCard() {
  const [selected, setSelected] = useState(SAMPLE_CALENDARS[0].url);
  const [hidden, setHidden] = useState<string[]>([SAMPLE_CALENDARS[2].url]);
  const [week, setWeek] = useState('monday');
  const onWeb = Platform.OS === 'web';
  return (
    <SettingsSection title="Calendars">
      {SAMPLE_CALENDARS.map((c) => {
        const isHidden = hidden.includes(c.url);
        return (
          <SettingsBlock
            key={c.url}
            onPress={() => setSelected(c.url)}
            selected={c.url === selected}
          >
            <View style={styles.calRow}>
              <CalendarMark
                icon={c.icon}
                size={16}
                color={c.color ?? Colors.dark.textSecondary}
              />
              <ThemedText
                type="small"
                themeColor={isHidden ? 'placeholder' : undefined}
                style={styles.flex}
              >
                {c.name}
              </ThemedText>
              {c.url === selected && (
                <CheckIcon size={20} color={AccentColor} />
              )}
              <Pressable
                onPress={() =>
                  setHidden((h) =>
                    isHidden ? h.filter((u) => u !== c.url) : [...h, c.url]
                  )
                }
                hitSlop={10}
                style={styles.eye}
              >
                {isHidden ? (
                  <EyeOffIcon size={20} color={Colors.dark.placeholder} />
                ) : (
                  <EyeIcon size={20} color={Colors.dark.textSecondary} />
                )}
              </Pressable>
            </View>
          </SettingsBlock>
        );
      })}
      <SettingsBlock>
        {onWeb ? (
          <View style={styles.legend}>
            <SettingsMessage icon={CheckIcon}>
              New events go here
            </SettingsMessage>
            <SettingsMessage icon={EyeIcon}>
              Shown on the calendar
            </SettingsMessage>
          </View>
        ) : (
          <>
            <SettingsMessage icon={CheckIcon}>
              Where new events go. Tap a calendar to change.
            </SettingsMessage>
            <SettingsMessage icon={EyeIcon}>
              Shown on the calendar and widget. Tap the eye to hide one.
            </SettingsMessage>
          </>
        )}
      </SettingsBlock>
      <SettingsBlock>
        <FieldStack label="Week starts on" icon={CalendarIcon}>
          <ChipRow
            options={[
              { value: 'monday', label: 'Monday' },
              { value: 'sunday', label: 'Sunday' },
              {
                value: 'phone',
                label: `Match ${onWeb ? 'browser' : 'phone'} (Monday)`,
              },
            ]}
            value={week}
            onChange={setWeek}
            singleLine
          />
        </FieldStack>
      </SettingsBlock>
    </SettingsSection>
  );
}

export function SettingsPartsSection() {
  const [toggle, setToggle] = useState(true);
  const [choice, setChoice] = useState(0);
  return (
    <Section
      id="settings"
      title="Settings card"
      intro="The card every screen is built from (settings-parts.tsx), then the Settings sections, the login and the connection screens."
    >
      <Row>
        <Specimen name="SettingsSection" file={PARTS} shows="title (17 px)">
          <View style={styles.cardBox}>
            <SettingsSection title="Account">
              <SettingsValue label="Logged in as" value="ada" />
              <SettingsValue
                label="Calendar server"
                value="https://dav.example.org/ada/"
              />
            </SettingsSection>
          </View>
        </Specimen>
        <Specimen
          name="SettingsSection large"
          file={PARTS}
          shows="large: the DayHeading size (the day list's title)"
        >
          <View style={styles.cardBox}>
            <SettingsSection title="Thu 9 Oct" large>
              <SettingsBlock>
                <ThemedText type="small" themeColor="textSecondary">
                  A card about one day.
                </ThemedText>
              </SettingsBlock>
            </SettingsSection>
          </View>
        </Specimen>
      </Row>

      <Specimen
        name="SettingsValue"
        file={PARTS}
        shows="text value; long wrapping value; control value; busy value; onPress row (lights on hover/press); trailing cell; labelWidth 80 / 160; centerValue"
      >
        <SettingsSection title="Rows">
          <SettingsValue label="Version" value="1.0.0 · Web" />
          <SettingsValue
            label="A long label that wraps in its column"
            value="A long value that wraps onto a second and maybe a third line inside the value cell of the card"
          />
          <SettingsValue
            label="Permission"
            value={
              <SettingsToggle
                on={toggle}
                label={toggle ? 'Allowed' : 'Off'}
                onPress={() => setToggle((v) => !v)}
              />
            }
          />
          <SettingsValue
            label="Reminders"
            value={<SettingsBusy label="Checking…" />}
          />
          <SettingsValue
            label="onPress"
            value="Press or hover this cell"
            onPress={noop}
            pressLabel="Sample row"
          />
          <SettingsValue
            label="trailing"
            value="A third column after its own rule"
            trailing={
              <View style={styles.trailing}>
                <GiftIcon size={18} color={AccentColor} />
              </View>
            }
          />
          <SettingsValue labelWidth={80} label="80 px" value="labelWidth 80" />
          <SettingsValue
            labelWidth={160}
            label="160 px"
            value="labelWidth 160"
          />
          <SettingsValue
            centerValue
            label={
              <View>
                <ThemedText type="smallBold">09:30</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  15 min
                </ThemedText>
              </View>
            }
            value="centerValue beside a two-line label"
          />
        </SettingsSection>
      </Specimen>

      <Row>
        <Specimen
          name="SettingsBlock"
          file={PARTS}
          shows="plain; onPress radio choices (selected has no look of its own, only aria-checked)"
        >
          <View style={styles.cardBox}>
            <SettingsSection title="Blocks">
              <SettingsBlock>
                <ThemedText type="small">A plain full-width row.</ThemedText>
              </SettingsBlock>
              {['First choice', 'Second choice'].map((label, i) => (
                <SettingsBlock
                  key={label}
                  onPress={() => setChoice(i)}
                  selected={choice === i}
                >
                  <ThemedText type="small">
                    {label} {choice === i ? '(selected)' : ''}
                  </ThemedText>
                </SettingsBlock>
              ))}
            </SettingsSection>
          </View>
        </Specimen>
        <Specimen
          name="SettingsMessage / SettingsOutcomeLine / SettingsBusy"
          file={PARTS}
          shows="tone note, success, problem; custom icon; long wrap; busy row"
        >
          <View style={styles.cardBox}>
            <SettingsMessage>
              A note: reminders ring on this device.
            </SettingsMessage>
            <SettingsMessage tone="success">
              Sent. Check your phone.
            </SettingsMessage>
            <SettingsMessage tone="problem">
              Not saved. The calendar server didn’t answer.
            </SettingsMessage>
            <SettingsMessage icon={BellIcon}>
              Reminders arrive only while this page is open in a tab.
            </SettingsMessage>
            <SettingsMessage tone="problem">
              A long problem that wraps: the phone may stop hitome in the
              background, and Snooze can then do nothing. Allow background
              activity under Battery.
            </SettingsMessage>
            <SettingsOutcomeLine
              outcome={{ tone: 'note', text: 'SettingsOutcomeLine, tone note' }}
            />
            <SettingsBusy label="Loading…" />
          </View>
        </Specimen>
      </Row>

      <Specimen
        name="CardFrame and DashedLine"
        file={PARTS}
        shows="The frame alone (accent bar, dotted top, shadow); a horizontal rule; strong rule; vertical rule"
      >
        <View style={styles.cardBox}>
          <CardFrame style={{ backgroundColor: Colors.dark.background }}>
            <View style={styles.framePad}>
              <ThemedText type="small">CardFrame</ThemedText>
            </View>
            <DashedLine />
            <View style={styles.framePad}>
              <ThemedText type="small">after DashedLine</ThemedText>
            </View>
            <DashedLine strong weight={2} dash={2} />
            <View style={[styles.framePad, styles.vRow]}>
              <ThemedText type="small">left</ThemedText>
              <View style={styles.vRule}>
                <View style={StyleSheet.absoluteFill}>
                  <DashedLine vertical />
                </View>
              </View>
              <ThemedText type="small">right</ThemedText>
            </View>
          </CardFrame>
        </View>
      </Specimen>

      <Specimen
        name="Account (ConnectionSection)"
        file={
          Platform.OS === 'web'
            ? 'components/settings/connection-section.tsx'
            : 'components/settings/connection-section.android.tsx'
        }
        shows="Live, view only: it shows this session's account (web) or the phone's sync app (Android); its buttons would really log out or disconnect, so presses are off."
      >
        <View style={styles.cardBox}>
          <ViewOnly>
            <ConnectionSection />
          </ViewOnly>
        </View>
      </Specimen>

      <Specimen
        name="Calendars (assembled)"
        file="components/settings/calendars-section.tsx"
        shows="Built here from its real parts with sample calendars (Family hidden): the real section reads the account's calendar list from the server and writes the choices to settings. Presses work on the sample."
      >
        <View style={styles.cardBox}>
          <SampleCalendarsCard />
        </View>
        <Tag>its loading and failure rows</Tag>
        <View style={styles.cardBox}>
          <SettingsSection title="Calendars">
            <SettingsBlock>
              <SettingsBusy label="Loading…" />
            </SettingsBlock>
          </SettingsSection>
        </View>
        <View style={styles.cardBox}>
          <SettingsSection title="Calendars">
            <SettingsBlock>
              <SettingsMessage tone="problem">
                The server didn’t answer. Check your connection, then try again.
              </SettingsMessage>
            </SettingsBlock>
          </SettingsSection>
        </View>
      </Specimen>

      <Specimen
        name="NotificationsSection"
        file="components/settings/notifications-section.tsx"
        shows="Live, view only: reads this browser's (or phone's) real permission and your real default alert; its chips and buttons would change them, so presses are off."
      >
        <View style={styles.cardBox}>
          <ViewOnly>
            <NotificationsSection />
          </ViewOnly>
        </View>
      </Specimen>

      <Row>
        <Specimen
          name="ReminderPreview"
          file="components/settings/reminder-preview.tsx"
          shows="Android's sample notification (Settings shows it on Android only)"
        >
          <View style={styles.preview}>
            <ReminderPreview />
          </View>
        </Specimen>
        <Specimen
          name="AboutSection"
          file="components/settings/about-section.tsx"
          shows="Live: this build's version and channel; the links open GitHub."
        >
          <View style={styles.cardBox}>
            <AboutSection />
          </View>
        </Specimen>
      </Row>

      <LoginSpecimens />

      <Specimen
        name={
          Platform.OS === 'web'
            ? 'SetupScreen (web login)'
            : 'SetupScreen (Android first run)'
        }
        file={
          Platform.OS === 'web'
            ? 'components/settings/setup-screen.tsx'
            : 'components/settings/setup-screen.android.tsx'
        }
        shows="The real screen in a 720 px box, view only (Log in would really log in). Below 768 px the button sits in a footer; wider, it is the card's last row."
        bare
      >
        <View style={styles.screenBox}>
          <ViewOnly>
            <View style={styles.screenFill}>
              <SetupScreen />
            </View>
          </ViewOnly>
        </View>
      </Specimen>

      <Note>
        ConnectionProblem: the web&apos;s whole-screen answer when the calendar
        has never loaded. One per message webConnectionProblem can give; Try
        again is live but does nothing here. (Once anything has loaded, the
        toast in Toasts and banners takes over.)
      </Note>
      {(
        [
          ['unauthorized', 'login rejected'],
          ['unreachable', 'unreachable, timeout, no such host'],
          ['not-caldav', 'not a calendar server'],
          ['no-calendars', 'no calendars'],
          ['other', 'anything else (shows the reason)'],
        ] as const
      ).map(([failure, label]) => (
        <ConnectionProblemSpecimen
          key={failure}
          failure={failure}
          label={label}
        />
      ))}
    </Section>
  );
}

function ConnectionProblemSpecimen({
  failure,
  label,
}: {
  failure:
    | 'unauthorized'
    | 'unreachable'
    | 'not-caldav'
    | 'no-calendars'
    | 'other';
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const problem = webConnectionProblem(
    failure === 'other' ? 'bad-url' : failure,
    'The server answered 500 Internal Server Error.'
  );
  return (
    <Specimen
      name={`ConnectionProblem: ${label}`}
      file="components/calendar/connection-problem.tsx"
      shows={`webConnectionProblem('${failure}') in a 560 px box; Try again spins for 1.5 s`}
      bare
    >
      <View style={styles.problemBox}>
        <ConnectionProblem
          problem={problem}
          busy={busy}
          onRetry={() => {
            setBusy(true);
            setTimeout(() => setBusy(false), 1500);
          }}
        />
      </View>
    </Specimen>
  );
}

const styles = StyleSheet.create({
  cardBox: {
    width: '100%',
    maxWidth: 560,
    minWidth: 280,
    gap: Spacing.two,
  },
  formCell: {
    width: 320,
    maxWidth: '100%',
    gap: Spacing.one,
  },
  calRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 24,
  },
  flex: {
    flex: 1,
  },
  eye: {
    padding: Spacing.one,
    margin: -Spacing.one,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.four,
    rowGap: Spacing.two,
  },
  trailing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  framePad: {
    padding: Spacing.three,
  },
  vRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  vRule: {
    width: 1,
  },
  preview: {
    width: 320,
    maxWidth: '100%',
  },
  screenBox: {
    height: 720,
    overflow: 'hidden',
  },
  screenFill: {
    height: 720,
  },
  problemBox: {
    height: 560,
    overflow: 'hidden',
  },
});
