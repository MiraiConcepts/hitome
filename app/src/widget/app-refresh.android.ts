// App-side widget refresh, fired on app open. requestWidgetUpdate only invokes
// the callback when an Agenda widget is actually on the home screen.
import { requestWidgetUpdate } from 'react-native-android-widget';

import { ensureSource } from '@/config/source';

import { renderAgenda } from './agenda';
import { loadAgendaCache } from './load';

export function refreshAgendaWidget(): void {
  requestWidgetUpdate({
    widgetName: 'Agenda',
    renderWidget: async () =>
      renderAgenda(await loadAgendaCache(), await ensureSource()),
  }).catch(() => {
    // Best-effort; the 30-minute cycle catches up.
  });
}
