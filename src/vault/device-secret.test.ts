import { describe, expect, it } from 'vitest';
import { MemoryDeviceSecretStore } from './device-secret';

describe('device secret store', () => {
  it('creates a secret once and can clear it', async () => {
    const store = new MemoryDeviceSecretStore();
    const first = await store.getOrCreate();
    expect(first.length).toBeGreaterThanOrEqual(32);
    await expect(store.getOrCreate()).resolves.toBe(first);
    await store.clear();
    await expect(store.read()).resolves.toBeUndefined();
    const next = await store.getOrCreate();
    expect(next).not.toBe(first);
  });
});
