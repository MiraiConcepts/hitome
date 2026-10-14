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
  TelescopeIcon,
  RefreshIcon,
  TrashIcon,
} from '@/components/icons';

import { shareEvent } from '@/utils/share-event';

import { Messages } from '@/constants/messages';

import { SampleEventEditor } from './editor-shells';
import { useGalleryToast } from './parts';
import type { SampleEditorOptions } from './sample-editor';
import { TODAY } from './sample-data';

type EditorRequest = Omit<SampleEditorOptions, 'onDone'>;

type Overlays = {
  /** `discover`: the list as discover mode shows it (going boxes). */
  openDay: (day: string, events: CalEvent[], discover?: boolean) => void;
  openEditor: (request: EditorRequest) => void;
};

const OverlayContext = createContext<Overlays>({
  openDay: () => {},
  openEditor: () => {},
});

export function useOverlays() {
  return useContext(OverlayContext);
}

/** What the month screen says after the editor closes (sample calendar:
 *  Personal). */
export function toastFor(result: EditorResult) {
  if (result === 'created')
    return { message: Messages.added('Personal'), icon: CalendarPlusIcon };
  if (result === 'updated')
    return { message: Messages.saved('Personal'), icon: CheckIcon };
  if (result === 'conflict')
    return { message: Messages.changedElsewhere, icon: RefreshIcon };
  return {
    icon: TrashIcon,
    message:
      result.scope === 'all'
        ? Messages.deleted('Personal')
        : Messages.removed('Personal'),
    action: 'Undo',
  };
}

export function OverlayHost({ children }: { children: ReactNode }) {
  const toast = useGalleryToast();
  const [day, setDay] = useState<{
    day: string;
    events: CalEvent[];
    discover?: boolean;
  } | null>(null);
  // Discover mode's answers on this page only, by event id.
  const [going, setGoing] = useState<Record<string, boolean>>({});
  const [editor, setEditor] = useState<
    (EditorRequest & { key: number }) | null
  >(null);
  const openEditor = useCallback((request: EditorRequest) => {
    setDay(null);
    setEditor((prev) => ({ ...request, key: (prev?.key ?? 0) + 1 }));
  }, []);
  const value = useMemo<Overlays>(
    () => ({
      openDay: (d, events, discover) => setDay({ day: d, events, discover }),
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
              message: Messages.deleted('Personal'),
              action: 'Undo',
            });
          }}
          onShare={async (event) => {
            // The real share: the system sheet, or the clipboard (then a toast).
            if ((await shareEvent(event)) === 'copied') {
              setDay(null);
              toast({ icon: CheckIcon, message: Messages.eventCopied });
            }
          }}
          onAdd={() => openEditor({ event: null, defaultDay: day.day })}
          discover={
            day.discover
              ? {
                  isGoing: (event) => going[event.id] ?? !event.free,
                  onToggle: (event) => {
                    const next = !(going[event.id] ?? !event.free);
                    setGoing((g) => ({ ...g, [event.id]: next }));
                    toast({
                      icon: next ? CheckIcon : TelescopeIcon,
                      message: (next ? Messages.going : Messages.notGoing)(
                        event.summary
                      ),
                      action: 'Undo',
                    });
                  },
                  onOpen: (event) =>
                    toast({
                      icon: CheckIcon,
                      message: `Opens ${event.summary}'s page`,
                    }),
                }
              : undefined
          }
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
