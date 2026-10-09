import { useEffect } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import type { CalEvent } from '@/caldav/types';
import {
  EventEditorActions,
  EventEditorFields,
  EventEditorHeader,
  type EditorResult,
} from '@/components/calendar/event-editor-form';
import { EventEditorSheet } from '@/components/calendar/event-editor-sheet';
import { useEventEditor } from '@/components/calendar/use-event-editor';
import { CardFrame, DashedLine } from '@/components/settings/settings-parts';
import { MODAL_ANIMATION, useBackdropFade } from '@/constants/backdrop';
import { Spacing } from '@/constants/theme';
import { useIsWide } from '@/hooks/use-is-wide';
import { useTheme } from '@/hooks/use-theme';

export type { EditorResult } from '@/components/calendar/use-event-editor';

type Props = {
  /** Event being edited, or null to create a new one. */
  event: CalEvent | null;
  /** Default day (dateString) for a new event. */
  defaultDay: string;
  onClose: () => void;
  onDone: (result: EditorResult) => void;
  /** Open on a repeating event's delete question. */
  askDeleteFirst?: boolean;
};

/**
 * Create/edit editor: one controller (use-event-editor.ts) and one set of
 * parts (event-editor-form.tsx), two shells — a centered dialog on wide
 * layouts, a bottom sheet on narrow ones (the Android app and phone-width
 * web). The controller performs the CalDAV write itself and reports the
 * outcome via onDone.
 */
export function EventEditor({
  event,
  defaultDay,
  onClose,
  onDone,
  askDeleteFirst,
}: Props) {
  const isWide = useIsWide();

  if (!isWide) {
    return (
      <EventEditorSheet
        event={event}
        defaultDay={defaultDay}
        onClose={onClose}
        onDone={onDone}
        askDeleteFirst={askDeleteFirst}
      />
    );
  }

  return (
    <EventEditorDialog
      event={event}
      defaultDay={defaultDay}
      onClose={onClose}
      onDone={onDone}
      askDeleteFirst={askDeleteFirst}
    />
  );
}

/** Wide-layout shell: header, scrolling fields, and the action bar stacked
 *  in a centered card. */
function EventEditorDialog({
  event,
  defaultDay,
  onClose,
  onDone,
  askDeleteFirst,
}: Props) {
  const theme = useTheme();
  const fade = useBackdropFade();
  const editor = useEventEditor({ event, defaultDay, onDone, askDeleteFirst });
  // Cmd/Ctrl+Enter saves from any field, as in a mail composer; Esc goes back
  // one step through the modal: out of the repeat question, then closed. Re-subscribed whenever save changes, so the
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
    <Modal
      visible
      transparent
      animationType={MODAL_ANIMATION}
      onRequestClose={scopeAsk ? editor.cancelScope : onClose}
    >
      <View style={[styles.backdrop, fade]}>
        {/* A click outside the card steps back, as Escape does: out of the
            repeat question first, then closed. A layer behind the card, not
            around it, and not a keyboard stop (the popover's, too). */}
        <Pressable
          style={[StyleSheet.absoluteFill, styles.dismiss]}
          onPress={scopeAsk ? editor.cancelScope : onClose}
          focusable={false}
          accessibilityLabel="Close"
        />
        <CardFrame
          style={[styles.card, { backgroundColor: theme.background }]}
          testID="event-editor"
        >
          <EventEditorHeader editor={editor} roomy card />
          <DashedLine />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.fieldsScroll}
          >
            <EventEditorFields
              editor={editor}
              autoFocusTitle={!event}
              columns
            />
          </ScrollView>
          <DashedLine />
          <EventEditorActions editor={editor} onClose={onClose} card />
        </CardFrame>
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
  // Solid at zero width: Chrome draws its 'auto' focus ring whatever the width
  // says, so the style has to change too.
  dismiss: {
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
  // When nothing in the form holds the focus (the delete question of a repeating
  // event), the dialog hands it to this scroll area, and Chrome rings it.
  fieldsScroll: {
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
  // The settings card's frame (accent bar, dotted top, hard shadow), wide
  // enough for two columns of fields.
  card: {
    width: '100%',
    maxWidth: 840,
    maxHeight: '90%',
    boxShadow: '4px 4px 0px rgba(0, 0, 0, 0.75)',
  },
});
