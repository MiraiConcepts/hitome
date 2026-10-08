// Web has no credential storage worth the name — anything a browser keeps is
// plaintext on disk — and it does not need one. The web app is served from the
// same address as Radicale (app at `/`, Radicale proxied under `/dav/`, see
// docs/Deploy.md), so it derives its endpoint from the page it was loaded from
// and the proxy in front supplies the credentials. Nothing to type, nothing to
// store, and no cross-origin request for a browser to block.
//
// Native twin: dav-storage.ts (Android holds no login at all).
import type { DavConfig } from './dav-config';

export async function readStoredConfig(): Promise<DavConfig | null> {
  // Static-export prerender runs this in Node with no window; the client picks
  // the real origin up on hydration.
  if (typeof window === 'undefined') return null;
  return {
    url: new URL('/dav/', window.location.origin).href,
    username: '',
    password: '',
  };
}

export async function writeStoredConfig(): Promise<void> {
  // Derived, so there is nothing to persist.
}

export async function readLastConfig(): Promise<DavConfig | null> {
  return null;
}

export async function clearLastConfig(): Promise<void> {
  // Nothing is typed on web, so there is nothing to remember.
}
