// Tell the browser that Satoshi_bold is bold. expo-font registers every
// family with no weight, so the browser took Satoshi_bold for a regular face:
// asked for bold (the bold label styles name the bold file AND weight 700),
// it thickened the already-bold letters itself, a smudged double bold the
// phone never shows. Declared here at 700, both as Satoshi_bold and as the
// bold half of Satoshi, the browser uses the real letters for any bold
// request; global.css turns faking off altogether. Native twin:
// font-faces.ts.
import { Asset } from 'expo-asset';

let declared = false;

export function declareBoldFace(): void {
  if (declared || typeof document === 'undefined') return;
  declared = true;
  const bold = Asset.fromModule(
    require('../../assets/fonts/Satoshi_bold.otf')
  ).uri;
  const medium = Asset.fromModule(
    require('../../assets/fonts/Satoshi_medium.otf')
  ).uri;
  const face = (family: string, uri: string, weight: number) =>
    `@font-face{font-family:${JSON.stringify(family)};src:url(${JSON.stringify(uri)});font-weight:${weight};font-display:swap}`;
  const style = document.createElement('style');
  // Satoshi_medium the same way, at 500 (the grid's event text).
  style.textContent =
    face('Satoshi', bold, 700) +
    face('Satoshi_bold', bold, 700) +
    face('Satoshi_medium', medium, 500);
  document.head.appendChild(style);
}
