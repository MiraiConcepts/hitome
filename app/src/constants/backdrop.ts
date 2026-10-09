import { Platform, type ViewStyle } from 'react-native';

/**
 * The dim behind a dialog is blurred as well on the web, so the grid under it
 * recedes instead of competing with it. The phone's own backdrop stays a
 * plain dim: React Native has no backdrop blur there without a native module.
 * RNW forwards unknown CSS properties, as it does for the grid's scroll snap.
 */
export const BACKDROP_BLUR: ViewStyle | null =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      } as unknown as ViewStyle)
    : null;

/**
 * A Modal's own animation: none, on every platform. The dim and the blur are
 * simply there when the dialog is. (A modal that fades in does it by changing
 * its opacity, and on the web a backdrop filter inside a partly transparent
 * ancestor blurs nothing until the fade has finished, so the blur used to
 * arrive a moment after the dialog.)
 */
export const MODAL_ANIMATION = 'none';
