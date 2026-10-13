import * as Sharing from 'expo-sharing';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/** What a month picture is on this platform: a PNG file's address. */
export type MonthPicture = string;

export type MonthShareResult = 'shared' | 'copied' | 'saved' | 'failed';

/** Pixels per point in the picture: the same as the web's, so a month copied
 *  on the desktop and one shared from the phone come out the same size. */
const PIXEL_RATIO = 2;

/** Draw the mounted picture view (see MonthPicture) into a PNG file. */
export async function captureMonth(view: View): Promise<MonthPicture> {
  // Captured as is, it would be the phone's own density (3.5x on some), a
  // larger file than the desktop's for the same picture.
  const { width, height } = await new Promise<{
    width: number;
    height: number;
  }>((resolve) =>
    view.measure((_x, _y, w, h) => resolve({ width: w, height: h }))
  );
  return captureRef(view, {
    format: 'png',
    result: 'tmpfile',
    width: Math.round(width * PIXEL_RATIO),
    height: Math.round(height * PIXEL_RATIO),
  });
}

/**
 * Hand the picture on: Android's share sheet, which also offers Copy. Started
 * at the tap, before the picture exists, to match the web (where the
 * clipboard must be asked within the tap); here it simply waits for it.
 */
export async function deliverMonth(
  picture: Promise<MonthPicture>,
  title: string
): Promise<MonthShareResult> {
  try {
    await Sharing.shareAsync(await picture, {
      mimeType: 'image/png',
      dialogTitle: title,
    });
    return 'shared';
  } catch {
    return 'failed';
  }
}
