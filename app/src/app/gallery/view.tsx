// DEVELOPMENT ONLY (see app/src/gallery/README.md): not in a release build.
//
// /gallery/view: the specimens themselves, the page /gallery frames.
import { Redirect } from 'expo-router';

export default function GalleryViewRoute() {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GalleryView } = require('@/gallery/gallery-view');
    return <GalleryView />;
  }
  return <Redirect href="/" />;
}
