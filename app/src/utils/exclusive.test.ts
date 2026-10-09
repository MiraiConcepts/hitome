import { exclusive } from './exclusive';

describe('exclusive', () => {
  it('ignores a call made while one is still running', async () => {
    const lock = { current: false };
    let runs = 0;
    let finish = () => {};
    const write = () =>
      new Promise<void>((resolve) => {
        runs++;
        finish = resolve;
      });
    const first = exclusive(lock, write);
    const second = exclusive(lock, write);
    expect(runs).toBe(1);
    expect(await second).toBeUndefined();
    finish();
    await first;
    await exclusive(lock, async () => {
      runs++;
    });
    expect(runs).toBe(2);
  });

  it('lets the next call run after one fails', async () => {
    const lock = { current: false };
    await expect(
      exclusive(lock, async () => {
        throw new Error('offline');
      })
    ).rejects.toThrow('offline');
    expect(await exclusive(lock, async () => 'saved')).toBe('saved');
  });
});
