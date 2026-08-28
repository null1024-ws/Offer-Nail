import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { decryptVault, encryptVault } from './crypto';
import { VaultRepository } from './repository';

function databaseName(): string {
  return `offer-nail-test-${crypto.randomUUID()}`;
}

describe('VaultRepository', () => {
  it('persists only encrypted vault data across repository instances', async () => {
    const name = databaseName();
    const first = new VaultRepository({ databaseName: name });
    const vault = await encryptVault({ fullName: '张三' }, 'password', {
      iterations: 100,
    });
    await first.writeVault(vault);
    await first.close();

    const reopened = new VaultRepository({ databaseName: name });
    const stored = await reopened.readVault();
    expect(stored).toEqual(vault);
    expect(JSON.stringify(stored)).not.toContain('张三');
    await expect(decryptVault(stored, 'password')).resolves.toEqual({
      fullName: '张三',
    });
    await reopened.destroy();
  });

  it('keeps the previous vault when a write transaction fails', async () => {
    const name = databaseName();
    const stable = new VaultRepository({ databaseName: name });
    const oldVault = await encryptVault({ revision: 'old' }, 'password', {
      iterations: 100,
    });
    const newVault = await encryptVault({ revision: 'new' }, 'password', {
      iterations: 100,
    });
    await stable.writeVault(oldVault);

    const faulty = new VaultRepository({
      databaseName: name,
      faultInjector(stage) {
        if (stage === 'afterVaultPut') throw new Error('simulated failure');
      },
    });
    await expect(faulty.writeVault(newVault)).rejects.toMatchObject({
      code: 'TRANSACTION_FAILED',
    });
    expect(await stable.readVault()).toEqual(oldVault);
    await faulty.close();
    await stable.destroy();
  });

  it('clears vault, encrypted attachments and site rules together', async () => {
    const repository = new VaultRepository({ databaseName: databaseName() });
    await repository.writeVault(
      await encryptVault({ profile: 'encrypted' }, 'password', {
        iterations: 100,
      }),
    );
    await repository.writeAttachment({
      id: '30000000-0000-4000-8000-000000000001',
      kind: 'resume',
      size: 128,
      encryptedPayload: 'encrypted-attachment',
    });
    await repository.writeSiteRule({
      id: 'example-name',
      origin: 'https://careers.example.com',
      pageSignature: 'careers-form-v1',
      fieldFingerprint: 'name-field',
      targetFieldId: 'personal.fullName',
      transform: 'identity',
      enabled: true,
      confirmedAt: '2026-08-28T00:00:00.000Z',
    });

    expect(await repository.countRecords()).toEqual({
      vault: 1,
      attachments: 1,
      siteRules: 1,
    });
    await repository.clearAll();
    expect(await repository.countRecords()).toEqual({
      vault: 0,
      attachments: 0,
      siteRules: 0,
    });
    await repository.destroy();
  });
});
