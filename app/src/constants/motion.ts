/**
 * How fast things fade and slide, as three named speeds, so the whole app
 * moves at one pace. Gesture timings (how long a hold lasts, the delay before
 * a touch counts as a press) and the day pulse, which is meant to be noticed,
 * are not speeds of this kind and keep their own numbers.
 */
export const Motion = {
  /** Over before it is noticed: tap feedback arriving, a label stepping out. */
  quick: 100,
  /** The everyday speed: a toast, the loading bar, a label stepping in, a
   *  switch, a day's shading, the discover cascade's tiles. */
  normal: 160,
  /** A change of scene: the setup screen giving way, discover mode's
   *  colours. */
  slow: 250,
} as const;
