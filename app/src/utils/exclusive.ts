/**
 * Runs `run` unless an earlier call holding the same `lock` has not finished;
 * that second call does nothing and gives undefined. The lock is plain data
 * (a ref), so it is taken before React has drawn the state a disabled button
 * waits on: two taps on Save in one frame make one write, not two.
 */
export async function exclusive<T>(
  lock: { current: boolean },
  run: () => Promise<T>
): Promise<T | undefined> {
  if (lock.current) return undefined;
  lock.current = true;
  try {
    return await run();
  } finally {
    lock.current = false;
  }
}
