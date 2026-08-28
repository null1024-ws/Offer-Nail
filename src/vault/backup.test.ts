import { describe, expect, it, vi } from 'vitest';
import { resumeV0Fixture } from '../domain/resume/__fixtures__/resume-v0';
import { migrateResumeData } from '../domain/resume';
import {
  exportEncryptedBackup,
  previewEncryptedBackup,
  resetLocalData,
  restoreEncryptedBackup,
  type BackupRepository,
} from './backup';
import { decryptVault, encryptVault, type EncryptedVault } from './crypto';
import { MemoryDeviceSecretStore } from './device-secret';

class MemoryRepository implements BackupRepository {
  vault?: EncryptedVault;
  cleared = false;

  async readVault() {
    return this.vault;
  }

  async writeVault(vault: EncryptedVault) {
    this.vault = vault;
  }

  async clearAll() {
    this.vault = undefined;
    this.cleared = true;
  }
}

async function backupFixture() {
  const secrets = new MemoryDeviceSecretStore(
    'device-secret-for-tests-32bytes-min!!',
  );
  const repository = new MemoryRepository();
  repository.vault = await encryptVault(
    migrateResumeData(resumeV0Fixture),
    await secrets.getOrCreate(),
    { iterations: 100 },
  );
  return {
    secrets,
    serialized: await exportEncryptedBackup(
      repository,
      secrets,
      () => new Date('2026-08-28T07:00:00.000Z'),
    ),
  };
}

describe('encrypted backup', () => {
  it('exports ciphertext and previews it with the embedded device secret', async () => {
    const { serialized } = await backupFixture();
    expect(serialized).not.toContain('旧版默认档案');
    await expect(previewEncryptedBackup(serialized)).resolves.toEqual({
      exportedAt: '2026-08-28T07:00:00.000Z',
      profileName: '旧版默认档案',
      schemaVersion: 1,
    });
    const tampered = JSON.parse(serialized) as { deviceSecret: string };
    tampered.deviceSecret = 'x'.repeat(32);
    await expect(
      previewEncryptedBackup(JSON.stringify(tampered)),
    ).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
    });
  });

  it('validates and migrates before replacing the current vault', async () => {
    const secrets = new MemoryDeviceSecretStore(
      'device-secret-for-tests-32bytes-min!!',
    );
    const source = new MemoryRepository();
    source.vault = await encryptVault(
      resumeV0Fixture,
      (await secrets.read()) ?? (await secrets.getOrCreate()),
      {
        iterations: 100,
      },
    );
    const serialized = await exportEncryptedBackup(source, secrets);
    const target = new MemoryRepository();
    const targetSecrets = new MemoryDeviceSecretStore();

    const restored = await restoreEncryptedBackup(
      serialized,
      target,
      targetSecrets,
    );
    expect(restored.schemaVersion).toBe(1);
    await expect(
      decryptVault(target.vault!, await targetSecrets.getOrCreate()),
    ).resolves.toEqual(restored);
  });

  it('does not overwrite current data for a tampered key or invalid versions', async () => {
    const target = new MemoryRepository();
    const existing = await encryptVault({ sentinel: 'existing' }, 'old', {
      iterations: 100,
    });
    target.vault = existing;
    const { serialized } = await backupFixture();
    const targetSecrets = new MemoryDeviceSecretStore(
      'local-secret-for-restore-32bytes-min!!',
    );
    const tampered = JSON.parse(serialized) as { deviceSecret: string };
    tampered.deviceSecret = 'x'.repeat(32);

    await expect(
      restoreEncryptedBackup(JSON.stringify(tampered), target, targetSecrets),
    ).rejects.toBeTruthy();
    expect(target.vault).toBe(existing);

    const unsupported = JSON.stringify({
      ...JSON.parse(serialized),
      backupVersion: 99,
    });
    await expect(
      restoreEncryptedBackup(unsupported, target, targetSecrets),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_BACKUP_VERSION' });
    expect(target.vault).toBe(existing);
  });

  it('locks the session and clears the device secret before wiping data', async () => {
    const repository = new MemoryRepository();
    const secrets = new MemoryDeviceSecretStore(
      'device-secret-for-tests-32bytes-min!!',
    );
    repository.vault = await encryptVault({ secret: true }, 'password', {
      iterations: 100,
    });
    const lock = vi.fn(async () => undefined);

    await resetLocalData(repository, { lock }, secrets);
    expect(lock).toHaveBeenCalledOnce();
    expect(repository.cleared).toBe(true);
    expect(repository.vault).toBeUndefined();
    await expect(secrets.read()).resolves.toBeUndefined();
  });

  it('clears extra local data (e.g. LLM config) when a callback is provided', async () => {
    const repository = new MemoryRepository();
    const secrets = new MemoryDeviceSecretStore(
      'device-secret-for-tests-32bytes-min!!',
    );
    const clearExtras = vi.fn(async () => undefined);

    await resetLocalData(repository, { lock: async () => undefined }, secrets, clearExtras);
    expect(clearExtras).toHaveBeenCalledOnce();
    expect(repository.cleared).toBe(true);
    await expect(secrets.read()).resolves.toBeUndefined();
  });
});
