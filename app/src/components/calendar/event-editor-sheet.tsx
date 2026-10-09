import {
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  useBottomSheetModal,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
  type BottomSheetScrollViewMethods,
} from '@gorhom/bottom-sheet';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
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
import { BACKDROP_BLUR } from '@/constants/backdrop';
import { AccentColor } from '@/constants/theme';
import { useEscapeKey } from '@/hooks/use-escape-key';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  event: CalEvent | null;
  defaultDay: string;
  onClose: () => void;
  onDone: (result: EditorResult) => void;
  askDeleteFirst?: boolean;
};

// BottomSheetTextInput's keyboard hooks call native TextInput.State APIs that
// react-native-web doesn't implement (crashes on blur) — and the browser
// manages its own keyboard anyway, so the plain input is correct on web.
const SheetTextInput = Platform.OS === 'web' ? TextInput : BottomSheetTextInput;

/**
 * The dim behind the sheet: there from the moment the sheet starts to rise and
 * gone once it has left, a step and not the library's fade. A tap on it
 * dismisses the sheet.
 */
function Backdrop({ animatedIndex, style }: BottomSheetBackdropProps) {
  const { dismiss } = useBottomSheetModal();
  const shown = useAnimatedStyle(() => ({
    opacity: animatedIndex.value > -0.95 ? 1 : 0,
  }));
  return (
    <Animated.View style={[style, styles.backdrop, shown, BACKDROP_BLUR]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => dismiss()}
        accessibilityRole="button"
        accessibilityLabel="Close"
        focusable={false}
      />
    </Animated.View>
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
 * The grab handle with the header under it, as the sheet's handle: the bar a
 * drag closes the sheet from. The form below only ever scrolls, so a hard
 * flick to its top can't carry on into closing the sheet. Same store as the
 * footer, for the same portal reason.
 */
function makeHandle(store: ReturnType<typeof createFooterStore>) {
  return function SheetHandle() {
    const { editor } = useSyncExternalStore(store.subscribe, store.get);
    return (
      <View>
        <View style={styles.handle}>
          <View style={styles.handleIndicator} />
        </View>
        <EventEditorHeader editor={editor} />
      </View>
    );
  };
}

/**
 * Narrow-layout shell: the editor in a bottom sheet (drag-to-dismiss,
 * keyboard-aware). The header rides in the sheet's handle and the
 * action bar is the sheet's footer, which rides above the keyboard — Save
 * stays in reach while typing. Mounted only while open — presents itself on
 * mount and reports every dismissal path through onClose.
 */
export function EventEditorSheet({
  event,
  defaultDay,
  onClose,
  onDone,
  askDeleteFirst,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const titleRef = useRef<TextInput>(null);
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null);
  // onChange also fires when the form's height changes (a repeat preset
  // unfolding its end options); the title is focused on the first settle only.
  const focusedTitle = useRef(false);
  const editor = useEventEditor({ event, defaultDay, onDone, askDeleteFirst });
  const { height } = useWindowDimensions();

  // Cancel dismisses the sheet; onDismiss then reports onClose, the same
  // path a drag-down or backdrop tap takes. The real handler lands from the
  // effect (it reads the sheet ref, which render must not).
  const [store] = useState(() =>
    createFooterStore({ editor, onClose: () => {} })
  );
  const [Footer] = useState(() => makeFooter(store, insets.bottom));
  const [Handle] = useState(() => makeHandle(store));
  useEffect(() => {
    store.set({ editor, onClose: () => sheetRef.current?.dismiss() });
  });

  useEffect(() => {
    sheetRef.current?.present();
  }, []);

  // Web: the library's sheet box runs past the bottom of the window inside a
  // clipped (overflow: hidden) host, and a browser still scrolls a clipped
  // box to keep a caret in view. Typing in Notes slid the whole sheet up,
  // its header cut off at the top and a gap left below, and nothing slid it
  // back. The host never means to scroll, so it is held at the top.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const pin = (e: Event) => {
      const box = e.target;
      if (
        box instanceof HTMLElement &&
        box.scrollTop !== 0 &&
        getComputedStyle(box).overflowY === 'hidden' &&
        box.querySelector('[data-testid="event-editor"]')
      )
        box.scrollTop = 0;
    };
    document.addEventListener('scroll', pin, true);
    return () => document.removeEventListener('scroll', pin, true);
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

  // Escape on the web: out of the repeat question first, then the sheet. (A
  // phone has no such key; the back button below does the closing there.)
  useEscapeKey(() =>
    editor.scopeAsk ? editor.cancelScope() : sheetRef.current?.dismiss()
  );

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

  // After the keyboard closes the library can leave the sheet a hair off its
  // resting point, and it only lets the form scroll at rest: a new event
  // (title focused, keyboard up, then closed) would not scroll at all.
  // Settling it again on every keyboard close puts it back — after a beat,
  // because a drag can be what closed the keyboard: settled mid-drag, the
  // drag's end left the sheet halfway down with the title under the header.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!dismissing.current) sheetRef.current?.snapToIndex(0);
      }, RESETTLE_DELAY_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
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
      // Room for the whole screen below the status bar. The form fills most
      // of it anyway; capped lower, the sheet opened short of the top and
      // then jumped up the rest of the way when the title's keyboard rose.
      maxDynamicContentSize={height - insets.top}
      // Lifted for the keyboard, the sheet stops under the status bar rather
      // than behind it (edge-to-edge gives it the whole screen otherwise).
      topInset={insets.top}
      enablePanDownToClose
      // Dragged closed by its handle (header included) only: content pans
      // handed a flick that hit the top of the form on to the sheet, which
      // closed it mid-scroll.
      enableContentPanningGesture={false}
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
        // The library rounds the sheet by default; the app is square.
        borderRadius: 0,
      }}
      // The grab handle sits on the header's black ground, so handle and
      // header read as one bar — the month header and weekday row's trick.
      // Above the scroll view, not pinned inside it: a sticky header in a
      // sheet that also moves for the keyboard could slide off its place,
      // leaving a gap above it and the first field tucked under it.
      handleComponent={Handle}
    >
      <BottomSheetScrollView
        ref={scrollRef}
        testID="event-editor"
        keyboardShouldPersistTaps="handled"
        // Pads the content by the footer's live height (gesture-bar inset
        // and any error line included), so the last field scrolls clear of
        // the action bar. Only where there is a footer: with none, the
        // library pads by its unset sentinel and the content collapses.
        enableFooterMarginAdjustment={Platform.OS !== 'web'}
      >
        <EventEditorFields
          editor={editor}
          TextInputComponent={SheetTextInput}
          titleRef={titleRef}
          onFocusTail={revealTail}
        />
        {Platform.OS === 'web' && (
          // Stuck to the bottom of the form while it scrolls, as the native
          // footer is: on a long event Save had scrolled out of sight.
          <View style={styles.webActions}>
            <EventEditorActions
              editor={editor}
              onClose={() => sheetRef.current?.dismiss()}
            />
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

/** Past the end of a drag that closed the keyboard. */
const RESETTLE_DELAY_MS = 400;

const styles = StyleSheet.create({
  // A web-only position; React Native's style types do not list it.
  webActions: {
    position: 'sticky' as 'relative',
    bottom: 0,
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  // The library's default handle box: 10 above and below the indicator.
  handle: {
    backgroundColor: HEADER_GROUND,
    alignItems: 'center',
    paddingVertical: 10,
  },
  handleIndicator: {
    backgroundColor: AccentColor,
    width: 36,
    height: 4,
  },
});
