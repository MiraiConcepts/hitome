// One run at a time, without losing a request: a call while a run is in
// flight marks it dirty, and the run goes once more when it ends (its fetch
// may predate the change that asked). Callers all get the same promise,
// which settles after that last run.

export function coalesced(run: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let dirty = false;
  return () => {
    if (running) {
      dirty = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          dirty = false;
          await run();
        } while (dirty);
      } finally {
        running = null;
      }
    })();
    return running;
  };
}
