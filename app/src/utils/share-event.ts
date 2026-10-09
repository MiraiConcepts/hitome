import { Platform, Share } from 'react-native';

import type { CalEvent } from '@/caldav/types';
import { eventShareText } from '@/utils/event-text';

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Copy through a hidden field, for a page the clipboard API refuses. */
function copyBySelection(text: string): boolean {
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(field);
    return ok;
  } catch {
    return false;
  }
}

async function shareOnWeb(text: string, title: string): Promise<ShareResult> {
  // The browser's own share sheet where it has one (phones, Safari, some
  // desktops); otherwise the text goes to the clipboard and the caller says so.
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError')
        return 'cancelled';
      // Refused for another reason: fall back to copying.
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return copyBySelection(text) ? 'copied' : 'failed';
  }
}

/** Share one event as text: the system sheet on Android, the browser's or the
 *  clipboard on the web. */
export async function shareEvent(event: CalEvent): Promise<ShareResult> {
  const text = eventShareText(event);
  if (Platform.OS === 'web')
    return shareOnWeb(text, event.summary.trim() || '(untitled)');
  try {
    const result = await Share.share({ message: text });
    return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
  } catch {
    return 'failed';
  }
}
