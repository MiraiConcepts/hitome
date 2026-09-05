import {
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
  type BottomSheetScrollViewMethods,
} from '@gorhom/bottom-sheet';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  BackHandler,
  Keyboard,
  Platform,
  StyleSheet,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CalEvent } from '@/caldav/types';
import {
  EventEditorActions,
  EventEditorFields,
  EventEditorHeader,
  type EditorResult,
} from '@/components/calendar/event-editor-form';
import { HEADER_GROUND } from '@/components/calendar/month-header';
import {
  useEventEditor,
  type EventEditorController,
} from '@/components/calendar/use-event-editor';
import { AccentColor, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  event: CalEvent | null;
  defaultDay: string;
  onClose: () => void;
  onDone: (result: EditorResult) => void;
};

// BottomSheetTextInput's keyboard hooks call native TextInput.State APIs that
// react-native-web doesn't implement (crashes on blur) — and the browser
// manages its own keyboard anyway, so the plain input is correct on web.
const SheetTextInput = Platform.OS === 'web' ? TextInput : BottomSheetTextInput;

function Backdrop(props: BottomSheetBackdropProps) {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      pressBehavior="close"
    />
  );
}

/**
 * The footer is rendered by the sheet itself (via `footerComponent`), inside
 * a portal that does not carry React context from this tree, and a fresh
 * component identity per render would remount it on every keystroke. So the
 * footer is one stable component that reads its props from a tiny external
 * store this shell keeps current from an effect.
 */
type FooterProps = { editor: EventEditorController; onClose: () => void };

function createFooterStore(initial: FooterProps) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: FooterProps) {
      value = next;
      listeners.forEach((fn) => fn());
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

/** Whether the soft keyboard is up (always false on web, which has no
 *  keyboard events — and no gesture bar to inset for). */
function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

function makeFooter(
  store: ReturnType<typeof createFooterStore>,
  bottomInset: number
) {
  return function SheetFooter(props: BottomSheetFooterProps) {
    const { editor, onClose } = useSyncExternalStore(
      store.subscribe,
      store.get
    );
    // The gesture-bar inset is padding inside the bar rather than the
    // footer's own bottomInset, so the bar's ground runs to the sheet's edge
    // instead of leaving a strip where the fields show through beneath it.
    // Riding above the keyboard there is no bar to clear, so it drops.
    const keyboardShown = useKeyboardShown();
    return (
      <BottomSheetFooter {...props}>
        <EventEditorActions
          editor={editor}
          onClose={onClose}
          bottomInset={keyboardShown ? 0 : bottomInset}
        />
      </BottomSheetFooter>
    );
  };
}

/**
 * Narrow-layout shell: the editor in a bottom sheet (drag-to-dismiss,
 * keyboard-aware). The header is pinned at the top of the scroll and the
 * action bar is the sheet's footer, which rides above the keyboard — Save
 * stays in reach while typing. Mounted only while open — presents itself on
 * mount and reports every dismissal path through onClose.
 */
export function EventEditorSheet({
  event,
  defaultDay,
  onClose,
  onDone,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const titleRef = useRef<TextInput>(null);
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null);
  // onChange also fires when the form's height changes (a repeat preset
  // unfolding its end options); the title is focused on the first settle only.
  const focusedTitle = useRef(false);
  const editor = useEventEditor({ event, defaultDay, onDone });
  const { height } = useWindowDimensions();

  // Cancel dismisses the sheet; onDismiss then reports onClose, the same
  // path a drag-down or backdrop tap takes. The real handler lands from the
  // effect (it reads the sheet ref, which render must not).
  const [store] = useState(() =>
    createFooterStore({ editor, onClose: () => {} })
  );
  const [Footer] = useState(() => makeFooter(store, insets.bottom));
  useEffect(() => {
    store.set({ editor, onClose: () => sheetRef.current?.dismiss() });
  });

  useEffect(() => {
    sheetRef.current?.present();
  }, []);

  // The sheet lifts for the keyboard but does not scroll to the focused
  // input, so the fields at the tail of the form (location, notes) would sit
  // under it. Focusing one scrolls the form to its end once the keyboard is
  // up — or at once, if it already is (hopping from one tail field to the
  // other raises no second keyboardDidShow).
  function revealTail() {
    const scrollToEnd = () =>
      scrollRef.current?.scrollToEnd({ animated: true });
    if (Platform.OS === 'web' || Keyboard.isVisible()) {
      scrollToEnd();
      return;
    }
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      sub.remove();
      scrollToEnd();
    });
  }

  // The library leaves the Android back button to us (predictive back is off
  // in app.json, so BackHandler is reliable).
  //
  // Claiming the press unconditionally swallowed every one that landed during
  // the dismiss animation: `dismiss()` on a sheet already on its way out is a
  // no-op, and this handler stays mounted until onDismiss unmounts it. Backing
  // out at thumb speed — press to close the sheet, press again to leave —
  // therefore ate the second press, and the app appeared to ignore the back
  // button for a beat. Only the press that starts the dismissal is ours; once
  // it is running, later presses fall through to the system and exit.
  const dismissing = useRef(false);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dismissing.current) return false;
      dismissing.current = true;
      sheetRef.current?.dismiss();
      return true;
    });
    return () => sub.remove();
  }, []);

  return (
    <BottomSheetModal
      ref={sheetRef}
      onDismiss={onClose}
      // A new event starts in the title — once the sheet has settled, so the
      // keyboard rises under a resting sheet rather than a moving one.
      onChange={(index) => {
        if (index < 0) return;
        // Settled open again — a dismissal that did not take (a pan-down let
        // go short of the threshold). Back is ours once more.
        dismissing.current = false;
        if (event || focusedTitle.current) return;
        focusedTitle.current = true;
        titleRef.current?.focus();
      }}
      enableDynamicSizing
      maxDynamicContentSize={height * 0.9}
      // Lifted for the keyboard, the sheet stops under the status bar rather
      // than behind it (edge-to-edge gives it the whole screen otherwise).
      topInset={insets.top}
      enablePanDownToClose
      enableBlurKeyboardOnGesture
      backdropComponent={Backdrop}
      // Native only: the footer rides above the keyboard there. On web the
      // library sizes the sheet before the footer has measured and never
      // grows it, hiding the last field — and there is no keyboard to ride
      // above — so web puts the action bar in flow at the end of the form.
      footerComponent={Platform.OS === 'web' ? undefined : Footer}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      // adjustPan, not adjustResize: under edge-to-edge (the SDK default)
      // Android never resizes the window for the keyboard, and the library's
      // adjustResize branch then zeroes the keyboard height — the sheet sits
      // still and the keyboard covers the lower fields and the footer. With
      // adjustPan it measures the keyboard itself and lifts sheet + footer.
      android_keyboardInputMode="adjustPan"
      backgroundStyle={{
        backgroundColor: theme.background,
        borderRadius: Spacing.one,
      }}
      // The grab handle sits on the header's black ground, so handle and
      // header read as one bar — the month header and weekday row's trick.
      handleStyle={styles.handle}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetScrollView
        ref={scrollRef}
        testID="event-editor"
        stickyHeaderIndices={[0]}
        keyboardShouldPersistTaps="handled"
        // Pads the content by the footer's live height (gesture-bar inset
        // and any error line included), so the last field scrolls clear of
        // the action bar. Only where there is a footer: with none, the
        // library pads by its unset sentinel and the content collapses.
        enableFooterMarginAdjustment={Platform.OS !== 'web'}
      >
        <EventEditorHeader editor={editor} />
        <EventEditorFields
          editor={editor}
          TextInputComponent={SheetTextInput}
          titleRef={titleRef}
          onFocusTail={revealTail}
        />
        {Platform.OS === 'web' && (
          <EventEditorActions
            editor={editor}
            onClose={() => sheetRef.current?.dismiss()}
          />
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  handle: {
    backgroundColor: HEADER_GROUND,
    borderTopLeftRadius: Spacing.one,
    borderTopRightRadius: Spacing.one,
  },
  handleIndicator: {
    backgroundColor: AccentColor,
    width: 36,
    height: 4,
  },
});
