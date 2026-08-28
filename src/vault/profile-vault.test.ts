import { expect, it } from 'vitest';
import { createEmptyResumeData } from '../domain/resume';
import { encryptVault, type EncryptedVault } from './crypto';
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
  const password = 'secure-password-123';
  const original = createEmptyResumeData();
  const encrypted = await encryptVault(original, password, { iterations: 100 });
  const repository = new MemoryRepository(encrypted);
  const edited = structuredClone(original);
  edited.masterProfile.name = '重新打开的档案';

  await saveProfile(repository, edited, password);

  expect(repository.vault?.kdfParameters.iterations).toBe(100);
  expect(repository.vault?.createdAt).toBe(encrypted.createdAt);
  await expect(unlockProfile(repository, password)).resolves.toEqual(edited);
});
