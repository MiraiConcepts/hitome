// Import FIRST, before any tsdav import (see src/app/_layout.tsx). Hermes (React
// Native) lacks btoa/atob and a reliable TextEncoder/TextDecoder, which tsdav needs
// (Basic-auth base64 + XML handling). On web these globals already exist, so the
// assignments below are guarded no-ops.
import { decode as atobPolyfill, encode as btoaPolyfill } from 'base-64';
import { getRandomValues } from 'expo-crypto';
import {
  TextDecoder as TextDecoderPolyfill,
  TextEncoder as TextEncoderPolyfill,
} from 'text-encoding';

const g = globalThis as Record<string, unknown>;

if (typeof g.btoa === 'undefined') g.btoa = btoaPolyfill;
if (typeof g.atob === 'undefined') g.atob = atobPolyfill;
if (typeof g.TextEncoder === 'undefined') g.TextEncoder = TextEncoderPolyfill;
if (typeof g.TextDecoder === 'undefined') g.TextDecoder = TextDecoderPolyfill;

// Hermes has no global crypto at all, and the randomUUID fallback below is
// built on getRandomValues — so this has to land first. expo-crypto's
// implementation is synchronous, so it slots straight in.
const cryptoLike = (g.crypto ?? (g.crypto = {})) as Record<string, unknown>;
if (typeof cryptoLike.getRandomValues === 'undefined')
  cryptoLike.getRandomValues = getRandomValues;

// crypto.randomUUID (event UIDs, via expo-crypto on web) is secure-context-only
// in browsers — absent behind a plain-HTTP proxy (e2e, bare tailnet). RFC 4122
// v4 from getRandomValues is the same entropy without the context restriction.
if (typeof cryptoLike.randomUUID === 'undefined')
  cryptoLike.randomUUID = () => {
    const bytes = new Uint8Array(16);
    (cryptoLike.getRandomValues as (a: Uint8Array) => Uint8Array)(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
      ''
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
