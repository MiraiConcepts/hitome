// Headless entry for widget lifecycle events. Polyfills are guaranteed by
// app/index.ts (imported before the register module that pulls this in).
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { ensureSource } from '@/config/source';

import { renderAgenda } from './agenda';
import { readWidgetCache } from './cache';
import { loadAgendaCache } from './load';

export async function widgetTaskHandler(
  props: WidgetTaskHandlerProps
): Promise<void> {
  switch (props.widgetAction) {
    case 'WIDGET_DELETED':
      return;
    case 'WIDGET_RESIZED': {
      // Re-render only — no network on a resize. Still has to read the config,
      // since "not set up yet" is part of what the widget draws.
      const configured = await ensureSource();
      props.renderWidget(renderAgenda(await readWidgetCache(), configured));
      return;
    }
    default: {
      // WIDGET_ADDED, WIDGET_UPDATE (30-min cycle), and WIDGET_CLICK — the
      // only custom clickAction is the refresh tap, so every click refetches.
      const cache = await loadAgendaCache();
      props.renderWidget(renderAgenda(cache, await ensureSource()));
      return;
    }
  }
}
