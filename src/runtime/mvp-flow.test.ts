/** @vitest-environment node */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  createProfileVariant,
  setVariantFieldOverride,
} from '../domain/resume/variant-model';
import { applyConfirmedCandidates } from '../parser/merge';
import { parseResumeCandidates } from '../parser/candidates';
import { sourceLinesFromText } from '../parser/source';
import { resumeTextFixture } from '../parser/__fixtures__/resume-text';
import { collectPageFields } from '../page-mapping/collector';
import { applyFill, undoFill } from '../fill-engine/apply';
import { fillRequestFromPreview, planPageFill } from '../fill-engine/plan';
import { loadFixtureDocument } from '../fill-engine/__fixtures__/form-fixture';
import { MemoryDeviceSecretStore } from '../vault/device-secret';
import { initializeNewVault } from '../vault/initialize';
import { saveProfile, unlockProfile } from '../vault/profile-vault';
import { exportEncryptedBackup, restoreEncryptedBackup } from '../vault/backup';
import { VaultRepository } from '../vault/repository';
import { resumeForFill } from '../domain/resume';

describe('MVP end-to-end flow', () => {
  it('covers init, import, variant, fill, undo, rules and backup restore', async () => {
    const repository = new VaultRepository({
      databaseName: `offer-nail-mvp-${crypto.randomUUID()}`,
    });
    const secrets = new MemoryDeviceSecretStore();
    const blank = await initializeNewVault(repository, secrets, '秋招档案');
    const parsed = parseResumeCandidates(
      sourceLinesFromText(resumeTextFixture),
    );
    const imported = applyConfirmedCandidates(
      blank,
      parsed.candidates.map((candidate) => ({
        candidate,
        selected: true,
        overwrite: true,
        value: candidate.value,
      })),
    );
    const withVariant = createProfileVariant(imported, '前端校招');
    const variantId = withVariant.profileVariants[0]!.id;
    const overridden = setVariantFieldOverride(
      withVariant,
      variantId,
      withVariant.masterProfile.personal.id,
      'personal.summary',
      { kind: 'text', value: '变体简介' },
    );
    await saveProfile(repository, overridden, secrets);

    const document = loadFixtureDocument();
    const fillResume = resumeForFill(overridden, variantId);
    expect(fillResume.masterProfile.personal.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: 'personal.summary',
          value: { kind: 'text', value: '变体简介' },
        }),
      ]),
    );
    const plan = planPageFill(collectPageFields(document), fillResume);
    expect(
      (document.getElementById('full-name') as HTMLInputElement).value,
    ).toBe('');
    const session = applyFill(
      document,
      fillRequestFromPreview(
        plan.items.filter((item) => item.selected),
        plan,
      ).instructions,
      {
        addEmploymentCount: plan.addEmploymentCount,
        newEmployments: plan.newEmployments,
      },
    );
    expect(
      (document.getElementById('full-name') as HTMLInputElement).value,
    ).toBe('张三');
    expect(
      (document.getElementById('summary') as HTMLTextAreaElement).value,
    ).toBe('变体简介');
    expect(undoFill(document, session)).toEqual({ ok: true });
    expect(
      (document.getElementById('full-name') as HTMLInputElement).value,
    ).toBe('');

    const backup = await exportEncryptedBackup(repository, secrets);
    expect(backup).not.toContain('张三');
    const restoreSecrets = new MemoryDeviceSecretStore();
    const restored = await restoreEncryptedBackup(
      backup,
      new VaultRepository({
        databaseName: `offer-nail-mvp-restore-${crypto.randomUUID()}`,
      }),
      restoreSecrets,
    );
    expect(restored.masterProfile.name).toBe('秋招档案');
    const tampered = JSON.parse(backup) as { deviceSecret: string };
    tampered.deviceSecret = 'x'.repeat(32);
    await expect(
      restoreEncryptedBackup(
        JSON.stringify(tampered),
        new VaultRepository({
          databaseName: `offer-nail-mvp-wrong-${crypto.randomUUID()}`,
        }),
        new MemoryDeviceSecretStore(),
      ),
    ).rejects.toThrow();
    expect(await unlockProfile(repository, secrets)).toMatchObject({
      masterProfile: { name: '秋招档案' },
    });
    await repository.destroy();
  });
});
