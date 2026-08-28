import { z } from 'zod';
import { migrateResumeData, type ResumeData } from '../domain/resume';
import {
  decryptVault,
  encryptVault,
  encryptedVaultSchema,
  type EncryptedVault,
} from './crypto';
import type { DeviceSecretStore } from './device-secret';

const BACKUP_VERSION = 2 as const;

export const encryptedBackupSchema = z.strictObject({
  format: z.literal('offer-nail-encrypted-backup'),
  backupVersion: z.literal(BACKUP_VERSION),
  exportedAt: z.iso.datetime(),
  vault: encryptedVaultSchema,
  deviceSecret: z.string().min(32),
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
  secrets: DeviceSecretStore,
  now: () => Date = () => new Date(),
): Promise<string> {
  const vault = await repository.readVault();
  if (!vault) {
    throw new BackupError('INVALID_BACKUP', '当前没有可导出的保险库');
  }
  const deviceSecret = await secrets.read();
  if (!deviceSecret) {
    throw new BackupError(
      'INVALID_BACKUP',
      '找不到本机密钥，无法导出可恢复的备份',
    );
  }
  return JSON.stringify({
    format: 'offer-nail-encrypted-backup',
    backupVersion: BACKUP_VERSION,
    exportedAt: now().toISOString(),
    vault,
    deviceSecret,
  } satisfies EncryptedBackup);
}

export interface BackupPreview {
  exportedAt: string;
  profileName: string;
  schemaVersion: number;
}

export async function previewEncryptedBackup(
  serialized: string,
): Promise<BackupPreview> {
  const backup = parseBackup(serialized);
  const payload = await decryptVault(backup.vault, backup.deviceSecret);
  const resumeData = migrateResumeData(payload);
  return {
    exportedAt: backup.exportedAt,
    profileName: resumeData.masterProfile.name,
    schemaVersion: resumeData.schemaVersion,
  };
}

export async function restoreEncryptedBackup(
  serialized: string,
  repository: BackupRepository,
  secrets: DeviceSecretStore,
): Promise<ResumeData> {
  const backup = parseBackup(serialized);
  const payload = await decryptVault(backup.vault, backup.deviceSecret);
  const migrated = migrateResumeData(payload);
  const restoredVault = await encryptVault(
    migrated,
    await secrets.getOrCreate(),
    {
      iterations: backup.vault.kdfParameters.iterations,
      existingCreatedAt: backup.vault.createdAt,
    },
  );
  await repository.writeVault(restoredVault);
  return migrated;
}

export async function resetLocalData(
  repository: BackupRepository,
  session: LockableSession,
  secrets: DeviceSecretStore,
): Promise<void> {
  await session.lock();
  await repository.clearAll();
  await secrets.clear();
}
