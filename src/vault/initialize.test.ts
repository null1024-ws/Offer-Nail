import { describe, expect, it } from 'vitest';
import { decryptVault, encryptVault, type EncryptedVault } from './crypto';
import {
  initializeNewVault,
  masterPasswordError,
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
  it('creates a valid encrypted empty profile without storing the password', async () => {
    const repository = new MemoryRepository();
    const password = 'secure-password-123';
    const resumeData = await initializeNewVault(
      repository,
      password,
      '前端校招',
    );

    expect(resumeData.masterProfile.name).toBe('前端校招');
    expect(resumeData.masterProfile.educations).toEqual([]);
    expect(JSON.stringify(repository.vault)).not.toContain(password);
    await expect(decryptVault(repository.vault!, password)).resolves.toEqual(
      resumeData,
    );
  });

  it('rejects weak passwords and refuses to overwrite an existing vault', async () => {
    expect(masterPasswordError('short1')).toBe('主密码至少需要 12 个字符');
    expect(masterPasswordError('long-password-only')).toBe(
      '主密码需要同时包含字母和数字',
    );

    const repository = new MemoryRepository();
    await expect(
      initializeNewVault(repository, 'weak', '默认档案'),
    ).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    expect(repository.vault).toBeUndefined();

    repository.vault = await encryptVault({ existing: true }, 'old-password1', {
      iterations: 100,
    });
    const existing = repository.vault;
    await expect(
      initializeNewVault(repository, 'secure-password-123'),
    ).rejects.toMatchObject({ code: 'ALREADY_INITIALIZED' });
    expect(repository.vault).toBe(existing);
  });
});
