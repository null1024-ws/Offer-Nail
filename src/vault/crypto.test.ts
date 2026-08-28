import { describe, expect, it } from 'vitest';
import {
  calibrateKdfIterations,
  decryptVault,
  encryptVault,
  VaultCryptoError,
} from './crypto';

describe('vault crypto', () => {
  it('round-trips data with the correct password', async () => {
    const payload = { profile: { name: '张三', phone: '13800000000' } };
    const vault = await encryptVault(payload, 'correct horse battery staple', {
      iterations: 1_000,
    });
    await expect(
      decryptVault(vault, 'correct horse battery staple'),
    ).resolves.toEqual(payload);
  });

  it('rejects wrong passwords, ciphertext tampering, salts and versions', async () => {
    const vault = await encryptVault({ secret: 'resume' }, 'password', {
      iterations: 1_000,
    });
    await expect(decryptVault(vault, 'wrong')).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
    });
    await expect(
      decryptVault(
        { ...vault, encryptedPayload: `A${vault.encryptedPayload}` },
        'password',
      ),
    ).rejects.toBeInstanceOf(VaultCryptoError);
    await expect(
      decryptVault({ ...vault, salt: 'AAAA' }, 'password'),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    await expect(
      decryptVault({ ...vault, vaultVersion: 2 }, 'password'),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_VERSION' });
  });

  it('calibrates and bounds KDF iterations', async () => {
    await expect(calibrateKdfIterations(async () => 100, 350)).resolves.toBe(
      350_000,
    );
    await expect(calibrateKdfIterations(async () => 10, 350)).resolves.toBe(
      1_200_000,
    );
    await expect(calibrateKdfIterations(async () => 10_000, 350)).resolves.toBe(
      210_000,
    );
  });

  it('does not include secrets in public errors', async () => {
    const secret = 'private-resume-value';
    const vault = await encryptVault({ secret }, 'password', {
      iterations: 1_000,
    });
    try {
      await decryptVault(vault, 'wrong');
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain('password');
    }
  });
});
