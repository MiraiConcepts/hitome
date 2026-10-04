// Compile-time only: the Android backend must offer everything the web one
// does, with the same types — tsc only ever resolves events.ts.
// The linter's resolver prefers .android files, so it reads these two
// imports as one module; tsc does not.
// eslint-disable-next-line import/no-duplicates
import type * as Android from './events.android';
// eslint-disable-next-line import/no-duplicates
import type * as Web from './events';

type Missing = Exclude<keyof typeof Web, keyof typeof Android>;
export const noneMissing: Missing extends never ? true : Missing = true;
