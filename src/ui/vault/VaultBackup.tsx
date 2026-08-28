import { useState } from 'react';
import {
  exportEncryptedBackup,
  previewEncryptedBackup,
  resetLocalData,
  restoreEncryptedBackup,
  type BackupPreview,
  type BackupRepository,
  type LockableSession,
} from '../../vault/backup';
import type { ResumeData } from '../../domain/resume/schema';

export interface VaultBackupProps {
  repository: BackupRepository;
  session: LockableSession;
  password: string;
  onRestored: (data: ResumeData) => Promise<void> | void;
  onReset: () => Promise<void> | void;
}

export function VaultBackup({
  repository,
  session,
  password,
  onRestored,
  onReset,
}: VaultBackupProps) {
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<{
    serialized: string;
    info: BackupPreview;
  }>();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <section className="vault-backup" aria-labelledby="vault-backup-title">
      <h2 id="vault-backup-title">备份与恢复</h2>
      <p>备份文件保持加密。没有正确主密码时无法恢复明文。</p>
      <div className="item-actions">
        <button
          type="button"
          onClick={async () => {
            setError(undefined);
            try {
              const serialized = await exportEncryptedBackup(repository);
              const blob = new Blob([serialized], {
                type: 'application/json',
              });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'offer-nail-backup.json';
              link.click();
              URL.revokeObjectURL(url);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : '导出失败');
            }
          }}
        >
          导出加密备份
        </button>
      </div>
      <label>
        恢复备份
        <input
          type="file"
          accept="application/json,.json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setError(undefined);
            try {
              const serialized = await file.text();
              const info = await previewEncryptedBackup(serialized, password);
              setPreview({ serialized, info });
            } catch (cause) {
              setPreview(undefined);
              setError(
                cause instanceof Error
                  ? cause.message
                  : '备份无法预览，文件未被导入。',
              );
            }
          }}
        />
      </label>
      {preview && (
        <p>
          将覆盖当前保险库：{preview.info.profileName}（schema{' '}
          {preview.info.schemaVersion}，导出于 {preview.info.exportedAt}）
          <button
            type="button"
            onClick={async () => {
              setError(undefined);
              try {
                const restored = await restoreEncryptedBackup(
                  preview.serialized,
                  password,
                  repository,
                );
                setPreview(undefined);
                await onRestored(restored);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : '恢复失败');
              }
            }}
          >
            确认恢复
          </button>
        </p>
      )}
      <label className="inline-check">
        <input
          type="checkbox"
          checked={confirmReset}
          onChange={(event) => setConfirmReset(event.target.checked)}
        />
        我确认要彻底删除本地保险库、规则和附件
      </label>
      <button
        type="button"
        disabled={!confirmReset}
        onClick={async () => {
          setError(undefined);
          await resetLocalData(repository, session);
          await onReset();
        }}
      >
        彻底删除
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
