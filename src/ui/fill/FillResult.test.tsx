import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FillResult } from './FillResult';

describe('FillResult', () => {
  it('summarizes outcomes and offers undo only when something was filled', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    const onBack = vi.fn();
    const { rerender } = render(
      <FillResult
        outcomes={[
          {
            fingerprint: 'input|text|fullName',
            status: 'filled',
            previousValue: '',
          },
          {
            fingerprint: 'input|text|phone',
            status: 'skipped',
            reason: '敏感字段需手动处理',
            previousValue: '',
          },
          {
            fingerprint: 'input|text|jobLevel',
            status: 'unsupported',
            reason: '不支持的控件',
            previousValue: '',
          },
        ]}
        onBack={onBack}
        onUndo={onUndo}
      />,
    );

    expect(screen.getByText('已直接填写')).toBeVisible();
    expect(screen.getByText('已填写 1')).toBeVisible();
    expect(screen.getByText('已跳过 1')).toBeVisible();
    expect(screen.getByText('不支持 1')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '撤销本次填写' }));
    expect(onUndo).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: '返回' }));
    expect(onBack).toHaveBeenCalledOnce();

    rerender(
      <FillResult
        outcomes={[
          {
            fingerprint: 'input|text|phone',
            status: 'skipped',
            reason: '敏感字段需手动处理',
            previousValue: '',
          },
        ]}
        onBack={onBack}
        onUndo={onUndo}
      />,
    );
    expect(
      screen.queryByRole('button', { name: '撤销本次填写' }),
    ).not.toBeInTheDocument();
  });
});
