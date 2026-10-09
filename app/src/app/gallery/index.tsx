// DEVELOPMENT ONLY (see app/src/gallery/README.md): a build for release does not
// contain the gallery at all, and this address goes back to the calendar.
//
// /gallery: every UI piece of the app in one place, shown at a phone's or a
// desktop's width on the web. Linked from nowhere; reached by typing the URL.
import { Redirect } from 'expo-router';

export default function GalleryRoute() {
  // `__DEV__` is a constant in a release bundle, so the bundler drops this
  // whole block and the gallery's files with it (nothing else imports them).
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GalleryShell } = require('@/gallery/shell');
    return <GalleryShell />;
  }
  return <Redirect href="/" />;
}
