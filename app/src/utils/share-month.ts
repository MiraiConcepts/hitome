import * as Sharing from 'expo-sharing';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/** What a month picture is on this platform: a PNG file's address. */
export type MonthPicture = string;

export type MonthShareResult = 'shared' | 'copied' | 'saved' | 'failed';

/** Draw the mounted picture view (see MonthPicture) into a PNG file. */
export function captureMonth(view: View): Promise<MonthPicture> {
  return captureRef(view, { format: 'png', result: 'tmpfile' });
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
