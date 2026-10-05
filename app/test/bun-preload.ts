// bun test only (jest-expo mocks these itself): the Expo native modules the
// store backend reaches at import time pull in react-native's Flow entry,
// which bun cannot parse. Tests inject their own calendar store, so these
// only need to load.
import { mock } from 'bun:test';

mock.module('expo', () => ({ requireOptionalNativeModule: () => null }));
mock.module('expo-secure-store', () => ({
  getItem: () => null,
  setItem: () => {},
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));
mock.module('expo-file-system', () => ({
  File: class {
    exists = false;
    text = async () => '';
    write = () => {};
    delete = () => {};
  },
  Paths: { document: '/' },
}));
