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
  const uri = Asset.fromModule(
    require('../../assets/fonts/Satoshi_bold.otf')
  ).uri;
  const face = (family: string) =>
    `@font-face{font-family:${JSON.stringify(family)};src:url(${JSON.stringify(uri)});font-weight:700;font-display:swap}`;
  const style = document.createElement('style');
  style.textContent = face('Satoshi') + face('Satoshi_bold');
  document.head.appendChild(style);
}
