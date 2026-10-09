// How long a browser may keep one of the app's files. A file whose name
// carries its content's hash never changes: the bundles under /_expo/static/,
// and the fonts and images the export writes as /assets/…/name.<hash>.ext.
// Everything else (the HTML, version.json for the silent-reload check)
// revalidates, so a new release is seen.

const HASHED_ASSET = /^\/assets\/.+\.[0-9a-f]{32}\.[^/.]+$/;

/**
 * `requested` is the path asked for; `served` the file that answered it,
 * which is the app shell when the path was not found. Only the very file
 * asked for is kept: a bundle missing after a release must not cache the
 * shell under the bundle's name for a year.
 */
export function cacheControl(requested: string, served: string): string {
  const hashed =
    requested.startsWith('/_expo/static/') || HASHED_ASSET.test(requested);
  return hashed && served === requested
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}

/**
 * Whether a path not found may be answered with the app shell. Only a client
 * route can be: a path that names a file (its last part has an extension) or
 * sits under /.well-known/ is a 404, so a browser asking for a bundle gone
 * after a release never runs the shell as JavaScript.
 */
export function mayServeShell(pathname: string): boolean {
  if (pathname === '/.well-known' || pathname.startsWith('/.well-known/'))
    return false;
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  return !/\.[^.]+$/.test(last);
}
