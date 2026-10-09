import { useEffect, useRef, useState } from 'react';
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
  editorName,
  EventEditorActions,
  EventEditorFields,
  EventEditorHeader,
  type EditorResult,
} from '@/components/calendar/event-editor-form';
import { EventEditorSheet } from '@/components/calendar/event-editor-sheet';
import {
  useEventEditor,
  type EventEditorController,
} from '@/components/calendar/use-event-editor';
import { CardFrame, DashedLine } from '@/components/settings/settings-parts';
import { BACKDROP_BLUR, MODAL_ANIMATION } from '@/constants/backdrop';
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
 *
 * The controller lives here, above the shells: a window resized across the
 * breakpoint swaps dialog for sheet (or back) with what was typed, an open
 * question and a running Save all intact.
 */
export function EventEditor({
  event,
  defaultDay,
  onClose,
  onDone,
  askDeleteFirst,
}: Props) {
  const isWide = useIsWide();
  const editor = useEventEditor({ event, defaultDay, onDone, askDeleteFirst });
  useFocusReturn();

  if (!isWide) {
    return <EventEditorSheet editor={editor} onClose={onClose} />;
  }

  return <EventEditorDialog editor={editor} onClose={onClose} />;
}

/**
 * Web: focus goes back to what opened the editor (the day cell, the chip)
 * once it closes, as the day list's does. Read during the first render,
 * before the title's autofocus moves it; the dialog's own trap remembers the
 * element focused when it mounted, which is that title, gone by then.
 */
function useFocusReturn() {
  const [opener] = useState(() =>
    Platform.OS === 'web' && typeof document !== 'undefined'
      ? document.activeElement
      : null
  );
  const open = useRef(false);
  useEffect(() => {
    if (!(opener instanceof HTMLElement) || opener === document.body) return;
    open.current = true;
    return () => {
      open.current = false;
      // A beat later, and only if still closed: a development remount
      // (strict mode runs this cleanup once at mount) must not pull the
      // focus out of the title.
      setTimeout(() => {
        if (!open.current && opener.isConnected)
          opener.focus({ preventScroll: true });
      }, 0);
    };
  }, [opener]);
}

type ShellProps = {
  editor: EventEditorController;
  onClose: () => void;
};

/** Wide-layout shell: header, scrolling fields, and the action bar stacked
 *  in a centered card. */
function EventEditorDialog({ editor, onClose }: ShellProps) {
  const theme = useTheme();
  const { event } = editor;
  // Cmd/Ctrl+Enter saves from any field, as in a mail composer; Esc goes back
  // one step through the modal: out of an open question, then (asking first
  // when something changed) closed. Re-subscribed whenever save changes, so
  // the listener always saves the form as it stands.
  const { save, busy, scopeAsk, discardAsk } = editor;
  const dismiss = () => {
    if (editor.requestDismiss()) onClose();
  };
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
      if (busy || scopeAsk || discardAsk) return;
      e.preventDefault();
      save();
    };
    // Capture phase: the title field handles Enter itself (submit and blur)
    // and stops it there, so a bubbling listener never hears it.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [save, busy, scopeAsk, discardAsk]);
  return (
    <Modal
      visible
      transparent
      animationType={MODAL_ANIMATION}
      onRequestClose={dismiss}
      // RN Web passes this to its role=dialog box: the header's words.
      aria-label={editorName(editor)}
    >
      <View style={[styles.backdrop, BACKDROP_BLUR]}>
        {/* A click outside the card steps back, as Escape does: out of an
            open question first, then closed (asking first when something
            changed). A layer behind the card, not around it, and not a
            keyboard stop (the popover's, too). */}
        <Pressable
          style={[StyleSheet.absoluteFill, styles.dismiss]}
          onPress={dismiss}
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
