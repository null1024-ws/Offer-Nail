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

async function backupFixture(password = 'password') {
  const repository = new MemoryRepository();
  repository.vault = await encryptVault(
    migrateResumeData(resumeV0Fixture),
    password,
    { iterations: 100 },
  );
  return exportEncryptedBackup(
    repository,
    () => new Date('2026-08-28T07:00:00.000Z'),
  );
}

describe('encrypted backup', () => {
  it('exports ciphertext and previews it only with the correct password', async () => {
    const serialized = await backupFixture();
    expect(serialized).not.toContain('旧版默认档案');
    await expect(
      previewEncryptedBackup(serialized, 'password'),
    ).resolves.toEqual({
      exportedAt: '2026-08-28T07:00:00.000Z',
      profileName: '旧版默认档案',
      schemaVersion: 1,
    });
    await expect(
      previewEncryptedBackup(serialized, 'wrong'),
    ).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
    });
  });

  it('validates and migrates before replacing the current vault', async () => {
    const source = new MemoryRepository();
    source.vault = await encryptVault(resumeV0Fixture, 'password', {
      iterations: 100,
    });
    const serialized = await exportEncryptedBackup(source);
    const target = new MemoryRepository();

    const restored = await restoreEncryptedBackup(
      serialized,
      'password',
      target,
    );
    expect(restored.schemaVersion).toBe(1);
    await expect(decryptVault(target.vault!, 'password')).resolves.toEqual(
      restored,
    );
  });

  it('does not overwrite current data for wrong passwords or invalid versions', async () => {
    const target = new MemoryRepository();
    const existing = await encryptVault({ sentinel: 'existing' }, 'old', {
      iterations: 100,
    });
    target.vault = existing;
    const serialized = await backupFixture();

    await expect(
      restoreEncryptedBackup(serialized, 'wrong', target),
    ).rejects.toBeTruthy();
    expect(target.vault).toBe(existing);

    const unsupported = JSON.stringify({
      ...JSON.parse(serialized),
      backupVersion: 99,
    });
    await expect(
      restoreEncryptedBackup(unsupported, 'password', target),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_BACKUP_VERSION' });
    expect(target.vault).toBe(existing);
  });

  it('locks the session before clearing local data', async () => {
    const repository = new MemoryRepository();
    repository.vault = await encryptVault({ secret: true }, 'password', {
      iterations: 100,
    });
    const lock = vi.fn(async () => undefined);

    await resetLocalData(repository, { lock });
    expect(lock).toHaveBeenCalledOnce();
    expect(repository.cleared).toBe(true);
    expect(repository.vault).toBeUndefined();
  });
});
