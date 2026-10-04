import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

/** A row from the store: column name → value (numbers for integer columns). */
export type StoreRow = Record<string, string | number | null>;
export type StoreValues = Record<string, string | number | boolean | null>;

type NativeStore = {
  query(
    uri: string,
    projection: string[],
    selection: string | null,
    args: string[] | null,
    sort: string | null
  ): Promise<StoreRow[]>;
  insert(uri: string, values: StoreValues): Promise<string>;
  update(
    uri: string,
    values: StoreValues,
    selection: string | null,
    args: string[] | null
  ): Promise<number>;
  delete(
    uri: string,
    selection: string | null,
    args: string[] | null
  ): Promise<number>;
  requestSync(): Promise<number>;
  openApp(pkg: string): Promise<boolean>;
  /** Start watching for changes, if access has since been granted. */
  watch(): Promise<boolean>;
  addListener(event: 'onChange', listener: () => void): EventSubscription;
};

/**
 * Android's calendar store, or null where there is none (web, and any build
 * without the native module). See the Kotlin side for what it does.
 */
export const CalendarStore =
  requireOptionalNativeModule<NativeStore>('CalendarStore');
