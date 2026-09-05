import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import type { CalEvent } from '@/caldav/types';
import {
  EventEditorActions,
  EventEditorFields,
  EventEditorHeader,
  type EditorResult,
} from '@/components/calendar/event-editor-form';
import { EventEditorSheet } from '@/components/calendar/event-editor-sheet';
import { useEventEditor } from '@/components/calendar/use-event-editor';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useIsWide } from '@/hooks/use-is-wide';

export type { EditorResult } from '@/components/calendar/use-event-editor';

type Props = {
  /** Event being edited, or null to create a new one. */
  event: CalEvent | null;
  /** Default day (dateString) for a new event. */
  defaultDay: string;
  onClose: () => void;
  onDone: (result: EditorResult) => void;
};

/**
 * Create/edit editor: one controller (use-event-editor.ts) and one set of
 * parts (event-editor-form.tsx), two shells — a centered dialog on wide
 * layouts, a bottom sheet on narrow ones (the Android app and phone-width
 * web). The controller performs the CalDAV write itself and reports the
 * outcome via onDone.
 */
export function EventEditor({ event, defaultDay, onClose, onDone }: Props) {
  const isWide = useIsWide();

  if (!isWide) {
    return (
      <EventEditorSheet
        event={event}
        defaultDay={defaultDay}
        onClose={onClose}
        onDone={onDone}
      />
    );
  }

  return (
    <EventEditorDialog
      event={event}
      defaultDay={defaultDay}
      onClose={onClose}
      onDone={onDone}
    />
  );
}

/** Wide-layout shell: header, scrolling fields, and the action bar stacked
 *  in a centered card. */
function EventEditorDialog({ event, defaultDay, onClose, onDone }: Props) {
  const editor = useEventEditor({ event, defaultDay, onDone });
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView style={styles.card} testID="event-editor">
          <EventEditorHeader editor={editor} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <EventEditorFields editor={editor} autoFocusTitle={!event} />
          </ScrollView>
          <EventEditorActions editor={editor} onClose={onClose} />
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.three,
  },
  card: {
    borderRadius: Spacing.one,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
  },
});
