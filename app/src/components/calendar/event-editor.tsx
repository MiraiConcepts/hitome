import { useEffect } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';

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
import { Colors, Spacing } from '@/constants/theme';
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
  // Cmd/Ctrl+Enter saves from any field, as in a mail composer; Esc already
  // closes through the modal. Re-subscribed whenever save changes, so the
  // listener always saves the form as it stands.
  const { save, busy, scopeAsk } = editor;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
      if (busy || scopeAsk) return;
      e.preventDefault();
      save();
    };
    // Capture phase: the title field handles Enter itself (submit and blur)
    // and stops it there, so a bubbling listener never hears it.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [save, busy, scopeAsk]);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView style={styles.card} testID="event-editor">
          <EventEditorHeader editor={editor} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <EventEditorFields
              editor={editor}
              autoFocusTitle={!event}
              columns
            />
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
  // Wide enough for two columns of fields. The edge is drawn because the
  // header's black ground is the dimmed backdrop's colour: without it the
  // date title looked to float above the card.
  card: {
    overflow: 'hidden',
    width: '100%',
    maxWidth: 840,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: Colors.dark.ruleStrong,
  },
});
