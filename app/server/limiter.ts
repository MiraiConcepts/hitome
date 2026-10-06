// A brake on password guessing. One person per copy, so one shared counter
// is enough (and behind a reverse proxy every request looks like the proxy
// anyway): a few mistakes are free, then each failure doubles the wait before
// the next try, up to a ceiling. A successful login clears it.

const FREE_FAILURES = 5;
const FIRST_WAIT_MS = 30_000;
const MAX_WAIT_MS = 15 * 60_000;
/** Failures older than this are forgotten. */
const WINDOW_MS = 15 * 60_000;

export type Limiter = ReturnType<typeof createLimiter>;

export function createLimiter(now: () => number = Date.now) {
  let failures: number[] = [];
  let lockedUntil = 0;

  return {
    /** Milliseconds until another attempt is allowed; 0 when it is. */
    wait(): number {
      return Math.max(0, lockedUntil - now());
    },
    fail(): void {
      const t = now();
      failures = failures.filter((f) => t - f < WINDOW_MS);
      failures.push(t);
      const over = failures.length - FREE_FAILURES;
      if (over >= 0)
        lockedUntil = t + Math.min(FIRST_WAIT_MS * 2 ** over, MAX_WAIT_MS);
    },
    succeed(): void {
      failures = [];
      lockedUntil = 0;
    },
  };
}
