// THROWAWAY gallery (see app/src/gallery/REVERT.md). Opens the day list and
// the editor over the gallery as the month screen opens them over the grid,
// and answers their outcomes with the month screen's toasts.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { CalEvent } from '@/caldav/types';
import { DayPopover } from '@/components/calendar/day-popover';
import type { EditorResult } from '@/components/calendar/use-event-editor';
import {
  CalendarPlusIcon,
  CheckIcon,
  RefreshIcon,
  TrashIcon,
} from '@/components/icons';

import { shareEvent } from '@/utils/share-event';

import { SampleEventEditor } from './editor-shells';
import { useGalleryToast } from './parts';
import type { SampleEditorOptions } from './sample-editor';
import { TODAY } from './sample-data';

type EditorRequest = Omit<SampleEditorOptions, 'onDone'>;

type Overlays = {
  openDay: (day: string, events: CalEvent[]) => void;
  openEditor: (request: EditorRequest) => void;
};

const OverlayContext = createContext<Overlays>({
  openDay: () => {},
  openEditor: () => {},
});

export function useOverlays() {
  return useContext(OverlayContext);
}

/** What the month screen says after the editor closes. */
export function toastFor(result: EditorResult) {
  if (result === 'created')
    return { message: 'Event added', icon: CalendarPlusIcon };
  if (result === 'updated') return { message: 'Saved', icon: CheckIcon };
  if (result === 'conflict')
    return {
      message: 'Event changed elsewhere. List refreshed',
      icon: RefreshIcon,
    };
  return {
    icon: TrashIcon,
    message:
      result.scope === 'this'
        ? 'Occurrence deleted'
        : result.scope === 'following'
          ? 'Following occurrences deleted'
          : 'Event deleted',
    action: 'Undo',
  };
}

export function OverlayHost({ children }: { children: ReactNode }) {
  const toast = useGalleryToast();
  const [day, setDay] = useState<{ day: string; events: CalEvent[] } | null>(
    null
  );
  const [editor, setEditor] = useState<
    (EditorRequest & { key: number }) | null
  >(null);
  const openEditor = useCallback((request: EditorRequest) => {
    setDay(null);
    setEditor((prev) => ({ ...request, key: (prev?.key ?? 0) + 1 }));
  }, []);
  const value = useMemo<Overlays>(
    () => ({
      openDay: (d, events) => setDay({ day: d, events }),
      openEditor,
    }),
    [openEditor]
  );
  return (
    <OverlayContext.Provider value={value}>
      {children}
      {day && (
        <DayPopover
          day={day.day}
          events={day.events}
          onClose={() => setDay(null)}
          onPressEvent={(event) => openEditor({ event, defaultDay: day.day })}
          onDelete={(event) => {
            if (event.recurring) {
              openEditor({ event, defaultDay: day.day, askDeleteFirst: true });
              return;
            }
            setDay(null);
            toast({
              icon: TrashIcon,
              message: 'Event deleted',
              action: 'Undo',
            });
          }}
          onShare={async (event) => {
            // The real share: the system sheet, or the clipboard (then a toast).
            if ((await shareEvent(event)) === 'copied') {
              setDay(null);
              toast({ icon: CheckIcon, message: 'Copied to clipboard' });
            }
          }}
          onAdd={() => openEditor({ event: null, defaultDay: day.day })}
        />
      )}
      {editor && (
        <SampleEventEditor
          key={editor.key}
          event={editor.event}
          askDeleteFirst={editor.askDeleteFirst}
          scopeAsk={editor.scopeAsk}
          problem={editor.problem}
          alarmHint={editor.alarmHint}
          busy={editor.busy}
          defaultAlert={editor.defaultAlert}
          defaultDay={editor.defaultDay ?? TODAY}
          onClose={() => setEditor(null)}
          onDone={(result) => {
            setEditor(null);
            toast(toastFor(result));
          }}
        />
      )}
    </OverlayContext.Provider>
  );
}
