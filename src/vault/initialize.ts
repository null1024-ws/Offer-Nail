import { createEmptyResumeData, type ResumeData } from '../domain/resume';
import { encryptVault, type EncryptedVault } from './crypto';

export interface InitializationRepository {
  readVault(): Promise<EncryptedVault | undefined>;
  writeVault(vault: EncryptedVault): Promise<void>;
}

export class VaultInitializationError extends Error {
  constructor(
    readonly code: 'ALREADY_INITIALIZED' | 'WEAK_PASSWORD',
    message: string,
  ) {
    super(message);
    this.name = 'VaultInitializationError';
  }
}

export function masterPasswordError(password: string): string | undefined {
  if (password.length < 12) return '主密码至少需要 12 个字符';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return '主密码需要同时包含字母和数字';
  }
  return undefined;
}

export async function initializeNewVault(
  repository: InitializationRepository,
  password: string,
  profileName = '默认档案',
): Promise<ResumeData> {
  if (await repository.readVault()) {
    throw new VaultInitializationError(
      'ALREADY_INITIALIZED',
      '保险库已经初始化',
    );
  }
  const passwordError = masterPasswordError(password);
  if (passwordError) {
    throw new VaultInitializationError('WEAK_PASSWORD', passwordError);
  }

  const resumeData = createEmptyResumeData({ profileName });
  const vault = await encryptVault(resumeData, password);
  await repository.writeVault(vault);
  return resumeData;
}
