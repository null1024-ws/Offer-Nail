import { createEmptyResumeData, type ResumeData } from '../domain/resume';
import { encryptVault, type EncryptedVault } from './crypto';
import type { DeviceSecretStore } from './device-secret';

export interface InitializationRepository {
  readVault(): Promise<EncryptedVault | undefined>;
  writeVault(vault: EncryptedVault): Promise<void>;
}

export class VaultInitializationError extends Error {
  constructor(
    readonly code: 'ALREADY_INITIALIZED',
    message: string,
  ) {
    super(message);
    this.name = 'VaultInitializationError';
  }
}

export async function initializeNewVault(
  repository: InitializationRepository,
  secrets: DeviceSecretStore,
  profileName = '默认档案',
): Promise<ResumeData> {
  if (await repository.readVault()) {
    throw new VaultInitializationError(
      'ALREADY_INITIALIZED',
      '保险库已经初始化',
    );
  }

  const resumeData = createEmptyResumeData({ profileName });
  const vault = await encryptVault(resumeData, await secrets.getOrCreate());
  await repository.writeVault(vault);
  return resumeData;
}
