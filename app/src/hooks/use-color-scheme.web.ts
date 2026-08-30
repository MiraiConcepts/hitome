import type { ColorSchemeName } from 'react-native';

/**
 * Web is pinned to the dark palette, whatever the OS says.
 *
 * The calendar is drawn dark-first — black header block, accent-orange ink,
 * dark out-of-month fills lifted from the home-screen widget — and those are
 * fixed colors, not theme lookups. Following a light OS setting therefore only
 * produced a half-light screen: white day cells under a black header, with
 * near-black neighbouring-month cells punched through them. One scheme, one
 * design. (Native still follows the system.)
 */
export function useColorScheme(): ColorSchemeName {
  return 'dark';
}
