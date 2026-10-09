import { useEffect, useState } from 'react';
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

/** A Modal's own animation. On the web it is `none`: a modal that fades in
 *  does it by changing its opacity, and a backdrop filter inside a partly
 *  transparent ancestor blurs nothing until the fade has finished, so the
 *  blur arrived a moment after the dialog. The dim and the blur fade
 *  themselves instead (useBackdropFade). */
export const MODAL_ANIMATION = Platform.OS === 'web' ? 'none' : 'fade';

/** How long the dim and the blur take to come in. */
const FADE_MS = 160;

const CLEAR = {
  backgroundColor: 'rgba(0, 0, 0, 0)',
  backdropFilter: 'blur(0px)',
  WebkitBackdropFilter: 'blur(0px)',
} as unknown as ViewStyle;

const SHOWN = {
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  transitionProperty:
    'background-color, backdrop-filter, -webkit-backdrop-filter',
  transitionDuration: `${FADE_MS}ms`,
  transitionTimingFunction: 'ease-out',
} as unknown as ViewStyle;

/**
 * The backdrop's dim and blur, faded in together on the web: clear on the
 * first frame, then on, with a CSS transition in between. A phone has the
 * Modal's own fade and nothing here.
 */
export function useBackdropFade(): ViewStyle | null {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // After the clear frame has painted, or there is nothing to transition from.
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => setOn(true))
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  if (Platform.OS !== 'web') return null;
  return on ? SHOWN : CLEAR;
}
