import { expect, it } from 'vitest';
import { createEmptyResumeData } from '../domain/resume';
import { encryptVault, type EncryptedVault } from './crypto';
import { MemoryDeviceSecretStore } from './device-secret';
import type { InitializationRepository } from './initialize';
import { saveProfile, unlockProfile } from './profile-vault';

class MemoryRepository implements InitializationRepository {
  constructor(public vault?: EncryptedVault) {}

  async readVault() {
    return this.vault;
  }

  async writeVault(vault: EncryptedVault) {
    this.vault = vault;
  }
}

it('saves and reopens an edited encrypted profile', async () => {
  const secrets = new MemoryDeviceSecretStore(
    'device-secret-for-tests-32bytes-min!!',
  );
  const original = createEmptyResumeData();
  const encrypted = await encryptVault(original, await secrets.getOrCreate(), {
    iterations: 100,
  });
  const repository = new MemoryRepository(encrypted);
  const edited = structuredClone(original);
  edited.masterProfile.name = '重新打开的档案';

  await saveProfile(repository, edited, secrets);

  expect(repository.vault?.kdfParameters.iterations).toBe(100);
  expect(repository.vault?.createdAt).toBe(encrypted.createdAt);
  await expect(unlockProfile(repository, secrets)).resolves.toEqual(edited);
});

it('does not open a vault encrypted with an unknown secret', async () => {
  const original = createEmptyResumeData();
  const repository = new MemoryRepository(
    await encryptVault(original, 'unknown-secret-from-another-device', {
      iterations: 100,
    }),
  );
  const secrets = new MemoryDeviceSecretStore();
  await expect(unlockProfile(repository, secrets)).rejects.toBeTruthy();
});
