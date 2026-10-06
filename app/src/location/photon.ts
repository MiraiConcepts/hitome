// Photon (photon.komoot.io) autocomplete client — the app's only third-party
// call, so it degrades to silence on ANY failure: the location field is then
// just a text field. Fair-use manners: debounced by the caller, min 3 chars,
// limit 5, lang pinned (invalid lang is a hard 400; unpinned localizes country
// names per Accept-Language), no custom headers (keeps requests preflight-free).
import { suggestionLabel, type PhotonProperties } from './label';

const ENDPOINT = 'https://photon.komoot.io/api/';
const LIMIT = 5;
const TIMEOUT_MS = 4000;
const CACHE_MAX = 50;
/** Consecutive failures before the session stops querying entirely. */
const BREAKER_LIMIT = 3;

export const MIN_QUERY_LENGTH = 3;

const cache = new Map<string, string[]>();
let consecutiveFailures = 0;
let inFlight: AbortController | null = null;

/**
 * Suggestion labels for a query — [] on any failure, throttle, or breaker
 * trip. Aborts the previous in-flight request (latest keystroke wins; stale
 * responses can never overwrite newer ones).
 */
export async function searchLocations(query: string): Promise<string[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH) return [];
  if (consecutiveFailures >= BREAKER_LIMIT) return [];
  const cached = cache.get(q);
  if (cached) return cached;

  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&limit=${LIMIT}&lang=en`;
    // no-referrer: on web the browser would otherwise send this page's origin,
    // which is the private server's hostname.
    const res = await fetch(url, {
      signal: controller.signal,
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) throw new Error(`photon ${res.status}`);
    const body = (await res.json()) as {
      features?: { properties?: PhotonProperties }[];
    };
    const labels: string[] = [];
    for (const feature of body.features ?? []) {
      const label = feature.properties && suggestionLabel(feature.properties);
      if (label && !labels.includes(label)) labels.push(label);
    }
    consecutiveFailures = 0;
    cache.set(q, labels);
    if (cache.size > CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return labels;
  } catch (err) {
    // An abort just means a newer keystroke superseded us — not a failure.
    if (!(err instanceof Error && err.name === 'AbortError'))
      consecutiveFailures += 1;
    return [];
  } finally {
    clearTimeout(timeout);
    if (inFlight === controller) inFlight = null;
  }
}
