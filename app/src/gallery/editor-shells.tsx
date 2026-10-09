// THROWAWAY gallery (see app/src/gallery/REVERT.md). The event editor's two
// shells, copied from calendar/event-editor.tsx (centred dialog) and
// calendar/event-editor-sheet.tsx (bottom sheet) and driven by the sample
// controller. The real shells build their own controller (useEventEditor),
// which reads the account's calendars and writes to the server, so they
// cannot be handed sample data. The parts inside (header, fields, actions)
// are the real ones.
import {
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetScrollView,
  useBottomSheetModal,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EventEditorActions,
  EventEditorFields,
  EventEditorHeader,
} from '@/components/calendar/event-editor-form';
import { HEADER_GROUND } from '@/components/calendar/month-header';
import type { EventEditorController } from '@/components/calendar/use-event-editor';
import { CardFrame, DashedLine } from '@/components/settings/settings-parts';
import { BACKDROP_BLUR, MODAL_ANIMATION } from '@/constants/backdrop';
import { AccentColor, Spacing } from '@/constants/theme';
import { useEscapeKey } from '@/hooks/use-escape-key';
import { useIsWide } from '@/hooks/use-is-wide';
import { useTheme } from '@/hooks/use-theme';

import { useSampleEditor, type SampleEditorOptions } from './sample-editor';

/** As EventEditor: the dialog when wide, the sheet when narrow. */
export function SampleEventEditor(
  props: SampleEditorOptions & { onClose: () => void }
) {
  const isWide = useIsWide();
  return isWide ? <SampleDialog {...props} /> : <SampleSheet {...props} />;
}

function SampleDialog({
  onClose,
  ...options
}: SampleEditorOptions & { onClose: () => void }) {
  const theme = useTheme();
  const editor = useSampleEditor(options);
  return (
    <Modal
      visible
      transparent
      animationType={MODAL_ANIMATION}
      onRequestClose={editor.scopeAsk ? editor.cancelScope : onClose}
    >
      <View style={[styles.backdrop, BACKDROP_BLUR]}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.dismiss]}
          onPress={editor.scopeAsk ? editor.cancelScope : onClose}
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
              autoFocusTitle={!options.event}
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

function Backdrop({ animatedIndex, style }: BottomSheetBackdropProps) {
  const { dismiss } = useBottomSheetModal();
  const shown = useAnimatedStyle(() => ({
    opacity: animatedIndex.value > -0.95 ? 1 : 0,
  }));
  return (
    <Animated.View style={[style, styles.sheetBackdrop, shown, BACKDROP_BLUR]}>
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

type Store = {
  get: () => { editor: EventEditorController; onClose: () => void };
  set: (next: { editor: EventEditorController; onClose: () => void }) => void;
  subscribe: (fn: () => void) => () => void;
};

function createStore(initial: ReturnType<Store['get']>): Store {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      value = next;
      listeners.forEach((fn) => fn());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

function makeFooter(store: Store, bottomInset: number) {
  return function SheetFooter(props: BottomSheetFooterProps) {
    const { editor, onClose } = useSyncExternalStore(
      store.subscribe,
      store.get
    );
    return (
      <BottomSheetFooter {...props}>
        <EventEditorActions
          editor={editor}
          onClose={onClose}
          bottomInset={bottomInset}
        />
      </BottomSheetFooter>
    );
  };
}

function makeHandle(store: Store) {
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

function SampleSheet({
  onClose,
  ...options
}: SampleEditorOptions & { onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const titleRef = useRef<TextInput>(null);
  const editor = useSampleEditor(options);
  const { height } = useWindowDimensions();
  const [store] = useState(() => createStore({ editor, onClose: () => {} }));
  const [Footer] = useState(() => makeFooter(store, insets.bottom));
  const [Handle] = useState(() => makeHandle(store));
  useEffect(() => {
    store.set({ editor, onClose: () => sheetRef.current?.dismiss() });
  });
  useEffect(() => {
    sheetRef.current?.present();
  }, []);
  // As the real sheet: on the web the clipped host must never scroll to a
  // caret, or the header slides off the top.
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
  useEscapeKey(() =>
    editor.scopeAsk ? editor.cancelScope() : sheetRef.current?.dismiss()
  );
  return (
    <BottomSheetModal
      ref={sheetRef}
      onDismiss={onClose}
      enableDynamicSizing
      maxDynamicContentSize={height - insets.top}
      topInset={insets.top}
      enablePanDownToClose
      enableContentPanningGesture={false}
      enableBlurKeyboardOnGesture
      backdropComponent={Backdrop}
      footerComponent={Platform.OS === 'web' ? undefined : Footer}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustPan"
      backgroundStyle={{ backgroundColor: theme.background, borderRadius: 0 }}
      handleComponent={Handle}
    >
      <BottomSheetScrollView
        testID="event-editor"
        keyboardShouldPersistTaps="handled"
        enableFooterMarginAdjustment={Platform.OS !== 'web'}
      >
        <EventEditorFields editor={editor} titleRef={titleRef} />
        {Platform.OS === 'web' && (
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.three,
  },
  dismiss: {
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
  fieldsScroll: {
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
  card: {
    width: '100%',
    maxWidth: 840,
    maxHeight: '90%',
    boxShadow: '4px 4px 0px rgba(0, 0, 0, 0.75)',
  },
  webActions: {
    position: 'sticky' as 'relative',
    bottom: 0,
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
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
