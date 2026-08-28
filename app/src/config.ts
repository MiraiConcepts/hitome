import { Platform } from 'react-native';

import { resolveDavUrl } from '@/caldav/resolve-url';

// Radicale (CalDAV) connection. Credentials are SERVER-SIDE by design: the host
// Caddy injects Authorization on /dav/* (see docs/Deploy.md), so clients normally
// run credential-less and only need a URL.
//
// EXPO_PUBLIC_* env vars are Metro-inlined at build time; access must stay fully
// dotted (no destructuring / bracket access) or it won't be replaced.
//
// URL precedence: EXPO_PUBLIC_DAV_URL → (web only) `/dav/` on the page's own
// origin. Native builds must bake a URL (see app/.env.example).
// Username/password are an OPTIONAL dev fallback (e.g. Android dev straight at
// Radicale without a proxy) — when absent, requests carry no Authorization.

const rawUrl =
  process.env.EXPO_PUBLIC_DAV_URL ?? (Platform.OS === 'web' ? '/dav/' : '');

export const DAV = {
  url: resolveDavUrl(
    rawUrl,
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : null
  ),
  user: process.env.EXPO_PUBLIC_DAV_USER ?? '',
  pass: process.env.EXPO_PUBLIC_DAV_PASS ?? '',
};

/** Configured = a server URL exists. Credentials are never required client-side. */
export const davConfigured = Boolean(DAV.url);
