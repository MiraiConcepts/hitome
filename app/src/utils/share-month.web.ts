import { Asset } from 'expo-asset';
import { toBlob } from 'html-to-image';
import type { View } from 'react-native';

/** What a month picture is on this platform: a PNG. */
export type MonthPicture = Blob;

export type MonthShareResult = 'shared' | 'copied' | 'saved' | 'failed';

/** Pixels per CSS pixel: sharp on a high-density screen, and when zoomed. */
const PIXEL_RATIO = 2;

async function dataUrl(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let fontCss: Promise<string> | null = null;

/**
 * Satoshi for the picture, both its faces, written out here. A picture is
 * drawn apart from the page and sees only the fonts handed to it; left to
 * find them itself, the library found only the bold face (font-faces.web.ts
 * declares it in a stylesheet, while expo-font registers the regular one
 * where a stylesheet search cannot see it), and drew every word bold, wider
 * than the grid had measured, so titles were cut short.
 */
function satoshiCss(): Promise<string> {
  fontCss ??= Promise.all([
    dataUrl(Asset.fromModule(require('../../assets/fonts/Satoshi.otf')).uri),
    dataUrl(
      Asset.fromModule(require('../../assets/fonts/Satoshi_bold.otf')).uri
    ),
  ]).then(([regular, bold]) => {
    const face = (family: string, src: string, weight: number) =>
      `@font-face{font-family:${JSON.stringify(family)};src:url(${src});font-weight:${weight}}`;
    return (
      face('Satoshi', regular, 400) +
      face('Satoshi', bold, 700) +
      face('Satoshi_bold', bold, 700)
    );
  });
  fontCss.catch(() => {
    fontCss = null;
  });
  return fontCss;
}

/** Draw the mounted picture view (see MonthPicture) into a PNG. */
export async function captureMonth(view: View): Promise<MonthPicture> {
  // react-native-web hands back the element itself.
  const node = view as unknown as HTMLElement;
  // The month's type is Satoshi, loaded at run time: a picture taken before
  // it lands is set in the fallback font.
  await document.fonts?.ready;
  const blob = await toBlob(node, {
    pixelRatio: PIXEL_RATIO,
    fontEmbedCSS: await satoshiCss(),
    width: node.offsetWidth,
    height: node.offsetHeight,
    // The view waits off screen; in the picture it sits at the origin.
    style: { position: 'static', left: '0', top: '0' },
  });
  if (!blob) throw new Error('No picture');
  return blob;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Copy the picture to the clipboard, ready to paste. The clipboard is asked
 * at once, within the tap, and given the picture still being drawn: asked
 * after the drawing, a browser can refuse for want of a recent tap. Where the
 * clipboard takes no pictures, it is downloaded instead.
 */
export async function deliverMonth(
  picture: Promise<MonthPicture>,
  title: string
): Promise<MonthShareResult> {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': picture }),
    ]);
    return 'copied';
  } catch {
    try {
      download(await picture, `${title}.png`);
      return 'saved';
    } catch {
      return 'failed';
    }
  }
}
