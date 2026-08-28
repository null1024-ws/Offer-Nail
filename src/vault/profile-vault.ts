import {
  migrateResumeData,
  resumeDataSchema,
  type ResumeData,
} from '../domain/resume';
import { decryptVault, encryptVault } from './crypto';
import type { DeviceSecretStore } from './device-secret';
import type { InitializationRepository } from './initialize';

export async function unlockProfile(
  repository: InitializationRepository,
  secrets: DeviceSecretStore,
): Promise<ResumeData> {
  const vault = await repository.readVault();
  if (!vault) throw new Error('保险库不存在');
  return migrateResumeData(
    await decryptVault(vault, await secrets.getOrCreate()),
  );
}

export async function saveProfile(
  repository: InitializationRepository,
  data: ResumeData,
  secrets: DeviceSecretStore,
): Promise<void> {
  const currentVault = await repository.readVault();
  if (!currentVault) throw new Error('保险库不存在');
  const validated = resumeDataSchema.parse(data);
  const replacement = await encryptVault(
    validated,
    await secrets.getOrCreate(),
    {
      iterations: currentVault.kdfParameters.iterations,
      existingCreatedAt: currentVault.createdAt,
    },
  );
  await repository.writeVault(replacement);
}
