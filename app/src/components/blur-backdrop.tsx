import { BlurTargetView, BlurView } from 'expo-blur';
import {
  createContext,
  useContext,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';

/**
 * Android blurs only what it is told to: a BlurView draws a blurred copy of a
 * BlurTargetView's content. So the app's screens sit in one target, and the
 * dialogs that dim them are drawn outside it (the popover in a portal, the
 * sheet's backdrop in the sheet host), each with a BlurView aimed at it. A
 * React Native Modal is a window of its own, which no target can reach.
 * Elsewhere none of this applies: the web blurs with CSS (BACKDROP_BLUR) and
 * there is no iOS build.
 */
const TargetContext = createContext<RefObject<View | null> | null>(null);

/** Holds the target's ref for everything below, the portals included. */
export function BlurTargetProvider({ children }: { children: ReactNode }) {
  const ref = useRef<View | null>(null);
  return (
    <TargetContext.Provider value={ref}>{children}</TargetContext.Provider>
  );
}

/** The content that a BlurBackdrop blurs: the screens, not the dialogs. */
export function BlurTarget({ children }: { children: ReactNode }) {
  const ref = useContext(TargetContext);
  if (Platform.OS !== 'android' || !ref) return <>{children}</>;
  return (
    <BlurTargetView ref={ref} style={styles.fill}>
      {children}
    </BlurTargetView>
  );
}

/**
 * A blur over the screens, filling its parent, and the dim over the blur (the
 * parent's own dim would be under it, hidden, and the screens would show
 * paler than the plain dim leaves them); nothing off Android.
 */
export function BlurBackdrop() {
  const ref = useContext(TargetContext);
  if (Platform.OS !== 'android' || !ref) return null;
  return (
    <>
      <BlurView
        blurTarget={ref}
        blurMethod="dimezisBlurViewSdk31Plus"
        tint="dark"
        intensity={20}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.dim} pointerEvents="none" />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});
