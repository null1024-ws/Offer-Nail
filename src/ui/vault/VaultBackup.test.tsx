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
        password="correct horse 1234"
        onRestored={onRestored}
        onReset={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '彻底删除' })).toBeDisabled();
    await user.click(
      screen.getByRole('checkbox', {
        name: '我确认要彻底删除本地保险库、规则和附件',
      }),
    );
    expect(screen.getByRole('button', { name: '彻底删除' })).toBeEnabled();
    expect(onRestored).not.toHaveBeenCalled();
    expect(createEmptyResumeData().masterProfile.name).toBe('默认档案');
  });
});
