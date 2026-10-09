// THROWAWAY gallery (see app/src/gallery/REVERT.md). The agenda widget as
// the launcher would draw it, from the real render over sample events.
import type { ReactElement } from 'react';
import { useWindowDimensions } from 'react-native';
import { WidgetPreview } from 'react-native-android-widget';

import { renderAgenda } from '@/widget/agenda';

import { Specimen } from './parts';
import { sampleWidgetCache } from './sample-data';

export function WidgetPreviewCard() {
  const { width } = useWindowDimensions();
  const size = Math.min(360, width - 64);
  return (
    <Specimen
      name="Agenda widget (WidgetPreview)"
      file="src/widget/agenda.tsx renderAgenda, dark half"
      shows="Sample snapshot; taps do nothing here"
    >
      <WidgetPreview
        renderWidget={() => {
          // renderAgenda always returns the light and dark pair.
          const widget = renderAgenda(sampleWidgetCache(), true) as {
            dark: ReactElement;
          };
          return widget.dark;
        }}
        width={size}
        height={Math.round(size * 1.1)}
      />
    </Specimen>
  );
}
