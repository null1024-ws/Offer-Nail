import { describe, expect, it } from 'vitest';
import { encryptVault } from './crypto';
import {
  VaultLockedError,
  VaultSession,
  type SessionMarker,
  type SessionMarkerStore,
} from './session';

class MemoryMarkerStore implements SessionMarkerStore {
  marker?: SessionMarker;

  async read(): Promise<SessionMarker | undefined> {
    return this.marker;
  }

  async write(marker: SessionMarker): Promise<void> {
    this.marker = structuredClone(marker);
  }

  async clear(): Promise<void> {
    this.marker = undefined;
  }
}

interface TestPayload {
  fullName: string;
  email: string;
}

async function encryptedPayload() {
  return encryptVault(
    { fullName: '张三', email: 'zhang@example.com' },
    'password',
    { iterations: 100 },
  );
}

describe('VaultSession', () => {
  it('stays unlocked in the active manager without persisting plaintext', async () => {
    const markerStore = new MemoryMarkerStore();
    const session = new VaultSession<TestPayload>(markerStore);
    await session.initialize();
    await session.unlock(await encryptedPayload(), 'password');

    expect(session.getSnapshot().state).toBe('unlocked');
    expect(session.readSelectedFields(['fullName'])).toEqual({
      fullName: '张三',
    });
    expect(JSON.stringify(markerStore.marker)).not.toContain('张三');
    expect(JSON.stringify(markerStore.marker)).not.toContain('password');
  });

  it('returns only requested fields to callers', async () => {
    const session = new VaultSession<TestPayload>(new MemoryMarkerStore());
    await session.unlock(await encryptedPayload(), 'password');

    const selected = session.readSelectedFields(['email']);
    expect(selected).toEqual({ email: 'zhang@example.com' });
    expect(selected).not.toHaveProperty('fullName');
  });

  it('removes access immediately after manual lock', async () => {
    const markerStore = new MemoryMarkerStore();
    const session = new VaultSession<TestPayload>(markerStore);
    await session.unlock(await encryptedPayload(), 'password');
    await session.lock();

    expect(session.getSnapshot()).toEqual({ state: 'locked' });
    expect(() => session.readSelectedFields(['fullName'])).toThrow(
      VaultLockedError,
    );
    expect(markerStore.marker).toEqual({ state: 'locked' });
  });

  it('starts locked after an extension or browser lifecycle restart', async () => {
    const markerStore = new MemoryMarkerStore();
    const previous = new VaultSession<TestPayload>(markerStore);
    await previous.unlock(await encryptedPayload(), 'password');
    expect(markerStore.marker?.state).toBe('unlocked');

    const restarted = new VaultSession<TestPayload>(markerStore);
    await restarted.initialize();
    expect(restarted.getSnapshot()).toEqual({ state: 'locked' });
    expect(markerStore.marker).toBeUndefined();
    expect(() => restarted.readSelectedFields(['email'])).toThrow(
      VaultLockedError,
    );
  });
});
