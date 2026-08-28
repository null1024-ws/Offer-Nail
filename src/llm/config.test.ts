import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryDeviceSecretStore } from '../vault/device-secret';
import {
  BrowserLlmConfigStore,
  MemoryLlmConfigStore,
  normalizeModel,
} from './config';

function installBrowserStorageMock() {
  const storage = new Map<string, unknown>();
  vi.stubGlobal('browser', {
    storage: {
      local: {
        get: async (key: string) => {
          const value = storage.get(key);
          return value === undefined ? {} : { [key]: value };
        },
        set: async (items: Record<string, unknown>) => {
          Object.entries(items).forEach(([key, value]) => storage.set(key, value));
        },
        remove: async (key: string) => {
          storage.delete(key);
        },
      },
    },
  });
  return storage;
}

describe('normalizeModel', () => {
  it('maps retired aliases to the current flash model and keeps v4 ids', () => {
    expect(normalizeModel('deepseek-chat')).toBe('deepseek-v4-flash');
    expect(normalizeModel('deepseek-reasoner')).toBe('deepseek-v4-flash');
    expect(normalizeModel('deepseek-v4-flash')).toBe('deepseek-v4-flash');
    expect(normalizeModel('deepseek-v4-pro')).toBe('deepseek-v4-pro');
  });
});

describe('MemoryLlmConfigStore', () => {
  it('reads, writes and clears config while preserving an unset api key', async () => {
    const store = new MemoryLlmConfigStore();
    await expect(store.read()).resolves.toBeUndefined();
    await store.write({ enabled: true, model: 'deepseek-v4-flash' }, 'sk-abc');
    await expect(store.readApiKey()).resolves.toBe('sk-abc');
    await store.write({ enabled: false, model: 'deepseek-v4-flash' });
    await expect(store.readApiKey()).resolves.toBe('sk-abc');
    await store.write({ enabled: false, model: 'deepseek-v4-flash' }, '');
    await expect(store.readApiKey()).resolves.toBeUndefined();
  });
});

describe('BrowserLlmConfigStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('encrypts the api key at rest and decrypts it back', async () => {
    const storage = installBrowserStorageMock();
    const store = new BrowserLlmConfigStore(new MemoryDeviceSecretStore());

    await store.write({ enabled: true, model: 'deepseek-v4-flash' }, 'sk-secret-123');

    const storedRaw = storage.get('offerNailLlmApiKey');
    expect(typeof storedRaw).toBe('string');
    expect(storedRaw).not.toContain('sk-secret-123');
    await expect(store.readApiKey()).resolves.toBe('sk-secret-123');
  });

  it('clears the api key when an empty value is written', async () => {
    const storage = installBrowserStorageMock();
    const store = new BrowserLlmConfigStore(new MemoryDeviceSecretStore());

    await store.write({ enabled: true, model: 'deepseek-v4-flash' }, 'sk-secret-123');
    await store.write({ enabled: true, model: 'deepseek-v4-flash' }, '');
    await expect(store.readApiKey()).resolves.toBeUndefined();
    expect(storage.has('offerNailLlmApiKey')).toBe(false);
  });
});
