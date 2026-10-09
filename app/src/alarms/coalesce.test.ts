import { coalesced } from './coalesce';

function gate() {
  let open = () => {};
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

describe('coalesced', () => {
  it('runs once more for calls made while a run is in flight', async () => {
    const gates = [gate(), gate()];
    let runs = 0;
    const run = coalesced(async () => {
      await gates[runs++].promise;
    });
    const first = run();
    const second = run();
    const third = run();
    expect(second).toBe(first);
    expect(third).toBe(first);
    gates[0].open();
    await Promise.resolve();
    await Promise.resolve();
    expect(runs).toBe(2);
    gates[1].open();
    await first;
    expect(runs).toBe(2);
  });

  it('runs again for a call after the last run ended', async () => {
    let runs = 0;
    const run = coalesced(async () => {
      runs++;
    });
    await run();
    await run();
    expect(runs).toBe(2);
  });

  it('keeps going after a run fails', async () => {
    let runs = 0;
    const run = coalesced(async () => {
      runs++;
      if (runs === 1) throw new Error('no');
    });
    await expect(run()).rejects.toThrow('no');
    await run();
    expect(runs).toBe(2);
  });
});
