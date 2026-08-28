import { z } from 'zod';
import { migrateResumeData, type ResumeData } from '../domain/resume';
import {
  decryptVault,
  encryptVault,
  encryptedVaultSchema,
  type EncryptedVault,
} from './crypto';

const BACKUP_VERSION = 1 as const;

export const encryptedBackupSchema = z.strictObject({
  format: z.literal('offer-nail-encrypted-backup'),
  backupVersion: z.literal(BACKUP_VERSION),
  exportedAt: z.iso.datetime(),
  vault: encryptedVaultSchema,
});

export type EncryptedBackup = z.infer<typeof encryptedBackupSchema>;

export class BackupError extends Error {
  constructor(
    readonly code: 'INVALID_BACKUP' | 'UNSUPPORTED_BACKUP_VERSION',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BackupError';
  }
}

export interface BackupRepository {
  readVault(): Promise<EncryptedVault | undefined>;
  writeVault(vault: EncryptedVault): Promise<void>;
  clearAll(): Promise<void>;
}

export interface LockableSession {
  lock(): Promise<void>;
}

function parseBackup(serialized: string): EncryptedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch (error) {
    throw new BackupError('INVALID_BACKUP', '备份文件不是有效 JSON', {
      cause: error,
    });
  }

  if (
    typeof raw === 'object' &&
    raw !== null &&
    'backupVersion' in raw &&
    raw.backupVersion !== BACKUP_VERSION
  ) {
    throw new BackupError('UNSUPPORTED_BACKUP_VERSION', '备份文件版本不受支持');
  }

  const parsed = encryptedBackupSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BackupError('INVALID_BACKUP', '备份文件格式无效', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

export async function exportEncryptedBackup(
  repository: BackupRepository,
  now: () => Date = () => new Date(),
): Promise<string> {
  const vault = await repository.readVault();
  if (!vault) {
    throw new BackupError('INVALID_BACKUP', '当前没有可导出的保险库');
  }
  return JSON.stringify({
    format: 'offer-nail-encrypted-backup',
    backupVersion: BACKUP_VERSION,
    exportedAt: now().toISOString(),
    vault,
  } satisfies EncryptedBackup);
}

export interface BackupPreview {
  exportedAt: string;
  profileName: string;
  schemaVersion: number;
}

export async function previewEncryptedBackup(
  serialized: string,
  password: string,
): Promise<BackupPreview> {
  const backup = parseBackup(serialized);
  const payload = await decryptVault(backup.vault, password);
  const resumeData = migrateResumeData(payload);
  return {
    exportedAt: backup.exportedAt,
    profileName: resumeData.masterProfile.name,
    schemaVersion: resumeData.schemaVersion,
  };
}

export async function restoreEncryptedBackup(
  serialized: string,
  password: string,
  repository: BackupRepository,
): Promise<ResumeData> {
  const backup = parseBackup(serialized);
  const payload = await decryptVault(backup.vault, password);
  const migrated = migrateResumeData(payload);
  const restoredVault = await encryptVault(migrated, password, {
    iterations: backup.vault.kdfParameters.iterations,
    existingCreatedAt: backup.vault.createdAt,
  });
  await repository.writeVault(restoredVault);
  return migrated;
}

export async function resetLocalData(
  repository: BackupRepository,
  session: LockableSession,
): Promise<void> {
  await session.lock();
  await repository.clearAll();
}
