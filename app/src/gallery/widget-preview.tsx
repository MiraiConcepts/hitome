// THROWAWAY gallery (see app/src/gallery/REVERT.md). The widget off Android:
// its primitives draw only on Android, so the web gets a description.
import { Unavailable } from './parts';

export function WidgetPreviewCard() {
  return (
    <Unavailable
      name="Agenda widget"
      file="src/widget/agenda.tsx"
      reason="Preview it on an emulator or a phone: this page on Android draws it with WidgetPreview over sample events. A screenshot exists at docs/screenshots/widget.png, but that folder is outside the app, which the bundler cannot reach, so it is not shown here."
    />
  );
}
