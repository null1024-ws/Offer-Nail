import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyResumeData } from '../../domain/resume';
import { VaultBackup } from './VaultBackup';

describe('VaultBackup', () => {
  it('previews a backup then restores only after confirmation', async () => {
    const user = userEvent.setup();
    const onRestored = vi.fn();
    render(
      <VaultBackup
        repository={{
          readVault: async () => undefined,
          writeVault: async () => undefined,
          clearAll: async () => undefined,
        }}
        session={{ lock: async () => undefined }}
        secrets={{
          read: async () => 'device-secret-for-tests-32bytes-min!!',
          write: async () => undefined,
          clear: async () => undefined,
          getOrCreate: async () => 'device-secret-for-tests-32bytes-min!!',
        }}
        onRestored={onRestored}
        onReset={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '彻底删除' })).toBeDisabled();
    await user.click(
      screen.getByRole('checkbox', {
        name: '我确认要彻底删除本地保险库、规则、附件和 AI 辅助识别设置',
      }),
    );
    expect(screen.getByRole('button', { name: '彻底删除' })).toBeEnabled();
    expect(onRestored).not.toHaveBeenCalled();
    expect(createEmptyResumeData().masterProfile.name).toBe('默认档案');
  });
});
