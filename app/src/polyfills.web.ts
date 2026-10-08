// Web build of polyfills.ts (imported FIRST in the same places). A browser
// already has btoa/atob, TextEncoder/TextDecoder and crypto.getRandomValues,
// so the native file's fallbacks are left out: its text-encoding import alone
// shipped every legacy character table (Big5 and the rest) in the bundle.

const cryptoLike = globalThis.crypto as unknown as {
  getRandomValues: (array: Uint8Array) => Uint8Array;
  randomUUID?: () => string;
};

// crypto.randomUUID (event UIDs, via expo-crypto on web) is secure-context-only
// in browsers — absent behind a plain-HTTP proxy (e2e, bare tailnet). RFC 4122
// v4 from getRandomValues is the same entropy without the context restriction.
if (typeof cryptoLike.randomUUID === 'undefined')
  cryptoLike.randomUUID = () => {
    const bytes = new Uint8Array(16);
    cryptoLike.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
      ''
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };

export {};
