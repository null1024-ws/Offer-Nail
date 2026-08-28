import {
  migrateResumeData,
  resumeDataSchema,
  type ResumeData,
} from '../domain/resume';
import { decryptVault, encryptVault } from './crypto';
import type { InitializationRepository } from './initialize';

export async function unlockProfile(
  repository: InitializationRepository,
  password: string,
): Promise<ResumeData> {
  const vault = await repository.readVault();
  if (!vault) throw new Error('保险库不存在');
  return migrateResumeData(await decryptVault(vault, password));
}

export async function saveProfile(
  repository: InitializationRepository,
  data: ResumeData,
  password: string,
): Promise<void> {
  const currentVault = await repository.readVault();
  if (!currentVault) throw new Error('保险库不存在');
  const validated = resumeDataSchema.parse(data);
  const replacement = await encryptVault(validated, password, {
    iterations: currentVault.kdfParameters.iterations,
    existingCreatedAt: currentVault.createdAt,
  });
  await repository.writeVault(replacement);
}
