import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Onboarding } from './Onboarding';

describe('Onboarding', () => {
  it('creates a named blank profile', async () => {
    const onInitialize = vi.fn(async () => undefined);
    render(<Onboarding onInitialize={onInitialize} />);
    const profileName = screen.getByLabelText('档案名称');
    await userEvent.clear(profileName);
    await userEvent.type(profileName, '前端校招');
    await userEvent.click(screen.getByRole('button', { name: '创建空白档案' }));

    expect(onInitialize).toHaveBeenCalledWith({
      profileName: '前端校招',
    });
  });

  it('shows a safe retry message when initialization fails', async () => {
    render(
      <Onboarding
        onInitialize={vi.fn(async () => {
          throw new Error('storage failure');
        })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '创建空白档案' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '初始化失败，请重试；现有数据未被修改',
    );
  });
});
