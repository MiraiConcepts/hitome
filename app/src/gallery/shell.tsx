// THROWAWAY gallery (see app/src/gallery/REVERT.md). Off the web there is no
// iframe to frame: the shell is the content itself, at the phone's width.
import { GalleryView } from './gallery-view';

export function GalleryShell() {
  return <GalleryView />;
}
