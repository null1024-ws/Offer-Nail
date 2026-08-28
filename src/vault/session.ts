import { decryptVault, type EncryptedVault } from './crypto';

export interface SessionMarker {
  state: 'locked' | 'unlocked';
  sessionId?: string;
  unlockedAt?: string;
}

export interface SessionMarkerStore {
  read(): Promise<SessionMarker | undefined>;
  write(marker: SessionMarker): Promise<void>;
  clear(): Promise<void>;
}

export class BrowserSessionMarkerStore implements SessionMarkerStore {
  private static readonly key = 'offerNailVaultSession';

  async read(): Promise<SessionMarker | undefined> {
    const result = await browser.storage.session.get(
      BrowserSessionMarkerStore.key,
    );
    return result[BrowserSessionMarkerStore.key] as SessionMarker | undefined;
  }

  async write(marker: SessionMarker): Promise<void> {
    await browser.storage.session.set({
      [BrowserSessionMarkerStore.key]: marker,
    });
  }

  async clear(): Promise<void> {
    await browser.storage.session.remove(BrowserSessionMarkerStore.key);
  }
}

export class VaultLockedError extends Error {
  constructor() {
    super('保险库当前处于锁定状态');
    this.name = 'VaultLockedError';
  }
}

export type VaultSessionSnapshot =
  | { state: 'locked' }
  | { state: 'unlocked'; sessionId: string; unlockedAt: string };

export class VaultSession<TPayload extends object> {
  private payload?: TPayload;
  private snapshot: VaultSessionSnapshot = { state: 'locked' };

  constructor(private readonly markerStore: SessionMarkerStore) {}

  async initialize(): Promise<void> {
    this.payload = undefined;
    this.snapshot = { state: 'locked' };
    await this.markerStore.clear();
  }

  async unlock(
    vault: EncryptedVault,
    password: string,
  ): Promise<VaultSessionSnapshot> {
    const payload = await decryptVault<TPayload>(vault, password);
    const snapshot = {
      state: 'unlocked' as const,
      sessionId: crypto.randomUUID(),
      unlockedAt: new Date().toISOString(),
    };
    this.payload = payload;
    this.snapshot = snapshot;
    await this.markerStore.write(snapshot);
    return snapshot;
  }

  async lock(): Promise<void> {
    this.payload = undefined;
    this.snapshot = { state: 'locked' };
    await this.markerStore.write({ state: 'locked' });
  }

  replacePayload(payload: TPayload): void {
    if (!this.payload) throw new VaultLockedError();
    this.payload = payload;
  }

  requirePayload(): TPayload {
    if (!this.payload) throw new VaultLockedError();
    return this.payload;
  }

  getSnapshot(): VaultSessionSnapshot {
    return this.snapshot;
  }

  readSelectedFields<TKey extends keyof TPayload>(
    keys: readonly TKey[],
  ): Pick<TPayload, TKey> {
    if (!this.payload) throw new VaultLockedError();
    const selected = {} as Pick<TPayload, TKey>;
    keys.forEach((key) => {
      selected[key] = structuredClone(this.payload![key]);
    });
    return selected;
  }
}
