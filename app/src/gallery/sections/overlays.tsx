// THROWAWAY gallery (see app/src/gallery/REVERT.md). The day list and the
// event editor, opened over the page as in the app, and the editor's parts
// drawn in place.
import { StyleSheet, View } from 'react-native';

import {
  EventEditorActions,
  EventEditorFields,
  EventEditorHeader,
} from '@/components/calendar/event-editor-form';
import type { CalEvent } from '@/caldav/types';
import {
  CardFrame,
  DashedLine,
  SettingsButton,
} from '@/components/settings/settings-parts';
import { Colors, Spacing } from '@/constants/theme';
import { useIsWide } from '@/hooks/use-is-wide';

import { useOverlays } from '../overlays';
import { Note, Row, Section, Specimen, Tag } from '../parts';
import { useSampleEditor, type SampleEditorOptions } from '../sample-editor';
import {
  BUSY_DAY,
  BUSY_EVENTS,
  DAY,
  SAMPLE,
  TODAY,
  TODAY_EVENTS,
} from '../sample-data';

const noop = () => {};
const FORM = 'components/calendar/event-editor-form.tsx';

function Open({ label, onPress }: { label: string; onPress: () => void }) {
  return <SettingsButton label={label} onPress={onPress} />;
}

function HeaderSpecimen({
  label,
  options,
  roomy,
  card,
}: {
  label: string;
  options: SampleEditorOptions;
  roomy?: boolean;
  card?: boolean;
}) {
  const editor = useSampleEditor(options);
  return (
    <View style={styles.cell}>
      <Tag>{label}</Tag>
      <View style={card ? styles.cardGround : null}>
        <EventEditorHeader editor={editor} roomy={roomy} card={card} />
      </View>
    </View>
  );
}

function ActionsSpecimen({
  label,
  options,
  card,
}: {
  label: string;
  options: SampleEditorOptions;
  card?: boolean;
}) {
  const editor = useSampleEditor(options);
  return (
    <View style={styles.cell}>
      <Tag>{label}</Tag>
      <View style={card ? styles.cardGround : null}>
        <EventEditorActions editor={editor} onClose={noop} card={card} />
      </View>
    </View>
  );
}

function FieldsSpecimen({
  event,
  columns,
}: {
  event: CalEvent | null;
  columns?: boolean;
}) {
  const editor = useSampleEditor({ event, defaultDay: TODAY });
  if (!columns) return <EventEditorFields editor={editor} />;
  return (
    <CardFrame style={{ backgroundColor: Colors.dark.background }}>
      <EventEditorHeader editor={editor} roomy card />
      <DashedLine />
      <EventEditorFields editor={editor} columns />
      <DashedLine />
      <EventEditorActions editor={editor} onClose={noop} card />
    </CardFrame>
  );
}

export function OverlaysSection() {
  const { openDay, openEditor } = useOverlays();
  const wide = useIsWide();
  const recurring = SAMPLE.standup;
  return (
    <Section
      id="overlays"
      title="Dialogs and sheets"
      intro={`The day list and the editor open over the page exactly as in the app: here a ${wide ? 'centred dialog (wide window)' : 'bottom sheet (narrow window)'}. The editor is the real form in a copy of its shell, on a sample controller: Save and Delete check the form, spin, then show the toast; nothing is written.`}
    >
      <Specimen
        name="DayPopover (real)"
        file="components/calendar/day-popover.tsx"
        shows="Today's 4 events; a 12-event day (scrolls); Add event shows on the web only. Rows open the editor, the bin deletes (a repeating one asks first)."
      >
        <Row gap={Spacing.two}>
          <Open
            label="Day list: 4 events"
            onPress={() => openDay(TODAY, TODAY_EVENTS)}
          />
          <Open
            label="Day list: 12 events"
            onPress={() => openDay(DAY(BUSY_DAY), BUSY_EVENTS)}
          />
          <Open
            label="Day list: tags and long title"
            onPress={() =>
              openDay(DAY(1), [
                SAMPLE.planning,
                SAMPLE.untitled,
                SAMPLE.birthday,
              ])
            }
          />
        </Row>
      </Specimen>

      <Specimen
        name="Event editor (real form, sample controller)"
        file="calendar/event-editor.tsx, event-editor-sheet.tsx, event-editor-form.tsx"
        shows="Each opens the dialog (wide) or the sheet (narrow)"
      >
        <Row gap={Spacing.two}>
          <Open
            label="New event"
            onPress={() => openEditor({ event: null, defaultDay: TODAY })}
          />
          <Open
            label="Edit: Dentist"
            onPress={() =>
              openEditor({ event: SAMPLE.dentist, defaultDay: TODAY })
            }
          />
          <Open
            label="Edit: repeating (Save asks which)"
            onPress={() => openEditor({ event: recurring, defaultDay: TODAY })}
          />
          <Open
            label="Delete a repeating event (scope step)"
            onPress={() =>
              openEditor({
                event: recurring,
                defaultDay: TODAY,
                askDeleteFirst: true,
              })
            }
          />
          <Open
            label="All-day, several days"
            onPress={() =>
              openEditor({ event: SAMPLE.trip, defaultDay: DAY(5) })
            }
          />
          <Open
            label="Long title, notes, place, links"
            onPress={() =>
              openEditor({ event: SAMPLE.planning, defaultDay: DAY(1) })
            }
          />
          <Open
            label="Custom rule and foreign alert"
            onPress={() =>
              openEditor({ event: SAMPLE.bookClub, defaultDay: DAY(4) })
            }
          />
          <Open
            label="Birthday (yearly)"
            onPress={() =>
              openEditor({ event: SAMPLE.birthday, defaultDay: DAY(2) })
            }
          />
          <Open
            label="With notifications-off hint"
            onPress={() =>
              openEditor({
                event: SAMPLE.dentist,
                defaultDay: TODAY,
                alarmHint:
                  "Notifications are off, so reminders won't ring on this device.",
              })
            }
          />
          <Open
            label="A failed save"
            onPress={() =>
              openEditor({
                event: SAMPLE.dentist,
                defaultDay: TODAY,
                problem: {
                  text: 'Not saved. The calendar server didn’t answer. Your changes are still here.',
                },
              })
            }
          />
        </Row>
        <Note>
          Clear the title and press Save to see the field problem; set an end
          before the start for the times problem.
        </Note>
      </Specimen>

      <Specimen
        name="EventEditorHeader"
        file={FORM}
        shows="sheet (black band); roomy; card (the wide dialog); new / edit / all-day over days"
        bare
      >
        <HeaderSpecimen
          label="sheet, new event"
          options={{ event: null, defaultDay: TODAY }}
        />
        <HeaderSpecimen
          label="sheet, edit"
          options={{ event: SAMPLE.dentist, defaultDay: TODAY }}
        />
        <HeaderSpecimen
          label="roomy, all-day over 4 days"
          roomy
          options={{ event: SAMPLE.trip, defaultDay: DAY(5) }}
        />
        <HeaderSpecimen
          label="card (dialog), timed over two days"
          card
          roomy
          options={{ event: SAMPLE.hackathon, defaultDay: DAY(-3) }}
        />
      </Specimen>

      <Specimen
        name="EventEditorActions"
        file={FORM}
        shows="bar (sheet) and card (dialog); new vs edit (Delete); saving; failed write; the repeat question for Save and for Delete"
        bare
      >
        <ActionsSpecimen
          label="bar, new event"
          options={{ event: null, defaultDay: TODAY }}
        />
        <ActionsSpecimen
          label="bar, edit"
          options={{ event: SAMPLE.dentist, defaultDay: TODAY }}
        />
        <ActionsSpecimen
          label="card, edit, saving"
          card
          options={{ event: SAMPLE.dentist, defaultDay: TODAY, busy: true }}
        />
        <ActionsSpecimen
          label="bar, failed write"
          options={{
            event: SAMPLE.dentist,
            defaultDay: TODAY,
            problem: {
              text: 'Not saved. The server rejected the login. Check it in Settings.',
            },
          }}
        />
        <ActionsSpecimen
          label="repeat question, Save (this event not offered: the rule changed)"
          options={{
            event: recurring,
            defaultDay: TODAY,
            scopeAsk: { action: 'save', scopes: ['following', 'all'] },
          }}
        />
        <ActionsSpecimen
          label="repeat question, Delete"
          card
          options={{
            event: recurring,
            defaultDay: TODAY,
            scopeAsk: {
              action: 'delete',
              scopes: ['this', 'following', 'all'],
            },
          }}
        />
      </Specimen>

      <Specimen
        name="EventEditorFields, one column (the sheet's)"
        file={FORM}
        shows="Edit of a repeating Work event with an alert and a Zoom link"
        bare
      >
        <View style={styles.formBox}>
          <FieldsSpecimen event={SAMPLE.standup} />
        </View>
      </Specimen>

      <Specimen
        name="EventEditorFields, two columns (the dialog's), in its card"
        file={FORM}
        shows="Edit of the long event: notes, place, links. Squeezed on a narrow window, as the dialog never is."
        bare
      >
        <FieldsSpecimen event={SAMPLE.planning} columns />
      </Specimen>
    </Section>
  );
}

const styles = StyleSheet.create({
  cell: {
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  cardGround: {
    backgroundColor: Colors.dark.background,
  },
  formBox: {
    maxWidth: 560,
  },
});
