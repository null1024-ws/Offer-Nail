/** @vitest-environment node */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  loadFixtureDocument,
  seededResume,
} from '../fill-engine/__fixtures__/form-fixture';
import { MemoryDeviceSecretStore } from '../vault/device-secret';
import { initializeNewVault } from '../vault/initialize';
import { saveProfile } from '../vault/profile-vault';
import { VaultRepository } from '../vault/repository';
import {
  VaultSession,
  type SessionMarker,
  type SessionMarkerStore,
} from '../vault/session';
import type { ResumeData } from '../domain/resume';
import { createBackgroundHandler } from './background-handler';
import { createContentHandler } from './content-handler';

class MemoryMarkerStore implements SessionMarkerStore {
  marker?: SessionMarker;
  async read() {
    return this.marker;
  }
  async write(marker: SessionMarker) {
    this.marker = structuredClone(marker);
  }
  async clear() {
    this.marker = undefined;
  }
}

describe('background fill handler', () => {
  it('unlocks, scans without writing, fills after confirm, and saves rules', async () => {
    const document = loadFixtureDocument();
    const content = createContentHandler(document);
    const repository = new VaultRepository({
      databaseName: `offer-nail-bg-${crypto.randomUUID()}`,
    });
    const secrets = new MemoryDeviceSecretStore();
    const created = await initializeNewVault(repository, secrets);
    await saveProfile(repository, seededResume(), secrets);
    const session = new VaultSession<ResumeData>(new MemoryMarkerStore());
    await session.initialize();
    const handle = createBackgroundHandler({
      session,
      repository,
      secrets,
      getActiveTabId: async () => 1,
      ensureScript: async () => undefined,
      sendToTab: async (_tabId, message) => content(message),
    });

    const unlocked = await handle({ type: 'offerNail:status' });
    expect(unlocked.ok && 'status' in unlocked && unlocked.status).toBe(
      'unlocked',
    );
    const scanned = await handle({ type: 'offerNail:scan' });
    expect(scanned.ok && 'items' in scanned).toBe(true);
    expect(
      (document.getElementById('full-name') as HTMLInputElement).value,
    ).toBe('');
    if (!scanned.ok || !('items' in scanned)) throw new Error('scan failed');
    const filled = await handle({
      type: 'offerNail:confirmFill',
      items: scanned.items.filter((item) => item.selected),
    });
    expect(filled.ok && 'outcomes' in filled).toBe(true);
    expect(
      (document.getElementById('full-name') as HTMLInputElement).value,
    ).toBe('张三');
    expect(document.querySelectorAll('.employment-item')).toHaveLength(2);
    const rules = await repository.listSiteRules();
    expect(rules.length).toBeGreaterThan(0);
    expect(JSON.stringify(rules)).not.toContain('张三');
    const undone = await handle({ type: 'offerNail:undoFill' });
    expect(undone.ok && 'undone' in undone && undone.undone.ok).toBe(true);
    expect(
      (document.getElementById('full-name') as HTMLInputElement).value,
    ).toBe('');
    await repository.destroy();
    expect(created.masterProfile.name).toBe('默认档案');
  });

  it('clears the vault and device secret on offerNail:reset', async () => {
    const repository = new VaultRepository({
      databaseName: `offer-nail-reset-${crypto.randomUUID()}`,
    });
    const secrets = new MemoryDeviceSecretStore();
    await initializeNewVault(repository, secrets);
    await saveProfile(repository, seededResume(), secrets);
    const session = new VaultSession<ResumeData>(new MemoryMarkerStore());
    await session.initialize();
    const handle = createBackgroundHandler({
      session,
      repository,
      secrets,
      getActiveTabId: async () => 1,
      ensureScript: async () => undefined,
      sendToTab: async () => ({ ok: false, error: 'unused' }),
    });

    expect(await repository.readVault()).toBeDefined();
    expect(await secrets.read()).toBeDefined();

    const reset = await handle({ type: 'offerNail:reset' });
    expect(reset.ok).toBe(true);
    expect(await repository.readVault()).toBeUndefined();
    expect(await secrets.read()).toBeUndefined();

    await repository.destroy();
  });
});
