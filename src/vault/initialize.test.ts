import { describe, expect, it } from 'vitest';
import { decryptVault, encryptVault, type EncryptedVault } from './crypto';
import { MemoryDeviceSecretStore } from './device-secret';
import {
  initializeNewVault,
  type InitializationRepository,
} from './initialize';

class MemoryRepository implements InitializationRepository {
  vault?: EncryptedVault;

  async readVault() {
    return this.vault;
  }

  async writeVault(vault: EncryptedVault) {
    this.vault = vault;
  }
}

describe('vault initialization', () => {
  it('creates a valid encrypted empty profile with a device secret', async () => {
    const repository = new MemoryRepository();
    const secrets = new MemoryDeviceSecretStore();
    const resumeData = await initializeNewVault(
      repository,
      secrets,
      '前端校招',
    );

    expect(resumeData.masterProfile.name).toBe('前端校招');
    expect(resumeData.masterProfile.educations).toEqual([]);
    const secret = await secrets.read();
    expect(secret).toBeDefined();
    expect(JSON.stringify(repository.vault)).not.toContain(secret);
    await expect(decryptVault(repository.vault!, secret!)).resolves.toEqual(
      resumeData,
    );
  });

  it('refuses to overwrite an existing vault', async () => {
    const repository = new MemoryRepository();
    const secrets = new MemoryDeviceSecretStore();
    repository.vault = await encryptVault({ existing: true }, 'old-secret', {
      iterations: 100,
    });
    const existing = repository.vault;
    await expect(initializeNewVault(repository, secrets)).rejects.toMatchObject(
      { code: 'ALREADY_INITIALIZED' },
    );
    expect(repository.vault).toBe(existing);
  });
});
